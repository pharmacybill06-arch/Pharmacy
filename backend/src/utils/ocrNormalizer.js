// ocrNormalizer.js
// Unified OCR normalization and layout-aware parsing pipeline
// Converts EasyOCR, Google Vision, and OCR.space outputs into a common token format

/**
 * Token format:
 * {
 *   text: string,
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number,
 *   confidence?: number,
 *   engine?: string
 * }
 */

// --- STEP 1: NORMALIZATION ---

/**
 * Normalize EasyOCR output
 * @param {Array} easyOcrResults - [ [bbox, text, confidence], ... ]
 * @returns {Array}
 */
function normalizeEasyOcr(easyOcrResults) {
  return easyOcrResults.map(([bbox, text, confidence]) => {
    // bbox: [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
    const xs = bbox.map(pt => pt[0]);
    const ys = bbox.map(pt => pt[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xs) - x;
    const height = Math.max(...ys) - y;
    return { text, x, y, width, height, confidence, engine: 'easyocr' };
  });
}

/**
 * Normalize Google Vision output
 * @param {Array} textAnnotations - [{description, boundingPoly: {vertices: [...]}, confidence}]
 * @returns {Array}
 */
function normalizeVision(textAnnotations) {
  return textAnnotations.map(annotation => {
    const vertices = annotation.boundingPoly.vertices;
    const xs = vertices.map(v => v.x || 0);
    const ys = vertices.map(v => v.y || 0);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xs) - x;
    const height = Math.max(...ys) - y;
    return {
      text: annotation.description,
      x,
      y,
      width,
      height,
      confidence: annotation.confidence,
      engine: 'vision'
    };
  });
}

/**
 * Normalize OCR.space output
 * @param {Array} words - [{WordText, Left, Top, Width, Height, Confidence}]
 * @returns {Array}
 */
function normalizeOcrSpace(words) {
  return words.map(word => ({
    text: word.WordText,
    x: word.Left,
    y: word.Top,
    width: word.Width,
    height: word.Height,
    confidence: word.Confidence,
    engine: 'ocrspace'
  }));
}

/**
 * Merge all tokens from all engines
 * @param  {...Array} tokenLists
 * @returns {Array}
 */
function mergeTokens(...tokenLists) {
  return tokenLists.flat();
}

// --- STEP 2: SORTING ---
function sortTokens(tokens) {
  return tokens.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

// --- STEP 3: ROW DETECTION ---
function groupTokensByRows(tokens, threshold = 15) {
  const rows = [];
  let currentRow = null;
  for (const token of tokens) {
    if (!currentRow || Math.abs(token.y - currentRow.rowY) > threshold) {
      currentRow = { rowY: token.y, tokens: [token] };
      rows.push(currentRow);
    } else {
      currentRow.tokens.push(token);
    }
  }
  return rows;
}

// --- STEP 4: HEADER DETECTION ---
const HEADER_KEYWORDS = [
  'medicine', 'item', 'product', 'qty', 'quantity', 'rate', 'price', 'mrp', 'amount', 'total'
];

function detectHeaders(tokens) {
  const headerMap = {};
  for (const token of tokens) {
    const lower = token.text.toLowerCase();
    for (const key of HEADER_KEYWORDS) {
      if (lower.includes(key)) {
        headerMap[key] = token.x;
      }
    }
  }
  return headerMap;
}

// --- STEP 5: COLUMN MAPPING ---
function assignTokensToColumns(row, headerXs) {
  // Find closest header for each token
  return row.tokens.map(token => {
    let minDist = Infinity;
    let col = null;
    for (const [header, x] of Object.entries(headerXs)) {
      const dist = Math.abs(token.x - x);
      if (dist < minDist) {
        minDist = dist;
        col = header;
      }
    }
    return { ...token, column: col };
  });
}

// --- STEP 6: FULL TABLE RECONSTRUCTION PIPELINE ---
/**
 * Full pipeline: sort → group rows → detect headers → assign columns → merge medicine names → return structured items
 * @param {Array} tokens - Normalized tokens from any OCR engine
 * @returns {Array} Structured items with column assignments
 */
function reconstructBillTable(tokens) {
  if (!tokens || tokens.length === 0) return [];

  const sorted = sortTokens(tokens);
  const rows = groupTokensByRows(sorted);

  // Find the header row
  let headerRow = null;
  let headerIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const rowText = rows[i].tokens.map(t => t.text.toLowerCase()).join(' ');
    const matchCount = HEADER_KEYWORDS.filter(k => rowText.includes(k)).length;
    if (matchCount >= 2) {
      headerRow = rows[i];
      headerIndex = i;
      break;
    }
  }

  if (!headerRow) return [];

  const headerXs = detectHeaders(headerRow.tokens);
  const dataRows = rows.slice(headerIndex + 1);
  const items = [];

  for (const row of dataRows) {
    const mapped = assignTokensToColumns(row, headerXs);
    const item = {};

    for (const token of mapped) {
      if (token.column) {
        if (item[token.column]) {
          item[token.column] += ' ' + token.text;
        } else {
          item[token.column] = token.text;
        }
      }
    }

    // Only add rows that have at least a name or amount
    if (item.item || item.product || item.medicine || item.amount || item.total) {
      items.push({
        name: item.item || item.product || item.medicine || '',
        quantity: parseFloat(item.qty || item.quantity) || 0,
        mrp: parseFloat(item.mrp) || null,
        rate: parseFloat(item.rate || item.price) || 0,
        itemTotal: parseFloat(item.amount || item.total) || 0,
      });
    }
  }

  return items;
}

// --- STEP 7: NUMERIC NORMALIZATION ---
/**
 * Fix common OCR digit mistakes and parse strings to floats
 * @param {Array} items - Array of item objects
 * @returns {Array} Items with normalized numeric fields
 */
function normalizeNumericFields(items) {
  if (!Array.isArray(items)) return items;

  const fixDigits = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/[Oo]/g, '0')   // O → 0
      .replace(/[lI|]/g, '1')  // l, I, | → 1
      .replace(/[Ss]/g, '5')   // S → 5 (only in numeric context)
      .replace(/[Bb]/g, '8')   // B → 8
      .replace(/,/g, '');       // Remove thousand separators
  };

  const NUMERIC_FIELDS = ['quantity', 'freeQuantity', 'mrp', 'rate', 'discount', 'gstPercent', 'cgstPercent', 'sgstPercent', 'itemTotal'];

  return items.map(item => {
    const result = { ...item };
    for (const field of NUMERIC_FIELDS) {
      if (result[field] !== null && result[field] !== undefined) {
        let val = result[field];
        if (typeof val === 'string') {
          val = fixDigits(val);
          val = parseFloat(val);
        }
        result[field] = isNaN(val) ? null : val;
      }
    }
    return result;
  });
}

// --- STEP 8: VALIDATION ---
/**
 * Validate items: MRP ≥ Rate, Amount ≈ Qty × Rate
 * @param {Array} items - Array of item objects
 * @returns {Object} { validItems, warnings }
 */
function validateItems(items) {
  if (!Array.isArray(items)) return { validItems: items || [], warnings: [] };

  const warnings = [];
  const TOLERANCE = 0.05; // 5% tolerance

  const validItems = items.map((item, idx) => {
    const result = { ...item };

    // Check MRP >= Rate
    if (result.mrp != null && result.rate != null && result.mrp > 0 && result.rate > 0) {
      if (result.mrp < result.rate) {
        warnings.push(`Item ${idx + 1} "${result.name}": MRP (${result.mrp}) < Rate (${result.rate})`);
      }
    }

    // Check Amount ≈ Qty × Rate
    if (result.quantity > 0 && result.rate > 0 && result.itemTotal > 0) {
      const expected = result.quantity * result.rate;
      const diff = Math.abs(expected - result.itemTotal);
      if (diff > expected * TOLERANCE && diff > 1) {
        warnings.push(
          `Item ${idx + 1} "${result.name}": Amount (${result.itemTotal}) ≠ Qty (${result.quantity}) × Rate (${result.rate}) = ${expected.toFixed(2)}`
        );
        result.confidence = Math.min(result.confidence || 1.0, 0.7);
      }
    }

    return result;
  });

  return { validItems, warnings };
}

module.exports = {
  normalizeEasyOcr,
  normalizeVision,
  normalizeOcrSpace,
  mergeTokens,
  sortTokens,
  groupTokensByRows,
  detectHeaders,
  assignTokensToColumns,
  reconstructBillTable,
  normalizeNumericFields,
  validateItems
};
