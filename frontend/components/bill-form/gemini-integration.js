// NOTE: GoogleGenerativeAI is not imported here because it uses Web Workers which are not available in React Native
// Instead, we use the backend API or the HTTP fallback method

import Constants from 'expo-constants';

// ✅ FIX: Read keys directly from Constants at module load time
// This works reliably in both dev (process.env) and built APK (Constants.expoConfig.extra)
const _extra = Constants.expoConfig?.extra || Constants.manifest?.extra || {};

const GEMINI_API_KEY =
  process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
  _extra.EXPO_PUBLIC_GEMINI_API_KEY ||
  '';

const GROQ_API_KEY =
  process.env.EXPO_PUBLIC_GROQ_API_KEY ||
  _extra.EXPO_PUBLIC_GROQ_API_KEY ||
  '';

const ENABLE_GEMINI = (() => {
  const val =
    process.env.EXPO_PUBLIC_ENABLE_GEMINI ??
    _extra.EXPO_PUBLIC_ENABLE_GEMINI ??
    true;
  if (typeof val === 'boolean') return val;
  return ['true', '1', 'yes', 'on'].includes(String(val).toLowerCase());
})();

// Debug log on load (remove after confirming fix)
console.log('[Config] Gemini key length:', GEMINI_API_KEY.length);
console.log('[Config] Groq key length:', GROQ_API_KEY.length);
console.log('[Config] Enable Gemini:', ENABLE_GEMINI);
console.log('[Config] expoConfig.extra keys:', Object.keys(_extra));

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
    .replace(/[\uFFFD\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferUnit(name = '') {
  const t = name.toUpperCase();
  if (t.includes('SACHET')) return 'sachet';
  if (t.includes('TAB')) return 'tabs';
  if (t.includes('CAP')) return 'caps';
  if (t.includes('SYRUP')) return 'bottle';
  return 'units';
}

function normalizeBill(parsed) {
  const items = Array.isArray(parsed.items) ? parsed.items : [];

  let paymentType = parsed.paymentType;
  if (typeof paymentType === 'string') {
    paymentType = paymentType.toLowerCase();
    if (paymentType.includes('credit')) paymentType = 'credit';
    else if (paymentType.includes('cash')) paymentType = 'cash';
  }

  let phoneNumbers = parsed.phoneNumbers;
  if (typeof phoneNumbers === 'string') {
    phoneNumbers = phoneNumbers.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  }
  if (!Array.isArray(phoneNumbers)) phoneNumbers = [];

  const normalizedItems = items.map((it, idx) => {
    const qty = Number(it.quantity) || 0;
    const rate = Number(it.rate) || 0;

    let itemTotal = it.itemTotal;
    if (itemTotal == null || itemTotal === '') {
      itemTotal = qty * rate;
    } else {
      itemTotal = Number(itemTotal) || 0;
    }

    return {
      id: it.id || `${Date.now()}${idx}`,
      sn: it.sn != null ? Number(it.sn) : undefined,
      freeQuantity: it.freeQuantity != null ? Number(it.freeQuantity) : undefined,
      manufacturer: it.manufacturer ?? undefined,
      batchNumber: it.batchNumber ?? undefined,
      expiryDate: it.expiryDate ?? undefined,
      hsnCode: it.hsnCode ?? undefined,
      name: it.name || '',
      quantity: qty,
      unit: it.unit || inferUnit(it.name),
      mrp: it.mrp != null ? Number(it.mrp) : undefined,
      rate,
      discount: it.discount != null ? Number(it.discount) : undefined,
      gstPercent: it.gstPercent != null ? Number(it.gstPercent) : 0,
      sgstPercent: it.sgstPercent != null ? Number(it.sgstPercent) : undefined,
      cgstPercent: it.cgstPercent != null ? Number(it.cgstPercent) : undefined,
      itemTotal: round2(itemTotal),
    };
  });

  const subtotalFromItems = round2(
    normalizedItems.reduce((sum, it) => sum + (Number(it.itemTotal) || 0), 0)
  );

  const cgst = Number(parsed.cgst) || 0;
  const sgst = Number(parsed.sgst) || 0;

  let totalGst = Number(parsed.totalGst);
  if (!totalGst) totalGst = cgst + sgst;

  const discountAmount = Number(parsed.discountAmount) || 0;
  const roundOff = Number(parsed.roundOff) || 0;

  let subtotal = Number(parsed.subtotal);
  if (!subtotal) subtotal = subtotalFromItems;

  const computedGrand = round2(subtotal + totalGst - discountAmount + roundOff);

  return {
    ...parsed,
    paymentType,
    phoneNumbers,
    items: normalizedItems,
    subtotal: round2(subtotal),
    cgst: round2(cgst),
    sgst: round2(sgst),
    totalGst: round2(totalGst),
    discountAmount: round2(discountAmount),
    roundOff: round2(roundOff),
    grandTotal:
      parsed.grandTotal != null && parsed.grandTotal !== ''
        ? round2(parsed.grandTotal)
        : computedGrand,
  };
}

function extractJson(text) {
  if (!text) return null;
  text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

// ─────────────────────────────────────────────
// AI API callers
// ─────────────────────────────────────────────

async function generateViaHttpFallback(apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  const json = await res.json();
  console.log('[Gemini] API response status:', res.status, '- has candidates:', !!json?.candidates?.[0]);

  if (!res.ok) {
    console.warn('[Gemini] request failed:', json);
    return null;
  }

  const text =
    json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  return text.trim() || null;
}

async function generateViaGroqFallback(apiKey, prompt) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    });

    const json = await res.json();
    console.log('[Groq] API response status:', res.status, '- has choices:', !!json?.choices?.[0]);

    if (!res.ok) {
      console.warn('[Groq] request failed:', json);
      return null;
    }

    const text = json?.choices?.[0]?.message?.content || '';
    return text.trim() || null;
  } catch (error) {
    console.error('[Groq] Error:', error);
    return null;
  }
}

async function callBackendParser(ocrText, backendUrl) {
  try {
    // ✅ FIX: backendUrl already contains "/api", so don't append it again
    const base = backendUrl.replace(/\/$/, '');
    // If base already ends with /api, just append /parse-ocr
    // Otherwise append /parse-ocr directly
    const url = base.endsWith('/api')
      ? `${base}/parse-ocr`
      : `${base}/api/parse-ocr`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ocrText }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Backend ${res.status}: ${text?.slice(0, 200)}`);
    }

    const json = await res.json();
    if (json?.success && json?.data) return json.data;
    throw new Error(json?.error || 'Unexpected backend response');
  } catch (err) {
    console.warn('[Gemini] Backend call failed:', err?.message || err);
    throw err;
  }
}

// ─────────────────────────────────────────────
// Fallback (local) parser
// ─────────────────────────────────────────────

function fallbackParseOcrText(ocrText) {
  const lines = ocrText.split('\n').filter((line) => line.trim().length > 0);
  const text = ocrText;

  const result = {
    pharmacyName: sanitizeText(extractPharmacyName(lines)),
    shopAddress: sanitizeText(extractAddress(lines)),
    phoneNumbers: sanitizeText(extractPhoneNumbers(text)),
    gstin: sanitizeText(extractGSTIN(text)),
    dlNumber: sanitizeText(extractDLNumber(text)),
    invoiceNumber: sanitizeText(extractInvoiceNumber(text)),
    invoiceDate: sanitizeText(extractInvoiceDate(text)),
    paymentType: extractPaymentType(text),
    items: extractItems(lines, text),
    subtotal: 0,
    cgst: 0,
    sgst: 0,
    totalGst: 0,
    grandTotal: 0,
  };

  const totals = extractTotals(text);
  result.subtotal = totals.subtotal;
  result.cgst = totals.cgst;
  result.sgst = totals.sgst;
  result.totalGst = totals.totalGst;
  result.grandTotal = totals.grandTotal;

  return result;
}

function extractPharmacyName(lines) {
  const excludePatterns = [
    /^PHONE/i, /^DATE/i, /^INVOICE/i, /^GST/i,
    /^[A-Z]{2}\/[A-Z]{2}\/\d{4}/i, /^\d{2}\/\d{2}\/\d{4}/i,
    /^\d{10}$/i, /^GSTIN/i, /^D\.?L\.?/i, /^S[\d]+[-]/i,
    /^[A-Z0-9\s]*WARD/i, /^[A-Z0-9\s]*ROAD/i,
    /^[A-Z0-9\s]*MARKET/i, /^[A-Z0-9\s]*NEAR/i,
    /^GOODS\s+ONCE\s+SOLD/i, /^WILL\s+NOT\s+BE/i,
    /^OR\s+EXCHANGED/i, /^BILLS?\s+NOT\s+PAID/i,
    /^DUE\s+DATE/i, /INTEREST/i, /THIS IS TAX INVOICE/i,
    /^EMAIL/i, /^SUBJECT\s+TO/i, /^NOTE/i, /^TERMS/i,
    /^AUTHORIZED/i, /^\(/, /^[0-9.]*$/, /^SUBJECT/i,
    /^PLEASE/i, /^THANK/i,
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 4) continue;
    if (excludePatterns.some((p) => p.test(trimmed.toUpperCase()))) continue;
    if (!/[A-Z]/i.test(trimmed)) continue;
    const digitCount = (trimmed.match(/\d/g) || []).length;
    if (digitCount > trimmed.length / 2) continue;
    if (trimmed.length > 50) continue;
    return trimmed;
  }
  return '';
}

function extractAddress(lines) {
  const addressLines = [];
  let inAddressSection = false;

  for (const line of lines) {
    const trimmed = line.trim().toUpperCase();
    if (!inAddressSection &&
      (trimmed.includes('S.D.') || trimmed.includes('MARKET') ||
        trimmed.includes('ROAD') || trimmed.includes('WARD') || trimmed.includes('-'))) {
      inAddressSection = true;
    }
    if (inAddressSection && trimmed.length > 3 &&
      !trimmed.includes('PHONE') && !trimmed.includes('GSTIN') &&
      !trimmed.includes('D.L') && !trimmed.includes('EMAIL')) {
      addressLines.push(line.trim());
    }
    if (inAddressSection && (trimmed.includes('GSTIN') || trimmed.includes('D.L'))) break;
  }

  return addressLines.slice(0, 3).join(', ');
}

function extractPhoneNumbers(text) {
  const phonePattern = /(\d{5}[-\d]{4,}|\d{10})/g;
  const matches = text.match(phonePattern) || [];
  return matches.slice(0, 3).join(', ');
}

function extractGSTIN(text) {
  const gstPattern = /\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d{1}[Z]{1}[A-Z0-9]{1}/;
  const match = text.match(gstPattern);
  return match ? match[0] : '';
}

function extractDLNumber(text) {
  const dlPattern = /D\.?L\.?\s*[:\-]?\s*([0-9A-Z\s,]+)/i;
  const match = text.match(dlPattern);
  if (match) return match[1].substring(0, 50).trim();
  return '';
}

function extractInvoiceNumber(text) {
  const patterns = [
    /Invoice\s*No\.?\s*[:=\s]+([A-Z0-9\-]+)/i,
    /IRN\s*NO\s*[:=\s]+([A-Z0-9\-]+)/i,
    /(TS\d+|INV\d+)/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1] || match[0];
  }
  return '';
}

function extractInvoiceDate(text) {
  const datePattern = /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/;
  const match = text.match(datePattern);
  if (match) {
    const date = match[1];
    const parts = date.split(/[-\/]/);
    if (parts.length === 3) {
      const first = parseInt(parts[0]);
      const second = parseInt(parts[1]);
      const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      if (first > 12) {
        return `${String(first).padStart(2, '0')}-${String(second).padStart(2, '0')}-${year}`;
      } else if (second > 12) {
        return `${String(second).padStart(2, '0')}-${String(first).padStart(2, '0')}-${year}`;
      } else {
        return `${String(first).padStart(2, '0')}-${String(second).padStart(2, '0')}-${year}`;
      }
    }
  }
  return '';
}

function extractPaymentType(text) {
  if (text.toUpperCase().includes('CREDIT')) return 'credit';
  return 'cash';
}

function extractItems(lines, fullText) {
  const items = [];
  let tableHeaderIdx = -1;
  const headerKeywords = ['ITEM NAME', 'ITEM', 'MRP', 'RATE', 'QTY', 'PACKING', 'AMOUNT', 'DIS'];

  for (let i = 0; i < lines.length; i++) {
    const lineUpper = lines[i].toUpperCase();
    const keywordCount = headerKeywords.filter((kw) => lineUpper.includes(kw)).length;
    if (keywordCount >= 3) { tableHeaderIdx = i; break; }
  }

  if (tableHeaderIdx === -1) {
    console.warn('[Parser] No item table header found - skipping item extraction');
    return [];
  }

  let tableEndIdx = lines.length;
  for (let i = tableHeaderIdx + 1; i < lines.length; i++) {
    const lineUpper = lines[i].toUpperCase();
    if (lineUpper.includes('TOTAL') || lineUpper.includes('SUB TOTAL') ||
      lineUpper.includes('GRAND TOTAL') || lineUpper.includes('SUBTOTAL')) {
      tableEndIdx = i;
      break;
    }
  }

  const tableLines = lines.slice(tableHeaderIdx + 1, tableEndIdx);

  for (const line of tableLines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (/^[\d\s.,\-()]*$/.test(trimmed)) continue;
    if (trimmed.length < 5) continue;
    if (!looksLikeMedicineName(trimmed)) continue;

    const item = parseItemLine(trimmed);
    if (item && item.name && item.name.length > 3) {
      items.push({
        id: `item-${Date.now()}-${items.length}`,
        name: item.name || '',
        quantity: item.quantity ?? 1,
        unit: item.unit || 'tabs',
        rate: item.rate ?? 0,
        gstPercent: item.gstPercent || 0,
        needsReview: item.needsReview || false,
        reviewReason: item.reviewReason || [],
      });
    }
  }

  return items;
}

function looksLikeMedicineName(text) {
  const upper = text.toUpperCase();
  const excludePatterns = [
    /^STATE[:\s]*/i, /^WARD[:\s]*/i, /^\d+-/,
    /^\d{2}\/\d{2}\/\d{4}/, /^\d{10}$/, /^GSTIN/i,
    /^D\.?L\.?/i, /^PHONE/i, /^EMAIL/i, /^TIME/i,
    /^INVOICE/i, /^DATE/i, /^NEAR /i, /^S\d+-/i,
    /^WARD NO/i, /^DISST /i, /ROAD/i, /MARKET/i,
  ];
  for (const pattern of excludePatterns) {
    if (pattern.test(upper)) return false;
  }
  const hasLetters = /[A-Z]/.test(upper);
  const hasNumbers = /\d/.test(text);
  const hasSpecialChars = /[-()[\]\/&.,]/.test(text);
  const hasCommonMedicineWords =
    /\b(TAB|STRIP|SACHET|TABLET|DROPS|SYRUP|POWDER|GEL|CREAM|LOTION|SUSPENSION|SOLUTION|CAPSULE|PATCH|VIAL|INJECTION|SPRAY|INHALER)\b/i.test(text);
  if (hasLetters && (hasNumbers || hasSpecialChars || hasCommonMedicineWords)) return true;
  const uppercaseWords = (text.match(/\b[A-Z]+\b/g) || []).length;
  if (uppercaseWords >= 2 && hasNumbers) return true;
  return false;
}

function parseItemLine(line) {
  const parts = line.split(/\s{2,}|\t/).map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length < 1) return null;

  let nameIdx = -1;
  let bestName = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (/[A-Z]/.test(part) && part.length > bestName.length && !isNumeric(part)) {
      nameIdx = i;
      bestName = part;
    }
  }

  if (nameIdx === -1) return null;

  const item = {
    name: bestName,
    quantity: undefined,
    unit: 'tabs',
    rate: undefined,
    gstPercent: 0,
    needsReview: false,
    reviewReason: [],
  };

  const numbers = [];
  for (let i = 0; i < parts.length; i++) {
    if (i !== nameIdx) {
      const num = parseFloat(parts[i]);
      if (!isNaN(num) && num > 0) {
        numbers.push({ value: num, originalText: parts[i] });
      }
    }
  }

  if (numbers.length >= 1) {
    const firstNum = numbers[0].value;
    if (firstNum >= 1 && firstNum <= 100 && Number.isInteger(firstNum)) {
      item.quantity = Math.round(firstNum);
    } else {
      item.needsReview = true;
      item.reviewReason.push('Quantity unclear from line');
    }
  }

  if (numbers.length >= 2) {
    const lastNum = numbers[numbers.length - 1].value;
    if (lastNum > 10 && lastNum < 10000) {
      item.rate = lastNum;
    } else if (numbers.length >= 2) {
      const secondLast = numbers[numbers.length - 2].value;
      if (secondLast > 10 && secondLast < 10000) {
        item.rate = secondLast;
      } else {
        item.needsReview = true;
        item.reviewReason.push('Rate unclear from numbers');
      }
    }
  } else if (numbers.length === 1) {
    const num = numbers[0].value;
    if (num > 10 && num < 10000) {
      item.rate = num;
      item.needsReview = true;
      item.reviewReason.push('Single number could be qty or rate');
    }
  }

  return item;
}

function isNumeric(str) {
  return /^[\d.]+$/.test(str);
}

function extractTotals(text) {
  const result = { subtotal: 0, cgst: 0, sgst: 0, totalGst: 0, grandTotal: 0 };
  const totalKeywords = ['GRAND TOTAL', 'TOTAL', 'SUB TOTAL', 'SUBTOTAL', 'SGST', 'CGST', 'GST'];

  for (const keyword of totalKeywords) {
    const pattern = new RegExp(`${keyword}[\\s:=]*([\\d.]+)`, 'gi');
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(
        match[0].replace(/\D/g, '.').match(/\d+\.?\d*/)?.[0] || '0'
      );
      if (keyword.toUpperCase().includes('GRAND')) result.grandTotal = value;
      else if (keyword.toUpperCase().includes('SUB')) result.subtotal = value;
      else if (keyword.toUpperCase().includes('SGST')) result.sgst = value;
      else if (keyword.toUpperCase().includes('CGST')) result.cgst = value;
      else if (keyword.toUpperCase().includes('GST') &&
        !keyword.includes('SGST') && !keyword.includes('CGST')) {
        result.totalGst = value;
      }
    }
  }

  return result;
}

// ─────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────

const GEMINI_PROMPT = (ocrText) => `
You extract data from an Indian pharmacy bill OCR.

Return ONLY valid JSON (no markdown, no extra text).
If a value is missing, return null or 0.

IMPORTANT: "pharmacyName" must be the SELLER/DISTRIBUTOR/SUPPLIER name (the company who issued the invoice), NOT the buyer/customer.
Indian pharmacy invoices have two parties: the SELLER at the top and the BUYER (often after "To:", "M/s", "Ship To:", "Bill To:"). Extract only the SELLER name as pharmacyName.

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
      "name": string|null,
      "quantity": number|null,
      "unit": string|null,
      "manufacturer": string|null,
      "batchNumber": string|null,
      "expiryDate": "DD-MM-YYYY"|null,
      "hsnCode": string|null,
      "mrp": number|null,
      "rate": number|null,
      "discount": number|null,
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
   - NEVER leave quantity as null/0 if item has a rate and total

2. TOTALS - EXTRACT EXACTLY FROM BILL:
   - Copy subtotal, CGST, SGST, total GST, and grand total EXACTLY as shown
   - NEVER calculate - ALWAYS extract from bill text

3. ITEM-LEVEL FIELDS:
   - manufacturer: Brand/manufacturer name
   - batchNumber: Batch/Lot number
   - expiryDate: Expiry date in DD-MM-YYYY or MM-YY format
   - hsnCode: HSN code for GST

4. PAYMENT TYPE: lowercase "cash" or "credit"

OCR TEXT:
${ocrText}
`;

export async function parseOcrWithGemini(ocrText, backendUrl) {
  try {
    // ✅ Try backend first
    const configuredBackend =
      backendUrl ||
      process.env.EXPO_PUBLIC_BACKEND_URL ||
      _extra.EXPO_PUBLIC_BACKEND_URL;

    if (configuredBackend) {
      try {
        return await callBackendParser(ocrText, configuredBackend);
      } catch (e) {
        // Backend failed, fall through to direct AI
        console.log('[Gemini] Backend unavailable, trying direct AI...');
      }
    }

    // ✅ Check AI keys (already resolved at module load)
    if (!GEMINI_API_KEY && !GROQ_API_KEY) {
      console.warn('[Gemini] No API keys found. Using fallback parser.');
      return fallbackParseOcrText(ocrText);
    }

    if (!ENABLE_GEMINI) {
      console.log('[Gemini] AI parsing disabled. Using fallback parser.');
      return fallbackParseOcrText(ocrText);
    }

    const prompt = GEMINI_PROMPT(ocrText);

    // ✅ Try Gemini first
    let httpText = null;
    if (GEMINI_API_KEY) {
      try {
        httpText = await generateViaHttpFallback(GEMINI_API_KEY, prompt);
      } catch (e) {
        console.warn('[Gemini] Direct Gemini failed:', e?.message);
      }
    }

    // ✅ Try Groq if Gemini failed
    if (!httpText && GROQ_API_KEY) {
      try {
        console.log('[Gemini] Trying Groq fallback...');
        httpText = await generateViaGroqFallback(GROQ_API_KEY, prompt);
      } catch (e) {
        console.warn('[Gemini] Groq also failed:', e?.message);
      }
    }

    if (!httpText) {
      console.warn('[Gemini] All AI services failed, using local parser.');
      return fallbackParseOcrText(ocrText);
    }

    const jsonText = extractJson(httpText);
    if (!jsonText) {
      console.warn('[Gemini] No valid JSON found in response');
      return fallbackParseOcrText(ocrText);
    }

    const parsed = JSON.parse(jsonText);
    if (parsed.items) {
      parsed.items = parsed.items.map((item, index) => ({
        id: `${Date.now()}${index}`,
        ...item,
      }));
    }

    return normalizeBill(parsed);
  } catch (error) {
    console.warn('[Gemini] Error during generation, using fallback:', error);
    return fallbackParseOcrText(ocrText);
  }
}

export function formatParsedDataForForm(parsedData) {
  return {
    pharmacyName: sanitizeText(parsedData.pharmacyName || ''),
    shopAddress: sanitizeText(parsedData.shopAddress || ''),
    phoneNumbers: Array.isArray(parsedData.phoneNumbers)
      ? parsedData.phoneNumbers.map((p) => sanitizeText(p)).join(', ')
      : sanitizeText(parsedData.phoneNumbers || ''),
    gstin: sanitizeText(parsedData.gstin || ''),
    dlNumber: sanitizeText(parsedData.dlNumber || ''),
    invoiceNumber: sanitizeText(parsedData.invoiceNumber || ''),
    invoiceDate: sanitizeText(parsedData.invoiceDate || ''),
    dueDate: parsedData.dueDate ? sanitizeText(parsedData.dueDate) : undefined,
    paymentType: (parsedData.paymentType || 'cash').toLowerCase(),
    currentBalance: parsedData.currentBalance || 0,
    items: formatItems(parsedData.items || []),
    subtotal: Number(parsedData.subtotal) || 0,
    cgst: Number(parsedData.cgst) || 0,
    sgst: Number(parsedData.sgst) || 0,
    totalGst: Number(parsedData.totalGst) || 0,
    roundOff: Number(parsedData.roundOff) || 0,
    grandTotal: Number(parsedData.grandTotal) || 0,
  };
}

function formatItems(items) {
  return items.map((item, index) => ({
    id: item.id || `item-${Date.now()}-${index}`,
    name: sanitizeText(item.name || ''),
    manufacturer: sanitizeText(item.manufacturer || undefined),
    batchNumber: sanitizeText(item.batchNumber || undefined),
    expiryDate: sanitizeText(item.expiryDate || undefined),
    hsnCode: sanitizeText(item.hsnCode || undefined),
    quantity: Number(item.quantity) || 0,
    freeQuantity: item.freeQuantity ? Number(item.freeQuantity) : undefined,
    unit: sanitizeText(item.unit || ''),
    mrp: item.mrp ? Number(item.mrp) : undefined,
    rate: Number(item.rate) || 0,
    discount: item.discount ? Number(item.discount) : undefined,
    discountPercent: item.discountPercent ? Number(item.discountPercent) : undefined,
    sgstPercent: item.sgstPercent ? Number(item.sgstPercent) : undefined,
    cgstPercent: item.cgstPercent ? Number(item.cgstPercent) : undefined,
    gstPercent: Number(item.gstPercent) || 0,
    itemTotal: item.itemTotal ? Number(item.itemTotal) : undefined,
    needsReview: item.needsReview === true,
    reviewReason: item.reviewReason || [],
  }));
}

export function getItemsNeedingReview(items) {
  return items.filter((item) => item.needsReview === true);
}

export function calculateParseConfidence(data) {
  let score = 1.0;

  const headerFields = ['pharmacyName', 'invoiceNumber', 'invoiceDate'];
  const missingHeaders = headerFields.filter((field) => !data[field]).length;
  score -= missingHeaders * 0.1;

  const items = data.items || [];
  if (items.length > 0) {
    const itemsNeedingReview = items.filter((item) => item.needsReview).length;
    score -= (itemsNeedingReview / items.length) * 0.2;
  } else {
    score -= 0.3;
  }

  const itemsWithMissingDetails = items.filter(
    (item) => !item.quantity || !item.rate || !item.unit
  ).length;
  if (items.length > 0) {
    score -= (itemsWithMissingDetails / items.length) * 0.15;
  }

  return Math.max(0, Math.min(1, score));
}

export default {
  parseOcrWithGemini,
  formatParsedDataForForm,
  getItemsNeedingReview,
  calculateParseConfidence,
};