/**
 * Bill parser (client side).
 *
 * AI parsing happens ONLY on the backend (/api/ai/parse-ocr, which runs OpenAI). The app
 * never holds a model API key: anything read from EXPO_PUBLIC_* is inlined into the
 * shipped JS bundle, so a key here is a published key — that is exactly how the old
 * Gemini key ended up leaked and revoked.
 *
 * Order: backend AI parse → local regex parser (fallbackParseOcrText) if the backend is
 * unreachable, so the pharmacist still gets a filled-in form offline.
 */

import Constants from 'expo-constants';

const _extra = Constants.expoConfig?.extra || Constants.manifest?.extra || {};

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
    let qty = Number(it.quantity) || 0;
    let rate = Number(it.rate) || 0;
    let mrp = it.mrp != null ? Number(it.mrp) : undefined;
    let itemTotal = it.itemTotal != null && it.itemTotal !== '' ? Number(it.itemTotal) : null;
    const discount = it.discount != null ? Number(it.discount) : undefined;

    // === CROSS-VALIDATION: Only swap rate/itemTotal if VERY clearly wrong ===
    // Only swap when qty > 1 AND the "rate" is very close to qty*itemTotal (i.e. clearly reversed)
    if (rate > 0 && itemTotal != null && itemTotal > 0 && qty > 1) {
      const expectedTotal = qty * rate;
      // If rate field holds what looks like the line total (rate ≈ qty × itemTotal)
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
    // Trust what the AI/OCR read from the bill column positions.

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
      mrp,
      rate,
      discount,
      discountPercent: it.discountPercent != null ? Number(it.discountPercent) : undefined,
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

// ─────────────────────────────────────────────
// Backend AI parser
// ─────────────────────────────────────────────

async function callBackendParser(ocrText, backendUrl) {
  try {
    const base = backendUrl.replace(/\/$/, '');
    const url = base.endsWith('/api')
      ? `${base}/ai/parse-ocr`
      : `${base}/api/ai/parse-ocr`;

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
    console.warn('[BillParser] Backend call failed:', err?.message || err);
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
  const headerKeywords = ['ITEM NAME', 'ITEM', 'MRP', 'RATE', 'QTY', 'PACKING', 'AMOUNT', 'DIS', 'BATCH', 'EXPIRY', 'HSN', 'PRODUCT', 'PARTICULAR', 'PACK', 'NET'];

  // Find header row (need at least 2 matching keywords)
  for (let i = 0; i < lines.length; i++) {
    const lineUpper = lines[i].toUpperCase();
    const keywordCount = headerKeywords.filter((kw) => lineUpper.includes(kw)).length;
    if (keywordCount >= 2) { tableHeaderIdx = i; break; }
  }

  if (tableHeaderIdx === -1) {
    console.warn('[Parser] No item table header found - skipping item extraction');
    return [];
  }

  // Parse column positions from the header row
  const headerLine = lines[tableHeaderIdx];
  const columnMap = parseHeaderColumns(headerLine);
  console.log('[Parser] Detected columns:', JSON.stringify(columnMap));

  let tableEndIdx = lines.length;
  for (let i = tableHeaderIdx + 1; i < lines.length; i++) {
    const lineUpper = lines[i].toUpperCase();
    if (/\b(SUB\s*TOTAL|SUBTOTAL|GRAND\s*TOTAL|TOTAL\s*(AMT|AMOUNT)?)\b/.test(lineUpper) &&
        !lineUpper.includes('ITEM') && !lineUpper.includes('PRODUCT')) {
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

    const item = parseItemLineWithColumns(trimmed, columnMap);
    if (item && item.name && item.name.length > 2) {
      // Cross-validate: if rate × qty doesn't match itemTotal, flag for review
      const needsReview = item.needsReview || false;
      const reviewReasons = [...(item.reviewReason || [])];

      if (item.rate > 0 && item.quantity > 0 && item.itemTotal > 0) {
        const expected = item.rate * item.quantity;
        const diff = Math.abs(expected - item.itemTotal);
        if (diff > expected * 0.15 && diff > 5) {
          // Rate and total don't match - might be swapped
          reviewReasons.push('Rate × Qty ≠ Amount - verify price fields');
        }
      }

      items.push({
        id: `item-${Date.now()}-${items.length}`,
        name: item.name || '',
        quantity: item.quantity ?? 1,
        unit: item.unit || 'tabs',
        mrp: item.mrp || undefined,
        rate: item.rate ?? 0,
        batchNumber: item.batchNumber || undefined,
        expiryDate: item.expiryDate || undefined,
        hsnCode: item.hsnCode || undefined,
        discount: item.discount || undefined,
        discountPercent: item.discountPercent || undefined,
        gstPercent: item.gstPercent || 0,
        itemTotal: item.itemTotal || undefined,
        needsReview: needsReview || reviewReasons.length > 0,
        reviewReason: reviewReasons,
      });
    }
  }

  return items;
}

/**
 * Parse the header row to identify column positions
 */
function parseHeaderColumns(headerLine) {
  const upper = headerLine.toUpperCase();
  const columns = {};

  // Map of header keywords to field names, ordered by priority
  const headerMap = [
    { patterns: [/\bS\.?\s*N\.?O?\b/, /\bSR\.?\s*N?O?\b/, /^#/], field: 'sn' },
    { patterns: [/\bITEM\s*(NAME)?\b/, /\bPRODUCT\b/, /\bPARTICULAR\b/, /\bDESCRIPTION\b/, /\bMEDICINE\b/], field: 'name' },
    { patterns: [/\bPACK(ING)?\b/, /\bPKG\b/], field: 'unit' },
    { patterns: [/\bHSN\b/], field: 'hsnCode' },
    { patterns: [/\bBATCH\b/, /\bB\.?\s*NO?\b/, /\bLOT\b/], field: 'batchNumber' },
    { patterns: [/\bEXP(IRY)?\b/, /\bEXP\.?\s*D(A)?T(E)?\b/], field: 'expiryDate' },
    { patterns: [/\bMFG\b/, /\bMANUFACTURER\b/, /\bCOMPANY\b/], field: 'manufacturer' },
    { patterns: [/\bQTY\b/, /\bQUANTITY\b/], field: 'qty' },
    { patterns: [/\bFREE\b/, /\bSCHM\b/, /\bSCHEME\b/], field: 'free' },
    { patterns: [/\bMRP\b/, /\bM\.R\.P\b/], field: 'mrp' },
    { patterns: [/\bRATE\b/, /\bP\.?\s*RATE\b/, /\bPUR\.?\s*RATE\b/, /\bNET\s*RATE\b/], field: 'rate' },
    { patterns: [/\bDIS(C|COUNT)?\.?\s*%?\b/], field: 'discount' },
    { patterns: [/\bGST\s*%?\b/, /\bTAX\s*%?\b/], field: 'gstPercent' },
    { patterns: [/\bCGST\b/], field: 'cgstPercent' },
    { patterns: [/\bSGST\b/], field: 'sgstPercent' },
    { patterns: [/\bAMT\b/, /\bAMOUNT\b/, /\bNET\s*AMT\b/, /\bVALUE\b/, /\bTOTAL\b/, /\bNET\b/], field: 'amount' },
  ];

  for (const { patterns, field } of headerMap) {
    for (const pattern of patterns) {
      const match = upper.match(pattern);
      if (match) {
        columns[field] = match.index;
        break;
      }
    }
  }

  return columns;
}

/**
 * Parse an item line using detected column positions
 */
function parseItemLineWithColumns(line, columnMap) {
  // Split by 2+ spaces or tabs for column-separated data
  const parts = line.split(/\s{2,}|\t/).map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length < 1) return null;

  // Find the medicine name (longest non-numeric part)
  let nameIdx = -1;
  let bestName = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (/[A-Z]/i.test(part) && !isNumeric(part) && part.length > bestName.length) {
      // Skip parts that look like batch numbers (alphanumeric but mostly digits)
      const digitRatio = (part.match(/\d/g) || []).length / part.length;
      if (digitRatio < 0.6 || part.length > 8) {
        nameIdx = i;
        bestName = part;
      }
    }
  }

  if (nameIdx === -1) return null;

  const item = {
    name: bestName,
    quantity: undefined,
    unit: 'tabs',
    mrp: undefined,
    rate: undefined,
    batchNumber: undefined,
    expiryDate: undefined,
    hsnCode: undefined,
    discount: undefined,
    discountPercent: undefined,
    gstPercent: 0,
    itemTotal: undefined,
    needsReview: false,
    reviewReason: [],
  };

  // Collect all numeric values with their positions (index in parts array)
  const numericParts = [];
  for (let i = 0; i < parts.length; i++) {
    if (i === nameIdx) continue;
    const part = parts[i];

    // Check for batch number pattern (mix of letters and digits like "ATZ501A")
    if (/^[A-Z0-9]{4,}$/i.test(part) && /[A-Z]/i.test(part) && /\d/.test(part)) {
      item.batchNumber = part;
      continue;
    }

    // Check for expiry date pattern (MM/YY, MM-YY, MM/YYYY)
    if (/^\d{1,2}[\/\-]\d{2,4}$/.test(part)) {
      item.expiryDate = part;
      continue;
    }

    // Check for HSN code (4-8 digit number, usually 3004, 30049099 etc.)
    if (/^\d{4,8}$/.test(part)) {
      const num = parseInt(part);
      if (num >= 1000 && num <= 99999999 && !item.hsnCode) {
        item.hsnCode = part;
        continue;
      }
    }

    // Strip % sign for discount percentage
    const cleanPart = part.replace(/%$/, '');
    const num = parseFloat(cleanPart);
    if (!isNaN(num) && num >= 0) {
      numericParts.push({ value: num, index: i, original: part, hasPercent: part.endsWith('%') });
    }
  }

  // Use column order knowledge to assign numeric values
  // In Indian pharmacy bills, typical column order after name is:
  // Pack | HSN | Batch | Expiry | MFG | Qty | Free | MRP | Rate | Dis% | GST% | Amount

  // Assign based on value heuristics and position
  const afterName = numericParts.filter(p => p.index > nameIdx);
  const beforeName = numericParts.filter(p => p.index < nameIdx);

  // Serial number is usually before the name
  if (beforeName.length > 0 && beforeName[0].value >= 1 && beforeName[0].value <= 999 && Number.isInteger(beforeName[0].value)) {
    // Likely serial number, skip it
  }

  if (afterName.length === 0) {
    item.needsReview = true;
    item.reviewReason.push('No numeric data found for this item');
    return item;
  }

  // Strategy: identify Qty (small integer), Rate/MRP (medium decimal), Amount (largest value, last position)
  // Discount% is small (0-50), GST% is small (5, 12, 18, 28)

  // The LAST numeric value is typically the Amount/Total
  // The Qty is typically the FIRST small integer after name
  // Rate/MRP are medium values between Qty and Amount

  let qtyIdx = -1;
  let amountIdx = -1;
  let rateIdx = -1;
  let mrpIdx = -1;

  // Find quantity: first small integer (1-999)
  for (let i = 0; i < afterName.length; i++) {
    const v = afterName[i].value;
    if (v >= 1 && v <= 999 && Number.isInteger(v) && !afterName[i].hasPercent) {
      qtyIdx = i;
      item.quantity = Math.round(v);
      break;
    }
  }

  // Amount is typically the last larger number
  if (afterName.length >= 2) {
    amountIdx = afterName.length - 1;
    item.itemTotal = afterName[amountIdx].value;
  }

  // Identify percentage values (GST%, discount%)
  for (let i = 0; i < afterName.length; i++) {
    if (i === qtyIdx || i === amountIdx) continue;
    const v = afterName[i].value;
    if (afterName[i].hasPercent || (v > 0 && v <= 50 && [5, 12, 18, 28, 0.5, 2.5, 6, 9, 14].includes(v))) {
      if (!item.gstPercent || item.gstPercent === 0) {
        item.gstPercent = v;
      }
    }
  }

  // Remaining numbers between qty and amount are price fields (MRP, Rate, Discount)
  const priceNumbers = [];
  for (let i = 0; i < afterName.length; i++) {
    if (i === qtyIdx || i === amountIdx) continue;
    const v = afterName[i].value;
    if (!afterName[i].hasPercent && v > 0 && ![5, 12, 18, 28].includes(v)) {
      priceNumbers.push({ value: v, arrayIdx: i });
    }
  }

  if (priceNumbers.length >= 2) {
    // Two price columns: assign by column POSITION from the header, not by value comparison.
    // In Indian pharmacy bills, the typical column order is: MRP (first), then Rate (second).
    // If we have column position info from header, use that.
    const hasMrpCol = columnMap.mrp !== undefined;
    const hasRateCol = columnMap.rate !== undefined;

    if (hasMrpCol && hasRateCol) {
      // Both columns detected in header - assign by position order:
      // The one closer to MRP header position = MRP, the other = Rate
      if (columnMap.mrp < columnMap.rate) {
        item.mrp = priceNumbers[0].value;
        item.rate = priceNumbers[1].value;
      } else {
        item.rate = priceNumbers[0].value;
        item.mrp = priceNumbers[1].value;
      }
    } else {
      // No header info - use position order: first = MRP, second = Rate
      // (typical Indian invoice column order)
      item.mrp = priceNumbers[0].value;
      item.rate = priceNumbers[1].value;
    }
  } else if (priceNumbers.length === 1) {
    // Single price column: use as rate
    item.rate = priceNumbers[0].value;
  }

  // If we found no qty but have rate and amount, calculate qty
  if ((!item.quantity || item.quantity === 0) && item.rate > 0 && item.itemTotal > 0) {
    const calculatedQty = Math.round(item.itemTotal / item.rate);
    if (calculatedQty >= 1 && calculatedQty <= 999) {
      item.quantity = calculatedQty;
      item.needsReview = true;
      item.reviewReason.push('Quantity calculated from Amount/Rate');
    }
  }

  // If we have a single large number and no amount, it might be the amount, not rate
  if (afterName.length === 1) {
    const v = afterName[0].value;
    if (v > 100) {
      item.itemTotal = v;
      item.rate = undefined;
      item.needsReview = true;
      item.reviewReason.push('Single number - could be rate or amount');
    } else {
      item.rate = v;
    }
  }

  // Default quantity to 1 if still not set
  if (!item.quantity) {
    item.quantity = 1;
    item.needsReview = true;
    item.reviewReason.push('Quantity defaulted to 1');
  }

  return item;
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

// parseItemLine is replaced by parseItemLineWithColumns above
// Kept for reference but no longer called
function parseItemLine(line) {
  return parseItemLineWithColumns(line, {});
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



/**
 * Parse OCR text into structured bill data via the backend's AI endpoint, falling back
 * to the local regex parser when the backend can't be reached.
 */
export async function parseOcrText(ocrText, backendUrl) {
  const configuredBackend =
    backendUrl ||
    process.env.EXPO_PUBLIC_BACKEND_URL ||
    _extra.EXPO_PUBLIC_BACKEND_URL;

  if (!configuredBackend) {
    console.warn('[BillParser] No backend URL configured — using local parser.');
    return fallbackParseOcrText(ocrText);
  }

  try {
    return await callBackendParser(ocrText, configuredBackend);
  } catch (error) {
    console.warn('[BillParser] Backend parse failed, using local parser:', error?.message);
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
    items: formatItems(parsedData.items || []),
  };
}

function formatItems(items) {
  return items.map((item, index) => ({
    id: item.id || `item-${Date.now()}-${index}`,
    name: sanitizeText(item.name || ''),
    batchNumber: sanitizeText(item.batchNumber || undefined),
    expiryDate: sanitizeText(item.expiryDate || undefined),
    quantity: Number(item.quantity) || 0,
    humanVerified: item.humanVerified === true,
    needsReview: item.needsReview === true || !item.name || !item.batchNumber || !item.expiryDate || !item.quantity,
    reviewReason: item.reviewReason || [
      ...(!item.name ? ['Missing item name'] : []),
      ...(!item.batchNumber ? ['Missing batch number'] : []),
      ...(!item.expiryDate ? ['Missing expiry date'] : []),
      ...(!item.quantity ? ['Missing quantity'] : []),
    ],
    // Dual-unit capture (P3) — Unit 1 (pack) / Unit 2 (base) / conversion. `packLabel`/
    // `baseUnit`/`packSize` are the user-confirmed values (set once the row is edited or
    // re-opened from a saved bill); `suggestedX` are the OCR auto-suggestion, kept
    // alongside so the row can pre-fill from it without the user having to touch it —
    // the backend falls back to the suggestion itself if the confirmed value is absent.
    packLabel: item.packLabel || undefined,
    baseUnit: item.baseUnit || undefined,
    packSize: item.packSize || undefined,
    suggestedPackLabel: item.suggestedPackLabel || undefined,
    suggestedBaseUnit: item.suggestedBaseUnit || undefined,
    suggestedPackSize: item.suggestedPackSize || undefined,
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
    (item) => !item.name || !item.batchNumber || !item.expiryDate || !item.quantity
  ).length;
  if (items.length > 0) {
    score -= (itemsWithMissingDetails / items.length) * 0.15;
  }

  return Math.max(0, Math.min(1, score));
}

export default {
  parseOcrText,
  formatParsedDataForForm,
  getItemsNeedingReview,
  calculateParseConfidence,
};
