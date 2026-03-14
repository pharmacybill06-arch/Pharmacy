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

module.exports = {
  normalizeEasyOcr,
  normalizeVision,
  normalizeOcrSpace,
  mergeTokens,
  sortTokens,
  groupTokensByRows,
  detectHeaders,
  assignTokensToColumns
};
