const prisma = require('../models/prisma');
const wb = require('./workbookBuilder');
const ledgerService = require('./ledgerService');
const { parseExpiryToUtcDate, daysUntil } = require('../utils/dateUtils');

/**
 * Export Service
 * Generates Excel/CSV exports of everything a pharmacist has put into Setu:
 * purchase entries (for ERP import), expiry lists (for distributor returns),
 * the GST summary (for the accountant), and the daily sale register.
 *
 * Hard rules:
 *   1. Batch numbers are exported exactly as stored — no cleanup, no case changes.
 *   2. Archived records are excluded unless includeArchived is explicitly on.
 *   3. Generation only. This module must never mutate business data.
 *   4. Blank stays blank — never "null"/"undefined"/0 standing in for missing data.
 */

// Beyond this an export stops being useful and starts timing out; the user is asked
// to narrow the range instead.
const MAX_ROWS = 10000;

const EXPORT_TYPES = ['purchases', 'expiry', 'sales', 'ledger'];

const TYPE_LABEL = {
  purchases: 'Purchases',
  expiry: 'Expiry',
  sales: 'Sales',
  ledger: 'Ledger',
};

class NoDataError extends Error {
  constructor(message = 'No data in this range') {
    super(message);
    this.name = 'NoDataError';
    this.isNoData = true;
  }
}

class RowLimitError extends Error {
  constructor(rowCount) {
    super(
      `This export has ${rowCount.toLocaleString('en-IN')} rows, over the ${MAX_ROWS.toLocaleString('en-IN')} limit. Narrow the date range and try again.`
    );
    this.name = 'RowLimitError';
    this.isRowLimit = true;
  }
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Inclusive date-range filter; either bound may be omitted. */
function dateRangeFilter(from, to) {
  if (!from && !to) return undefined;
  const filter = {};
  if (from) filter.gte = new Date(from);
  if (to) {
    // `to` is a calendar day — include everything up to the end of it
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    filter.lte = end;
  }
  return filter;
}

function ddmmyyyyCompact(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
}

/** Setu_Purchases_01072026-31072026.xlsx */
function buildFileName(type, filters, format) {
  const label = TYPE_LABEL[type] || 'Export';
  const from = ddmmyyyyCompact(filters?.from) || ddmmyyyyCompact(new Date());
  const to = ddmmyyyyCompact(filters?.to) || ddmmyyyyCompact(new Date());
  return `Setu_${label}_${from}-${to}.${format}`;
}

// ============================================================
// A. PURCHASE ITEMS (+ GST SUMMARY)
// ============================================================

const PURCHASE_COLUMNS = [
  { header: 'Invoice No', key: 'invoiceNo', type: 'text', width: 16 },
  { header: 'Invoice Date', key: 'invoiceDate', type: 'date', width: 14 },
  { header: 'Distributor', key: 'distributor', type: 'text', width: 28 },
  { header: 'Distributor GSTIN', key: 'gstin', type: 'text', width: 20 },
  { header: 'Product Name', key: 'productName', type: 'text', width: 34 },
  { header: 'Pack', key: 'pack', type: 'text', width: 12 },
  { header: 'MFR', key: 'mfr', type: 'text', width: 18 },
  // Text-typed so Excel cannot mangle "5P10775" into scientific notation
  { header: 'Batch No', key: 'batchNo', type: 'text', width: 16 },
  { header: 'Expiry', key: 'expiry', type: 'text', width: 10 },
  { header: 'Expiry (Date)', key: 'expiryDate', type: 'date', width: 14 },
  { header: 'Qty', key: 'qty', type: 'number', width: 8 },
  { header: 'Free Qty', key: 'freeQty', type: 'number', width: 10 },
  { header: 'HSN', key: 'hsn', type: 'text', width: 12 },
  { header: 'Rate', key: 'rate', type: 'currency', width: 10 },
  { header: 'Discount %', key: 'discount', type: 'percent', width: 11 },
  { header: 'MRP', key: 'mrp', type: 'currency', width: 10 },
  // Avoid width 9 — that is ExcelJS's default, so it is never written as a custom
  // width and the column silently loses its explicit sizing
  { header: 'GST %', key: 'gstPercent', type: 'percent', width: 10 },
  { header: 'Amount', key: 'amount', type: 'currency', width: 12 },
];

const GST_COLUMNS = [
  { header: 'Invoice No', key: 'invoiceNo', type: 'text', width: 16 },
  { header: 'Date', key: 'date', type: 'date', width: 14 },
  { header: 'Distributor', key: 'distributor', type: 'text', width: 28 },
  { header: 'GSTIN', key: 'gstin', type: 'text', width: 20 },
  { header: 'Taxable Value', key: 'taxable', type: 'currency', width: 14 },
  { header: 'CGST', key: 'cgst', type: 'currency', width: 12 },
  { header: 'SGST', key: 'sgst', type: 'currency', width: 12 },
  { header: 'Total GST', key: 'totalGst', type: 'currency', width: 12 },
  { header: 'Grand Total', key: 'grandTotal', type: 'currency', width: 14 },
];

async function fetchPurchaseBills(userId, filters) {
  return prisma.bill.findMany({
    where: {
      userId,
      billType: 'purchase',
      status: { not: 'draft' },
      ...(filters.billIds?.length ? { id: { in: filters.billIds } } : {}),
      ...(dateRangeFilter(filters.from, filters.to)
        ? { invoiceDate: dateRangeFilter(filters.from, filters.to) }
        : {}),
      ...(filters.distributorIds?.length ? { distributorId: { in: filters.distributorIds } } : {}),
    },
    include: {
      distributor: true,
      items: {
        ...(filters.includeArchived ? {} : { where: { expiryStatus: { not: 'archived' } } }),
        orderBy: { serialNumber: 'asc' },
      },
    },
    orderBy: { invoiceDate: 'asc' },
  });
}

function buildPurchaseRows(bills) {
  const rows = [];
  for (const bill of bills) {
    const distributorName = bill.distributor?.name || bill.pharmacyName || null;
    for (const item of bill.items) {
      // UTC-anchored: ExcelJS serialises Date objects in UTC, so a local-midnight
      // date would land in the cell as the previous day east of Greenwich
      // ("8/26" showing as 30-08-2026 instead of 31-08-2026).
      const parsedExpiry = parseExpiryToUtcDate(item.expiryDate);
      rows.push({
        invoiceNo: bill.invoiceNumber,
        invoiceDate: bill.invoiceDate,
        distributor: distributorName,
        gstin: bill.distributor?.gstin,
        productName: item.name,
        // No dedicated pack column exists on BillItem; `unit` is what the parser stores
        pack: item.unit && item.unit !== 'units' ? item.unit : null,
        mfr: item.manufacturer,
        batchNo: item.batchNumber, // verbatim
        expiry: item.expiryDate, // raw, as printed on the bill
        expiryDate: parsedExpiry, // normalised where parseable, blank otherwise
        qty: item.quantity,
        freeQty: item.freeQuantity,
        hsn: item.hsnCode,
        rate: item.rate || null,
        discount: item.discount,
        mrp: item.mrp,
        gstPercent: item.gstPercent,
        amount: item.itemTotal || null,
      });
    }
  }
  return rows;
}

/**
 * GST Summary: one row per bill, plus rate-wise subtotals for ITC matching.
 */
function buildGstSummary(bills) {
  const rows = [];
  const rateBuckets = new Map(); // gstPercent -> taxable total

  for (const bill of bills) {
    const itemsTotal = bill.items.reduce((sum, i) => sum + (i.itemTotal || 0), 0);
    // Prefer the totals captured off the printed bill; fall back to the line items
    const taxable = bill.subtotal != null ? bill.subtotal : round2(itemsTotal);
    const cgst = bill.cgst;
    const sgst = bill.sgst;
    const totalGst = bill.totalGst != null
      ? bill.totalGst
      : (cgst != null || sgst != null ? round2((cgst || 0) + (sgst || 0)) : null);

    rows.push({
      invoiceNo: bill.invoiceNumber,
      date: bill.invoiceDate,
      distributor: bill.distributor?.name || bill.pharmacyName || null,
      gstin: bill.distributor?.gstin,
      taxable,
      cgst,
      sgst,
      totalGst,
      grandTotal: bill.grandTotal,
    });

    for (const item of bill.items) {
      if (item.gstPercent == null) continue;
      const key = item.gstPercent;
      rateBuckets.set(key, round2((rateBuckets.get(key) || 0) + (item.itemTotal || 0)));
    }
  }

  // Rate-wise subtotals at the bottom — what the accountant reconciles ITC against
  const footers = [];
  const sortedRates = [...rateBuckets.keys()].sort((a, b) => a - b);
  for (const rate of sortedRates) {
    const taxable = rateBuckets.get(rate);
    const half = round2((taxable * rate) / 200); // CGST and SGST each take half
    footers.push({
      invoiceNo: `GST ${rate}%`,
      distributor: 'Rate-wise subtotal',
      taxable,
      cgst: half,
      sgst: half,
      totalGst: round2(half * 2),
      grandTotal: round2(taxable + half * 2),
    });
  }

  const grandTaxable = round2(rows.reduce((s, r) => s + (r.taxable || 0), 0));
  const grandCgst = round2(rows.reduce((s, r) => s + (r.cgst || 0), 0));
  const grandSgst = round2(rows.reduce((s, r) => s + (r.sgst || 0), 0));
  footers.push({
    invoiceNo: 'TOTAL',
    distributor: `${rows.length} bill${rows.length === 1 ? '' : 's'}`,
    taxable: grandTaxable,
    cgst: grandCgst,
    sgst: grandSgst,
    totalGst: round2(grandCgst + grandSgst),
    grandTotal: round2(rows.reduce((s, r) => s + (r.grandTotal || 0), 0)),
  });

  return { rows, footers };
}

// ============================================================
// B. EXPIRY REPORT
// ============================================================

const EXPIRY_COLUMNS = [
  { header: 'Product', key: 'product', type: 'text', width: 34 },
  { header: 'Batch No', key: 'batchNo', type: 'text', width: 16 },
  { header: 'Expiry', key: 'expiryDate', type: 'date', width: 14 },
  { header: 'Days Left', key: 'daysLeft', type: 'number', width: 11 },
  { header: 'Quantity', key: 'quantity', type: 'number', width: 11 },
  { header: 'Unit', key: 'unit', type: 'text', width: 10 },
  { header: 'Distributor', key: 'distributor', type: 'text', width: 28 },
  { header: 'Invoice No', key: 'invoiceNo', type: 'text', width: 16 },
  { header: 'MRP', key: 'mrp', type: 'currency', width: 10 },
];

/**
 * Expiry rows come from ProductBatch — live batch-level stock, which is what a
 * returns list needs. The source distributor is resolved via the purchase line that
 * created the batch, falling back to any purchase line carrying the same batch number
 * (batches backfilled from legacy data have no source link).
 */
async function buildExpiryRows(userId, filters) {
  const batches = await prisma.productBatch.findMany({
    where: {
      product: { userId },
      ...(filters.includeArchived ? {} : { isArchived: false }),
    },
    include: {
      product: { select: { id: true, name: true, baseUnit: true } },
      sourceBillItem: {
        include: { bill: { include: { distributor: { select: { name: true } } } } },
      },
    },
  });

  // Fallback distributor lookup for batches with no source link
  const unlinked = batches.filter((b) => !b.sourceBillItem && b.batchNumber);
  const fallback = new Map(); // `${productId}::${batchNumber}` -> { distributor, invoiceNo }
  if (unlinked.length > 0) {
    const matches = await prisma.billItem.findMany({
      where: {
        productId: { in: [...new Set(unlinked.map((b) => b.productId))] },
        batchNumber: { in: [...new Set(unlinked.map((b) => b.batchNumber))] },
        bill: { userId, billType: 'purchase' },
      },
      include: { bill: { include: { distributor: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    for (const match of matches) {
      const key = `${match.productId}::${match.batchNumber}`;
      if (!fallback.has(key)) {
        fallback.set(key, {
          distributor: match.bill.distributor?.name || match.bill.pharmacyName || null,
          invoiceNo: match.bill.invoiceNumber || null,
        });
      }
    }
  }

  const withinDays = filters.withinDays ? Number(filters.withinDays) : null;
  const from = filters.from ? new Date(filters.from) : null;
  const to = filters.to ? new Date(filters.to) : null;

  const rows = [];
  for (const batch of batches) {
    // A batch with no expiry on record can't be ranked or returned — leave it out
    if (!batch.expiryDate) continue;

    const expiry = new Date(batch.expiryDate);
    const daysLeft = daysUntil(expiry);

    if (withinDays !== null && daysLeft > withinDays) continue;
    if (from && expiry < from) continue;
    if (to && expiry > to) continue;

    const sourceBill = batch.sourceBillItem?.bill;
    const fb = fallback.get(`${batch.productId}::${batch.batchNumber}`);

    rows.push({
      product: batch.product.name,
      batchNo: batch.batchNumber, // verbatim
      expiryDate: expiry,
      daysLeft,
      quantity: batch.quantityBase,
      unit: batch.product.baseUnit,
      distributor:
        sourceBill?.distributor?.name || sourceBill?.pharmacyName || fb?.distributor || null,
      invoiceNo: sourceBill?.invoiceNumber || fb?.invoiceNo || null,
      mrp: batch.mrp,
    });
  }

  // Soonest-expiring first — the ones that actually need returning
  rows.sort((a, b) => a.daysLeft - b.daysLeft);
  return rows;
}

// ============================================================
// C. DAILY SALE REGISTER
// ============================================================

const SALES_COLUMNS = [
  { header: 'Date', key: 'date', type: 'date', width: 14 },
  { header: 'Time', key: 'time', type: 'text', width: 10 },
  { header: 'Product', key: 'product', type: 'text', width: 34 },
  { header: 'Batch No', key: 'batchNo', type: 'text', width: 16 },
  { header: 'Qty', key: 'qty', type: 'number', width: 10 },
  { header: 'Unit', key: 'unit', type: 'text', width: 10 },
  { header: 'Price', key: 'price', type: 'currency', width: 10 },
  { header: 'Amount', key: 'amount', type: 'currency', width: 12 },
  { header: 'Status', key: 'status', type: 'text', width: 10 },
  { header: 'Schedule', key: 'schedule', type: 'text', width: 10 },
  { header: 'Customer', key: 'customer', type: 'text', width: 24 },
  { header: 'Doctor', key: 'doctor', type: 'text', width: 24 },
];

async function buildSalesRows(userId, filters) {
  const saleItems = await prisma.saleItem.findMany({
    where: {
      sale: {
        userId,
        ...(filters.includeArchived ? {} : { isArchived: false }),
        ...(dateRangeFilter(filters.from, filters.to)
          ? { saleDate: dateRangeFilter(filters.from, filters.to) }
          : {}),
      },
      // Drug-inspector view: Schedule H1/NRX lines only
      ...(filters.scheduleOnly ? { product: { scheduleFlag: { in: ['h1', 'nrx'] } } } : {}),
    },
    include: {
      product: { select: { name: true, baseUnit: true, scheduleFlag: true } },
      productBatch: { select: { batchNumber: true } },
      sale: {
        select: {
          saleDate: true, status: true, customerName: true,
          doctorName: true, customerPhone: true,
        },
      },
    },
    orderBy: { sale: { saleDate: 'asc' } },
  });

  return saleItems.map((item) => {
    const scheduled = item.product.scheduleFlag === 'h1' || item.product.scheduleFlag === 'nrx';
    return {
      date: item.sale.saleDate,
      time: new Date(item.sale.saleDate).toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: false,
      }),
      product: item.product.name,
      batchNo: item.productBatch?.batchNumber, // verbatim
      qty: item.quantityBase,
      unit: item.product.baseUnit,
      price: item.pricePerBase,
      amount: item.pricePerBase != null ? round2(item.quantityBase * item.pricePerBase) : null,
      status: item.sale.status,
      schedule: scheduled ? item.product.scheduleFlag.toUpperCase() : null,
      // Patient and doctor are the point of the H1 register; on ordinary lines they
      // stay blank unless the pharmacist happened to record them
      customer: item.sale.customerName,
      doctor: item.sale.doctorName,
    };
  });
}

// ============================================================
// D. DISTRIBUTOR LEDGER
// ============================================================

const LEDGER_COLUMNS = [
  { header: 'Date', key: 'date', type: 'date', width: 14 },
  { header: 'Particulars', key: 'particulars', type: 'text', width: 40 },
  { header: 'Debit', key: 'debit', type: 'currency', width: 14 },
  { header: 'Credit', key: 'credit', type: 'currency', width: 14 },
  { header: 'Balance', key: 'balance', type: 'currency', width: 14 },
];

const LEDGER_PAYMENT_COLUMNS = [
  { header: 'Date', key: 'date', type: 'date', width: 14 },
  { header: 'Amount', key: 'amount', type: 'currency', width: 14 },
  { header: 'Mode', key: 'mode', type: 'text', width: 14 },
  { header: 'Reference No', key: 'reference', type: 'text', width: 24 },
  { header: 'Notes', key: 'notes', type: 'text', width: 30 },
];

async function buildLedgerData(distributorId) {
  const ledger = await ledgerService.getDistributorLedger(distributorId);

  // Same columns as the in-app Ledger tab. Unused debit/credit cells are left blank
  // rather than zero-filled, which is how a statement is normally read.
  const statementRows = (ledger.ledgerRows || []).map((row) => ({
    date: row.date,
    particulars: row.particulars,
    debit: row.debit || null,
    credit: row.credit || null,
    balance: row.runningBalance,
  }));

  const paymentRows = (ledger.payments || []).map((payment) => ({
    date: payment.paymentDate || payment.createdAt,
    amount: payment.amount,
    mode: payment.paymentMethod,
    reference: payment.referenceNumber,
    notes: payment.notes,
  }));

  return { ledger, statementRows, paymentRows };
}

// ============================================================
// PREVIEW + GENERATE
// ============================================================

/**
 * Row/context counts shown before generating ("142 items from 9 bills").
 * Never mutates anything.
 */
async function previewExport(userId, type, filters = {}) {
  if (!EXPORT_TYPES.includes(type)) throw new Error(`Invalid export type: ${type}`);

  switch (type) {
    case 'purchases': {
      const bills = await fetchPurchaseBills(userId, filters);
      const rowCount = bills.reduce((sum, b) => sum + b.items.length, 0);
      return {
        rowCount,
        summary: rowCount === 0
          ? 'No data in this range'
          : `${rowCount} item${rowCount === 1 ? '' : 's'} from ${bills.length} bill${bills.length === 1 ? '' : 's'}`,
        contextCount: bills.length,
      };
    }
    case 'expiry': {
      const rows = await buildExpiryRows(userId, filters);
      const distributors = new Set(rows.map((r) => r.distributor || 'Unknown'));
      return {
        rowCount: rows.length,
        summary: rows.length === 0
          ? 'No data in this range'
          : `${rows.length} batch${rows.length === 1 ? '' : 'es'} across ${distributors.size} distributor${distributors.size === 1 ? '' : 's'}`,
        contextCount: distributors.size,
      };
    }
    case 'sales': {
      const rows = await buildSalesRows(userId, filters);
      return {
        rowCount: rows.length,
        summary: rows.length === 0
          ? 'No data in this range'
          : `${rows.length} sale line${rows.length === 1 ? '' : 's'}`,
        contextCount: rows.length,
      };
    }
    case 'ledger': {
      if (!filters.distributorId) throw new Error('A distributor is required for a ledger export');
      const { statementRows, paymentRows } = await buildLedgerData(filters.distributorId);
      const rowCount = statementRows.length;
      return {
        rowCount,
        summary: rowCount === 0
          ? 'No data in this range'
          : `${rowCount} ledger entr${rowCount === 1 ? 'y' : 'ies'} and ${paymentRows.length} payment${paymentRows.length === 1 ? '' : 's'}`,
        contextCount: paymentRows.length,
      };
    }
    default:
      throw new Error(`Invalid export type: ${type}`);
  }
}

/**
 * Generate the export file.
 * @returns {{ buffer: Buffer, fileName: string, mimeType: string, rowCount: number }}
 */
async function generateExport(userId, type, filters = {}, format = 'xlsx') {
  if (!EXPORT_TYPES.includes(type)) throw new Error(`Invalid export type: ${type}`);
  if (!['xlsx', 'csv'].includes(format)) throw new Error(`Invalid format: ${format}`);

  const workbook = wb.createWorkbook();
  let primaryColumns;
  let primaryRows;
  let primaryFooters = [];
  let rowCount = 0;

  switch (type) {
    case 'purchases': {
      const bills = await fetchPurchaseBills(userId, filters);
      primaryRows = buildPurchaseRows(bills);
      primaryColumns = PURCHASE_COLUMNS;
      rowCount = primaryRows.length;
      if (rowCount === 0) throw new NoDataError();
      if (rowCount > MAX_ROWS) throw new RowLimitError(rowCount);

      wb.addSheet(workbook, 'Purchase Items', PURCHASE_COLUMNS, primaryRows);

      // Second sheet: what the accountant needs for ITC matching
      const gst = buildGstSummary(bills);
      wb.addSheet(workbook, 'GST Summary', GST_COLUMNS, gst.rows, gst.footers);
      break;
    }

    case 'expiry': {
      primaryRows = await buildExpiryRows(userId, filters);
      primaryColumns = EXPIRY_COLUMNS;
      rowCount = primaryRows.length;
      if (rowCount === 0) throw new NoDataError();
      if (rowCount > MAX_ROWS) throw new RowLimitError(rowCount);

      if (filters.groupByDistributor && format === 'xlsx') {
        // One sheet per distributor — each is the return list for that supplier
        const groups = new Map();
        for (const row of primaryRows) {
          const key = row.distributor || 'Unknown Distributor';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(row);
        }
        // Excel sheet names must be unique after sanitising/truncation
        const used = new Set();
        for (const [distributor, rows] of groups) {
          let name = wb.sanitizeSheetName(distributor);
          let suffix = 2;
          while (used.has(name)) {
            name = wb.sanitizeSheetName(`${distributor.slice(0, 27)} ${suffix++}`);
          }
          used.add(name);
          wb.addSheet(workbook, name, EXPIRY_COLUMNS, rows);
        }
      } else {
        wb.addSheet(workbook, 'Expiry Report', EXPIRY_COLUMNS, primaryRows);
      }
      break;
    }

    case 'sales': {
      primaryRows = await buildSalesRows(userId, filters);
      primaryColumns = SALES_COLUMNS;
      rowCount = primaryRows.length;
      if (rowCount === 0) throw new NoDataError();
      if (rowCount > MAX_ROWS) throw new RowLimitError(rowCount);

      wb.addSheet(
        workbook,
        filters.scheduleOnly ? 'Schedule H1 Register' : 'Sale Register',
        SALES_COLUMNS,
        primaryRows
      );
      break;
    }

    case 'ledger': {
      if (!filters.distributorId) throw new Error('A distributor is required for a ledger export');
      const { ledger, statementRows, paymentRows } = await buildLedgerData(filters.distributorId);
      primaryRows = statementRows;
      primaryColumns = LEDGER_COLUMNS;
      rowCount = statementRows.length;
      if (rowCount === 0) throw new NoDataError();
      if (rowCount > MAX_ROWS) throw new RowLimitError(rowCount);

      wb.addSheet(workbook, 'Ledger Statement', LEDGER_COLUMNS, statementRows);
      wb.addSheet(workbook, 'Payments', LEDGER_PAYMENT_COLUMNS, paymentRows);
      filters = { ...filters, distributorName: ledger.distributor?.name };
      break;
    }
    default:
      throw new Error(`Invalid export type: ${type}`);
  }

  const fileName = buildFileName(type, filters, format);

  const buffer =
    format === 'csv'
      ? wb.toCsvBuffer(primaryColumns, primaryRows, primaryFooters)
      : await wb.toXlsxBuffer(workbook);

  const mimeType =
    format === 'csv'
      ? 'text/csv; charset=utf-8'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  // Audit only — no file is stored, so this is the only trace the export happened.
  // A logging failure must never cost the user their export.
  try {
    await prisma.exportLog.create({
      data: {
        userId,
        exportType: type,
        format,
        filters: filters ? JSON.parse(JSON.stringify(filters)) : undefined,
        rowCount,
        fileName,
      },
    });
  } catch (error) {
    console.error('[EXPORT] Failed to write ExportLog (non-fatal):', error.message);
  }

  return { buffer, fileName, mimeType, rowCount };
}

module.exports = {
  MAX_ROWS,
  EXPORT_TYPES,
  NoDataError,
  RowLimitError,
  previewExport,
  generateExport,
  buildFileName,
  // exported for tests
  buildPurchaseRows,
  buildGstSummary,
  buildExpiryRows,
  buildSalesRows,
  fetchPurchaseBills,
  PURCHASE_COLUMNS,
  GST_COLUMNS,
  EXPIRY_COLUMNS,
  SALES_COLUMNS,
};
