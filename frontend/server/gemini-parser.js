/**
 * ============================================================================
 * GOOGLE GEMINI API - INVOICE PARSER SERVICE
 * ============================================================================
 * 
 * Uses Google Generative AI (Gemini) to intelligently parse OCR text from
 * pharmacy invoices into structured BillFormData format.
 * 
 * Key principles:
 * - Never hallucinate missing values (return null)
 * - Distinguish MRP vs Rate vs Amount based on invoice semantics
 * - Return clean JSON only
 * - Flag ambiguous items with needsReview: true
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Parse OCR text using Gemini with expert prompt engineering
 * @param {string} ocrText - Raw OCR text from bill image
 * @returns {Promise<Object>} - Parsed BillFormData structure
 */
async function parseInvoiceOCR(ocrText) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const systemPrompt = `You are an expert pharmacy invoice parser. Your task is to parse OCR-extracted text from Indian pharmacy bills and return ONLY valid JSON (no markdown, no explanation).

CRITICAL RULES:
1. NEVER hallucinate values - if unsure, use null
2. Return ONLY valid JSON - no text, no markdown backticks
3. Distinguish semantically:
   - MRP = Maximum Retail Price (printed on medicine box, fixed)
   - Rate = Selling price per unit (what pharmacy sells for)
   - Amount = Final line total for that item (quantity × rate - discount + GST)
4. For GST: If CGST% and SGST% both present, total GST = CGST + SGST. Otherwise use provided GST%.
5. Set needsReview: true if:
   - Quantity or rate unclear (OCR noise)
   - Calculation mismatch detected
   - Multiple interpretations possible
6. For dates: use DD/MM/YYYY format (Indian format)
7. All monetary values as numbers (no symbols or commas)
8. Return complete structure even if sections are incomplete

RESPONSE FORMAT - Return ONLY this JSON structure:
{
  "pharmacyName": "string or null",
  "shopAddress": "string or null",
  "phoneNumbers": "comma-separated string or null",
  "gstin": "string or null",
  "dlNumber": "string or null",
  "invoiceNumber": "string or null",
  "invoiceDate": "DD/MM/YYYY or null",
  "dueDate": "DD/MM/YYYY or null",
  "paymentType": "cash" or "credit" or null",
  "items": [
    {
      "name": "medicine name",
      "quantity": number or null,
      "freeQuantity": number or null,
      "unit": "tabs/strips/pcs/ml/gm/etc or null",
      "manufacturer": "string or null",
      "batchNumber": "string or null",
      "expiryDate": "MM/YY or null",
      "hsnCode": "string or null",
      "mrp": number or null,
      "rate": number or null,
      "discount": number or null,
      "discountPercent": number or null,
      "cgstPercent": number or null,
      "sgstPercent": number or null,
      "gstPercent": number or null,
      "itemTotal": number or null,
      "needsReview": boolean,
      "reviewReason": ["array of reasons if needsReview is true"]
    }
  ],
  "subtotal": number,
  "cgst": number,
  "sgst": number,
  "totalGst": number,
  "roundOff": number or null,
  "grandTotal": number
}

ITEM PARSING RULES:
- Each line with a medicine name = one item
- "Qty" column = quantity (required)
- "Free" / "FREE Qty" = freeQuantity
- Find unit after quantity (tabs, strips, pcs, ml, gm, etc.)
- "MRP" column = MRP (fixed retail price)
- "Rate" = selling price per unit (what pharmacy charges)
- Amount = final line total (should equal: (qty × rate - discount) + GST, but OCR errors may exist)
- Discount = absolute amount OR discountPercent = percentage
- "GST" / "TAX" columns indicate percentage
- If separate CGST/SGST columns exist, use those; otherwise use single GST%

TOTALS CALCULATION:
- subtotal = sum of (quantity × rate - discount) for all items before GST
- If CGST% and SGST% columns exist: 
  - cgst = subtotal × (CGST% / 100) [sum per item CGST]
  - sgst = subtotal × (SGST% / 100) [sum per item SGST]
  - totalGst = cgst + sgst
- Else: use provided GST total
- roundOff = if present (usually small adjustment)
- grandTotal = subtotal + totalGst + (roundOff || 0)`;

    const userMessage = `Parse this pharmacy bill OCR text and return ONLY the JSON structure. Do not include markdown, backticks, or explanations:\n\n${ocrText}`;

    const result = await model.generateContent([
      {
        role: 'user',
        parts: [{ text: userMessage }],
      },
    ]);

    const responseText = result.response.text();

    // Extract JSON from response (handle potential markdown wrapping)
    let jsonText = responseText.trim();
    
    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    // Parse JSON
    const parsedData = JSON.parse(jsonText);

    // Validate and normalize response
    return normalizeParserOutput(parsedData);
  } catch (error) {
    console.error('Gemini parsing error:', error.message);
    throw new Error(`Failed to parse OCR text with Gemini: ${error.message}`);
  }
}

/**
 * Validate and normalize Gemini output to match BillFormData structure
 * @param {Object} data - Raw Gemini response
 * @returns {Object} - Validated BillFormData
 */
function normalizeParserOutput(data) {
  // Default structure
  const normalized = {
    pharmacyName: data.pharmacyName || '',
    shopAddress: data.shopAddress || '',
    phoneNumbers: data.phoneNumbers || '',
    gstin: data.gstin || '',
    dlNumber: data.dlNumber || '',
    invoiceNumber: data.invoiceNumber || '',
    invoiceDate: data.invoiceDate || '',
    dueDate: data.dueDate || null,
    paymentType: data.paymentType || 'cash',
    items: [],
    subtotal: 0,
    cgst: 0,
    sgst: 0,
    totalGst: 0,
    roundOff: data.roundOff || 0,
    grandTotal: 0,
  };

  // Validate and normalize items
  if (Array.isArray(data.items)) {
    normalized.items = data.items.map((item, index) => ({
      id: `item-${Date.now()}-${index}`,
      name: item.name || '',
      quantity: Number(item.quantity) || null,
      freeQuantity: Number(item.freeQuantity) || undefined,
      unit: item.unit || '',
      manufacturer: item.manufacturer || undefined,
      batchNumber: item.batchNumber || undefined,
      expiryDate: item.expiryDate || undefined,
      hsnCode: item.hsnCode || undefined,
      mrp: item.mrp ? Number(item.mrp) : undefined,
      rate: Number(item.rate) || 0,
      discount: item.discount ? Number(item.discount) : undefined,
      discountPercent: item.discountPercent ? Number(item.discountPercent) : undefined,
      cgstPercent: item.cgstPercent ? Number(item.cgstPercent) : undefined,
      sgstPercent: item.sgstPercent ? Number(item.sgstPercent) : undefined,
      gstPercent: Number(item.gstPercent) || 0,
      itemTotal: item.itemTotal ? Number(item.itemTotal) : undefined,
      needsReview: item.needsReview || false,
      reviewReason: item.reviewReason || [],
    }));
  }

  // Set totals from Gemini response or calculate
  normalized.subtotal = Number(data.subtotal) || 0;
  normalized.cgst = Number(data.cgst) || 0;
  normalized.sgst = Number(data.sgst) || 0;
  normalized.totalGst = Number(data.totalGst) || (normalized.cgst + normalized.sgst);
  normalized.roundOff = Number(data.roundOff) || 0;
  normalized.grandTotal = Number(data.grandTotal) || 
    (normalized.subtotal + normalized.totalGst + normalized.roundOff);

  return normalized;
}

module.exports = {
  parseInvoiceOCR,
  normalizeParserOutput,
};
