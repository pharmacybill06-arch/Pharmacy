const prisma = require('../models/prisma');
const batchService = require('./batchService');

/**
 * Sale Service
 * Quick Sell (2-second sale capture) + Daily Sale Register.
 *
 * Core rules (project-wide, do not violate):
 *   - Stock deduction and sale creation happen in ONE transaction.
 *   - All stock math is in base units; packs are a display conversion only.
 *   - Negative stock warns, it never blocks — a blocked sale means the pharmacist
 *     stops using the app at the counter.
 *   - Archive, never delete. Archiving a sale restores its stock.
 *   - Schedule H1/NRX sales cannot be quick-saved: they need customer + doctor and
 *     an immediate bill.
 */

const { round3, formatQuantity } = batchService;

const SCHEDULE_FLAGS = ['none', 'h1', 'nrx'];

function requiresPrescriptionFlow(scheduleFlag) {
  return scheduleFlag === 'h1' || scheduleFlag === 'nrx';
}

/**
 * Resolve a YYYY-MM-DD register day into an absolute instant range.
 *
 * saleDate is stored as a true instant, but "today's register" is a wall-clock day at
 * the counter. The client passes its own UTC offset so a 12:30am sale files under the
 * day the pharmacist actually made it, not the UTC day.
 */
function resolveDayRange(dateStr, tzOffsetMinutes = 0) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  if (!match) throw new Error('Invalid date — expected YYYY-MM-DD');

  const [, y, m, d] = match;
  const offset = Number(tzOffsetMinutes) || 0;
  // Local midnight expressed as an instant: UTC midnight minus the local offset
  const start = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)) - offset * 60_000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Expand the requested lines into concrete per-batch allocations.
 *
 * A line either names its batch explicitly (the pharmacist picked one, possibly
 * overriding the FEFO suggestion) or leaves it out, in which case we plan it FEFO and
 * auto-split across batches.
 */
async function resolveSaleLines(userId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('At least one item is required');
  }

  const lines = [];
  const warnings = [];
  const productsById = new Map();

  for (const item of items) {
    if (!item.productId) throw new Error('Each item requires a productId');

    const quantityBase = round3(Number(item.quantityBase));
    if (!(quantityBase > 0)) throw new Error('Each item requires a quantity greater than zero');

    const product = await prisma.product.findFirst({
      where: { id: item.productId, userId },
      select: {
        id: true, name: true, scheduleFlag: true,
        packSize: true, packLabel: true, baseUnit: true,
      },
    });
    if (!product) throw new Error('Product not found');
    productsById.set(product.id, product);

    const pricePerBase =
      item.pricePerBase === undefined || item.pricePerBase === null || item.pricePerBase === ''
        ? null
        : Number(item.pricePerBase);

    if (item.productBatchId) {
      // Explicit batch: honour it exactly, including deliberate overselling.
      const batch = await prisma.productBatch.findFirst({
        where: { id: item.productBatchId, productId: product.id },
      });
      if (!batch) throw new Error('Selected batch does not belong to this product');

      if (batch.quantityBase < quantityBase) {
        warnings.push(
          `Stock mismatch: ${product.name} batch ${batch.batchNumber} is short by ` +
            `${formatQuantity(round3(quantityBase - batch.quantityBase), product)} — update purchase bills.`
        );
      }

      lines.push({
        productId: product.id,
        productBatchId: batch.id,
        quantityBase,
        pricePerBase,
        _product: product,
        _batchNumber: batch.batchNumber,
      });
    } else {
      // FEFO plan, auto-splitting across batches when one cannot cover the quantity.
      const plan = await batchService.planAllocation(product.id, quantityBase);
      warnings.push(...plan.warnings);
      for (const allocation of plan.allocations) {
        lines.push({
          productId: product.id,
          productBatchId: allocation.productBatchId,
          quantityBase: allocation.quantityBase,
          pricePerBase,
          _product: product,
          _batchNumber: allocation.batchNumber,
        });
      }
    }
  }

  return { lines, warnings, products: [...productsById.values()] };
}

/**
 * Create a sale: validates the schedule flow, writes the sale and deducts every
 * batch inside a single transaction.
 */
async function createSale(userId, data) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const { lines, warnings, products } = await resolveSaleLines(userId, data.items);

  // ===== Schedule H1 / NRX gate =====
  const scheduledProducts = products.filter((p) => requiresPrescriptionFlow(p.scheduleFlag));
  const needsPrescriptionFlow = scheduledProducts.length > 0;

  const customerName = (data.customerName || '').trim() || null;
  const doctorName = (data.doctorName || '').trim() || null;

  if (needsPrescriptionFlow) {
    const names = scheduledProducts.map((p) => `${p.name} (${p.scheduleFlag.toUpperCase()})`).join(', ');
    if (!customerName || !doctorName) {
      throw new Error(
        `Customer name and doctor name are required for Schedule H1/NRX items: ${names}`
      );
    }
  }

  const saleDate = data.saleDate ? new Date(data.saleDate) : new Date();
  if (Number.isNaN(saleDate.getTime())) throw new Error('Invalid sale date');

  // Prefer an explicit total; otherwise derive it from whatever prices were entered.
  let totalAmount = null;
  if (data.totalAmount !== undefined && data.totalAmount !== null && data.totalAmount !== '') {
    totalAmount = Number(data.totalAmount);
  } else {
    const priced = lines.filter((l) => l.pricePerBase != null);
    if (priced.length > 0) {
      totalAmount = round3(priced.reduce((sum, l) => sum + l.quantityBase * l.pricePerBase, 0));
    }
  }

  const sale = await prisma.$transaction(async (tx) => {
    // H1/NRX must be billed immediately — never parked in the convert queue.
    let billId = null;
    if (needsPrescriptionFlow) {
      const bill = await tx.bill.create({
        data: {
          userId,
          billType: 'sale',
          fileName: `invoice_${Date.now()}`,
          filePath: '/invoices',
          fileSize: 0,
          mimeType: 'application/json',
          invoiceDate: saleDate,
          customerName,
          customerPhone: (data.customerPhone || '').trim() || null,
          doctorName,
          grandTotal: totalAmount,
          status: 'completed',
          remarks: `Schedule ${scheduledProducts.map((p) => p.scheduleFlag.toUpperCase()).join('/')} sale`,
          items: {
            create: lines.map((line, index) => ({
              productId: line.productId,
              serialNumber: index + 1,
              name: line._product.name,
              batchNumber: line._batchNumber,
              quantity: line.quantityBase,
              unit: line._product.baseUnit,
              rate: line.pricePerBase || 0,
              itemTotal: round3(line.quantityBase * (line.pricePerBase || 0)),
              isProductMatched: true,
            })),
          },
        },
      });
      billId = bill.id;
    }

    const created = await tx.sale.create({
      data: {
        userId,
        saleDate,
        status: billId ? 'billed' : 'quick',
        billId,
        customerName,
        doctorName,
        customerPhone: (data.customerPhone || '').trim() || null,
        totalAmount,
        notes: (data.notes || '').trim() || null,
        items: {
          create: lines.map((line) => ({
            productId: line.productId,
            productBatchId: line.productBatchId,
            quantityBase: line.quantityBase,
            pricePerBase: line.pricePerBase,
          })),
        },
      },
      include: { items: true },
    });

    // Stock moves in the same transaction as the sale it belongs to.
    await batchService.applyBatchDeltas(tx, lines, -1);
    await batchService.syncProductStock(tx, lines.map((l) => l.productId));

    return created;
  });

  return {
    sale: await getSaleById(sale.id),
    warnings,
    requiresPrescriptionFlow: needsPrescriptionFlow,
  };
}

/**
 * Shape a sale for the register/list UIs: adds batch numbers, readable quantities
 * and the H1/NRX badge flag.
 */
function decorateSale(sale) {
  const items = (sale.items || []).map((item) => ({
    id: item.id,
    productId: item.productId,
    productName: item.product?.name || 'Unknown product',
    batchNumber: item.productBatch?.batchNumber || null,
    expiryDate: item.productBatch?.expiryDate || null,
    productBatchId: item.productBatchId,
    quantityBase: item.quantityBase,
    quantityLabel: formatQuantity(item.quantityBase, item.product || {}),
    pricePerBase: item.pricePerBase,
    lineTotal: item.pricePerBase != null ? round3(item.quantityBase * item.pricePerBase) : null,
    scheduleFlag: item.product?.scheduleFlag || 'none',
  }));

  return {
    id: sale.id,
    saleDate: sale.saleDate,
    status: sale.status,
    billId: sale.billId,
    customerName: sale.customerName,
    doctorName: sale.doctorName,
    customerPhone: sale.customerPhone,
    totalAmount: sale.totalAmount,
    isArchived: sale.isArchived,
    archivedAt: sale.archivedAt,
    notes: sale.notes,
    createdAt: sale.createdAt,
    items,
    itemCount: items.length,
    totalUnits: round3(items.reduce((sum, i) => sum + i.quantityBase, 0)),
    // Drives the red H1 badge in the register
    hasScheduledItem: items.some((i) => requiresPrescriptionFlow(i.scheduleFlag)),
  };
}

const SALE_INCLUDE = {
  items: {
    include: {
      product: {
        select: {
          id: true, name: true, packSize: true, packLabel: true,
          baseUnit: true, scheduleFlag: true,
        },
      },
      productBatch: { select: { id: true, batchNumber: true, expiryDate: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
};

async function getSaleById(saleId) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: SALE_INCLUDE });
  if (!sale) throw new Error('Sale not found');
  return decorateSale(sale);
}

/**
 * Daily Sale Register for one day, newest sale first.
 */
async function getDailyRegister(userId, dateStr, tzOffsetMinutes = 0, { includeArchived = false } = {}) {
  const { start, end } = resolveDayRange(dateStr, tzOffsetMinutes);

  const sales = await prisma.sale.findMany({
    where: {
      userId,
      saleDate: { gte: start, lt: end },
      ...(includeArchived ? {} : { isArchived: false }),
    },
    include: SALE_INCLUDE,
    orderBy: { saleDate: 'desc' },
  });

  const decorated = sales.map(decorateSale);

  return {
    date: dateStr,
    sales: decorated,
    summary: {
      saleCount: decorated.length,
      totalItems: decorated.reduce((sum, s) => sum + s.itemCount, 0),
      totalUnits: round3(decorated.reduce((sum, s) => sum + s.totalUnits, 0)),
      // Only sales that actually carry a price contribute to the ₹ total
      totalAmount: round3(decorated.reduce((sum, s) => sum + (s.totalAmount || 0), 0)),
      unbilledCount: decorated.filter((s) => s.status === 'quick').length,
      scheduledCount: decorated.filter((s) => s.hasScheduledItem).length,
    },
  };
}

/**
 * Cross-date product sale history — "koi bhi day ki medicine dekh sakein".
 * Answers "Nichophylline — 12 sales since 1 July" with every date, qty and batch.
 */
async function searchSalesByProduct(userId, query, { limit = 200 } = {}) {
  const searchTerm = String(query || '').trim();
  if (searchTerm.length < 2) {
    return { query: searchTerm, products: [], totalSales: 0 };
  }

  const saleItems = await prisma.saleItem.findMany({
    where: {
      sale: { userId, isArchived: false },
      product: { name: { contains: searchTerm, mode: 'insensitive' } },
    },
    include: {
      product: {
        select: {
          id: true, name: true, packSize: true, packLabel: true,
          baseUnit: true, scheduleFlag: true,
        },
      },
      productBatch: { select: { batchNumber: true, expiryDate: true } },
      sale: { select: { id: true, saleDate: true, status: true, customerName: true } },
    },
    orderBy: { sale: { saleDate: 'desc' } },
    take: limit,
  });

  // Group by product so the UI can headline "<name> — N sales since <date>"
  const groups = new Map();
  for (const item of saleItems) {
    if (!groups.has(item.productId)) {
      groups.set(item.productId, {
        productId: item.productId,
        productName: item.product.name,
        scheduleFlag: item.product.scheduleFlag,
        sales: [],
        totalUnits: 0,
      });
    }
    const group = groups.get(item.productId);
    group.sales.push({
      saleId: item.sale.id,
      saleDate: item.sale.saleDate,
      status: item.sale.status,
      customerName: item.sale.customerName,
      batchNumber: item.productBatch?.batchNumber || null,
      expiryDate: item.productBatch?.expiryDate || null,
      quantityBase: item.quantityBase,
      quantityLabel: formatQuantity(item.quantityBase, item.product),
      pricePerBase: item.pricePerBase,
    });
    group.totalUnits = round3(group.totalUnits + item.quantityBase);
  }

  const products = [...groups.values()].map((group) => ({
    ...group,
    saleCount: group.sales.length,
    // sales are already newest-first, so the last entry is the earliest sale
    firstSoldAt: group.sales[group.sales.length - 1]?.saleDate || null,
    lastSoldAt: group.sales[0]?.saleDate || null,
    totalUnitsLabel: formatQuantity(group.totalUnits, {
      packSize: 1,
      baseUnit: 'unit',
    }),
  }));

  return {
    query: searchTerm,
    products,
    totalSales: saleItems.length,
  };
}

/**
 * Convert-to-Bill queue: quick (unbilled) sales, oldest first.
 */
async function getPendingSales(userId) {
  const sales = await prisma.sale.findMany({
    where: { userId, status: 'quick', isArchived: false },
    include: SALE_INCLUDE,
    orderBy: { saleDate: 'asc' },
  });

  const decorated = sales.map(decorateSale);
  return {
    sales: decorated,
    summary: {
      pendingCount: decorated.length,
      oldestSaleDate: decorated[0]?.saleDate || null,
      totalAmount: round3(decorated.reduce((sum, s) => sum + (s.totalAmount || 0), 0)),
    },
  };
}

/**
 * Convert a quick sale into a Bill (billType = "sale").
 *
 * Batch and quantity are LOCKED — the stock was already deducted when the sale was
 * recorded, so re-touching it here would double-count. Only prices and customer
 * fields are editable.
 */
async function convertToBill(saleId, data = {}) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: SALE_INCLUDE });
  if (!sale) throw new Error('Sale not found');
  if (sale.isArchived) throw new Error('Cannot bill an archived sale');
  if (sale.status === 'billed' || sale.billId) throw new Error('Sale has already been billed');

  // Price overrides arrive keyed by sale item id; batch/quantity are ignored by design.
  const priceById = new Map();
  for (const override of data.items || []) {
    if (override?.saleItemId) priceById.set(override.saleItemId, override.pricePerBase);
  }

  const linePrices = sale.items.map((item) => {
    const raw = priceById.has(item.id) ? priceById.get(item.id) : item.pricePerBase;
    return raw === undefined || raw === null || raw === '' ? null : Number(raw);
  });

  const grandTotal =
    data.totalAmount !== undefined && data.totalAmount !== null && data.totalAmount !== ''
      ? Number(data.totalAmount)
      : round3(
          sale.items.reduce(
            (sum, item, index) => sum + item.quantityBase * (linePrices[index] || 0),
            0
          )
        );

  const customerName = data.customerName !== undefined
    ? (data.customerName || '').trim() || null
    : sale.customerName;
  const doctorName = data.doctorName !== undefined
    ? (data.doctorName || '').trim() || null
    : sale.doctorName;
  const customerPhone = data.customerPhone !== undefined
    ? (data.customerPhone || '').trim() || null
    : sale.customerPhone;

  const updated = await prisma.$transaction(async (tx) => {
    const bill = await tx.bill.create({
      data: {
        userId: sale.userId,
        billType: 'sale',
        fileName: `invoice_${Date.now()}`,
        filePath: '/invoices',
        fileSize: 0,
        mimeType: 'application/json',
        invoiceNumber: (data.invoiceNumber || '').trim() || null,
        invoiceDate: sale.saleDate,
        customerName,
        customerPhone,
        doctorName,
        grandTotal,
        status: 'completed',
        items: {
          create: sale.items.map((item, index) => ({
            productId: item.productId,
            serialNumber: index + 1,
            name: item.product?.name || 'Unknown product',
            // Locked: copied straight off the sale line
            batchNumber: item.productBatch?.batchNumber || null,
            quantity: item.quantityBase,
            unit: item.product?.baseUnit || 'unit',
            rate: linePrices[index] || 0,
            itemTotal: round3(item.quantityBase * (linePrices[index] || 0)),
            isProductMatched: true,
          })),
        },
      },
    });

    // Persist any price edits back onto the sale lines so both views agree
    for (let i = 0; i < sale.items.length; i++) {
      if (linePrices[i] !== sale.items[i].pricePerBase) {
        await tx.saleItem.update({
          where: { id: sale.items[i].id },
          data: { pricePerBase: linePrices[i] },
        });
      }
    }

    return tx.sale.update({
      where: { id: saleId },
      data: {
        status: 'billed',
        billId: bill.id,
        customerName,
        doctorName,
        customerPhone,
        totalAmount: grandTotal,
      },
    });
    // NOTE: no stock movement here — it was deducted when the sale was recorded.
  });

  return { sale: await getSaleById(updated.id), billId: updated.billId };
}

/**
 * Archive a sale and restore its stock. Never a hard delete.
 */
async function archiveSale(saleId) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: { items: true } });
  if (!sale) throw new Error('Sale not found');
  if (sale.isArchived) throw new Error('Sale is already archived');

  await prisma.$transaction(async (tx) => {
    // Put the units back on the exact batches they came off
    await batchService.applyBatchDeltas(tx, sale.items, +1);
    await batchService.syncProductStock(tx, sale.items.map((i) => i.productId));

    await tx.sale.update({
      where: { id: saleId },
      data: { isArchived: true, archivedAt: new Date() },
    });
  });

  return getSaleById(saleId);
}

/**
 * Restore an archived sale, deducting its stock again.
 */
async function unarchiveSale(saleId) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: { items: true } });
  if (!sale) throw new Error('Sale not found');
  if (!sale.isArchived) throw new Error('Sale is not archived');

  await prisma.$transaction(async (tx) => {
    await batchService.applyBatchDeltas(tx, sale.items, -1);
    await batchService.syncProductStock(tx, sale.items.map((i) => i.productId));

    await tx.sale.update({
      where: { id: saleId },
      data: { isArchived: false, archivedAt: null },
    });
  });

  return getSaleById(saleId);
}

/**
 * Schedule H1/NRX register — mirrors the physical register a drug inspector asks for.
 */
async function getScheduledSalesRegister(userId, { from = null, to = null } = {}) {
  const saleItems = await prisma.saleItem.findMany({
    where: {
      sale: {
        userId,
        isArchived: false,
        ...(from || to
          ? { saleDate: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } }
          : {}),
      },
      product: { scheduleFlag: { in: ['h1', 'nrx'] } },
    },
    include: {
      product: {
        select: { id: true, name: true, scheduleFlag: true, packSize: true, packLabel: true, baseUnit: true },
      },
      productBatch: { select: { batchNumber: true, expiryDate: true } },
      sale: {
        select: { id: true, saleDate: true, customerName: true, doctorName: true, customerPhone: true, billId: true },
      },
    },
    orderBy: { sale: { saleDate: 'desc' } },
  });

  return {
    entries: saleItems.map((item) => ({
      saleId: item.sale.id,
      saleDate: item.sale.saleDate,
      patientName: item.sale.customerName,
      patientPhone: item.sale.customerPhone,
      doctorName: item.sale.doctorName,
      drugName: item.product.name,
      scheduleFlag: item.product.scheduleFlag,
      batchNumber: item.productBatch?.batchNumber || null,
      expiryDate: item.productBatch?.expiryDate || null,
      quantityBase: item.quantityBase,
      quantityLabel: formatQuantity(item.quantityBase, item.product),
      billId: item.sale.billId,
    })),
    total: saleItems.length,
  };
}

module.exports = {
  resolveDayRange,
  requiresPrescriptionFlow,
  SCHEDULE_FLAGS,

  createSale,
  getSaleById,
  getDailyRegister,
  searchSalesByProduct,
  getPendingSales,
  convertToBill,
  archiveSale,
  unarchiveSale,
  getScheduledSalesRegister,
};
