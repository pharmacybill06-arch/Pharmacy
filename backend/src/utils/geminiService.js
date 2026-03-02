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
You are an expert Indian pharmacy invoice parser. Parse the OCR text below into structured JSON.

Return ONLY valid JSON (no markdown, no extra text). If a value is missing, return null or 0.

IMPORTANT: "pharmacyName" must be the SELLER/DISTRIBUTOR/SUPPLIER name (the company who issued the invoice), NOT the buyer/customer.

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

=== CRITICAL COLUMN-TO-FIELD ALIGNMENT RULES ===

STEP 1 - IDENTIFY THE TABLE HEADER ROW:
- Find the header row containing column keywords like: S.No, Item/Product/Particular, Pack/Packing, HSN, Batch, Expiry, Mfg, Qty, Free, Schm, MRP, Rate, Disc/Dis%, GST%, CGST, SGST, Amount/Amt/Net Amt/Value/Total
- The POSITION of each header determines which DATA VALUE goes into which field for EVERY item row
- Map each header to the correct field:
  * "S.No" / "SN" / "Sr" / "#" → sn
  * "Item" / "Product" / "Particular" / "Description" / "Medicine" → name
  * "Pack" / "Packing" / "Pkg" → unit (e.g. "10T" means strip of 10 tablets)
  * "HSN" / "HSN Code" → hsnCode
  * "Batch" / "B.No" / "Batch No" / "Lot" → batchNumber
  * "Expiry" / "Exp" / "Exp Dt" → expiryDate
  * "Mfg" / "Manufacturer" / "Company" → manufacturer
  * "Qty" / "Quantity" → quantity
  * "Free" / "Schm" / "Scheme" → freeQuantity
  * "MRP" / "M.R.P" → mrp (Maximum Retail Price per unit)
  * "Rate" / "Rt" / "Price" / "P.Rate" / "Pur Rate" / "Net Rate" → rate (per-unit selling/purchase price)
  * "Dis" / "Dis%" / "Disc" / "Disc%" / "Discount" → discountPercent (if %) or discount (if amount)
  * "GST%" / "Tax%" → gstPercent
  * "CGST" / "CGST%" → cgstPercent
  * "SGST" / "SGST%" → sgstPercent
  * "Amt" / "Amount" / "Net Amt" / "Value" / "Total" / "Net" → itemTotal

STEP 2 - FOR EACH ITEM ROW, READ VALUES BY COLUMN POSITION:
- Read each value in the SAME column position as its header
- DO NOT guess or shuffle values between columns
- If OCR merged columns, use context to separate (e.g. "100.00 12%" → rate=100.00, gstPercent=12)

STEP 3 - DISTINGUISH PRICE FIELDS PRECISELY (THIS IS THE MOST IMPORTANT STEP):
- MRP and Rate are TWO COMPLETELY DIFFERENT AND INDEPENDENT fields. NEVER mix them up.
- MRP = Maximum Retail Price (government-regulated price printed on medicine packaging). Read EXACTLY from the "MRP" column.
- Rate = Purchase/selling price per unit (the actual price charged by distributor). Read EXACTLY from the "Rate" / "P.Rate" / "Net Rate" column.
- MRP and Rate CAN have any relationship: MRP > Rate, MRP < Rate, or MRP = Rate. Do NOT assume MRP >= Rate.
- itemTotal = Line total amount from the "Amount" / "Amt" / "Net Amt" / "Value" column.
- CRITICAL: Read each value from its OWN column. If header says "MRP" → mrp. If "Rate" → rate. If "Amt" → itemTotal.
- If the bill has BOTH MRP and Rate columns, populate BOTH fields separately with exact values from each column.
- If only ONE price column labeled "MRP" → put in mrp field AND copy to rate field.
- If only ONE price column labeled "Rate"/"Price" → put in rate field only.
- If only ONE price column labeled "Amount"/"Amt"/"Value" → put in itemTotal only.
- NEVER put the line total into mrp or rate fields.
- NEVER put mrp or rate into itemTotal.
- NEVER swap MRP and Rate values based on which is larger.

STEP 4 - QUANTITY RULES:
- quantity = Qty column value (usually small integer 1-500)
- If qty=0/null but rate and itemTotal exist → quantity = round(itemTotal / rate)
- freeQuantity from "Free"/"Scheme" column

STEP 5 - TOTALS (extract EXACTLY as printed - do NOT recalculate):
- subtotal: "Sub Total" / "Subtotal" / "Taxable Amount"
- cgst: CGST amount (not %); sgst: SGST amount (not %)
- totalGst: "Total Tax" / "GST Amount" or cgst + sgst
- discountAmount: "Discount" amount in totals section
- roundOff: "Round Off" / "Adj"
- grandTotal: "Grand Total" / "Net Amount" / "Bill Amount"

STEP 6 - PAYMENT TYPE: lowercase "cash" or "credit"
STEP 7 - PHONE NUMBERS: array ["9876543210"]

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
    let qty = Number(it.quantity) || 0;
    let rate = Number(it.rate) || 0;
    let mrp = it.mrp != null ? Number(it.mrp) : undefined;
    let itemTotal = it.itemTotal != null && it.itemTotal !== '' ? Number(it.itemTotal) : null;
    const discount = it.discount != null ? Number(it.discount) : undefined;

    // === CROSS-VALIDATION: Only swap rate/itemTotal if VERY clearly wrong ===
    // Only swap when qty > 1 AND the "rate" is very close to qty*itemTotal (i.e. clearly reversed)
    if (rate > 0 && itemTotal != null && itemTotal > 0 && qty > 1) {
      const expectedTotal = qty * rate;
      const reverseExpected = qty * itemTotal;
      if (Math.abs(reverseExpected - rate) < rate * 0.05 && Math.abs(expectedTotal - itemTotal) > expectedTotal * 0.3) {
        console.log(`[Normalize] Swapping rate/itemTotal for item "${it.name}": rate ${rate} <-> total ${itemTotal}`);
        const tempRate = rate;
        rate = itemTotal;
        itemTotal = tempRate;
      }
    }

    // If quantity is 0/null but rate and total exist, calculate quantity
    if ((!qty || qty === 0) && rate > 0 && itemTotal != null && itemTotal > 0) {
      const calcQty = Math.round(itemTotal / rate);
      if (calcQty >= 1 && calcQty <= 9999) {
        qty = calcQty;
      }
    }

    // If rate is 0 but qty and total exist, calculate rate
    if ((!rate || rate === 0) && qty > 0 && itemTotal != null && itemTotal > 0) {
      rate = round2(itemTotal / qty);
    }

    // Compute itemTotal if not provided
    if (itemTotal == null || itemTotal === 0) {
      itemTotal = qty * rate - (discount || 0);
    }

    // NOTE: Do NOT swap MRP and Rate based on value comparison.
    // MRP and Rate are read from separate columns in the bill.
    // In Indian pharmacy invoices, Rate can sometimes exceed MRP
    // (e.g. when Rate includes tax, or for different pack sizes).
    // Trust what the AI read from the bill column positions.

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
      mrp,
      rate,
      
      // Discount/taxes
      discount,
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
