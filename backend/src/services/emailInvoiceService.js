/**
 * Email Invoice Service (Orchestrator)
 * Ties together: Zoho Mail → Download Attachments → OCR/AI Parse → Save Bill
 * 
 * Smart features:
 * - User can select specific emails to process
 * - Detects bills in email body text (not just attachments)
 * - AI-powered bill detection tells user which emails contain bills
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
 * Strip HTML tags from email body to get plain text
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<\/th>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * AI-powered bill detection: Analyze content to determine if it's a bill/invoice
 * @param {string} subject - Email subject
 * @param {string} bodyText - Plain text content of email
 * @param {boolean} hasAttachments - Whether email has supported attachments
 * @returns {Object} { isBill: boolean, confidence: number, reason: string, billType: string }
 */
async function detectBillContent(subject, bodyText, hasAttachments) {
  // Quick keyword-based pre-check for efficiency
  const combinedText = `${subject} ${bodyText}`.toLowerCase();
  const billKeywords = [
    'invoice', 'bill', 'receipt', 'purchase order', 'tax invoice',
    'proforma', 'credit note', 'debit note', 'challan', 'quotation',
    'gstin', 'gst', 'cgst', 'sgst', 'hsn', 'batch', 'expiry',
    'qty', 'quantity', 'rate', 'amount', 'total', 'subtotal',
    'mrp', 'discount', 'net amount', 'grand total', 'round off',
    'dl no', 'drug license', 'pharmacy', 'medicine', 'tablet',
    'capsule', 'syrup', 'injection'
  ];

  const keywordMatches = billKeywords.filter(kw => combinedText.includes(kw));
  
  // Fast path: if very few keywords match and no attachments, it's probably not a bill
  if (keywordMatches.length === 0 && !hasAttachments) {
    return {
      isBill: false,
      confidence: 0.95,
      reason: 'No bill-related keywords found',
      billType: 'none',
    };
  }

  // Fast path: strong keyword match = definitely a bill
  if (keywordMatches.length >= 5) {
    const hasItems = /\d+\s*(tab|cap|strip|bottle|vial|amp|inj|syrup|ml|mg|gm)/i.test(bodyText);
    const hasAmounts = /₹?\s*\d+\.?\d*/.test(bodyText);
    
    if (hasItems && hasAmounts) {
      return {
        isBill: true,
        confidence: 0.95,
        reason: `Strong bill indicators: ${keywordMatches.slice(0, 5).join(', ')}`,
        billType: bodyText.trim().length > 100 ? 'body-text' : 'attachment',
      };
    }
  }

  // For moderate matches, use AI for precise detection
  if (keywordMatches.length >= 2 || hasAttachments) {
    try {
      const Groq = require('groq-sdk');
      const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });

      const truncatedBody = bodyText.substring(0, 2000); // Limit to save tokens
      const response = await groqClient.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You analyze emails to detect if they contain pharmacy/medical invoices or bills. Return ONLY valid JSON.',
          },
          {
            role: 'user',
            content: `Analyze this email and determine if it contains a pharmacy/medical bill or invoice.

Subject: ${subject}
Body (first 2000 chars):
${truncatedBody}

Has file attachments: ${hasAttachments ? 'Yes' : 'No'}

Return JSON:
{
  "isBill": true/false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation",
  "billType": "body-text" | "attachment" | "both" | "none"
}

billType meanings:
- "body-text" = the bill/invoice data is in the email text itself
- "attachment" = bill is likely in the attached files
- "both" = both body and attachments contain bill info
- "none" = not a bill`,
          },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        max_tokens: 256,
        response_format: { type: 'json_object' },
      });

      const text = response.choices[0]?.message?.content || '';
      const parsed = JSON.parse(text);
      console.log(`[BillDetect] "${subject}" → isBill: ${parsed.isBill}, type: ${parsed.billType}, confidence: ${parsed.confidence}`);
      return parsed;
    } catch (aiErr) {
      console.warn('[BillDetect] AI detection failed, using keyword fallback:', aiErr.message);
    }
  }

  // Fallback: keyword-based decision
  return {
    isBill: keywordMatches.length >= 3 || hasAttachments,
    confidence: Math.min(0.5 + keywordMatches.length * 0.1, 0.85),
    reason: keywordMatches.length > 0 ? `Keywords found: ${keywordMatches.join(', ')}` : 'No bill indicators',
    billType: hasAttachments ? 'attachment' : keywordMatches.length >= 3 ? 'body-text' : 'none',
  };
}

/**
 * Process email body text as a bill through AI
 * @param {string} bodyText - Plain text email content
 * @param {string} subject - Email subject (for context)
 * @returns {Object} { parsedData, ocrText }
 */
async function processEmailBodyText(bodyText, subject) {
  if (!bodyText || bodyText.trim().length < 30) {
    throw new Error('Email body text too short to extract bill data');
  }

  // Add subject as context hint to the body
  const fullText = `Email Subject: ${subject}\n\n${bodyText}`;

  try {
    const parsedData = await parseOcrWithGemini(fullText);
    console.log(`[EmailInvoice] ✓ AI parsed email body: ${parsedData?.items?.length || 0} items`);
    return { parsedData, ocrText: fullText };
  } catch (err) {
    console.error('[EmailInvoice] ✗ Email body parsing failed:', err.message);
    throw new Error(`Failed to parse email body: ${err.message}`);
  }
}

// ============================================================================
// LIST INBOX EMAILS (for user to browse and select)
// ============================================================================

/**
 * List emails from Zoho inbox with smart bill detection
 * Returns emails with metadata + bill likelihood so frontend can display them
 * @param {number} limit - Max emails to fetch
 * @param {string} searchKey - Optional search keyword
 * @returns {Array} Enriched email list
 */
async function listInboxEmails(limit = 30, searchKey = null) {
  // Fetch emails
  let emails;
  if (searchKey) {
    emails = await zohoMailService.searchEmails(searchKey, limit);
  } else {
    emails = await zohoMailService.fetchEmails(limit);
  }

  // Enrich each email with detection info and processing status
  const enrichedEmails = [];

  for (const email of emails) {
    const messageId = String(email.messageId);
    const folderId = email.folderId;
    const subject = email.subject || '(no subject)';
    const sender = email.fromAddress || email.sender || '';
    const hasAtt = String(email.hasAttachment) === '1' || email.hasAttachment === true;
    const receivedTime = email.receivedTime ? new Date(parseInt(email.receivedTime)) : null;

    // Check if already processed
    let processingStatus = null;
    try {
      const existing = await prisma.emailProcessingLog.findUnique({
        where: { messageId },
      });
      if (existing) {
        processingStatus = {
          status: existing.status,
          billsCreated: existing.billsCreated || 0,
          processedAt: existing.processedAt,
        };
      }
    } catch (e) {
      // Ignore
    }

    // Get a short preview of the email content
    let bodyPreview = email.summary || '';
    let bodyText = '';

    // Try to get body text for bill detection (only first batch)
    if (enrichedEmails.length < 15) {
      try {
        const content = await zohoMailService.getEmailContent(messageId, folderId);
        if (content) {
          const rawHtml = content.content || content.htmlContent || content;
          bodyText = typeof rawHtml === 'string' ? stripHtml(rawHtml) : '';
          bodyPreview = bodyText.substring(0, 200);
        }
      } catch (e) {
        // If content fetch fails, we still have the summary
      }
    }

    // Run bill detection
    let billDetection = { isBill: false, confidence: 0, reason: '', billType: 'none' };
    try {
      billDetection = await detectBillContent(subject, bodyText || bodyPreview, hasAtt);
    } catch (e) {
      console.warn(`[EmailInvoice] Detection failed for "${subject}":`, e.message);
    }

    enrichedEmails.push({
      messageId,
      folderId,
      subject,
      sender,
      receivedTime,
      hasAttachments: hasAtt,
      preview: bodyPreview.substring(0, 200),
      billDetection,
      processingStatus,
    });
  }

  return enrichedEmails;
}

// ============================================================================
// PROCESS SELECTED EMAILS (user picks which ones to extract)
// ============================================================================

/**
 * Process user-selected emails — handles both attachments AND body text
 * @param {string} userId - User ID
 * @param {Array} selectedEmails - Array of { messageId, folderId } objects
 * @returns {Object} Processing results
 */
async function processSelectedEmails(userId, selectedEmails) {
  const results = {
    total: selectedEmails.length,
    processed: 0,
    failed: 0,
    skipped: 0,
    billsCreated: 0,
    details: [],
  };

  for (const { messageId, folderId } of selectedEmails) {
    const msgId = String(messageId);
    let subject = '';
    let sender = '';

    try {
      // Check if already processed
      const existing = await prisma.emailProcessingLog.findUnique({
        where: { messageId: msgId },
      });
      if (existing && existing.status === 'processed') {
        results.skipped++;
        results.details.push({
          messageId: msgId,
          status: 'skipped',
          reason: 'Already processed',
        });
        continue;
      }

      // Delete old failed/skipped log so we can re-process
      if (existing) {
        await prisma.emailProcessingLog.delete({ where: { id: existing.id } });
      }

      // Get basic email details
      const emailDetails = await zohoMailService.getEmailDetails(messageId, folderId);
      subject = emailDetails?.subject || '(no subject)';
      sender = emailDetails?.fromAddress || emailDetails?.sender || '';

      let billsFromThisEmail = 0;
      const errors = [];

      // ===== STEP 1: Try attachments first =====
      const attachments = emailDetails?.attachments || [];
      const supportedAttachments = attachments.filter(isSupportedAttachment);

      if (supportedAttachments.length > 0) {
        for (const attachment of supportedAttachments) {
          try {
            const attachmentId = attachment.attachmentId;
            const attachmentName = attachment.attachmentName || 'attachment';
            const ext = path.extname(attachmentName).toLowerCase();
            const mimeType =
              ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : 'image/jpeg';

            console.log(`[EmailInvoice] Downloading attachment: ${attachmentName}`);
            const fileBuffer = await zohoMailService.downloadAttachment(messageId, attachmentId, folderId);
            const { parsedData, ocrText } = await processAttachment(fileBuffer, attachmentName, mimeType);

            if (parsedData && parsedData.items && parsedData.items.length > 0) {
              const bill = await saveBillFromParsedData(userId, parsedData, ocrText, `zoho-email-${msgId}`);
              billsFromThisEmail++;
              results.billsCreated++;
              console.log(`[EmailInvoice] ✓ Bill from attachment: ${bill.id}`);
            } else {
              errors.push(`${attachmentName}: No items found`);
            }
          } catch (attErr) {
            errors.push(`${attachment.attachmentName}: ${attErr.message}`);
          }
        }
      }

      // ===== STEP 2: Try email body text (if no bills from attachments or no attachments) =====
      if (billsFromThisEmail === 0) {
        try {
          const content = await zohoMailService.getEmailContent(messageId, folderId);
          if (content) {
            const rawHtml = content.content || content.htmlContent || content;
            const bodyText = typeof rawHtml === 'string' ? stripHtml(rawHtml) : '';

            if (bodyText.length > 50) {
              // Check if the body actually looks like a bill
              const detection = await detectBillContent(subject, bodyText, false);

              if (detection.isBill && (detection.billType === 'body-text' || detection.billType === 'both')) {
                console.log(`[EmailInvoice] Processing email body as bill (confidence: ${detection.confidence})`);
                const { parsedData, ocrText } = await processEmailBodyText(bodyText, subject);

                if (parsedData && parsedData.items && parsedData.items.length > 0) {
                  const bill = await saveBillFromParsedData(userId, parsedData, ocrText, `zoho-email-body-${msgId}`);
                  billsFromThisEmail++;
                  results.billsCreated++;
                  console.log(`[EmailInvoice] ✓ Bill from email body: ${bill.id}`);
                } else {
                  errors.push('Email body: AI could not extract items');
                }
              } else {
                errors.push('Email body does not appear to contain bill data');
              }
            } else {
              errors.push('Email body too short for bill extraction');
            }
          }
        } catch (bodyErr) {
          errors.push(`Email body: ${bodyErr.message}`);
        }
      }

      // ===== STEP 3: Log results =====
      const status = billsFromThisEmail > 0 ? 'processed' : errors.length > 0 ? 'failed' : 'skipped';
      await prisma.emailProcessingLog.create({
        data: {
          messageId: msgId,
          subject,
          sender,
          emailDate: new Date(),
          attachments: supportedAttachments.length,
          billsCreated: billsFromThisEmail,
          status,
          errorMessage: errors.length > 0 ? errors.join('; ') : null,
        },
      });

      if (billsFromThisEmail > 0) {
        results.processed++;
        await zohoMailService.markAsRead(messageId, folderId);
      } else {
        results.failed++;
      }

      results.details.push({
        messageId: msgId,
        subject,
        status,
        billsCreated: billsFromThisEmail,
        errors,
      });
    } catch (emailErr) {
      console.error(`[EmailInvoice] ✗ Error processing ${msgId}:`, emailErr.message);
      results.failed++;
      results.details.push({
        messageId: msgId,
        subject,
        status: 'failed',
        errors: [emailErr.message],
      });

      try {
        await prisma.emailProcessingLog.create({
          data: {
            messageId: msgId,
            subject,
            sender,
            status: 'failed',
            errorMessage: emailErr.message,
          },
        });
      } catch (logErr) {
        // Ignore duplicate
      }
    }
  }

  console.log(`[EmailInvoice] ✓ Selected processing done. Processed: ${results.processed}, Bills: ${results.billsCreated}`);
  return results;
}

// ============================================================================
// ORIGINAL: Process a single attachment through OCR + AI pipeline
// ============================================================================

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
    try {
      const pdfParse = require('pdf-parse');
      const pdfData = await pdfParse(fileBuffer);
      ocrText = pdfData.text || '';
      console.log(`[EmailInvoice] PDF text extracted: ${ocrText.length} chars`);

      if (ocrText.trim().length < 50) {
        console.log('[EmailInvoice] PDF appears to be image-based, attempting Vision AI...');
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
    try {
      const base64 = fileBuffer.toString('base64');
      parsedData = await parseImageWithVision(base64, mimeType, '');
      console.log(`[EmailInvoice] ✓ Vision AI parsed image: ${parsedData?.items?.length || 0} items`);
    } catch (visionErr) {
      console.warn('[EmailInvoice] Vision AI failed, trying OCR.space:', visionErr.message);
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

  if (ocrText.length > 20 && !parsedData) {
    try {
      parsedData = await parseOcrWithGemini(ocrText);
      console.log(`[EmailInvoice] ✓ AI parsed OCR text: ${parsedData?.items?.length || 0} items`);
    } catch (aiErr) {
      console.error('[EmailInvoice] AI parsing failed:', aiErr.message);
    }
  }

  return {
    parsedData,
    ocrText,
    fileName,
  };
}

// ============================================================================
// SAVE BILL
// ============================================================================

/**
 * Save parsed data as a Bill + BillItems record
 */
async function saveBillFromParsedData(userId, parsedData, ocrText, source = 'zoho-email') {
  if (!parsedData) {
    throw new Error('No parsed data to save');
  }

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

  const bill = await prisma.bill.create({
    data: {
      userId,
      distributorId,
      fileName: parsedData.invoiceNumber || 'email-invoice',
      filePath: `email://${source}`,
      fileSize: 0,
      mimeType: 'application/pdf',

      pharmacyName: parsedData.pharmacyName || null,
      shopAddress: parsedData.shopAddress || null,
      phoneNumbers: parsedData.phoneNumbers ? JSON.stringify(parsedData.phoneNumbers) : null,

      invoiceNumber: parsedData.invoiceNumber || null,
      invoiceDate: parsedData.invoiceDate ? parseDateString(parsedData.invoiceDate) : null,

      subtotal: parsedData.subtotal ? parseFloat(parsedData.subtotal) : null,
      cgst: parsedData.cgst ? parseFloat(parsedData.cgst) : null,
      sgst: parsedData.sgst ? parseFloat(parsedData.sgst) : null,
      totalGst: parsedData.totalGst ? parseFloat(parsedData.totalGst) : null,
      discountAmount: parsedData.discountAmount ? parseFloat(parsedData.discountAmount) : null,
      roundOff: parsedData.roundOff ? parseFloat(parsedData.roundOff) : null,
      grandTotal: parsedData.grandTotal ? parseFloat(parsedData.grandTotal) : null,

      paymentType: parsedData.paymentType || null,

      rawOcrText: ocrText || null,
      ocrEngine: 'zoho-email',
      aiParser: 'gemini-ai',
      processedAt: new Date(),
      status: 'completed',

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

// ============================================================================
// ORIGINAL: Auto-fetch all emails (legacy)
// ============================================================================

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
    console.log(`[EmailInvoice] Fetching up to ${limit} emails from Zoho...`);
    const emails = await zohoMailService.fetchEmails(limit);
    results.emailsScanned = emails.length;

    for (const email of emails) {
      const messageId = email.messageId;
      const folderId = email.folderId;
      const subject = email.subject || '(no subject)';
      const sender = email.fromAddress || email.sender || '';

      try {
        const existing = await prisma.emailProcessingLog.findUnique({
          where: { messageId: String(messageId) },
        });

        if (existing) {
          results.emailsSkipped++;
          continue;
        }

        const hasAtt = String(email.hasAttachment) === '1' || email.hasAttachment === true;
        if (!hasAtt) {
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

        let billsFromThisEmail = 0;
        const attachmentErrors = [];

        for (const attachment of supportedAttachments) {
          try {
            const attachmentId = attachment.attachmentId;
            const attachmentName = attachment.attachmentName || 'attachment';
            const ext = path.extname(attachmentName).toLowerCase();
            const mimeType =
              ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : 'image/jpeg';

            const fileBuffer = await zohoMailService.downloadAttachment(messageId, attachmentId, folderId);
            const { parsedData, ocrText } = await processAttachment(fileBuffer, attachmentName, mimeType);

            if (parsedData && parsedData.items && parsedData.items.length > 0) {
              const bill = await saveBillFromParsedData(userId, parsedData, ocrText, `zoho-email-${messageId}`);
              billsFromThisEmail++;
              results.billsCreated++;
              console.log(`[EmailInvoice] ✓ Bill saved: ${bill.id} (${parsedData.items.length} items)`);
            } else {
              attachmentErrors.push(`${attachmentName}: No items extracted`);
            }
          } catch (attachErr) {
            attachmentErrors.push(`${attachment.attachmentName}: ${attachErr.message}`);
          }
        }

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
          // Ignore duplicate
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

  await prisma.emailProcessingLog.delete({ where: { id: logId } });
  const result = await fetchAndProcessEmails(userId, 1);
  return result;
}

module.exports = {
  fetchAndProcessEmails,
  processAttachment,
  saveBillFromParsedData,
  retryFailedEmail,
  // New smart features
  listInboxEmails,
  processSelectedEmails,
  detectBillContent,
  processEmailBodyText,
};
