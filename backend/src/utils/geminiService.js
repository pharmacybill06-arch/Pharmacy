const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Groq AI
let groqClient = null;
// Initialize Gemini AI
let geminiModel = null;

function initializeGemini() {
  const apiKey = process.env.GROQ_API_KEY;
  
  if (!apiKey) {
    console.warn('[AIService] ⚠️ GROQ_API_KEY not found in environment');
    return false;
  }

  try {
    groqClient = new Groq({ apiKey });
    console.log('[AIService] ✓ Groq AI initialized successfully');
    return true;
  } catch (error) {
    console.error('[AIService] ✗ Failed to initialize:', error.message);
    return false;
  }
}

function initializeGeminiVision() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[AIService] ⚠️ GEMINI_API_KEY not found — Gemini Vision disabled');
    return false;
  }
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    console.log('[AIService] ✓ Gemini Vision (gemini-2.0-flash) initialized');
    return true;
  } catch (error) {
    console.error('[AIService] ✗ Failed to initialize Gemini Vision:', error.message);
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
  if (!groqClient) {
    const initialized = initializeGemini();
    if (!initialized) {
      throw new Error('Groq AI is not configured. Please set GROQ_API_KEY in .env');
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
    console.log('[AIService] Sending request to Groq AI (llama-3.3-70b-versatile)...');
    const chatCompletion = await groqClient.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are an expert Indian pharmacy invoice parser. You always return ONLY valid JSON, no markdown fences, no extra text.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    });

    const text = chatCompletion.choices[0]?.message?.content || '';
    console.log('[AIService] ✓ Received response from Groq');
    
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
    
    console.log('[AIService] ✓ Successfully parsed bill data');
    console.log(`[AIService] Extracted: ${normalized.items?.length || 0} items`);
    
    return normalized;
  } catch (error) {
    console.error('[AIService] ✗ Parsing failed:', error.message);
    throw new Error(`AI parsing failed: ${error.message}`);
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
    // Force itemTotal to be strictly rate * quantity (no GST, discount, etc)
    let itemTotal = round2(qty * rate);

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
      discount: it.discount != null ? Number(it.discount) : undefined,
      discountPercent: it.discountPercent != null ? Number(it.discountPercent) : undefined,
      gstPercent: it.gstPercent != null ? Number(it.gstPercent) : 0,
      sgstPercent: it.sgstPercent != null ? Number(it.sgstPercent) : undefined,
      cgstPercent: it.cgstPercent != null ? Number(it.cgstPercent) : undefined,

      // Totals
      itemTotal,
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

/**
 * Parse bill image directly using Gemini Vision (PRIMARY — best for documents)
 * Falls back to Groq Vision if Gemini fails.
 */
async function parseImageWithVision(base64Image, mimeType = 'image/jpeg', ocrTextHint = '') {
  // Try Gemini Vision first (much better for document/table parsing)
  try {
    const result = await parseImageWithGeminiVision(base64Image, mimeType, ocrTextHint);
    return result;
  } catch (geminiErr) {
    console.warn('[AIService] Gemini Vision failed, trying Groq Vision:', geminiErr.message);
  }

  // Fallback to Groq Vision
  try {
    const result = await parseImageWithGroqVision(base64Image, mimeType, ocrTextHint);
    return result;
  } catch (groqErr) {
    console.warn('[AIService] Groq Vision failed:', groqErr.message);
  }

  // Final fallback: if we have OCR text, use text model
  if (ocrTextHint && ocrTextHint.trim().length > 10) {
    console.log('[AIService] All vision models failed — falling back to text model with OCR text...');
    return parseOcrWithGemini(ocrTextHint);
  }

  throw new Error('All vision parsing methods failed. Try a clearer image.');
}

/**
 * The standard vision prompt for both Gemini and Groq
 */
function getVisionPrompt(ocrTextHint) {
  return `You are an expert Indian pharmacy/medical invoice parser with 100% precision.

TASK: Look at this pharmacy bill/invoice image VERY CAREFULLY and extract ALL data into structured JSON.

CRITICAL RULES:
1. Read EVERY column header in the table first: identify S.No, Item/Product, Pack, HSN, Batch, Expiry, Qty, Free, MRP, Rate/P.Rate, Disc%, GST%, Amount/Amt columns.
2. For EACH item row, read values STRICTLY from their column positions. DO NOT mix up columns.
3. MRP and Rate are DIFFERENT fields - read each from its own column.
4. "pharmacyName" = the SELLER/DISTRIBUTOR/SUPPLIER name at the top, NOT the buyer.
5. Read ALL items - do not skip any rows.
6. Read totals section: Subtotal, CGST, SGST, Discount, Round Off, Grand Total EXACTLY as printed.
7. Dates should be in DD-MM-YYYY format.
8. Read batch numbers and expiry dates carefully - these are critical for pharmacy records.

${ocrTextHint ? `\nHINT - OCR text extracted from this image (may contain errors, use image as primary source):\n${ocrTextHint}\n` : ''}

Return ONLY valid JSON matching this schema:
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
  "items": [{
    "sn": number|null,
    "name": string,
    "quantity": number,
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
  }],
  "subtotal": number|null,
  "discountPercent": number|null,
  "discountAmount": number|null,
  "cgst": number|null,
  "sgst": number|null,
  "totalGst": number|null,
  "roundOff": number|null,
  "grandTotal": number|null
}`;
}

/**
 * Parse with Gemini Vision (gemini-2.0-flash) — best for document/table parsing
 */
async function parseImageWithGeminiVision(base64Image, mimeType = 'image/jpeg', ocrTextHint = '') {
  if (!geminiModel) {
    const initialized = initializeGeminiVision();
    if (!initialized) {
      throw new Error('Gemini Vision not configured. Set GEMINI_API_KEY in .env');
    }
  }

  const prompt = getVisionPrompt(ocrTextHint);

  console.log('[AIService] Sending image to Gemini Vision (gemini-2.0-flash)...');

  const result = await geminiModel.generateContent([
    prompt,
    {
      inlineData: {
        mimeType,
        data: base64Image,
      },
    },
  ]);

  const response = result.response;
  const text = response.text();
  console.log('[AIService] ✓ Received Gemini Vision response');

  // Extract JSON from response
  let jsonText = text.trim();
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/```\n?/g, '').replace(/```\n?$/g, '');
  }

  const start = jsonText.indexOf('{');
  const end = jsonText.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    jsonText = jsonText.slice(start, end + 1);
  }

  const parsed = JSON.parse(jsonText);
  const normalized = normalizeBillData(parsed);

  console.log(`[AIService] ✓ Gemini Vision parsed: ${normalized.items?.length || 0} items`);
  return normalized;
}

/**
 * Parse with Groq Vision (llama-4-scout) — fallback
 */
async function parseImageWithGroqVision(base64Image, mimeType = 'image/jpeg', ocrTextHint = '') {
  if (!groqClient) {
    const initialized = initializeGemini();
    if (!initialized) {
      throw new Error('Groq AI is not configured. Please set GROQ_API_KEY in .env');
    }
  }

  const visionPrompt = getVisionPrompt(ocrTextHint);

  try {
    console.log('[AIService] Sending image to Groq Vision (llama-4-scout-17b-16e)...');

    const chatCompletion = await groqClient.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: visionPrompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      temperature: 0.1,
      max_tokens: 4096,
    });

    const text = chatCompletion.choices[0]?.message?.content || '';
    console.log('[AIService] ✓ Received vision response from Groq');

    // Extract JSON from response
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '').replace(/```\n?$/g, '');
    }

    const start = jsonText.indexOf('{');
    const end = jsonText.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      jsonText = jsonText.slice(start, end + 1);
    }

    const parsed = JSON.parse(jsonText);
    const normalized = normalizeBillData(parsed);

    console.log('[AIService] ✓ Vision parsed bill data successfully');
    console.log(`[AIService] Extracted: ${normalized.items?.length || 0} items`);

    return normalized;
  } catch (error) {
    console.error('[AIService] ✗ Groq Vision parsing failed:', error.message);
    throw new Error(`Groq Vision parsing failed: ${error.message}`);
  }
}

async function fetchMedicineDetails(medicineName) {
  if (!groqClient) {
    const initialized = initializeGemini();
    if (!initialized) {
      throw new Error('Groq AI is not configured. Please set GROQ_API_KEY in .env');
    }
  }

  const prompt = `You are a medical data assistant. Given the medicine name "${medicineName}", provide its primary active ingredient (salt composition) and its likely manufacturer (company). Return ONLY a JSON object with keys "salt" and "manufacturer". If unknown, return empty strings for values. No markdown, no extra text.`;

  try {
    const chatCompletion = await groqClient.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are an API that returns ONLY valid JSON objects.' },
        { role: 'user', content: prompt }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 150,
      response_format: { type: 'json_object' }
    });

    const text = chatCompletion.choices[0]?.message?.content || '{}';
    return JSON.parse(text.trim());
  } catch (error) {
    console.error('[AIService] fetchMedicineDetails failed:', error.message);
    throw new Error('Failed to fetch medicine details');
  }
}

module.exports = {
  parseOcrWithGemini,
  parseImageWithVision,
  initializeGemini,
  initializeGeminiVision,
  fetchMedicineDetails,
};
