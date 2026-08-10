const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');

/**
 * Export Routes — Excel/CSV data export
 * All routes are prefixed with /api/exports
 *
 * Exports are generation-only: no route here mutates business data.
 */

// Row count shown before generating ("142 items from 9 bills")
router.post('/user/:userId/preview', exportController.previewExport);

// Generate and stream the file
router.post('/user/:userId', exportController.generateExport);

// Audit trail of past exports
router.get('/user/:userId/history', exportController.getExportHistory);

module.exports = router;
