/**
 * Email Invoice Service (Orchestrator)
 * Ties together: Zoho Mail → Download Attachments → OCR/AI Parse → Save Bill
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const prisma = require('../models/prisma');
const zohoMailService = require('./zohoMailService');
const productService = require('./productService');
const distributorService = require('./distributorService');
const { extractTextFromImage } = require('../utils/ocrService');
const { parseOcrWithGemini, parseImageWithVision } = require('../utils/geminiService');
const {
  reconstructBillTable,
  normalizeNumericFields,
  validateItems,
} = require('../utils/ocrNormalizer');

// Supported attachment types
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/tiff'];
const SUPPORTED_PDF_TYPES = ['application/pdf'];
const SUPPORTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.tiff'];

/**
 * Check if an attachment is a supported invoice file
 */
function isSupportedAttachment(attachment) {
  const name = (attachment.attachmentName || '').toLowerCase();
  const ext = path.extname(name);
  return SUPPORTED_EXTENSIONS.includes(ext);
}

/**
 * Helper: Parse date string
 */
function parseDateString(dateStr) {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/**
 * Process a single attachment through OCR + AI pipeline
 * @param {Buffer} fileBuffer - The file content
 * @param {string} fileName - Original file name
 * @param {string} mimeType - MIME type
 * @returns {Object} Parsed bill data
 */
async function processAttachment(fileBuffer, fileName, mimeType) {
  const isImage = SUPPORTED_IMAGE_TYPES.includes(mimeType);
  const isPdf = SUPPORTED_PDF_TYPES.includes(mimeType);

  let ocrText = '';
  let parsedData = null;

  if (isPdf) {
    // Try to extract text from PDF first
    try {
      const pdfParse = require('pdf-parse');
      const pdfData = await pdfParse(fileBuffer);
      ocrText = pdfData.text || '';
      console.log(`[EmailInvoice] PDF text extracted: ${ocrText.length} chars`);

      // If PDF has very little text (scanned/image PDF), try OCR on pages
      if (ocrText.trim().length < 50) {
        console.log('[EmailInvoice] PDF appears to be image-based, attempting Vision AI...');
        // Convert first page to base64 for vision
        const base64 = fileBuffer.toString('base64');
        try {
          parsedData = await parseImageWithVision(base64, 'application/pdf', '');
        } catch (visionErr) {
          console.warn('[EmailInvoice] Vision AI failed for PDF:', visionErr.message);
        }
      }
    } catch (pdfErr) {
      console.error('[EmailInvoice] PDF parse failed:', pdfErr.message);
    }
  } else if (isImage) {
    // Image-based invoice: run OCR
    try {
      // First try Vision AI directly (best for images)
      const base64 = fileBuffer.toString('base64');
      parsedData = await parseImageWithVision(base64, mimeType, '');
      console.log(`[EmailInvoice] ✓ Vision AI parsed image: ${parsedData?.items?.length || 0} items`);
    } catch (visionErr) {
      console.warn('[EmailInvoice] Vision AI failed, trying OCR.space:', visionErr.message);
      // Fallback: OCR.space
      try {
        const ocrResult = await extractTextFromImage(fileBuffer, mimeType);
        ocrText = ocrResult.text || '';
        console.log(`[EmailInvoice] ✓ OCR extracted ${ocrText.length} chars`);
      } catch (ocrErr) {
        console.error('[EmailInvoice] OCR failed:', ocrErr.message);
        throw new Error(`Both Vision AI and OCR failed for ${fileName}`);
      }
    }
  }

  // If we have OCR text but no parsed data, run through Gemini AI
  if (ocrText.length > 20 && !parsedData) {
    try {
      parsedData = await parseOcrWithGemini(ocrText);
      console.log(`[EmailInvoice] ✓ AI parsed OCR text: ${parsedData?.items?.length || 0} items`);
    } catch (aiErr) {
      console.error('[EmailInvoice] AI parsing failed:', aiErr.message);
    }
  }

  // Apply table reconstruction and normalization if we have items
  if (parsedData?.items && parsedData.items.length > 0) {
    try {
      parsedData.items = normalizeNumericFields(parsedData.items);
      const validation = validateItems(parsedData.items);
      if (validation.warnings.length > 0) {
        console.warn('[EmailInvoice] Validation warnings:', validation.warnings);
      }
    } catch (normErr) {
      console.warn('[EmailInvoice] Normalization warning:', normErr.message);
    }
  }

  return {
    parsedData,
    ocrText,
    fileName,
  };
}

/**
 * Save parsed data as a Bill + BillItems record
 * @param {string} userId - User ID to assign the bill to
 * @param {Object} parsedData - Parsed bill data from AI
 * @param {string} ocrText - Raw OCR text
 * @param {string} source - Source identifier (e.g., "zoho-email")
 * @returns {Object} Created bill
 */
async function saveBillFromParsedData(userId, parsedData, ocrText, source = 'zoho-email') {
  if (!parsedData) {
    throw new Error('No parsed data to save');
  }

  // Find or create distributor
  let distributorId = null;
  if (parsedData.pharmacyName) {
    try {
      const distributorData = {
        name: parsedData.pharmacyName,
        gstin: parsedData.gstin || null,
        phone: parsedData.phoneNumbers?.[0] || null,
        address: parsedData.shopAddress || null,
        dlNumber: parsedData.dlNumber || null,
      };
      const distributor = await distributorService.findOrCreateDistributor(userId, distributorData);
      if (distributor) distributorId = distributor.id;
    } catch (distErr) {
      console.warn('[EmailInvoice] Distributor creation warning:', distErr.message);
    }
  }

  // Create the bill
  const bill = await prisma.bill.create({
    data: {
      userId,
      distributorId,
      fileName: parsedData.invoiceNumber || 'email-invoice',
      filePath: `email://${source}`,
      fileSize: 0,
      mimeType: 'application/pdf',

      // Pharmacy details
      pharmacyName: parsedData.pharmacyName || null,
      shopAddress: parsedData.shopAddress || null,
      phoneNumbers: parsedData.phoneNumbers ? JSON.stringify(parsedData.phoneNumbers) : null,

      // Invoice identification
      invoiceNumber: parsedData.invoiceNumber || null,
      invoiceDate: parsedData.invoiceDate ? parseDateString(parsedData.invoiceDate) : null,

      // Financial totals
      subtotal: parsedData.subtotal ? parseFloat(parsedData.subtotal) : null,
      cgst: parsedData.cgst ? parseFloat(parsedData.cgst) : null,
      sgst: parsedData.sgst ? parseFloat(parsedData.sgst) : null,
      totalGst: parsedData.totalGst ? parseFloat(parsedData.totalGst) : null,
      discountAmount: parsedData.discountAmount ? parseFloat(parsedData.discountAmount) : null,
      roundOff: parsedData.roundOff ? parseFloat(parsedData.roundOff) : null,
      grandTotal: parsedData.grandTotal ? parseFloat(parsedData.grandTotal) : null,

      // Payment details
      paymentType: parsedData.paymentType || null,

      // OCR & Processing
      rawOcrText: ocrText || null,
      ocrEngine: 'zoho-email',
      aiParser: 'gemini-ai',
      processedAt: new Date(),
      status: 'completed',

      // Create items
      items: parsedData.items
        ? {
            create: parsedData.items.map((item, idx) => ({
              serialNumber: item.sn ? parseInt(item.sn) : idx + 1,
              name: item.name || '',
              manufacturer: item.manufacturer || null,
              batchNumber: item.batchNumber || null,
              expiryDate: item.expiryDate || null,
              hsnCode: item.hsnCode || null,
              quantity: item.quantity ? parseFloat(item.quantity) : 0,
              freeQuantity: item.freeQuantity ? parseFloat(item.freeQuantity) : null,
              unit: item.unit || 'units',
              mrp: item.mrp ? parseFloat(item.mrp) : null,
              rate: item.rate ? parseFloat(item.rate) : 0,
              gstPercent: item.gstPercent ? parseFloat(item.gstPercent) : null,
              cgstPercent: item.cgstPercent ? parseFloat(item.cgstPercent) : null,
              sgstPercent: item.sgstPercent ? parseFloat(item.sgstPercent) : null,
              discount: item.discount ? parseFloat(item.discount) : null,
              itemTotal: item.itemTotal ? parseFloat(item.itemTotal) : 0,
              confidence: item.confidence || 0.9,
            })),
          }
        : undefined,
    },
    include: { items: true },
  });

  // Sync products from bill items
  if (bill.items && bill.items.length > 0) {
    try {
      const syncResult = await productService.syncProductsFromBillItems(userId, bill.items);
      console.log(`[EmailInvoice] ✓ Product sync: ${syncResult.created} created, ${syncResult.updated} updated`);
    } catch (syncErr) {
      console.warn('[EmailInvoice] Product sync warning:', syncErr.message);
    }
  }

  return bill;
}

/**
 * Main orchestrator: Fetch emails from Zoho, process attachments, save bills
 * @param {string} userId - User ID to assign bills to
 * @param {number} limit - Max emails to process
 * @returns {Object} Processing summary
 */
async function fetchAndProcessEmails(userId, limit = 20) {
  const results = {
    emailsScanned: 0,
    emailsProcessed: 0,
    emailsSkipped: 0,
    emailsFailed: 0,
    billsCreated: 0,
    errors: [],
    logs: [],
  };

  try {
    // Fetch emails from Zoho
    console.log(`[EmailInvoice] Fetching up to ${limit} emails from Zoho...`);
    const emails = await zohoMailService.fetchEmails(limit);
    results.emailsScanned = emails.length;

    for (const email of emails) {
      const messageId = email.messageId;
      const folderId = email.folderId;
      const subject = email.subject || '(no subject)';
      const sender = email.fromAddress || email.sender || '';

      try {
        // Check if already processed
        const existing = await prisma.emailProcessingLog.findUnique({
          where: { messageId: String(messageId) },
        });

        if (existing) {
          results.emailsSkipped++;
          continue;
        }

        // Check if email has attachments
        if (!email.hasAttachment) {
          // Log as skipped (no attachments)
          await prisma.emailProcessingLog.create({
            data: {
              messageId: String(messageId),
              subject,
              sender,
              emailDate: email.receivedTime ? new Date(parseInt(email.receivedTime)) : null,
              status: 'skipped',
              errorMessage: 'No attachments',
            },
          });
          results.emailsSkipped++;
          continue;
        }

        // Get full email details (which includes attachment list)
        console.log(`[EmailInvoice] Processing: "${subject}" from ${sender}`);
        const emailDetails = await zohoMailService.getEmailDetails(messageId, folderId);

        if (!emailDetails || !emailDetails.attachments || emailDetails.attachments.length === 0) {
          await prisma.emailProcessingLog.create({
            data: {
              messageId: String(messageId),
              subject,
              sender,
              emailDate: email.receivedTime ? new Date(parseInt(email.receivedTime)) : null,
              status: 'skipped',
              errorMessage: 'No downloadable attachments',
            },
          });
          results.emailsSkipped++;
          continue;
        }

        // Filter for supported attachments
        const supportedAttachments = emailDetails.attachments.filter(isSupportedAttachment);

        if (supportedAttachments.length === 0) {
          await prisma.emailProcessingLog.create({
            data: {
              messageId: String(messageId),
              subject,
              sender,
              emailDate: email.receivedTime ? new Date(parseInt(email.receivedTime)) : null,
              status: 'skipped',
              errorMessage: 'No PDF/image attachments',
            },
          });
          results.emailsSkipped++;
          continue;
        }

        // Process each supported attachment
        let billsFromThisEmail = 0;
        const attachmentErrors = [];

        for (const attachment of supportedAttachments) {
          try {
            const attachmentId = attachment.attachmentId;
            const attachmentName = attachment.attachmentName || 'attachment';
            const ext = path.extname(attachmentName).toLowerCase();
            const mimeType =
              ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : 'image/jpeg';

            // Download attachment
            console.log(`[EmailInvoice] Downloading: ${attachmentName}`);
            const fileBuffer = await zohoMailService.downloadAttachment(messageId, attachmentId, folderId);

            // Process through OCR + AI pipeline
            const { parsedData, ocrText } = await processAttachment(fileBuffer, attachmentName, mimeType);

            if (parsedData && parsedData.items && parsedData.items.length > 0) {
              // Save as bill
              const bill = await saveBillFromParsedData(userId, parsedData, ocrText, `zoho-email-${messageId}`);
              billsFromThisEmail++;
              results.billsCreated++;
              console.log(`[EmailInvoice] ✓ Bill saved: ${bill.id} (${parsedData.items.length} items)`);
            } else {
              attachmentErrors.push(`${attachmentName}: No items extracted`);
            }
          } catch (attachErr) {
            console.error(`[EmailInvoice] ✗ Attachment error:`, attachErr.message);
            attachmentErrors.push(`${attachment.attachmentName}: ${attachErr.message}`);
          }
        }

        // Log this email
        const status = billsFromThisEmail > 0 ? 'processed' : attachmentErrors.length > 0 ? 'failed' : 'skipped';
        await prisma.emailProcessingLog.create({
          data: {
            messageId: String(messageId),
            subject,
            sender,
            emailDate: email.receivedTime ? new Date(parseInt(email.receivedTime)) : null,
            attachments: supportedAttachments.length,
            billsCreated: billsFromThisEmail,
            status,
            errorMessage: attachmentErrors.length > 0 ? attachmentErrors.join('; ') : null,
          },
        });

        if (billsFromThisEmail > 0) {
          results.emailsProcessed++;
          // Mark as read in Zoho
          await zohoMailService.markAsRead(messageId, folderId);
        } else {
          results.emailsFailed++;
        }

        results.logs.push({
          messageId: String(messageId),
          subject,
          sender,
          status,
          billsCreated: billsFromThisEmail,
          errors: attachmentErrors,
        });
      } catch (emailErr) {
        console.error(`[EmailInvoice] ✗ Email processing error:`, emailErr.message);
        results.emailsFailed++;
        results.errors.push({ messageId: String(messageId), error: emailErr.message });

        // Log the failed email
        try {
          await prisma.emailProcessingLog.create({
            data: {
              messageId: String(messageId),
              subject,
              sender,
              status: 'failed',
              errorMessage: emailErr.message,
            },
          });
        } catch (logErr) {
          // Ignore duplicate key errors
        }
      }
    }
  } catch (error) {
    console.error('[EmailInvoice] ✗ Fatal error:', error.message);
    results.errors.push({ error: error.message });
  }

  console.log(`[EmailInvoice] ✓ Done. Scanned: ${results.emailsScanned}, Processed: ${results.emailsProcessed}, Bills: ${results.billsCreated}, Failed: ${results.emailsFailed}`);
  return results;
}

/**
 * Re-process a failed email by its log ID
 */
async function retryFailedEmail(logId, userId) {
  const log = await prisma.emailProcessingLog.findUnique({ where: { id: logId } });
  if (!log) throw new Error('Processing log not found');
  if (log.status !== 'failed') throw new Error('Only failed emails can be retried');

  // Delete the old log so we can re-process
  await prisma.emailProcessingLog.delete({ where: { id: logId } });

  // Re-run processing for this message
  const result = await fetchAndProcessEmails(userId, 1);
  return result;
}

module.exports = {
  fetchAndProcessEmails,
  processAttachment,
  saveBillFromParsedData,
  retryFailedEmail,
};
