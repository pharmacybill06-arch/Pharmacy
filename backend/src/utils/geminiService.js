const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Groq AI
let groqClient = null;
// Initialize Gemini AI
let geminiModel = null;
let geminiTextModel = null;
const MAX_AI_LOG_CHARS = Number(process.env.AI_LOG_MAX_CHARS || 20000);
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

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

function extractJsonObject(text) {
  let jsonText = String(text || '').trim();
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
      model: GEMINI_MODEL,
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    });
    console.log(`[AIService] Gemini Vision (${GEMINI_MODEL}) initialized`);
    return true;
  } catch (error) {
    console.error('[AIService] ✗ Failed to initialize Gemini Vision:', error.message);
    return false;
  }
}

function initializeGeminiText() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[AIService] GEMINI_API_KEY not found - Gemini text parser disabled');
    return false;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    geminiTextModel = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    });
    console.log(`[AIService] Gemini text parser (${GEMINI_MODEL}) initialized`);
    return true;
  } catch (error) {
    console.error('[AIService] Failed to initialize Gemini text parser:', error.message);
    return false;
  }
}

/**
 * Parse OCR text using Gemini AI to extract structured bill data
 * @param {string} ocrText - Raw OCR text from bill image
 * @returns {Promise<Object>} Parsed bill data
 */
async function parseOcrWithGemini(ocrText) {
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

  if (!geminiTextModel) {
    initializeGeminiText();
  }

  if (geminiTextModel) {
    try {
      console.log(`[AIService] Sending request to Gemini text parser (${GEMINI_MODEL})...`);
      const result = await geminiTextModel.generateContent(prompt);
      const text = result.response.text();
      console.log('[AIService] Received response from Gemini text parser');
      logAiRawResponse('Gemini text parser', text);

      const parsed = extractJsonObject(text);
      const normalized = normalizeBillData(parsed, ocrText);

      console.log('[AIService] Successfully parsed bill data with Gemini text parser');
      console.log(`[AIService] Extracted: ${normalized.items?.length || 0} items`);
      logAiFilledData('Gemini text parser', normalized);

      return normalized;
    } catch (error) {
      console.warn('[AIService] Gemini text parser failed, trying Groq fallback:', error.message);
    }
  }

  // Initialize Groq fallback if not already done
  if (!groqClient) {
    const initialized = initializeGemini();
    if (!initialized) {
      throw new Error('Gemini and Groq AI are not configured. Please set GEMINI_API_KEY or GROQ_API_KEY in .env');
    }
  }

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
    const parsed = extractJsonObject(text);
    
    // Normalize the data
    const normalized = normalizeBillData(parsed, ocrText);
    
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
function normalizeBillData(parsed, sourceText = '') {
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const ocrTotals = extractTotalsFromOcrText(sourceText);

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
    const rawItemTotal = toNumber(it.itemTotal ?? it.amount ?? it.amt);
    let itemTotal = rawItemTotal;
    let adjustPriority = 0;

    if (itemTotal == null || itemTotal === 0) {
      itemTotal = round2(qty * rate - (discount || 0));
    }

    if (rate > 0 && qty > 0 && itemTotal > 0) {
      const expectedTotal = round2(qty * rate);
      const qtyFromTotal = itemTotal / rate;

      if (expectedTotal > itemTotal * 2 && isPlausibleQuantity(qtyFromTotal)) {
        qty = Math.round(qtyFromTotal);
      } else if (itemTotal < expectedTotal * 0.5 && expectedTotal < (ocrTotals.grossTotal || ocrTotals.grandTotal || Number.MAX_SAFE_INTEGER)) {
        itemTotal = expectedTotal;
      }

      if (rate <= 5 && itemTotal / qty > 5) {
        rate = round2(itemTotal / qty);
      }
    } else if ((!qty || qty === 0) && rate > 0 && itemTotal > 0) {
      const qtyFromTotal = itemTotal / rate;
      if (isPlausibleQuantity(qtyFromTotal)) {
        qty = Math.round(qtyFromTotal);
      }
    }

    if ((!qty || qty === 0) && itemTotal > 0 && rate > 0 && rate <= 5) {
      qty = 1;
      rate = round2(itemTotal);
      adjustPriority += 3;
    }

    if (qty > 0 && rate > 0 && itemTotal > 0) {
      const ratio = itemTotal / (qty * rate);
      if (Math.abs(ratio - 10) < 0.2) {
        rate = round2(rate * 10);
        adjustPriority += 2;
      } else if (Math.abs(ratio - 100) < 0.2) {
        rate = round2(rate * 100);
        adjustPriority += 2;
      }
    }

    if (qty >= 100 && rate > 0 && itemTotal > 0) {
      const mergedQty = qty / 10;
      if (Number.isInteger(mergedQty) && Math.abs(itemTotal / rate - mergedQty) < 0.1) {
        qty = mergedQty;
        adjustPriority += 2;
      }
    }

    if (qty > 0 && rate > 0 && itemTotal > 0) {
      const expectedTotal = round2(qty * rate);
      if (Math.abs(expectedTotal - itemTotal) <= 0.5) {
        itemTotal = expectedTotal;
      }
    }

    if (String(it.itemTotal ?? it.amount ?? it.amt ?? '').replace(/[^\d]/g, '').length >= 4 && !String(it.itemTotal ?? it.amount ?? it.amt ?? '').includes('.')) {
      adjustPriority += 1;
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
      __rawItemTotal: rawItemTotal,
      __adjustPriority: adjustPriority,
    };
  });

  reconcileItemTotalsToGross(normalizedItems, ocrTotals.grossTotal || repairMoneyAmount(toNumber(parsed.subtotal), undefined));
  normalizeDerivedLineValues(normalizedItems);
  repairItemTotalRemainder(normalizedItems, ocrTotals.grossTotal);
  normalizeDerivedLineValues(normalizedItems);

  normalizedItems.forEach((item) => {
    if (item.__rawItemTotal !== undefined) delete item.__rawItemTotal;
    if (item.__adjustPriority !== undefined) delete item.__adjustPriority;
  });

  const subtotalFromItems = round2(
    normalizedItems.reduce((sum, it) => sum + (Number(it.itemTotal) || 0), 0)
  );

  // Totals
  const grandTotal = repairMoneyAmount(toNumber(parsed.grandTotal), undefined, { preferCents: false });
  const cgst = ocrTotals.cgst ?? repairMoneyAmount(toNumber(parsed.cgst), grandTotal);
  const sgst = ocrTotals.sgst ?? repairMoneyAmount(toNumber(parsed.sgst), grandTotal);

  let totalGst = ocrTotals.totalGst ?? repairMoneyAmount(toNumber(parsed.totalGst), grandTotal);
  if (!totalGst) totalGst = cgst + sgst;

  let discountAmount = (ocrTotals.discountAmount ?? repairMoneyAmount(toNumber(parsed.discountAmount ?? parsed.discount), grandTotal)) || 0;
  let roundOff = repairMoneyAmount(toNumber(parsed.roundOff), grandTotal, { preferCents: false }) || 0;

  // For app calculations, subtotal means gross sum of item amounts.
  let subtotal = ocrTotals.grossTotal ?? repairMoneyAmount(toNumber(parsed.subtotal), grandTotal) ?? subtotalFromItems;
  if (!subtotal) subtotal = subtotalFromItems;

  if (!discountAmount && ocrTotals.taxableSubtotal && subtotal > ocrTotals.taxableSubtotal) {
    discountAmount = round2(subtotal - ocrTotals.taxableSubtotal);
  }

  // Grand total computed (fallback)
  let computedGrand = round2(subtotal + totalGst - discountAmount + roundOff);
  const finalGrandTotal = ocrTotals.grandTotal ?? grandTotal ?? computedGrand;
  const correctedRoundOff = round2(finalGrandTotal - (subtotal + totalGst - discountAmount));
  if (Math.abs(correctedRoundOff) <= 1) {
    roundOff = correctedRoundOff;
    computedGrand = finalGrandTotal;
  }

  // ── Deterministic format validation ────────────────────────────────────────
  const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  const rawGstin = parsed.gstin || '';
  const gstinValid = !rawGstin || GSTIN_REGEX.test(rawGstin.toUpperCase().trim());

  // Date sanity: reject future dates and nonsense dates
  function isValidBillDate(dateStr) {
    if (!dateStr) return true; // missing is handled elsewhere
    const parts = String(dateStr).split(/[-/]/);
    if (parts.length !== 3) return false;
    const [d, m, y] = parts.map(Number);
    if (!d || !m || !y) return false;
    const date = new Date(y < 100 ? 2000 + y : y, m - 1, d);
    if (isNaN(date.getTime())) return false;
    const now = new Date();
    if (date > now) return false; // invoice date in the future
    return true;
  }
  const invoiceDateValid = isValidBillDate(parsed.invoiceDate);

  // Per-item cross-validation
  const expiryItems = normalizedItems.map((item, index) => {
    const reasons = [];

    // Missing field checks
    if (!item.name) reasons.push('Missing item name');
    if (!item.batchNumber) reasons.push('Missing batch number');
    if (!item.expiryDate) reasons.push('Missing expiry date');
    if (!item.quantity) reasons.push('Missing quantity');

    // qty × rate ≈ itemTotal cross-check (within 5% tolerance)
    const qty = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    const total = Number(item.itemTotal) || 0;
    if (qty > 0 && rate > 0 && total > 0) {
      const expected = round2(qty * rate);
      const diff = Math.abs(expected - total);
      const tolerance = Math.max(expected * 0.05, 1); // 5% or ₹1 whichever is larger
      if (diff > tolerance) {
        reasons.push(`qty×rate (${expected}) does not match amount (${total})`);
      }
    }

    // Expiry date format: must be MM/YY, MM-YY, MM/YYYY, or DD-MM-YYYY
    const expRaw = item.expiryDate || '';
    const expValid = !expRaw || /^\d{2}[\/\-]\d{2,4}$/.test(expRaw) || /^\d{2}-\d{2}-\d{4}$/.test(expRaw);
    if (expRaw && !expValid) reasons.push('Expiry date format unrecognised');

    // Uncertainty flags from AI response (if model returned them)
    const uncertainFields = [];
    if (item._uncertain_batchNumber) { uncertainFields.push('batchNumber'); reasons.push('Batch number uncertain — verify in image'); }
    if (item._uncertain_expiryDate)  { uncertainFields.push('expiryDate');  reasons.push('Expiry date uncertain — verify in image'); }
    if (item._uncertain_quantity)    { uncertainFields.push('quantity');     reasons.push('Quantity uncertain — verify in image'); }
    if (item._uncertain_rate)        { uncertainFields.push('rate');         reasons.push('Rate uncertain — verify in image'); }

    return {
      sn: item.sn || index + 1,
      name: item.name || '',
      batchNumber: item.batchNumber || undefined,
      expiryDate: item.expiryDate || undefined,
      quantity: item.quantity || 0,
      rate: item.rate || undefined,
      mrp: item.mrp || undefined,
      itemTotal: item.itemTotal || undefined,
      uncertainFields,
      needsReview: reasons.length > 0,
      reviewReason: reasons,
    };
  });

  // Totals cross-check: sum of item totals vs grand total
  const computedItemsSum = round2(expiryItems.reduce((s, it) => s + (Number(it.itemTotal) || 0), 0));
  const totalsMismatch =
    finalGrandTotal &&
    computedItemsSum > 0 &&
    Math.abs(computedItemsSum - finalGrandTotal) > Math.max(finalGrandTotal * 0.05, 2);

  // Header-level uncertain fields from AI (if returned)
  const headerUncertainFields = [];
  if (parsed._uncertain_invoiceNumber) headerUncertainFields.push('invoiceNumber');
  if (parsed._uncertain_gstin)         headerUncertainFields.push('gstin');
  if (parsed._uncertain_dlNumber)      headerUncertainFields.push('dlNumber');
  if (parsed._uncertain_pharmacyName)  headerUncertainFields.push('pharmacyName');

  // Force flag fields that fail deterministic checks
  if (!gstinValid && rawGstin) headerUncertainFields.push('gstin');
  if (!invoiceDateValid && parsed.invoiceDate) headerUncertainFields.push('invoiceDate');

  return {
    pharmacyName: parsed.pharmacyName || '',
    shopAddress: parsed.shopAddress || '',
    phoneNumbers,
    gstin: rawGstin,
    dlNumber: parsed.dlNumber || '',
    invoiceNumber: parsed.invoiceNumber || '',
    invoiceDate: parsed.invoiceDate || '',
    dueDate: parsed.dueDate || undefined,
    paymentType,
    items: expiryItems,
    // Validation signals
    headerUncertainFields,
    gstinValid,
    invoiceDateValid,
    totalsMismatch: totalsMismatch || false,
    computedItemsSum,
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

function normalizePrintedMoney(value) {
  const numeric = toNumber(value);
  if (numeric === undefined) return undefined;

  const text = String(value || '').trim();
  if (text.includes('.')) return round2(numeric);

  const digits = text.replace(/[^\d]/g, '');
  if (digits.length >= 4) return round2(Number(digits) / 100);
  return round2(numeric);
}

function repairMoneyAmount(value, reference, options = {}) {
  if (value === undefined || value === null) return undefined;
  let amount = Number(value);
  if (!Number.isFinite(amount)) return undefined;

  const preferCents = options.preferCents !== false;
  if (reference && amount > reference * 2) {
    if (amount / 100 <= reference * 1.25) return round2(amount / 100);
    if (amount / 10 <= reference * 1.25) return round2(amount / 10);
  }

  if (preferCents && amount >= 10000) return round2(amount / 100);
  return round2(amount);
}

function repairLineAmount(value, rate, quantity, reference) {
  if (value === undefined || value === null) return 0;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;

  const candidates = [amount, amount / 10, amount / 100]
    .filter((candidate) => Number.isFinite(candidate) && candidate > 0)
    .map(round2);

  if (reference) {
    const withinReference = candidates.filter((candidate) => candidate <= reference * 1.1);
    if (withinReference.length > 0 && amount > reference) {
      return chooseLineAmountCandidate(withinReference, rate, quantity);
    }
  }

  if (String(value).replace(/[^\d]/g, '').length >= 4 && !String(value).includes('.')) {
    return chooseLineAmountCandidate(candidates, rate, quantity);
  }

  return round2(amount);
}

function getLineAmountCandidates(item) {
  const base = item.__rawItemTotal ?? item.itemTotal ?? 0;
  const amount = Number(base);
  if (!Number.isFinite(amount) || amount <= 0) {
    return [round2(item.itemTotal || 0)];
  }

  const candidates = new Set([round2(amount)]);
  if (String(base).replace(/[^\d]/g, '').length >= 4 && !String(base).includes('.')) {
    candidates.add(round2(amount / 10));
    candidates.add(round2(amount / 100));
  }

  if (item.quantity > 0 && item.rate > 0) {
    candidates.add(round2(item.quantity * item.rate));
  }

  return [...candidates].filter((candidate) => candidate > 0).sort((a, b) => b - a);
}

function reconcileItemTotalsToGross(items, grossTotal) {
  if (!grossTotal || !Array.isArray(items) || items.length === 0) return;
  if (items.length > 14) return;

  const candidateSets = items.map(getLineAmountCandidates);
  let bestChoice = null;

  function walk(index, runningSum, chosen) {
    if (index === candidateSets.length) {
      const diff = Math.abs(round2(grossTotal - runningSum));
      if (!bestChoice || diff < bestChoice.diff) {
        bestChoice = { diff, chosen: [...chosen] };
      }
      return;
    }

    for (const candidate of candidateSets[index]) {
      chosen.push(candidate);
      walk(index + 1, round2(runningSum + candidate), chosen);
      chosen.pop();
    }
  }

  walk(0, 0, []);

  if (!bestChoice || bestChoice.diff > 2) return;

  items.forEach((item, index) => {
    item.itemTotal = round2(bestChoice.chosen[index]);
    if (item.quantity > 0 && item.itemTotal > 0) {
      const impliedRate = item.itemTotal / item.quantity;
      const rateRatio = item.rate > 0 ? impliedRate / item.rate : 0;
      if (!item.rate || item.rate <= 5 || Math.abs(rateRatio - 10) < 0.2 || Math.abs(rateRatio - 100) < 0.2) {
        item.rate = round2(impliedRate);
      }
    }
    if ((!item.quantity || item.quantity === 0) && item.rate > 0 && item.itemTotal > 0) {
      const qty = item.itemTotal / item.rate;
      if (isPlausibleQuantity(qty)) item.quantity = Math.round(qty);
    }
  });
}

function normalizeDerivedLineValues(items) {
  items.forEach((item) => {
    const qty = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    const itemTotal = Number(item.itemTotal) || 0;

    if (qty >= 100 && rate > 0 && itemTotal > 0) {
      const mergedQty = qty / 10;
      if (Number.isInteger(mergedQty) && Math.abs(itemTotal / rate - mergedQty) < 0.1) {
        item.quantity = mergedQty;
      }
    }

    if ((!item.quantity || item.quantity === 0) && rate > 0 && itemTotal > 0) {
      const inferredQty = itemTotal / rate;
      if (isPlausibleQuantity(inferredQty)) {
        item.quantity = Math.round(inferredQty);
      }
    }

    if ((Number(item.quantity) || 0) > 0 && rate > 0 && itemTotal > 0) {
      const expected = round2((Number(item.quantity) || 0) * rate);
      if (Math.abs(expected - itemTotal) <= 0.5) {
        item.itemTotal = expected;
      }
    }
  });
}

function chooseLineAmountCandidate(candidates, rate, quantity) {
  if (!candidates.length) return 0;
  if (rate > 0) {
    const integerQtyCandidates = candidates
      .map((candidate) => ({
        candidate,
        qty: candidate / rate,
        integerDistance: Math.abs(candidate / rate - Math.round(candidate / rate)),
      }))
      .filter(({ qty }) => qty >= 1 && qty <= 500)
      .sort((a, b) => a.integerDistance - b.integerDistance || b.candidate - a.candidate);

    if (integerQtyCandidates.length > 0 && integerQtyCandidates[0].integerDistance < 0.05) {
      return integerQtyCandidates[0].candidate;
    }
  }

  if (quantity > 0 && rate > 0) {
    const expected = quantity * rate;
    return candidates
      .slice()
      .sort((a, b) => Math.abs(a - expected) - Math.abs(b - expected))[0];
  }

  return candidates[0];
}

function isPlausibleQuantity(value) {
  return Number.isFinite(value) && value >= 1 && value <= 500 && Math.abs(value - Math.round(value)) < 0.05;
}

function repairItemTotalRemainder(items, grossTotal) {
  if (!grossTotal || !items.length) return;

  const sum = round2(items.reduce((total, item) => total + (Number(item.itemTotal) || 0), 0));
  const difference = round2(grossTotal - sum);
  if (Math.abs(difference) === 0 || Math.abs(difference) > 1) return;

  const prioritized = items
    .map((item, index) => ({
      index,
      priority: Number(item.__adjustPriority) || 0,
      mismatch: Math.abs((Number(item.itemTotal) || 0) - ((Number(item.quantity) || 0) * (Number(item.rate) || 0))),
    }))
    .sort((a, b) => b.priority - a.priority || b.mismatch - a.mismatch || b.index - a.index);

  const adjustableIndex = items.findIndex((item) => {
    const total = Number(item.itemTotal) || 0;
    const qty = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    return total > 0 && (!qty || !rate || Math.abs(total - qty * rate) > 0.01);
  });

  const index = adjustableIndex >= 0
    ? adjustableIndex
    : prioritized.find((entry) => items[entry.index] && (Number(items[entry.index].itemTotal) || 0) > 0)?.index ?? (items.length - 1);
  items[index].itemTotal = round2((Number(items[index].itemTotal) || 0) + difference);
}

function extractTotalsFromOcrText(text = '') {
  const totals = {};
  if (!text || typeof text !== 'string') return totals;

  const grandMatch = text.match(/GRAND\s*TOTAL[^\d]*(\d+(?:\.\d+)?)/i);
  if (grandMatch) totals.grandTotal = normalizePrintedMoney(grandMatch[1]);

  const subtotalMatches = [...text.matchAll(/SUB\s*TOTAL[^\d]*(\d+(?:\.\d+)?)/gi)];
  if (subtotalMatches.length > 0) {
    totals.taxableSubtotal = normalizePrintedMoney(subtotalMatches[subtotalMatches.length - 1][1]);
  }

  const sgstMatch = text.match(/SGST\s*PAY\w*[^\d]*(\d+(?:\.\d+)?)/i);
  if (sgstMatch) totals.sgst = normalizePrintedMoney(sgstMatch[1]);

  const cgstMatch = text.match(/CGST\s*PAY\w*[^\d]*(\d+(?:\.\d+)?)/i);
  if (cgstMatch) totals.cgst = normalizePrintedMoney(cgstMatch[1]);

  const gst5Line = text.split(/\r?\n/).find((line) => /GST\s*5\s*%/i.test(line));
  if (gst5Line) {
    const values = gst5Line.match(/\d+(?:\.\d+)?/g) || [];
    if (values.length >= 6) {
      const moneyValues = values.slice(1).map(normalizePrintedMoney);
      totals.grossTotal = moneyValues[0];
      totals.schemeAmount = moneyValues[1];
      totals.discountAmount = moneyValues[2];
      totals.sgst = moneyValues[3] ?? totals.sgst;
      totals.cgst = moneyValues[4] ?? totals.cgst;
      totals.totalGst = moneyValues[5];
    }
  }

  if (!totals.totalGst && (totals.sgst || totals.cgst)) {
    totals.totalGst = round2((totals.sgst || 0) + (totals.cgst || 0));
  }

  return totals;
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
  "grandTotal": number|null,
  "_uncertain_invoiceNumber": boolean,
  "_uncertain_gstin": boolean,
  "_uncertain_dlNumber": boolean,
  "_uncertain_pharmacyName": boolean
}

Rules:
- pharmacyName is the SELLER/SUPPLIER printed at top-left, not the buyer/customer.
- Totals must be copied from the printed totals section. Do not calculate.
- If a value is not visible, use null.
- CRITICAL UNCERTAINTY RULE: For invoiceNumber, gstin, dlNumber, and pharmacyName — if the image is
  blurry, the text is partially obscured, or you are guessing any digit/character, set the corresponding
  _uncertain_* field to true. Do NOT invent plausible-looking values; mark uncertain: true instead.
  Example: if invoice number digits are unclear → _uncertain_invoiceNumber: true.
  GSTIN must be exactly 15 characters matching pattern: 2 digits + 5 letters + 4 digits + 1 letter + 1 digit + Z + 1 alphanumeric.
  If extracted GSTIN doesn't match this pattern, set _uncertain_gstin: true.
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
      "name": string|null,
      "batchNumber": string|null,
      "expiryDate": string|null,
      "_uncertain_batchNumber": boolean,
      "_uncertain_expiryDate": boolean,
      "_uncertain_quantity": boolean,
      "_uncertain_rate": boolean
    }
  ]
}

Rules:
- Read the table row-by-row visually from top to bottom. Ensure the items in the output array are in the EXACT SAME ORDER as they are printed in the table.
- First read the table header row and map each value by visual column position.
- Extract ONLY item serial number (sn), name, batch number, expiry date, and quantity. Ignore MRP, Rate, Discount, GST, HSN, and Amount columns.
- Expiry date is critical. Read Exp/Expiry/Exp Dt/Exp. columns carefully and format as MM/YY or MM/YYYY (or preserve the printed value if the full date is unclear).
- Quantity must come only from the QTY column. Do not use pack-size text inside the item name (e.g., 10TAB, 30x10) as quantity.
- Keep pack-size text inside the medicine name/unit. Example: "GPM SR 2 TAB 10TAB" can have quantity 20 if the QTY column says 20.
- Preserve the exact number of item rows visible in the table. Do not summarize or skip rows.
- If the table spans many rows, continue until the totals/class section begins.
- If a field is blank or not readable, use null rather than borrowing from a neighboring column.
- UNCERTAINTY RULE: For each item, if batchNumber, expiryDate, quantity, or rate text is
  blurry/partially obscured/ambiguous in the image, set the corresponding _uncertain_* field to true.
  Do NOT guess a plausible value for an uncertain field — set null and mark uncertain.
  If digits could be two different numbers (e.g. 0 vs 6, 1 vs 7), set _uncertain_* true.
${ocrTextHint ? `\nHINT - OCR text extracted from this image (may contain errors/be out of order, use image layout as primary source of truth for ordering and missing items):\n${ocrTextHint}\n` : ''}`;
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
  const normalized = normalizeBillData(parsed, ocrTextHint);

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
    const normalizedMulti = normalizeBillData(mergedParsed, ocrTextHint);

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
    const normalized = normalizeBillData(parsed, ocrTextHint);

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
