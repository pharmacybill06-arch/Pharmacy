const express = require('express');
const router = express.Router();
const ledgerController = require('../controllers/ledgerController');
const paymentAttachmentUpload = require('../config/paymentAttachmentUpload');

// Screen A — distributor list with outstanding/overdue
router.get('/user/:userId/summary', ledgerController.getSummary);

// Home screen alert card
router.get('/user/:userId/overdue-alert', ledgerController.getOverdueAlert);

// Archived payments filter
router.get('/user/:userId/archived-payments', ledgerController.getArchivedPayments);

// Upload a payment attachment (screenshot or photographed receipt)
router.post('/user/:userId/upload-attachment', paymentAttachmentUpload.single('attachment'), ledgerController.uploadAttachment);

// Flow C — record a payment for a distributor
router.post('/user/:userId/distributor/:distributorId/payments', ledgerController.recordPayment);

// Screen B — distributor ledger detail
router.get('/distributor/:distributorId', ledgerController.getDistributorLedger);

// Flow C, step 5 — allocation targets
router.get('/distributor/:distributorId/allocation-targets', ledgerController.getAllocationTargets);

// Distributor opening balance
router.put('/distributor/:distributorId/opening-balance', ledgerController.updateOpeningBalance);

// Payment edit / archive / restore
router.put('/payments/:paymentId', ledgerController.updatePayment);
router.post('/payments/:paymentId/archive', ledgerController.archivePayment);
router.post('/payments/:paymentId/unarchive', ledgerController.unarchivePayment);

module.exports = router;
