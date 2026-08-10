const express = require('express');
const router = express.Router();
const saleController = require('../controllers/saleController');

/**
 * Sale Routes — Quick Sell + Daily Sale Register
 * All routes are prefixed with /api/sales
 *
 * IMPORTANT: literal segments (user, preview-allocation) are declared before the
 * generic /:saleId routes so Express does not match them as an id.
 *
 * There is deliberately NO DELETE route: sales are archived, never deleted.
 */

// Split preview: "10 tabs from RSL25001 + 5 from RSL25009" before the sale is saved
router.get('/preview-allocation', saleController.previewAllocation);

// ============================================
// USER-SCOPED ROUTES
// ============================================

// Cross-date product sale history
router.get('/user/:userId/search', saleController.searchSales);

// Convert-to-bill queue (quick/unbilled sales, oldest first)
router.get('/user/:userId/pending', saleController.getPendingSales);

// Schedule H1/NRX register
router.get('/user/:userId/schedule-register', saleController.getScheduledRegister);

// Daily register (?date=YYYY-MM-DD&tzOffsetMinutes=330)
router.get('/user/:userId', saleController.getDailyRegister);

// Record a sale
router.post('/user/:userId', saleController.createSale);

// ============================================
// SALE-SCOPED ROUTES
// ============================================

router.post('/:saleId/convert-to-bill', saleController.convertToBill);
router.post('/:saleId/archive', saleController.archiveSale);
router.post('/:saleId/unarchive', saleController.unarchiveSale);
router.get('/:saleId', saleController.getSaleById);

module.exports = router;
