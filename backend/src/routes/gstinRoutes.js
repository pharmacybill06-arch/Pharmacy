const express = require('express');
const router = express.Router();
const gstinController = require('../controllers/gstinController');

/**
 * GSTIN Routes
 * Base path: /api/gstin
 */

// POST /api/gstin/lookup - Lookup GSTIN via Sandbox API (returns distributor info)
router.post('/lookup', gstinController.lookupGstin);

// POST /api/gstin/verify - Verify GSTIN via Cashfree API (legacy)
router.post('/verify', gstinController.verifyGstin);

// GET /api/gstin/status - Health check
router.get('/status', gstinController.getStatus);

module.exports = router;
