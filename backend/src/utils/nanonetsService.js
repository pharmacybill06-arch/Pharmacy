/**
 * Nanonets invoice extraction.
 * Uses the synchronous LabelFile endpoint of a model (pretrained "Invoice" model
 * added to the account, or a custom-trained model) — set its UUID as
 * NANONETS_MODEL_ID. Auth is HTTP Basic with the API key as username, blank password.
 */

const { normalizeBillData } = require('./geminiService');

const API_BASE = 'https://app.nanonets.com/api/v2/OCR/Model';
const MAX_LOG_CHARS = Number(process.env.NANONETS_LOG_MAX_CHARS || 12000);

function truncateForLog(value, maxChars = MAX_LOG_CHARS) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`;
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function labelFile(buffer, filename, mimeType, apiKey, modelId) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename);

  const basicAuth = Buffer.from(`${apiKey}:`).toString('base64');

  console.log('[NanonetsService] Sending document to Nanonets for labeling...');
  const res = await fetch(`${API_BASE}/${modelId}/LabelFile/?async=false`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basicAuth}` },
    body: form,
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new Error(`Nanonets request failed (${res.status}): ${truncateForLog(body)}`);
  }
  return body;
}

/** Read a simple field's text value, trying several candidate label names. */
function fieldValue(predictionByLabel, ...labels) {
  for (const label of labels) {
    const pred = predictionByLabel[label];
    if (pred !== undefined && pred !== null && pred !== '') return pred;
  }
  return undefined;
}

function indexPredictions(prediction = []) {
  const byLabel = {};
  const tables = [];
  for (const pred of prediction) {
    if (pred.type === 'table' && Array.isArray(pred.cells)) {
      tables.push(pred.cells);
    } else if (pred.label) {
      // Prefer the highest-scoring value if a label repeats
      if (!(pred.label in byLabel) || (pred.score || 0) > (byLabel[`${pred.label}__score`] || 0)) {
        byLabel[pred.label] = pred.ocr_text;
        byLabel[`${pred.label}__score`] = pred.score || 0;
      }
    }
  }
  return { byLabel, tables };
}

/** Convert a flat table (row/col/label/text cells) into row objects keyed by column label. */
function tableToRows(cells) {
  const rows = new Map();
  for (const cell of cells) {
    const row = rows.get(cell.row) || {};
    row[cell.label] = cell.text;
    rows.set(cell.row, row);
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
}

function mapLineItems(tables) {
  if (!tables.length) return [];
  // Use the largest table (most cells) as the item table.
  const cells = tables.reduce((best, t) => (t.length > best.length ? t : best), tables[0]);
  const rows = tableToRows(cells);

  return rows.map((row, idx) => ({
    sn: row.sn ?? row.SN ?? idx + 1,
    name: row.name ?? row.Description ?? row.description,
    quantity: row.quantity ?? row.Quantity,
    freeQuantity: row.freeQuantity ?? row.Free,
    unit: row.unit ?? row.Pack ?? row.Packing,
    manufacturer: row.manufacturer ?? row.Manufacturer,
    batchNumber: row.batchNumber ?? row.Batch ?? row.batch_number,
    expiryDate: row.expiryDate ?? row.Expiry ?? row.expiry_date,
    hsnCode: row.hsnCode ?? row.HSN ?? row.Product_Code ?? row.product_code,
    mrp: row.mrp ?? row.MRP,
    rate: row.rate ?? row.Price ?? row.Rate,
    discount: row.discount ?? row.Discount,
    discountPercent: row.discountPercent ?? row['Dis%'],
    gstPercent: row.gstPercent ?? row['GST%'],
    sgstPercent: row.sgstPercent ?? row['SGST%'],
    cgstPercent: row.cgstPercent ?? row['CGST%'],
    itemTotal: row.itemTotal ?? row.Line_Amount ?? row.Amount ?? row.total,
  }));
}

function mapNanonetsResultToBillShape(prediction) {
  const { byLabel, tables } = indexPredictions(prediction);

  let phoneNumbers = fieldValue(byLabel, 'phoneNumbers', 'seller_phone');
  if (phoneNumbers && !Array.isArray(phoneNumbers)) phoneNumbers = [String(phoneNumbers)];

  return {
    pharmacyName: fieldValue(byLabel, 'pharmacyName', 'seller_name'),
    shopAddress: fieldValue(byLabel, 'shopAddress', 'seller_address'),
    phoneNumbers,
    gstin: fieldValue(byLabel, 'gstin', 'seller_vat_number'),
    dlNumber: fieldValue(byLabel, 'dlNumber'),
    invoiceNumber: fieldValue(byLabel, 'invoiceNumber', 'invoice_number'),
    invoiceDate: fieldValue(byLabel, 'invoiceDate', 'invoice_date'),
    dueDate: fieldValue(byLabel, 'dueDate', 'payment_due_date'),
    paymentType: fieldValue(byLabel, 'paymentType'),
    items: mapLineItems(tables),
    subtotal: fieldValue(byLabel, 'subtotal'),
    discountPercent: fieldValue(byLabel, 'discountPercent'),
    discountAmount: fieldValue(byLabel, 'discountAmount'),
    cgst: fieldValue(byLabel, 'cgst'),
    sgst: fieldValue(byLabel, 'sgst'),
    totalGst: fieldValue(byLabel, 'totalGst', 'total_tax'),
    roundOff: fieldValue(byLabel, 'roundOff'),
    grandTotal: fieldValue(byLabel, 'grandTotal', 'total_due_amount', 'invoice_amount'),
  };
}

/**
 * Parse a bill image/PDF using Nanonets.
 * Returns data normalized to the same shape as the Gemini/Groq parsers.
 */
async function parseInvoiceWithNanonets(buffer, mimeType = 'image/jpeg', filename = 'invoice') {
  const apiKey = process.env.NANONETS_API_KEY;
  const modelId = process.env.NANONETS_MODEL_ID;
  if (!apiKey) {
    throw new Error('Nanonets is not configured. Set NANONETS_API_KEY in .env');
  }
  if (!modelId) {
    throw new Error(
      'Nanonets model is not configured. Add/train an Invoice model in the Nanonets dashboard, then set its model ID as NANONETS_MODEL_ID in .env'
    );
  }

  const result = await labelFile(buffer, filename, mimeType, apiKey, modelId);
  console.log(`[NanonetsService] Raw result:\n${truncateForLog(result)}`);

  const prediction = result?.result?.[0]?.prediction || result?.prediction || [];
  const rawParsed = mapNanonetsResultToBillShape(prediction);
  const normalized = normalizeBillData(rawParsed, '');

  console.log(`[NanonetsService] Parsed ${normalized.items?.length || 0} items via Nanonets`);
  return normalized;
}

module.exports = { parseInvoiceWithNanonets };
