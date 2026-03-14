/**
 * Email Bill Routes
 * API routes for Zoho email invoice extraction
 */

const express = require('express');
const router = express.Router();
const emailBillController = require('../controllers/emailBillController');

// POST /api/email-bills/fetch — trigger email fetch + processing
router.post('/fetch', emailBillController.fetchAndProcess);

// GET /api/email-bills/logs — list processing history
router.get('/logs', emailBillController.getEmailLogs);

// GET /api/email-bills/logs/:logId — get log detail
router.get('/logs/:logId', emailBillController.getEmailLogById);

// POST /api/email-bills/retry/:logId — retry a failed email
router.post('/retry/:logId', emailBillController.retryEmail);

module.exports = router;
