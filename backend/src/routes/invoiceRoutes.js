const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');

/**
 * Invoice Routes (Customer Sales)
 * All routes are prefixed with /api/invoices/:userId
 * 
 * These are distinct from Bill routes (which handle distributor purchases)
 * and use the same Bill model but with billType = 'sale'
 */

// ============================================
// INVOICE SPECIFIC ROUTES (must be before /:invoiceId)
// ============================================

// GET /invoices/:userId/stats - Get invoice statistics
router.get('/:userId/stats', invoiceController.getInvoiceStats);

// ============================================
// MAIN INVOICE ROUTES
// ============================================

// POST /invoices/:userId - Create new invoice
router.post('/:userId', invoiceController.createInvoice);

// GET /invoices/:userId - Get all invoices (paginated, filtered)
router.get('/:userId', invoiceController.getInvoices);

// ============================================
// SINGLE INVOICE ROUTES (:invoiceId must be after specific ones)
// ============================================

// GET /invoices/:userId/:invoiceId - Get single invoice
router.get('/:userId/:invoiceId', invoiceController.getInvoiceById);

// PUT /invoices/:userId/:invoiceId - Update invoice
router.put('/:userId/:invoiceId', invoiceController.updateInvoice);

// DELETE /invoices/:userId/:invoiceId - Delete/reverse invoice (refund stock)
router.delete('/:userId/:invoiceId', invoiceController.deleteInvoice);

module.exports = router;
