/**
 * Email Bill Routes
 * API routes for smart email invoice extraction and mailbox configuration.
 */

const express = require('express');

const router = express.Router();
const emailBillController = require('../controllers/emailBillController');

router.get('/connection', emailBillController.getConnection);
router.put('/connection', emailBillController.saveConnection);

router.get('/inbox', emailBillController.listInbox);
router.post('/process-selected', emailBillController.processSelected);
router.post('/extract', emailBillController.extractFromEmail);
router.post('/check-duplicate', emailBillController.checkDuplicate);

router.post('/fetch', emailBillController.fetchAndProcess);
router.get('/logs', emailBillController.getEmailLogs);
router.get('/logs/:logId', emailBillController.getEmailLogById);
router.post('/retry/:logId', emailBillController.retryEmail);

// Cache management endpoints
router.get('/cache-stats', emailBillController.getCacheStats);
router.post('/cleanup-cache', emailBillController.cleanupCache);

module.exports = router;
