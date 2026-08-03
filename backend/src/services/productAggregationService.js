/**
 * Product List (Enriched) — aggregates batch/expiry/distributor/invoice info
 * from BillItem (joined through Bill → Distributor), NOT from the stale
 * Product.batchNumber/Product.expiryDate fields (those are overwritten on
 * every bill sync and only ever reflect the last-synced batch).
 *
 * Only BillItem rows from purchase-type bills (Bill.billType === 'purchase')
 * count. Archived batches (BillItem.expiryStatus === 'archived') are included,
 * never excluded — just flagged.
 */

const prisma = require('../models/prisma');
const { parseExpiryDate, daysUntil, formatDDMMYYYY } = require('../utils/dateUtils');
const { normalizeProductName } = require('./productService');

function parseMonthYear(value) {
  // "MM-YYYY"
  const m = String(value || '').trim().match(/^(\d{1,2})-(\d{4})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const year = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { month, year };
}

function parseDistributorIds(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

async function getEnrichedProducts(userId, options = {}) {
  const {
    search = '',
    distributorIds = null,
    expiryMonth = null,
    receivedFrom = null,
    receivedTo = null,
    sort = 'fefo',
    page = 1,
    limit = 20,
  } = options;

  const distributorIdList = parseDistributorIds(distributorIds);
  const monthYear = expiryMonth ? parseMonthYear(expiryMonth) : null;
  const fromDate = receivedFrom ? new Date(receivedFrom) : null;
  const toDate = receivedTo ? new Date(receivedTo) : null;
  const searchTerm = String(search || '').trim();
  const searchNormalized = searchTerm ? normalizeProductName(searchTerm) : '';
  const searchLower = searchTerm.toLowerCase();

  const hasBatchFilters = !!(distributorIdList?.length || monthYear || fromDate || toDate);

  // Fetch every purchase-bill line item that's linked to a product, for this user.
  // Dataset size for a single pharmacy's catalog easily fits in memory — doing the
  // defensive date parsing / grouping in JS is far more robust than fragile SQL
  // against free-text expiry strings in varying formats.
  const billItems = await prisma.billItem.findMany({
    where: {
      productId: { not: null },
      bill: { userId, billType: 'purchase' },
    },
    include: {
      bill: { include: { distributor: true } },
      product: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const productGroups = new Map(); // productId -> { product, allBatches: [] }

  for (const item of billItems) {
    if (!item.product) continue;
    const bill = item.bill;
    const distributorName = bill.distributor?.name || bill.pharmacyName || null;
    const parsedExpiry = parseExpiryDate(item.expiryDate);

    const batch = {
      batchNumber: item.batchNumber || null,
      expiryDate: parsedExpiry ? formatDDMMYYYY(parsedExpiry) : (item.expiryDate || null),
      daysLeft: parsedExpiry ? daysUntil(parsedExpiry) : null,
      quantity: item.quantity ?? null,
      distributorId: bill.distributorId || null,
      distributorName,
      invoiceNumber: bill.invoiceNumber || null,
      invoiceDate: bill.invoiceDate ? formatDDMMYYYY(new Date(bill.invoiceDate)) : null,
      billId: bill.id,
      isArchived: item.expiryStatus === 'archived',
      _sortDate: parsedExpiry,
      _rawInvoiceDate: bill.invoiceDate,
      _matchesSearch:
        !!searchTerm &&
        ((item.batchNumber || '').toLowerCase().includes(searchLower) ||
          (bill.invoiceNumber || '').toLowerCase().includes(searchLower)),
    };

    if (!productGroups.has(item.productId)) {
      productGroups.set(item.productId, { product: item.product, allBatches: [], fallbackManufacturer: null });
    }
    const group = productGroups.get(item.productId);
    group.allBatches.push(batch);
    if (!group.fallbackManufacturer && item.manufacturer) {
      group.fallbackManufacturer = item.manufacturer;
    }
  }

  const results = [];

  for (const [productId, { product, allBatches, fallbackManufacturer }] of productGroups) {
    const nameMatches = !!searchTerm && normalizeProductName(product.name).includes(searchNormalized);
    const anyBatchMatchesSearch = allBatches.some((b) => b._matchesSearch);

    // Search is an inclusion filter only — it never removes batches, just flags them.
    if (searchTerm && !nameMatches && !anyBatchMatchesSearch) continue;

    // Distributor / expiry-month / received-date filters narrow which batches
    // qualify (AND logic); a product is only included if >=1 batch qualifies,
    // and the returned `batches` array is restricted to the qualifying ones.
    const qualifyingBatches = hasBatchFilters
      ? allBatches.filter((b) => {
          if (distributorIdList?.length && !distributorIdList.includes(b.distributorId)) return false;
          if (monthYear) {
            if (!b._sortDate) return false;
            if (b._sortDate.getMonth() + 1 !== monthYear.month || b._sortDate.getFullYear() !== monthYear.year) {
              return false;
            }
          }
          if (fromDate && (!b._rawInvoiceDate || new Date(b._rawInvoiceDate) < fromDate)) return false;
          if (toDate && (!b._rawInvoiceDate || new Date(b._rawInvoiceDate) > toDate)) return false;
          return true;
        })
      : allBatches;

    if (hasBatchFilters && qualifyingBatches.length === 0) continue;

    // Earliest expiry among parseable dates; fall back to the first batch's raw
    // string if none of this product's batches have a parseable date at all.
    const withParsedDate = qualifyingBatches.filter((b) => b._sortDate);
    let earliestExpiry = null;
    let daysToEarliestExpiry = null;
    if (withParsedDate.length > 0) {
      const earliest = withParsedDate.reduce((min, b) => (b._sortDate < min._sortDate ? b : min));
      earliestExpiry = earliest.expiryDate;
      daysToEarliestExpiry = earliest.daysLeft;
    } else if (qualifyingBatches.length > 0) {
      earliestExpiry = qualifyingBatches[0].expiryDate;
      daysToEarliestExpiry = null;
    }

    const distributorNames = [...new Set(qualifyingBatches.map((b) => b.distributorName).filter(Boolean))];

    results.push({
      id: productId,
      name: product.name,
      manufacturer: product.manufacturer || fallbackManufacturer,
      earliestExpiry,
      daysToEarliestExpiry,
      batchCount: qualifyingBatches.length,
      distributors: distributorNames,
      batches: qualifyingBatches.map((b) => ({
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        daysLeft: b.daysLeft,
        quantity: b.quantity,
        distributorName: b.distributorName,
        invoiceNumber: b.invoiceNumber,
        invoiceDate: b.invoiceDate,
        billId: b.billId,
        isArchived: b.isArchived,
        matchedSearch: b._matchesSearch,
      })),
    });
  }

  if (sort === 'name') {
    results.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    // FEFO default: earliest expiry first, nulls last
    results.sort((a, b) => {
      const aHas = a.daysToEarliestExpiry !== null;
      const bHas = b.daysToEarliestExpiry !== null;
      if (aHas && bHas) return a.daysToEarliestExpiry - b.daysToEarliestExpiry;
      if (aHas) return -1;
      if (bHas) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  const total = results.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const pageResults = results.slice(start, start + limit);

  return {
    products: pageResults,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  };
}

module.exports = { getEnrichedProducts };
