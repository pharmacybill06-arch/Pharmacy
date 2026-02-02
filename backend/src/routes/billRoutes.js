const express = require('express');
const router = express.Router();
const billController = require('../controllers/billController');

// Save parsed bill data from frontend (frontend does OCR + parsing)
router.post('/:userId/save', billController.uploadBill);

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

module.exports = router;
