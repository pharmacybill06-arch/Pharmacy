const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini AI
let genAI = null;
let geminiModel = null;

function initializeGemini() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  
  if (!apiKey) {
    console.warn('[GeminiService] ⚠️ GEMINI_API_KEY not found in environment');
    return false;
  }

  try {
    genAI = new GoogleGenerativeAI(apiKey);
    geminiModel = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      }
    });
    console.log('[GeminiService] ✓ Gemini AI initialized successfully');
    return true;
  } catch (error) {
    console.error('[GeminiService] ✗ Failed to initialize:', error.message);
    return false;
  }
}

/**
 * Parse OCR text using Gemini AI to extract structured bill data
 * @param {string} ocrText - Raw OCR text from bill image
 * @returns {Promise<Object>} Parsed bill data
 */
async function parseOcrWithGemini(ocrText) {
  // Initialize if not already done
  if (!geminiModel) {
    const initialized = initializeGemini();
    if (!initialized) {
      throw new Error('Gemini AI is not configured. Please set GEMINI_API_KEY in .env');
    }
  }

  const prompt = `
You extract data from an Indian pharmacy bill OCR.

Return ONLY valid JSON (no markdown, no extra text).
If a value is missing, return null or 0.

Schema:
{
  "pharmacyName": string|null,
  "shopAddress": string|null,
  "phoneNumbers": string[]|null,
  "gstin": string|null,
  "dlNumber": string|null,
  "invoiceNumber": string|null,
  "invoiceDate": "DD-MM-YYYY"|null,
  "dueDate": "DD-MM-YYYY"|null,
  "paymentType": "cash"|"credit"|null,

  "items": [
    {
      "sn": number|null,
      "name": string|null,
      "quantity": number|null,
      "freeQuantity": number|null,
      "unit": string|null,
      "manufacturer": string|null,
      "batchNumber": string|null,
      "expiryDate": "DD-MM-YYYY"|null,
      "hsnCode": string|null,
      "mrp": number|null,
      "rate": number|null,
      "discount": number|null,
      "discountPercent": number|null,
      "gstPercent": number|null,
      "sgstPercent": number|null,
      "cgstPercent": number|null,
      "itemTotal": number|null
    }
  ],

  "subtotal": number|null,
  "discountPercent": number|null,
  "discountAmount": number|null,
  "cgst": number|null,
  "sgst": number|null,
  "totalGst": number|null,
  "roundOff": number|null,
  "grandTotal": number|null
}

CRITICAL EXTRACTION RULES:

1. ITEM QUANTITY & RATE:
   - Look for "Qty" or "Quantity" column for item quantities
   - Look for "Rate" or "Price" or "Amount" columns
   - If quantity is not visible, check if total amount divided by rate gives a sensible number
   - NEVER leave quantity as null/0 if item has a rate and total

2. TOTALS - EXTRACT EXACTLY FROM BILL:
   - Copy subtotal, CGST, SGST, total GST, and grand total EXACTLY as shown
   - Look for keywords: "SUB TOTAL", "CGST", "SGST", "TOTAL GST", "GRAND TOTAL"
   - These are usually at the bottom of the bill
   - If CGST and SGST are shown separately, add them for totalGst
   - NEVER calculate - ALWAYS extract from bill text

3. ITEM-LEVEL FIELDS (pharmaceutical invoices):
   - sn: Serial number from bill (1, 2, 3, etc.)
   - manufacturer: Brand/manufacturer name (e.g., "CIPLA", "GSK", "LEEFORD")
   - batchNumber: Batch/Lot number (e.g., "A1B2C3", "ATZ501A")
   - expiryDate: Expiry date in DD-MM-YYYY or MM-YY format
   - hsnCode: HSN code for GST (e.g., "3004", "3002")
   - freeQuantity: Free quantity if mentioned (e.g., "Buy 2 Get 1 Free")

4. PAYMENT TYPE:
   - Must be lowercase: "cash" or "credit"
   - Look for keywords like "CREDIT", "CASH", "PAID"

5. PHONE NUMBERS:
   - Extract as array of strings
   - Format: ["9876543210", "0123456789"]

OCR TEXT:
${ocrText}
`;

  try {
    console.log('[GeminiService] Sending request to Gemini AI...');
    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log('[GeminiService] ✓ Received response from Gemini');
    
    // Extract JSON from response (remove markdown if present)
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '').replace(/```\n?$/g, '');
    }

    // Find JSON object
    const start = jsonText.indexOf('{');
    const end = jsonText.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      jsonText = jsonText.slice(start, end + 1);
    }

    const parsed = JSON.parse(jsonText);
    
    // Normalize the data
    const normalized = normalizeBillData(parsed);
    
    console.log('[GeminiService] ✓ Successfully parsed bill data');
    console.log(`[GeminiService] Extracted: ${normalized.items?.length || 0} items`);
    
    return normalized;
  } catch (error) {
    console.error('[GeminiService] ✗ Parsing failed:', error.message);
    throw new Error(`Gemini parsing failed: ${error.message}`);
  }
}

/**
 * Normalize and validate parsed bill data
 */
function normalizeBillData(parsed) {
  const items = Array.isArray(parsed.items) ? parsed.items : [];

  // Normalize payment type
  let paymentType = parsed.paymentType;
  if (typeof paymentType === 'string') {
    paymentType = paymentType.toLowerCase();
    if (paymentType.includes('credit')) paymentType = 'credit';
    else if (paymentType.includes('cash')) paymentType = 'cash';
  }

  // Normalize phone numbers (always array)
  let phoneNumbers = parsed.phoneNumbers;
  if (typeof phoneNumbers === 'string') {
    phoneNumbers = phoneNumbers
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(phoneNumbers)) phoneNumbers = [];

  // Normalize items
  const normalizedItems = items.map((it, idx) => {
    const qty = Number(it.quantity) || 0;
    const rate = Number(it.rate) || 0;

    // Use itemTotal if provided; else compute qty*rate
    let itemTotal = it.itemTotal;
    if (itemTotal == null || itemTotal === '') {
      itemTotal = qty * rate;
    } else {
      itemTotal = Number(itemTotal) || 0;
    }

    return {
      sn: it.sn != null ? Number(it.sn) : idx + 1,
      name: it.name || '',
      quantity: qty,
      freeQuantity: it.freeQuantity != null ? Number(it.freeQuantity) : undefined,
      unit: it.unit || inferUnit(it.name),
      
      // Preserve medicine identity fields
      manufacturer: it.manufacturer || undefined,
      batchNumber: it.batchNumber || undefined,
      expiryDate: it.expiryDate || undefined,
      hsnCode: it.hsnCode || undefined,
      
      // Prices
      mrp: it.mrp != null ? Number(it.mrp) : undefined,
      rate,
      
      // Discount/taxes
      discount: it.discount != null ? Number(it.discount) : undefined,
      discountPercent: it.discountPercent != null ? Number(it.discountPercent) : undefined,
      gstPercent: it.gstPercent != null ? Number(it.gstPercent) : 0,
      sgstPercent: it.sgstPercent != null ? Number(it.sgstPercent) : undefined,
      cgstPercent: it.cgstPercent != null ? Number(it.cgstPercent) : undefined,
      
      // Totals
      itemTotal: round2(itemTotal),
    };
  });

  const subtotalFromItems = round2(
    normalizedItems.reduce((sum, it) => sum + (Number(it.itemTotal) || 0), 0)
  );

  // Totals
  const cgst = Number(parsed.cgst) || 0;
  const sgst = Number(parsed.sgst) || 0;

  let totalGst = Number(parsed.totalGst);
  if (!totalGst) totalGst = cgst + sgst;

  const discountAmount = Number(parsed.discountAmount) || 0;
  const roundOff = Number(parsed.roundOff) || 0;

  // Subtotal: prefer parsed subtotal if present else computed
  let subtotal = Number(parsed.subtotal);
  if (!subtotal) subtotal = subtotalFromItems;

  // Grand total computed (fallback)
  const computedGrand = round2(subtotal + totalGst - discountAmount + roundOff);

  return {
    pharmacyName: parsed.pharmacyName || '',
    shopAddress: parsed.shopAddress || '',
    phoneNumbers,
    gstin: parsed.gstin || '',
    dlNumber: parsed.dlNumber || '',
    invoiceNumber: parsed.invoiceNumber || '',
    invoiceDate: parsed.invoiceDate || '',
    dueDate: parsed.dueDate || undefined,
    paymentType,
    
    items: normalizedItems,
    
    subtotal: round2(subtotal),
    discountPercent: parsed.discountPercent != null ? Number(parsed.discountPercent) : undefined,
    discountAmount: round2(discountAmount),
    cgst: round2(cgst),
    sgst: round2(sgst),
    totalGst: round2(totalGst),
    roundOff: round2(roundOff),
    grandTotal:
      parsed.grandTotal != null && parsed.grandTotal !== ''
        ? round2(parsed.grandTotal)
        : computedGrand,
  };
}

// Helper functions
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function inferUnit(name = '') {
  const t = name.toUpperCase();
  if (t.includes('SACHET')) return 'sachet';
  if (t.includes('TAB')) return 'tabs';
  if (t.includes('CAP')) return 'caps';
  if (t.includes('SYRUP')) return 'bottle';
  if (t.includes('STRIP')) return 'strip';
  return 'units';
}

module.exports = {
  parseOcrWithGemini,
  initializeGemini,
};
