const ledgerService = require('../services/ledgerService');
const paymentScreenshotService = require('../services/paymentScreenshotService');

/**
 * Ledger Controller
 * HTTP handlers for the Distributor Payments (Khata) feature.
 */

function handleServiceError(res, error, fallback) {
  console.error(fallback, error.message);
  if (error.code === 'DUPLICATE_TRANSACTION' || error.code === 'ARCHIVED_DUPLICATE_TRANSACTION') {
    return res.status(409).json({
      error: error.message,
      code: error.code,
      existingPaymentId: error.existingPaymentId,
      existingPayment: error.existingPayment,
    });
  }
  if (error.status) {
    return res.status(error.status).json({ error: error.message, code: error.code, field: error.field });
  }
  if (error.message.includes('not found') || error.message.includes('does not belong')) {
    return res.status(404).json({ error: error.message });
  }
  if (
    error.message.includes('required') ||
    error.message.includes('must be') ||
    error.message.includes('Invalid') ||
    error.message.includes('exceed') ||
    error.message.includes('cannot be') ||
    error.message.includes('Provide an updated')
  ) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(500).json({ error: fallback });
}

// Screen A — all distributors with outstanding/overdue totals
exports.getSummary = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await ledgerService.getLedgerSummary(userId);
    res.json({ message: 'Ledger summary fetched successfully', ...result });
  } catch (error) {
    handleServiceError(res, error, 'Failed to fetch ledger summary');
  }
};

// Home screen alert card
exports.getOverdueAlert = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await ledgerService.getOverdueAlert(userId);
    res.json({ message: 'Overdue alert fetched successfully', ...result });
  } catch (error) {
    handleServiceError(res, error, 'Failed to fetch overdue alert');
  }
};

// Screen B — distributor ledger detail (bills, payments, ledger statement)
exports.getDistributorLedger = async (req, res) => {
  try {
    const { distributorId } = req.params;
    const result = await ledgerService.getDistributorLedger(distributorId);
    res.json({ message: 'Distributor ledger fetched successfully', ...result });
  } catch (error) {
    handleServiceError(res, error, 'Failed to fetch distributor ledger');
  }
};

// Flow C, step 5 — allocation targets (opening balance + unpaid/partial bills, oldest first)
exports.getAllocationTargets = async (req, res) => {
  try {
    const { distributorId } = req.params;
    const targets = await ledgerService.getAllocationTargets(distributorId);
    res.json({ message: 'Allocation targets fetched successfully', targets });
  } catch (error) {
    handleServiceError(res, error, 'Failed to fetch allocation targets');
  }
};

// FIFO preview for Record/Edit Payment — the same planFifo the save runs, so the
// apps show exactly what will be stored. ?amount=&paymentDate=&paymentId=
exports.previewAllocation = async (req, res) => {
  try {
    const { distributorId } = req.params;
    const { amount, paymentDate, paymentId } = req.query;
    const result = await ledgerService.previewAllocation(distributorId, { amount, paymentDate, paymentId });
    res.json({ message: 'Allocation preview', ...result });
  } catch (error) {
    handleServiceError(res, error, 'Failed to preview allocation');
  }
};

// Ask-before-adjust: is there on-account money that could go on this bill?
exports.getOnAccountPrompt = async (req, res) => {
  try {
    const prompt = await ledgerService.buildOnAccountPrompt(req.params.billId);
    res.json({ prompt });
  } catch (error) {
    handleServiceError(res, error, 'Failed to check on-account balance');
  }
};

// The user said "Haan" — move on-account money onto this bill
exports.applyOnAccount = async (req, res) => {
  try {
    const result = await ledgerService.applyOnAccountToBill(req.params.billId, req.body || {});
    res.json({ message: 'Advance adjusted', ...result });
  } catch (error) {
    handleServiceError(res, error, 'Failed to adjust advance');
  }
};

// Read-only report: allocations where the bill is dated after the payment. ?format=csv
exports.getLateBillAllocations = async (req, res) => {
  try {
    const rows = await ledgerService.getLateBillAllocationsReport({ userId: req.params.userId });
    if (req.query.format === 'csv') {
      const { toCsv } = require('../utils/csv');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="bill-after-payment-allocations.csv"');
      return res.send(toCsv(rows));
    }
    res.json({ message: 'Allocations where bill date is after payment date', count: rows.length, rows });
  } catch (error) {
    handleServiceError(res, error, 'Failed to build report');
  }
};

// Flow C — record a payment (auto-allocates FIFO unless allocations[] provided)
// Scan a UPI payment screenshot into a pre-filled payment draft (amount, date,
// transaction id, receiver, matched distributor, duplicate). The image is not stored.
exports.scanPaymentScreenshot = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No screenshot uploaded' });
    }
    const result = await paymentScreenshotService.scanScreenshot(req.params.userId, req.file);
    res.json({ message: 'Screenshot scanned', ...result });
  } catch (error) {
    if (error.code === 'NOT_A_RECEIPT') {
      return res.status(422).json({ error: error.message, code: error.code });
    }
    console.error('Failed to scan payment screenshot', error.message);
    res.status(502).json({ error: 'Could not read the screenshot. Please enter the details manually.' });
  }
};

exports.recordPayment = async (req, res) => {
  try {
    const { userId, distributorId } = req.params;
    const result = await ledgerService.recordPayment(userId, distributorId, req.body);
    res.status(201).json({
      message: 'Payment recorded successfully',
      payment: result.payment,
      duplicateWarning: result.duplicateWarning,
    });
  } catch (error) {
    handleServiceError(res, error, 'Failed to record payment');
  }
};

// Edit a payment (amount, date, mode, reference, attachment, notes, allocations)
exports.updatePayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const payment = await ledgerService.updatePayment(paymentId, req.body);
    res.json({ message: 'Payment updated successfully', payment });
  } catch (error) {
    handleServiceError(res, error, 'Failed to update payment');
  }
};

// Archive a payment (never hard-delete)
exports.archivePayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const payment = await ledgerService.archivePayment(paymentId);
    res.json({ message: 'Payment archived successfully', payment });
  } catch (error) {
    handleServiceError(res, error, 'Failed to archive payment');
  }
};

// Restore an archived payment
exports.unarchivePayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const payment = await ledgerService.unarchivePayment(paymentId);
    res.json({ message: 'Payment restored successfully', payment });
  } catch (error) {
    handleServiceError(res, error, 'Failed to restore payment');
  }
};

// Archived payments filter view
exports.getArchivedPayments = async (req, res) => {
  try {
    const { userId } = req.params;
    const payments = await ledgerService.getArchivedPayments(userId);
    res.json({ message: 'Archived payments fetched successfully', payments });
  } catch (error) {
    handleServiceError(res, error, 'Failed to fetch archived payments');
  }
};

// Edit distributor opening balance (with audit note)
exports.updateOpeningBalance = async (req, res) => {
  try {
    const { distributorId } = req.params;
    const distributor = await ledgerService.updateOpeningBalance(distributorId, req.body);
    res.json({ message: 'Opening balance updated successfully', distributor });
  } catch (error) {
    handleServiceError(res, error, 'Failed to update opening balance');
  }
};

// Upload a payment attachment (screenshot or photographed receipt); returns a storage path
exports.uploadAttachment = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const attachmentPath = `/uploads/payments/${req.file.filename}`;
    res.status(201).json({ message: 'Attachment uploaded successfully', attachmentPath });
  } catch (error) {
    handleServiceError(res, error, 'Failed to upload attachment');
  }
};
