const saleService = require('../services/saleService');
const batchService = require('../services/batchService');

/**
 * Sale Controller
 * HTTP handlers for Quick Sell + the Daily Sale Register.
 */

function handleServiceError(res, error, fallback) {
  console.error(fallback, error.message);
  if (error.message.includes('not found')) {
    return res.status(404).json({ error: error.message });
  }
  if (
    error.message.includes('required') ||
    error.message.includes('must be') ||
    error.message.includes('Invalid') ||
    error.message.includes('already') ||
    error.message.includes('Cannot') ||
    error.message.includes('does not belong') ||
    error.message.includes('no batches')
  ) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(500).json({ error: fallback });
}

// POST /api/sales/user/:userId — record a sale (transactional stock deduction)
exports.createSale = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await saleService.createSale(userId, req.body);
    res.status(201).json({
      message: 'Sale recorded successfully',
      sale: result.sale,
      // Negative-stock notices: surfaced, never blocking
      warnings: result.warnings,
      requiresPrescriptionFlow: result.requiresPrescriptionFlow,
    });
  } catch (error) {
    handleServiceError(res, error, 'Failed to record sale');
  }
};

// GET /api/sales/user/:userId?date=YYYY-MM-DD — daily register
exports.getDailyRegister = async (req, res) => {
  try {
    const { userId } = req.params;
    const { date, tzOffsetMinutes, includeArchived } = req.query;

    // Default to "today" in the caller's timezone, not the server's
    const offset = Number(tzOffsetMinutes) || 0;
    const day = date || new Date(Date.now() + offset * 60_000).toISOString().slice(0, 10);

    const result = await saleService.getDailyRegister(userId, day, offset, {
      includeArchived: includeArchived === 'true',
    });
    res.json({ message: 'Daily register fetched successfully', ...result });
  } catch (error) {
    handleServiceError(res, error, 'Failed to fetch daily register');
  }
};

// GET /api/sales/user/:userId/search?product=... — cross-date product sale history
exports.searchSales = async (req, res) => {
  try {
    const { userId } = req.params;
    const { product, limit } = req.query;
    const result = await saleService.searchSalesByProduct(userId, product, {
      limit: limit ? parseInt(limit, 10) : 200,
    });
    res.json({ message: 'Sale search completed successfully', ...result });
  } catch (error) {
    handleServiceError(res, error, 'Failed to search sales');
  }
};

// GET /api/sales/user/:userId/pending — convert-to-bill queue (oldest first)
exports.getPendingSales = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await saleService.getPendingSales(userId);
    res.json({ message: 'Pending sales fetched successfully', ...result });
  } catch (error) {
    handleServiceError(res, error, 'Failed to fetch pending sales');
  }
};

// GET /api/sales/user/:userId/schedule-register — H1/NRX register (drug inspector view)
exports.getScheduledRegister = async (req, res) => {
  try {
    const { userId } = req.params;
    const { from, to } = req.query;
    const result = await saleService.getScheduledSalesRegister(userId, { from, to });
    res.json({ message: 'Schedule H1/NRX register fetched successfully', ...result });
  } catch (error) {
    handleServiceError(res, error, 'Failed to fetch schedule register');
  }
};

// GET /api/sales/:saleId — single sale
exports.getSaleById = async (req, res) => {
  try {
    const { saleId } = req.params;
    const sale = await saleService.getSaleById(saleId);
    res.json({ message: 'Sale fetched successfully', sale });
  } catch (error) {
    handleServiceError(res, error, 'Failed to fetch sale');
  }
};

// POST /api/sales/:saleId/convert-to-bill — batch/qty locked, prices/customer editable
exports.convertToBill = async (req, res) => {
  try {
    const { saleId } = req.params;
    const result = await saleService.convertToBill(saleId, req.body);
    res.json({ message: 'Sale converted to bill successfully', ...result });
  } catch (error) {
    handleServiceError(res, error, 'Failed to convert sale to bill');
  }
};

// POST /api/sales/:saleId/archive — restores stock. There is no DELETE route by design.
exports.archiveSale = async (req, res) => {
  try {
    const { saleId } = req.params;
    const sale = await saleService.archiveSale(saleId);
    res.json({ message: 'Sale archived and stock restored', sale });
  } catch (error) {
    handleServiceError(res, error, 'Failed to archive sale');
  }
};

// POST /api/sales/:saleId/unarchive — deducts stock again
exports.unarchiveSale = async (req, res) => {
  try {
    const { saleId } = req.params;
    const sale = await saleService.unarchiveSale(saleId);
    res.json({ message: 'Sale restored and stock deducted', sale });
  } catch (error) {
    handleServiceError(res, error, 'Failed to restore sale');
  }
};

// GET /api/sales/preview-allocation?productId=&quantityBase=&preferredBatchId=
// Powers the "10 tabs from RSL25001 + 5 from RSL25009" split preview before saving.
exports.previewAllocation = async (req, res) => {
  try {
    const { productId, quantityBase, preferredBatchId } = req.query;
    if (!productId) return res.status(400).json({ error: 'productId is required' });

    const result = await batchService.planAllocation(productId, Number(quantityBase), {
      preferredBatchId: preferredBatchId || null,
    });
    res.json({ message: 'Allocation preview generated successfully', ...result });
  } catch (error) {
    handleServiceError(res, error, 'Failed to preview allocation');
  }
};
