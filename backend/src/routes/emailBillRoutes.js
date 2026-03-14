/**
 * Email Bill Routes
 * API routes for Zoho email invoice extraction
 * Supports both smart selective processing and legacy auto-processing
 */

const express = require('express');
const router = express.Router();
const emailBillController = require('../controllers/emailBillController');

// ===== SMART EMAIL PROCESSING (NEW) =====

// GET /api/email-bills/inbox — list Zoho inbox emails with bill detection
router.get('/inbox', emailBillController.listInbox);

// POST /api/email-bills/process-selected — process user-selected emails
router.post('/process-selected', emailBillController.processSelected);

// ===== LEGACY ENDPOINTS =====

// POST /api/email-bills/fetch — auto-fetch and process all emails
router.post('/fetch', emailBillController.fetchAndProcess);

// GET /api/email-bills/logs — list processing history
router.get('/logs', emailBillController.getEmailLogs);

// GET /api/email-bills/logs/:logId — get log detail
router.get('/logs/:logId', emailBillController.getEmailLogById);

// POST /api/email-bills/retry/:logId — retry a failed email
router.post('/retry/:logId', emailBillController.retryEmail);

module.exports = router;
