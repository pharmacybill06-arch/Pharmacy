/**
 * Spreadsheet Parser for CSV and Excel files
 * Converts CSV/XLSX data into the same bill format as Gemini OCR output
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';

// ─────────────────────────────────────────────
// Column name mappings (case-insensitive)
// ─────────────────────────────────────────────
const COLUMN_MAPPINGS = {
  // Item name
  name: ['name', 'item', 'item name', 'product', 'product name', 'medicine', 'medicine name', 'description', 'particulars', 'drug', 'drug name'],
  // Quantity
  quantity: ['quantity', 'qty', 'qty.', 'pack', 'packs', 'no', 'nos', 'units', 'count'],
  // Free quantity
  freeQuantity: ['free', 'free qty', 'free quantity', 'freeqty', 'bonus', 'scheme'],
  // Unit
  unit: ['unit', 'uom', 'unit of measure', 'pack type', 'packing'],
  // MRP
  mrp: ['mrp', 'm.r.p', 'm.r.p.', 'maximum retail price', 'mrp/unit'],
  // Rate
  rate: ['rate', 'price', 'unit price', 'unit rate', 'ptr', 'net rate', 'pur.rate', 'pur rate', 'purchase rate', 'p.rate'],
  // Discount
  discount: ['discount', 'disc', 'disc.', 'dis', 'dis.', 'disc amt', 'discount amount', 'disc%'],
  // Discount percent
  discountPercent: ['discount%', 'disc%', 'dis%', 'disc %', 'discount percent'],
  // GST percent
  gstPercent: ['gst', 'gst%', 'gst %', 'gst percent', 'tax', 'tax%', 'tax %', 'igst', 'igst%'],
  // SGST percent
  sgstPercent: ['sgst', 'sgst%', 'sgst %'],
  // CGST percent
  cgstPercent: ['cgst', 'cgst%', 'cgst %'],
  // HSN Code
  hsnCode: ['hsn', 'hsn code', 'hsncode', 'hsn/sac', 'sac'],
  // Batch number
  batchNumber: ['batch', 'batch no', 'batch no.', 'batch number', 'batchno', 'lot', 'lot no', 'b.no', 'b.no.'],
  // Expiry date
  expiryDate: ['expiry', 'exp', 'exp.', 'expiry date', 'exp date', 'exp.date', 'exp dt', 'expdt'],
  // Manufacturer
  manufacturer: ['manufacturer', 'mfr', 'mfg', 'mfr.', 'company', 'brand', 'make'],
  // Item total
  itemTotal: ['total', 'amount', 'amt', 'amt.', 'value', 'net amount', 'net amt', 'net value', 'gross', 'gross amount', 'line total'],
  // Serial number
  sn: ['sn', 'sr', 'sr.', 's.no', 's.no.', 'sr no', 'sr no.', 'sl', 'sl.', 'sl no', '#', 'no.'],
};

// Header-level field mappings (for metadata rows or separate sheet columns)
const HEADER_MAPPINGS = {
  pharmacyName: ['pharmacy', 'pharmacy name', 'shop', 'shop name', 'distributor', 'distributor name', 'supplier', 'supplier name', 'from', 'party name', 'firm'],
  invoiceNumber: ['invoice', 'invoice no', 'invoice no.', 'invoice number', 'inv no', 'inv no.', 'bill no', 'bill no.', 'bill number', 'voucher', 'voucher no'],
  invoiceDate: ['date', 'invoice date', 'inv date', 'bill date', 'dated'],
  dueDate: ['due date', 'due', 'payment due'],
  gstin: ['gstin', 'gst no', 'gst no.', 'gst number', 'gstin/uin'],
  dlNumber: ['dl', 'dl no', 'dl no.', 'drug license', 'drug licence', 'dl number', 'license no', 'licence no'],
  phoneNumbers: ['phone', 'phone no', 'phone no.', 'contact', 'mobile', 'mob', 'tel', 'telephone'],
  shopAddress: ['address', 'addr', 'shop address', 'location'],
  paymentType: ['payment', 'payment type', 'payment mode', 'mode', 'pay mode'],
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function normalizeHeader(header) {
  if (!header || typeof header !== 'string') return '';
  return header.toLowerCase().replace(/[^a-z0-9%/ ]/g, '').trim();
}

function matchColumn(header, mappings) {
  const norm = normalizeHeader(header);
  if (!norm) return null;
  
  for (const [field, aliases] of Object.entries(mappings)) {
    for (const alias of aliases) {
      if (norm === alias || norm.includes(alias)) {
        return field;
      }
    }
  }
  return null;
}

function parseNumber(val) {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') return val;
  // Remove currency symbols, commas, spaces
  const cleaned = String(val).replace(/[₹$,\s]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseDate(val) {
  if (!val) return null;
  const str = String(val).trim();
  
  // Already in DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) return str;
  
  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str.replace(/\//g, '-');
  
  // MM/YY or MM-YY
  if (/^\d{2}[/-]\d{2}$/.test(str)) {
    const [m, y] = str.split(/[/-]/);
    const fullYear = parseInt(y) > 50 ? `19${y}` : `20${y}`;
    return `01-${m}-${fullYear}`;
  }

  // MM/YYYY or MM-YYYY
  if (/^\d{2}[/-]\d{4}$/.test(str)) {
    const [m, y] = str.split(/[/-]/);
    return `01-${m}-${y}`;
  }

  // Try to parse as an Excel serial date number
  if (/^\d{5}$/.test(str)) {
    const serial = parseInt(str);
    const utcDays = Math.floor(serial - 25569);
    const utcValue = utcDays * 86400 * 1000;
    const d = new Date(utcValue);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = d.getUTCFullYear();
      return `${dd}-${mm}-${yyyy}`;
    }
  }

  // Try native Date parse
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  return str; // Return as-is if can't parse
}

function inferUnit(name = '') {
  const t = name.toUpperCase();
  if (t.includes('SACHET')) return 'sachet';
  if (t.includes('TAB')) return 'tabs';
  if (t.includes('CAP')) return 'caps';
  if (t.includes('SYRUP') || t.includes('SYP')) return 'bottle';
  if (t.includes('INJ')) return 'injection';
  if (t.includes('CREAM') || t.includes('GEL') || t.includes('OINT')) return 'tube';
  if (t.includes('DROP')) return 'bottle';
  return 'units';
}

// ─────────────────────────────────────────────
// Core parsers
// ─────────────────────────────────────────────

/**
 * Read a file and return raw workbook
 */
async function readFileToWorkbook(fileUri, mimeType) {
  console.log('[SpreadsheetParser] Reading file:', fileUri, 'mimeType:', mimeType);
  
  const fileContent = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const workbook = XLSX.read(fileContent, { type: 'base64' });
  console.log('[SpreadsheetParser] Sheets found:', workbook.SheetNames);
  return workbook;
}

/**
 * Extract header row and metadata from a sheet
 */
function analyzeSheet(sheet) {
  const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  
  if (!allRows || allRows.length === 0) {
    return { headers: [], headerRowIndex: -1, dataRows: [], metadata: {} };
  }

  // Find the header row: the row that has the most column matches
  let bestRowIndex = 0;
  let bestMatchCount = 0;

  for (let i = 0; i < Math.min(allRows.length, 15); i++) {
    const row = allRows[i];
    if (!Array.isArray(row)) continue;
    
    let matchCount = 0;
    for (const cell of row) {
      const matched = matchColumn(String(cell), COLUMN_MAPPINGS);
      if (matched) matchCount++;
    }
    
    if (matchCount > bestMatchCount) {
      bestMatchCount = matchCount;
      bestRowIndex = i;
    }
  }

  // Extract metadata from rows above the header
  const metadata = {};
  for (let i = 0; i < bestRowIndex; i++) {
    const row = allRows[i];
    if (!Array.isArray(row)) continue;
    
    for (let j = 0; j < row.length - 1; j++) {
      const key = normalizeHeader(String(row[j]));
      const value = String(row[j + 1] || '').trim();
      if (!key || !value) continue;
      
      const field = matchColumn(key, HEADER_MAPPINGS);
      if (field && !metadata[field]) {
        metadata[field] = value;
      }
    }
  }

  const headers = allRows[bestRowIndex].map((h) => String(h));
  const dataRows = allRows.slice(bestRowIndex + 1);

  return { headers, headerRowIndex: bestRowIndex, dataRows, metadata };
}

/**
 * Parse a sheet into bill items using detected column mappings
 */
function parseItemsFromSheet(headers, dataRows) {
  // Map each header to a field name
  const columnMap = {};
  headers.forEach((header, index) => {
    const field = matchColumn(String(header), COLUMN_MAPPINGS);
    if (field && !(field in columnMap)) {
      columnMap[field] = index;
    }
  });

  console.log('[SpreadsheetParser] Column mapping:', columnMap);

  const items = [];

  for (const row of dataRows) {
    if (!Array.isArray(row)) continue;
    
    // Skip empty rows
    const nonEmpty = row.filter((cell) => cell != null && String(cell).trim() !== '');
    if (nonEmpty.length === 0) continue;

    // Get the item name - skip rows without a name (likely totals/footers)
    const nameIdx = columnMap.name;
    const name = nameIdx != null ? String(row[nameIdx] || '').trim() : '';
    
    // Skip if no name, unless there's a clear item number
    if (!name) {
      // Check if this is a total/summary row
      const rowText = row.map(c => String(c || '')).join(' ').toLowerCase();
      if (rowText.includes('total') || rowText.includes('grand') || rowText.includes('sub total') || rowText.includes('subtotal')) {
        continue; // Skip summary rows
      }
      if (!name) continue;
    }

    // Skip rows that look like summary lines
    const nameLower = name.toLowerCase();
    if (['total', 'grand total', 'subtotal', 'sub total', 'net amount', 'round off', 'cgst', 'sgst', 'igst', 'discount'].includes(nameLower)) {
      continue;
    }

    const getValue = (field) => (columnMap[field] != null ? row[columnMap[field]] : undefined);

    const quantity = parseNumber(getValue('quantity')) || 1;
    const rate = parseNumber(getValue('rate'));
    const itemTotal = parseNumber(getValue('itemTotal'));
    const mrp = parseNumber(getValue('mrp'));

    items.push({
      id: `item-${Date.now()}-${items.length}`,
      sn: parseNumber(getValue('sn')) || undefined,
      name,
      quantity,
      freeQuantity: parseNumber(getValue('freeQuantity')) || undefined,
      unit: (getValue('unit') ? String(getValue('unit')).trim() : '') || inferUnit(name),
      mrp: mrp || undefined,
      rate: rate || (itemTotal && quantity ? Math.round((itemTotal / quantity) * 100) / 100 : 0),
      discount: parseNumber(getValue('discount')) || undefined,
      discountPercent: parseNumber(getValue('discountPercent')) || undefined,
      gstPercent: parseNumber(getValue('gstPercent')) || 0,
      sgstPercent: parseNumber(getValue('sgstPercent')) || undefined,
      cgstPercent: parseNumber(getValue('cgstPercent')) || undefined,
      hsnCode: getValue('hsnCode') ? String(getValue('hsnCode')).trim() : undefined,
      batchNumber: getValue('batchNumber') ? String(getValue('batchNumber')).trim() : undefined,
      expiryDate: parseDate(getValue('expiryDate')) || undefined,
      manufacturer: getValue('manufacturer') ? String(getValue('manufacturer')).trim() : undefined,
      itemTotal: itemTotal || (quantity * (rate || 0)),
      needsReview: false,
      reviewReason: [],
    });
  }

  return items;
}

/**
 * Extract summary totals from rows below the items
 */
function extractTotals(items, allRows, headerRowIndex) {
  const totals = {
    subtotal: 0,
    cgst: 0,
    sgst: 0,
    totalGst: 0,
    grandTotal: 0,
    roundOff: 0,
    discountAmount: 0,
    discountPercent: 0,
  };

  // Calculate subtotal from items
  totals.subtotal = items.reduce((sum, item) => sum + (item.itemTotal || 0), 0);
  totals.subtotal = Math.round(totals.subtotal * 100) / 100;

  // Look for total rows below the data
  const totalKeywords = {
    subtotal: ['sub total', 'subtotal', 'sub-total', 'taxable amount', 'taxable value', 'total before tax'],
    cgst: ['cgst', 'central gst'],
    sgst: ['sgst', 'state gst'],
    totalGst: ['total gst', 'gst total', 'total tax', 'tax amount'],
    grandTotal: ['grand total', 'total amount', 'net amount', 'bill amount', 'invoice total', 'total', 'net payable'],
    roundOff: ['round off', 'roundoff', 'round-off', 'rounding'],
    discountAmount: ['discount', 'disc', 'total discount'],
  };

  // Scan all rows for keyword:value pairs
  for (const row of allRows) {
    if (!Array.isArray(row)) continue;
    const rowText = row.map(c => String(c || '').toLowerCase().trim()).join('|');
    
    for (const [field, keywords] of Object.entries(totalKeywords)) {
      for (const keyword of keywords) {
        if (rowText.includes(keyword)) {
          // Find the numeric value in this row
          for (let i = row.length - 1; i >= 0; i--) {
            const num = parseNumber(row[i]);
            if (num !== 0) {
              totals[field] = num;
              break;
            }
          }
          break;
        }
      }
    }
  }

  // If no explicit grand total found, calculate
  if (!totals.grandTotal) {
    totals.grandTotal = totals.subtotal + totals.totalGst - totals.discountAmount + totals.roundOff;
  }

  return totals;
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Parse a CSV or Excel file into structured bill data
 * @param {string} fileUri - The local file URI
 * @param {string} mimeType - The MIME type of the file
 * @returns {Object} Parsed bill data in the same format as Gemini output
 */
export async function parseSpreadsheetFile(fileUri, mimeType) {
  console.log('[SpreadsheetParser] Starting parse:', fileUri);

  const workbook = await readFileToWorkbook(fileUri, mimeType);
  
  // Use first sheet
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Analyze the sheet
  const { headers, headerRowIndex, dataRows, metadata } = analyzeSheet(sheet);
  const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  
  console.log('[SpreadsheetParser] Headers found:', headers);
  console.log('[SpreadsheetParser] Metadata:', metadata);
  console.log('[SpreadsheetParser] Data rows:', dataRows.length);

  if (headers.length === 0) {
    throw new Error('Could not detect column headers in the file. Please ensure the spreadsheet has a header row.');
  }

  // Parse items
  const items = parseItemsFromSheet(headers, dataRows);
  console.log('[SpreadsheetParser] Parsed items:', items.length);

  if (items.length === 0) {
    throw new Error('No items found in the file. Please ensure the spreadsheet has item data with at least a Name column.');
  }

  // Extract totals
  const totals = extractTotals(items, allRows, headerRowIndex);

  // Build result in same format as Gemini parsed output
  const result = {
    pharmacyName: metadata.pharmacyName || '',
    shopAddress: metadata.shopAddress || '',
    phoneNumbers: metadata.phoneNumbers || '',
    gstin: metadata.gstin || '',
    dlNumber: metadata.dlNumber || '',
    invoiceNumber: metadata.invoiceNumber || '',
    invoiceDate: parseDate(metadata.invoiceDate) || '',
    dueDate: parseDate(metadata.dueDate) || '',
    paymentType: (metadata.paymentType || 'cash').toLowerCase(),
    currentBalance: 0,
    items,
    subtotal: totals.subtotal,
    discountPercent: totals.discountPercent,
    discount: totals.discountAmount,
    cgst: totals.cgst,
    sgst: totals.sgst,
    totalGst: totals.totalGst || (totals.cgst + totals.sgst),
    roundOff: totals.roundOff,
    grandTotal: totals.grandTotal,
  };

  console.log('[SpreadsheetParser] Parse complete. Items:', items.length, 'GrandTotal:', result.grandTotal);
  return result;
}

/**
 * Convert spreadsheet data to a text representation (for Gemini AI refinement)
 */
export function spreadsheetToText(fileUri, mimeType) {
  // This sends the raw text to Gemini for more intelligent parsing if needed
  return readFileToWorkbook(fileUri, mimeType).then((workbook) => {
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    return csv;
  });
}

/**
 * Check if a MIME type or file extension is a supported spreadsheet format
 */
export function isSpreadsheetFile(mimeType, fileName) {
  const spreadsheetMimeTypes = [
    'text/csv',
    'text/comma-separated-values',
    'application/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/wps-office.xlsx',
  ];
  
  if (mimeType && spreadsheetMimeTypes.includes(mimeType.toLowerCase())) {
    return true;
  }

  if (fileName) {
    const ext = fileName.toLowerCase().split('.').pop();
    return ['csv', 'xlsx', 'xls'].includes(ext);
  }

  return false;
}

export default {
  parseSpreadsheetFile,
  spreadsheetToText,
  isSpreadsheetFile,
};
