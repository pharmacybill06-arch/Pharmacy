const express = require('express');
const router = express.Router();
const billController = require('../controllers/billController');

// Save parsed bill data from frontend (frontend does OCR + parsing)
router.post('/:userId/save', billController.uploadBill);

// ========== DRAFT ENDPOINTS ==========
// Save bill as draft (no product sync, status = 'draft')
router.post('/:userId/draft', billController.saveDraft);

// Get all drafts for a user
router.get('/user/:userId/drafts', billController.getUserDrafts);

// Convert draft to completed bill (triggers product sync)
router.post('/:billId/convert', billController.convertDraft);

// Get all bills for a user
router.get('/user/:userId', billController.getUserBills);

// Get single bill by ID
router.get('/:billId', billController.getBillById);

// Update bill metadata
router.put('/:billId', billController.updateBill);

// Delete bill
router.delete('/:billId', billController.deleteBill);

// Add item to bill
router.post('/:billId/items', billController.addBillItem);

// Get all items for a bill
router.get('/:billId/items', billController.getBillItems);

// Delete item from bill
router.delete('/items/:itemId', billController.deleteBillItem);

// ========== WHOLE-BILL EDIT (P5) ==========

// Edit bill header (invoiceNumber, invoiceDate, dueDate, distributorId) — audit-logged.
// Fast path for the most common edit: PATCH { invoiceDate: '...' }
router.patch('/:billId/header', billController.updateBillHeaderFields);

// Edit a line item (name, productId re-link, batchNumber, expiryDate, quantity, mrp,
// rate) — propagates to ProductBatch, audit-logged
router.patch('/items/:itemId', billController.updateBillItemFields);

// Before/after audit trail for a bill
router.get('/:billId/edit-history', billController.getBillEditHistory);

module.exports = router;
