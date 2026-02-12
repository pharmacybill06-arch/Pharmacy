// NOTE: GoogleGenerativeAI is not imported here because it uses Web Workers which are not available in React Native
// Instead, we use the backend API or the HTTP fallback method

// Import app.json and Constants for reliable API key access in built APKs
let APP_CONFIG = null;

// Try to get Constants from expo-constants first (most reliable for APK)
try {
  const { Constants } = require('expo-constants');
  if (Constants?.expoConfig?.extra) {
    APP_CONFIG = Constants;
    console.log('[Config] Loaded Constants from expo-constants');
  }
} catch (e) {
  console.log('[Config] expo-constants not available, trying app.json');
}

// Fallback: try to require app.json directly
if (!APP_CONFIG) {
  try {
    APP_CONFIG = require('../../../app.json');
    console.log('[Config] Loaded app.json directly');
  } catch (e) {
    console.warn('[Config] Could not load app.json');
  }
}
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Sanitize text to remove invalid characters and fix encoding issues
 * This prevents garbage characters like ΓåÆ in API requests
 */
function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';
  
  // Remove control characters and invalid UTF-8 sequences
  return text
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
    .replace(/[\uFFFD\uFEFF]/g, '') // Remove replacement chars
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

function inferUnit(name = "") {
  const t = name.toUpperCase();
  if (t.includes("SACHET")) return "sachet";
  if (t.includes("TAB")) return "tabs";
  if (t.includes("CAP")) return "caps";
  if (t.includes("SYRUP")) return "bottle";
  return "units";
}

function normalizeBill(parsed) {
  const items = Array.isArray(parsed.items) ? parsed.items : [];

  // normalize paymentType
  let paymentType = parsed.paymentType;
  if (typeof paymentType === "string") {
    paymentType = paymentType.toLowerCase();
    if (paymentType.includes("credit")) paymentType = "credit";
    else if (paymentType.includes("cash")) paymentType = "cash";
  }

  // normalize phones (always array)
  let phoneNumbers = parsed.phoneNumbers;
  if (typeof phoneNumbers === "string") {
    phoneNumbers = phoneNumbers
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(phoneNumbers)) phoneNumbers = [];

  // normalize items + compute subtotal from items if missing
  const normalizedItems = items.map((it, idx) => {
    const qty = Number(it.quantity) || 0;
    const rate = Number(it.rate) || 0;

    // Use Gemini itemTotal if provided; else compute qty*rate
    let itemTotal = it.itemTotal;
    if (itemTotal == null || itemTotal === "") {
      itemTotal = qty * rate;
    } else {
      itemTotal = Number(itemTotal) || 0;
    }

    return {
      // ✅ keep existing id if present
      id: it.id || `${Date.now()}${idx}`,

      // ✅ preserve table metadata if present
      sn: it.sn != null ? Number(it.sn) : undefined,
      freeQuantity: it.freeQuantity != null ? Number(it.freeQuantity) : undefined,

      // ✅ preserve medicine identity fields (YOUR MAIN ISSUE)
      manufacturer: it.manufacturer ?? undefined,
      batchNumber: it.batchNumber ?? undefined,
      expiryDate: it.expiryDate ?? undefined,
      hsnCode: it.hsnCode ?? undefined,

      // existing fields
      name: it.name || "",
      quantity: qty,
      unit: it.unit || inferUnit(it.name),

      // prices
      mrp: it.mrp != null ? Number(it.mrp) : undefined,
      rate,

      // discount/taxes
      discount: it.discount != null ? Number(it.discount) : undefined,
      gstPercent: it.gstPercent != null ? Number(it.gstPercent) : 0,
      sgstPercent: it.sgstPercent != null ? Number(it.sgstPercent) : undefined,
      cgstPercent: it.cgstPercent != null ? Number(it.cgstPercent) : undefined,

      // totals
      itemTotal: round2(itemTotal),
    };
  });

  const subtotalFromItems = round2(
    normalizedItems.reduce((sum, it) => sum + (Number(it.itemTotal) || 0), 0)
  );

  // totals
  const cgst = Number(parsed.cgst) || 0;
  const sgst = Number(parsed.sgst) || 0;

  let totalGst = Number(parsed.totalGst);
  if (!totalGst) totalGst = cgst + sgst;

  const discountAmount = Number(parsed.discountAmount) || 0;
  const roundOff = Number(parsed.roundOff) || 0;

  // subtotal: prefer parsed subtotal if present else computed
  let subtotal = Number(parsed.subtotal);
  if (!subtotal) subtotal = subtotalFromItems;

  // grand total computed (fallback)
  const computedGrand = round2(subtotal + totalGst - discountAmount + roundOff);

  return {
    ...parsed,

    paymentType,
    phoneNumbers, // ✅ array

    items: normalizedItems,

    subtotal: round2(subtotal),
    cgst: round2(cgst),
    sgst: round2(sgst),
    totalGst: round2(totalGst),

    discountAmount: round2(discountAmount),
    roundOff: round2(roundOff),

    grandTotal:
      parsed.grandTotal != null && parsed.grandTotal !== ""
        ? round2(parsed.grandTotal)
        : computedGrand,
  };
}



function extractJson(text) {
  if (!text) return null;

  // Remove markdown fences
  text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) return null;

  return text.slice(start, end + 1);
}

function fallbackParseOcrText(ocrText) {
  const lines = ocrText.split('\n').filter(line => line.trim().length > 0);
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

async function generateViaHttpFallback(apiKey, prompt) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
               thinkingConfig: { thinkingBudget: 0 }, 
      },
    }),
  });

  const json = await res.json();

  // ✅ DEBUG THIS ONCE
  console.log("[Gemini] API response status:", res.status, "- has candidates:", !!json?.candidates?.[0]);

  if (!res.ok) {
    console.warn("[Gemini] request failed:", json);
    return null;
  }

  const text =
    json?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("") || "";

  // If Gemini returns proper JSON but wrapped, extract it
  return text.trim() || null;
}

// Free alternative using Groq API (has free tier with fast models)
async function generateViaGroqFallback(apiKey, prompt) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", // Free tier model
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 4096,
        response_format: { type: "json_object" }
      }),
    });

    const json = await res.json();
    console.log("[Groq] API response status:", res.status, "- has choices:", !!json?.choices?.[0]);

    if (!res.ok) {
      console.warn("[Groq] request failed:", json);
      return null;
    }

    const text = json?.choices?.[0]?.message?.content || "";
    return text.trim() || null;
  } catch (error) {
    console.error("[Groq] Error:", error);
    return null;
  }
}




function extractPharmacyName(lines) {
  const excludePatterns = [
    // Invoice/bill metadata
    /^PHONE/i,
    /^DATE/i,
    /^INVOICE/i,
    /^GST/i,
    /^[A-Z]{2}\/[A-Z]{2}\/\d{4}/i, // Date format
    /^\d{2}\/\d{2}\/\d{4}/i, // Date
    /^\d{10}$/i, // Phone
    /^GSTIN/i,
    /^D\.?L\.?/i,
    /^S[\d]+[-]/i, // Serial numbers
    
    // Address components
    /^[A-Z0-9\s]*WARD/i,
    /^[A-Z0-9\s]*ROAD/i,
    /^[A-Z0-9\s]*MARKET/i,
    /^[A-Z0-9\s]*NEAR/i,
    
    // Common disclaimers & terms
    /^GOODS\s+ONCE\s+SOLD/i,
    /^WILL\s+NOT\s+BE/i,
    /^OR\s+EXCHANGED/i,
    /^BILLS?\s+NOT\s+PAID/i, // "Bills not paid due date..."
    /^DUE\s+DATE/i,
    /INTEREST/i,
    /THIS IS TAX INVOICE/i,
    /^EMAIL/i,
    /^SUBJECT\s+TO/i,
    /^NOTE/i,
    /^TERMS/i,
    /^AUTHORIZED/i,
    /^\(/,  // Lines starting with parentheses
    /^[0-9.]*$/,  // Lines that are only numbers
    /^SUBJECT/i,
    /^PLEASE/i,
    /^THANK/i,
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    const upper = trimmed.toUpperCase();
    
    // Skip empty lines and lines too short
    if (trimmed.length < 4) continue;
    
    // Skip lines matching exclude patterns
    if (excludePatterns.some(pattern => pattern.test(upper))) continue;
    
    // Must have at least some letters
    if (!/[A-Z]/i.test(trimmed)) continue;
    
    // Skip lines that are mostly numbers
    const digitCount = (trimmed.match(/\d/g) || []).length;
    if (digitCount > trimmed.length / 2) continue;
    
    // Prefer shorter pharmacy names (usually 5-30 chars)
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
    
    if (!inAddressSection && (trimmed.includes('S.D.') || trimmed.includes('MARKET') || 
        trimmed.includes('ROAD') || trimmed.includes('WARD') || trimmed.includes('-'))) {
      inAddressSection = true;
    }

    if (inAddressSection && trimmed.length > 3 && 
        !trimmed.includes('PHONE') && 
        !trimmed.includes('GSTIN') &&
        !trimmed.includes('D.L') &&
        !trimmed.includes('EMAIL')) {
      addressLines.push(line.trim());
    }

    if (inAddressSection && (trimmed.includes('GSTIN') || trimmed.includes('D.L'))) {
      break;
    }
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
  if (match) {
    return match[1].substring(0, 50).trim();
  }
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
    if (match) {
      return match[1] || match[0];
    }
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
    const keywordCount = headerKeywords.filter(kw => lineUpper.includes(kw)).length;
    
    if (keywordCount >= 3) {
      tableHeaderIdx = i;
      break;
    }
  }

  if (tableHeaderIdx === -1) {
    console.warn('[Parser] No item table header found - skipping item extraction');
    return [];
  }

  let tableEndIdx = lines.length;
  for (let i = tableHeaderIdx + 1; i < lines.length; i++) {
    const lineUpper = lines[i].toUpperCase();
    if (lineUpper.includes('TOTAL') || 
        lineUpper.includes('SUB TOTAL') ||
        lineUpper.includes('GRAND TOTAL') ||
        lineUpper.includes('SUBTOTAL')) {
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

    if (!looksLikeMedicineName(trimmed)) {
      continue;
    }

    const item = parseItemLine(trimmed);
    if (item && item.name && item.name.length > 3) {
      const billItem = {
        id: `item-${Date.now()}-${items.length}`,
        name: item.name || '',
        quantity: item.quantity ?? 1,
        unit: item.unit || 'tabs',
        rate: item.rate ?? 0,
        gstPercent: item.gstPercent || 0,
        needsReview: item.needsReview || false,
        reviewReason: item.reviewReason || [],
      };
      items.push(billItem);
    }
  }

  return items;
}

function looksLikeMedicineName(text) {
  const upper = text.toUpperCase();
  
  const excludePatterns = [
    /^STATE[:\s]*/i,
    /^WARD[:\s]*/i,
    /^\d+-/,
    /^\d{2}\/\d{2}\/\d{4}/,
    /^\d{10}$/,
    /^GSTIN/i,
    /^D\.?L\.?/i,
    /^PHONE/i,
    /^EMAIL/i,
    /^TIME/i,
    /^INVOICE/i,
    /^DATE/i,
    /^NEAR /i,
    /^S\d+-/i,
    /^WARD NO/i,
    /^DISST /i,
    /ROAD/i,
    /MARKET/i,
  ];

  for (const pattern of excludePatterns) {
    if (pattern.test(upper)) return false;
  }

  const hasLetters = /[A-Z]/.test(upper);
  const hasNumbers = /\d/.test(text);
  const hasSpecialChars = /[-()[\]\/&.,]/.test(text);
  const hasCommonMedicineWords = /\b(TAB|STRIP|SACHET|TABLET|DROPS|SYRUP|POWDER|GEL|CREAM|LOTION|SUSPENSION|SOLUTION|CAPSULE|PATCH|VIAL|INJECTION|SPRAY|INHALER)\b/i.test(text);

  if (hasLetters && (hasNumbers || hasSpecialChars || hasCommonMedicineWords)) {
    return true;
  }

  const uppercaseWords = (text.match(/\b[A-Z]+\b/g) || []).length;
  if (uppercaseWords >= 2 && hasNumbers) {
    return true;
  }

  return false;
}

function parseItemLine(line) {
  const parts = line.split(/\s{2,}|\t/).map(p => p.trim()).filter(p => p.length > 0);
  
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
  const result = {
    subtotal: 0,
    cgst: 0,
    sgst: 0,
    totalGst: 0,
    grandTotal: 0,
  };

  const totalKeywords = ['GRAND TOTAL', 'TOTAL', 'SUB TOTAL', 'SUBTOTAL', 'SGST', 'CGST', 'GST'];

  for (const keyword of totalKeywords) {
    const pattern = new RegExp(`${keyword}[\\s:=]*([\\d.]+)`, 'gi');
    const match = text.match(pattern);

    if (match) {
      const value = parseFloat(match[0].replace(/\D/g, '.').match(/\d+\.?\d*/)?.[0] || '0');

      if (keyword.toUpperCase().includes('GRAND')) {
        result.grandTotal = value;
      } else if (keyword.toUpperCase().includes('SUB')) {
        result.subtotal = value;
      } else if (keyword.toUpperCase().includes('SGST')) {
        result.sgst = value;
      } else if (keyword.toUpperCase().includes('CGST')) {
        result.cgst = value;
      } else if (keyword.toUpperCase().includes('GST') && !keyword.includes('SGST') && !keyword.includes('CGST')) {
        result.totalGst = value;
      }
    }
  }

  return result;
}

async function callBackendParser(ocrText, backendUrl) {
  try {
    const url = `${backendUrl.replace(/\/$/, '')}/api/parse-ocr`;
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

export async function parseOcrWithGemini(ocrText, backendUrl) {
  try {
    // Check if we're on a platform that doesn't support Web Workers (React Native)
    const isReactNative = typeof window === 'undefined' || typeof Worker === 'undefined';
    
  if (isReactNative) {
    // Helper function to get API key from multiple sources
    const getConfigValue = (key) => {
      // First try: process.env (Expo injected at build time - usually empty in APK)
      const envKey = `EXPO_PUBLIC_${key}`;
      if (process.env[envKey]) {
        return process.env[envKey];
      }
      
      // Second try: Constants.expoConfig.extra (from expo-constants in built APK)
      if (APP_CONFIG?.expoConfig?.extra?.[envKey]) {
        return APP_CONFIG.expoConfig.extra[envKey];
      }
      
      // Third try: app.json extra (direct require fallback)
      if (APP_CONFIG?.expo?.extra?.[envKey]) {
        return APP_CONFIG.expo.extra[envKey];
      }
      
      // Fourth try: Constants.manifest (older Expo versions)
      if (APP_CONFIG?.manifest?.extra?.[envKey]) {
        return APP_CONFIG.manifest.extra[envKey];
      }
      
      return null;
    };
    
    // Get API keys from best available source
    const apiKey = (getConfigValue('GEMINI_API_KEY') || '').toString().trim();
    const groqApiKey = (getConfigValue('GROQ_API_KEY') || '').toString().trim();
    let enableGemini = getConfigValue('ENABLE_GEMINI') ?? true;
    
    // Parse boolean
    if (typeof enableGemini !== 'boolean') {
      enableGemini = ['true', '1', 'yes', 'on'].includes(String(enableGemini).toLowerCase());
    }
    
    // Debug: log key lengths (not the actual keys for security)
    const hasGemini = apiKey && apiKey.length > 10;
    const hasGroq = groqApiKey && groqApiKey.length > 10;
    console.log(`[Config] Gemini key found: ${hasGemini} (${apiKey.length} chars)`);
    console.log(`[Config] Groq key found: ${hasGroq} (${groqApiKey.length} chars)`);
    console.log(`[Config] APP_CONFIG available: ${!!APP_CONFIG}`);
    
    const configuredBackend = backendUrl || getConfigValue('PARSER_API_URL') || getConfigValue('BACKEND_URL');

    // ✅ If backend exists, prefer it
    if (configuredBackend) {
      try {
        return await callBackendParser(ocrText, configuredBackend);
      } catch (e) {
        // Backend failed, continue to direct Gemini
      }
    }

    // Check if we have API keys to proceed
    const hasApiKey = apiKey && apiKey.length > 10;
    const hasGroqKey = groqApiKey && groqApiKey.length > 10;
    
    if (!hasApiKey && !hasGroqKey) {
      console.warn('[Gemini] No API keys found. Using fallback parser.');
      return fallbackParseOcrText(ocrText);
    }
    
    if (!enableGemini) {
      console.log('[Gemini] AI parsing disabled. Using fallback parser.');
      return fallbackParseOcrText(ocrText);
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
   - If quantity is not visible, check if total amount divided by rate gives a sensible number
   - NEVER leave quantity as null/0 if item has a rate and total

2. TOTALS - EXTRACT EXACTLY FROM BILL:
   - Copy subtotal, CGST, SGST, total GST, and grand total EXACTLY as shown
   - Look for keywords: "SUB TOTAL", "CGST", "SGST", "TOTAL GST", "GRAND TOTAL"
   - These are usually at the bottom of the bill
   - If CGST and SGST are shown separately, add them for totalGst
   - NEVER calculate - ALWAYS extract from bill text

3. ITEM-LEVEL FIELDS (pharmaceutical invoices):
   - manufacturer: Brand/manufacturer name (e.g., "CIPLA", "GSK", "LEEFORD")
   - batchNumber: Batch/Lot number (e.g., "A1B2C3", "ATZ501A")
   - expiryDate: Expiry date in DD-MM-YYYY or MM-YY format
   - hsnCode: HSN code for GST (e.g., "3004", "3002")

4. PAYMENT TYPE:
   - Must be lowercase: "cash" or "credit"
   - Look for keywords like "CREDIT", "CASH", "PAID"

OCR TEXT:
${ocrText}
`;

    // Try Gemini first if available
    let httpText = null;
    if (hasApiKey) {
      try {
        httpText = await generateViaHttpFallback(apiKey, prompt);
      } catch (e) {
        console.warn('[Gemini] Direct Gemini failed:', e?.message);
      }
    }
    
    // Try Groq if Gemini failed or unavailable
    if (!httpText && hasGroqKey) {
      try {
        console.log('[Gemini] Trying Groq free alternative...');
        httpText = await generateViaGroqFallback(groqApiKey, prompt);
      } catch (e) {
        console.warn('[Gemini] Groq also failed:', e?.message);
      }
    }
    
    // If all AI services failed, use fallback
    if (!httpText) {
      console.warn('[Gemini] All AI services failed, using local parser.');
      return fallbackParseOcrText(ocrText);
    }

    // Process the response
    let responseText = httpText.trim();
    if (responseText.startsWith('```json')) {
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
    } else if (responseText.startsWith('```')) {
      responseText = responseText.replace(/```\n?/g, '').replace(/```\n?$/g, '');
    }

    const jsonText = extractJson(responseText);
    if (!jsonText) {
      console.warn("[Gemini] No valid JSON found in response");
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
  }
    
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
      ? parsedData.phoneNumbers.map(p => sanitizeText(p)).join(', ')
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
    const reviewRate = itemsNeedingReview / items.length;
    score -= reviewRate * 0.2;
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
