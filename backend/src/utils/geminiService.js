const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Groq AI
let groqClient = null;
// Initialize Gemini AI
let geminiModel = null;
const MAX_AI_LOG_CHARS = Number(process.env.AI_LOG_MAX_CHARS || 20000);

function truncateForLog(value, maxChars = MAX_AI_LOG_CHARS) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`;
}

function summarizeBillData(data = {}) {
  return {
    pharmacyName: data.pharmacyName || null,
    gstin: data.gstin || null,
    invoiceNumber: data.invoiceNumber || null,
    invoiceDate: data.invoiceDate || null,
    paymentType: data.paymentType || null,
    itemCount: Array.isArray(data.items) ? data.items.length : 0,
    subtotal: data.subtotal ?? null,
    discountAmount: data.discountAmount ?? null,
    cgst: data.cgst ?? null,
    sgst: data.sgst ?? null,
    totalGst: data.totalGst ?? null,
    roundOff: data.roundOff ?? null,
    grandTotal: data.grandTotal ?? null,
  };
}

function logAiFilledData(source, data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  console.log(`[AIService] ${source} filled data summary: ${JSON.stringify(summarizeBillData(data))}`);
  console.log(`[AIService] ${source} filled fields:\n${truncateForLog(data)}`);

  if (items.length > 0) {
    const itemPreview = items.slice(0, 20).map((item, index) => ({
      index: index + 1,
      sn: item.sn ?? null,
      name: item.name ?? null,
      quantity: item.quantity ?? null,
      freeQuantity: item.freeQuantity ?? null,
      batchNumber: item.batchNumber ?? null,
      expiryDate: item.expiryDate ?? null,
      hsnCode: item.hsnCode ?? null,
      mrp: item.mrp ?? null,
      rate: item.rate ?? null,
      gstPercent: item.gstPercent ?? null,
      itemTotal: item.itemTotal ?? null,
    }));
    console.log(`[AIService] ${source} item preview: ${JSON.stringify(itemPreview, null, 2)}`);
  }
}

function logAiRawResponse(source, text) {
  console.log(`[AIService] ${source} raw response:\n${truncateForLog(text)}`);
}

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
    geminiModel = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    });
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
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    });

    const text = chatCompletion.choices[0]?.message?.content || '';
    console.log('[AIService] ✓ Received response from Groq');
    logAiRawResponse('Groq text parser', text);
    
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
    logAiFilledData('Groq text parser', normalized);
    
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
    let qty = toNumber(it.quantity ?? it.qty) || 0;
    let rate = toNumber(it.rate) || 0;
    let mrp = toNumber(it.mrp ?? it.nMrp ?? it.nmrp);
    const discount = toNumber(it.discount ?? it.dis);
    let itemTotal = toNumber(it.itemTotal ?? it.amount ?? it.amt);

    if (itemTotal == null || itemTotal === 0) {
      itemTotal = round2(qty * rate - (discount || 0));
    }

    return {
      sn: toNumber(it.sn) || idx + 1,
      name: it.name || it.itemNamePacking || it.itemName || '',
      quantity: qty,
      freeQuantity: toNumber(it.freeQuantity ?? it.free),
      unit: it.unit || inferUnit(it.name || it.itemNamePacking || ''),

      // Preserve medicine identity fields
      manufacturer: it.manufacturer || it.mfr || undefined,
      batchNumber: it.batchNumber || it.batch || undefined,
      expiryDate: it.expiryDate || it.exp || undefined,
      hsnCode: it.hsnCode || it.hsn || undefined,

      // Prices
      mrp,
      rate,

      // Discount/taxes
      discount,
      discountPercent: toNumber(it.discountPercent),
      gstPercent: toNumber(it.gstPercent ?? it.gst) || inferGstPercent(it),
      sgstPercent: toNumber(it.sgstPercent ?? it.sgst),
      cgstPercent: toNumber(it.cgstPercent ?? it.cgst),

      // Totals
      itemTotal: round2(itemTotal),
    };
  });

  const subtotalFromItems = round2(
    normalizedItems.reduce((sum, it) => sum + (Number(it.itemTotal) || 0), 0)
  );

  // Totals
  const cgst = toNumber(parsed.cgst) || 0;
  const sgst = toNumber(parsed.sgst) || 0;

  let totalGst = toNumber(parsed.totalGst);
  if (!totalGst) totalGst = cgst + sgst;

  const discountAmount = toNumber(parsed.discountAmount ?? parsed.discount) || 0;
  const roundOff = toNumber(parsed.roundOff) || 0;

  // Subtotal: prefer parsed subtotal if present else computed
  let subtotal = toNumber(parsed.subtotal);
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
    discountPercent: toNumber(parsed.discountPercent),
    discountAmount: round2(discountAmount),
    cgst: round2(cgst),
    sgst: round2(sgst),
    totalGst: round2(totalGst),
    roundOff: round2(roundOff),
    grandTotal:
      parsed.grandTotal != null && parsed.grandTotal !== ''
        ? round2(toNumber(parsed.grandTotal))
        : computedGrand,
  };
}

// Helper functions
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const cleaned = String(value).replace(/,/g, '').replace(/[^\d.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return undefined;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
}

function inferGstPercent(item) {
  const sgst = toNumber(item.sgstPercent ?? item.sgst) || 0;
  const cgst = toNumber(item.cgstPercent ?? item.cgst) || 0;
  return sgst + cgst || 0;
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

function getVisionMetadataPrompt(ocrTextHint) {
  return `You are reading an Indian pharmacy GST invoice image.

Extract ONLY seller, buyer, invoice metadata, and printed totals. Do NOT extract item rows.
Return ONLY valid JSON with this schema:
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
  "subtotal": number|null,
  "discountPercent": number|null,
  "discountAmount": number|null,
  "cgst": number|null,
  "sgst": number|null,
  "totalGst": number|null,
  "roundOff": number|null,
  "grandTotal": number|null
}

Rules:
- pharmacyName is the SELLER/SUPPLIER printed at top-left, not the buyer/customer.
- Totals must be copied from the printed totals section. Do not calculate.
- If a value is not visible, use null.
${ocrTextHint ? `\nOCR hint, may contain mistakes:\n${ocrTextHint}\n` : ''}`;
}

function getVisionItemsPrompt(ocrTextHint) {
  return `You are reading the item table of an Indian pharmacy GST invoice image.

Extract EVERY printed item row from the table, from top to bottom. Return ONLY valid JSON:
{
  "columns": string[],
  "items": [
    {
      "sn": number|null,
      "quantity": number|null,
      "freeQuantity": number|null,
      "name": string|null,
      "manufacturer": string|null,
      "batchNumber": string|null,
      "expiryDate": string|null,
      "hsnCode": string|null,
      "mrp": number|null,
      "rate": number|null,
      "discount": number|null,
      "discountPercent": number|null,
      "sgstPercent": number|null,
      "cgstPercent": number|null,
      "gstPercent": number|null,
      "itemTotal": number|null
    }
  ]
}

Rules:
- First read the table header row and map each value by visual column position.
- Do not calculate or infer printed values. Copy the printed itemTotal/Amount exactly.
- MRP, Rate, Discount, SGST, CGST, and Amount are separate columns. Never move values between them.
- Quantity must come only from the QTY column. Do not use pack-size text inside the item name, such as 10TAB, 30x10, 100+100, as quantity.
- Keep pack-size text inside the medicine name/unit. Example: "GPM SR 2 TAB 10TAB" can have quantity 20 if the QTY column says 20.
- Preserve the exact number of item rows visible in the table. Do not summarize or skip rows.
- If the table spans many rows, continue until the totals/class section begins.
- If a field is blank or not readable, use null rather than borrowing from a neighboring column.
${ocrTextHint ? `\nOCR hint, may contain mistakes:\n${ocrTextHint}\n` : ''}`;
}

function parseJsonResponse(text) {
  let jsonText = (text || '').trim();
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

  return JSON.parse(jsonText);
}

function mergeParsedBill(metadata, itemResult) {
  return {
    ...metadata,
    items: Array.isArray(itemResult?.items) ? itemResult.items : [],
  };
}

async function runGroqVisionJson(base64Image, mimeType, prompt, maxTokens = 4096) {
  const completion = await groqClient.chat.completions.create({
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt,
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
    temperature: 0,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  });

  return parseJsonResponse(completion.choices[0]?.message?.content || '');
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

  console.log('[AIService] Sending image to Gemini Vision metadata pass...');

  const metadataResult = await geminiModel.generateContent([
    getVisionMetadataPrompt(ocrTextHint),
    {
      inlineData: {
        mimeType,
        data: base64Image,
      },
    },
  ]);

  const response = metadataResult.response;
  const text = response.text();
  console.log('[AIService] ✓ Received Gemini Vision response');
  logAiRawResponse('Gemini Vision metadata pass', text);

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

  const metadata = JSON.parse(jsonText);
  console.log(`[AIService] Gemini Vision metadata fields:\n${truncateForLog(metadata)}`);

  console.log('[AIService] Sending image to Gemini Vision item-table pass...');
  const itemsResult = await geminiModel.generateContent([
    getVisionItemsPrompt(ocrTextHint),
    {
      inlineData: {
        mimeType,
        data: base64Image,
      },
    },
  ]);
  const itemsText = itemsResult.response.text();
  logAiRawResponse('Gemini Vision item-table pass', itemsText);
  const itemResult = parseJsonResponse(itemsText);
  console.log(`[AIService] Gemini Vision item-table fields:\n${truncateForLog(itemResult)}`);
  const parsed = mergeParsedBill(metadata, itemResult);
  const normalized = normalizeBillData(parsed);

  console.log(`[AIService] ✓ Gemini Vision parsed: ${normalized.items?.length || 0} items`);
  logAiFilledData('Gemini Vision final', normalized);
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

  try {
    console.log('[AIService] Sending image to Groq Vision metadata pass...');
    const metadataPass = await runGroqVisionJson(base64Image, mimeType, getVisionMetadataPrompt(ocrTextHint), 4096);
    console.log(`[AIService] Groq Vision metadata fields:\n${truncateForLog(metadataPass)}`);

    console.log('[AIService] Sending image to Groq Vision item-table pass...');
    const itemPass = await runGroqVisionJson(base64Image, mimeType, getVisionItemsPrompt(ocrTextHint), 8192);
    console.log(`[AIService] Groq Vision item-table fields:\n${truncateForLog(itemPass)}`);

    const mergedParsed = mergeParsedBill(metadataPass, itemPass);
    const normalizedMulti = normalizeBillData(mergedParsed);

    console.log('[AIService] Vision parsed bill data successfully');
    console.log(`[AIService] Extracted: ${normalizedMulti.items?.length || 0} items`);
    logAiFilledData('Groq Vision final', normalizedMulti);

    return normalizedMulti;

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
    logAiRawResponse('Groq Vision single-pass', text);

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
    logAiFilledData('Groq Vision single-pass final', normalized);

    return normalized;
  } catch (error) {
    console.error('[AIService] ✗ Groq Vision parsing failed:', error.message);
    throw new Error(`Groq Vision parsing failed: ${error.message}`);
  }
}

module.exports = {
  parseOcrWithGemini,
  parseImageWithVision,
  initializeGemini,
  initializeGeminiVision,
};
