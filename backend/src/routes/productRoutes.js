const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const {
  validateCreateProduct,
  validateUpdateProduct,
  validateSearchQuery,
  validatePagination,
  validateUserId,
  validateProductId,
} = require('../middleware/productValidation');

/**
 * Product Routes
 * All routes are prefixed with /api/products/:userId
 * 
 * IMPORTANT: Routes with specific literal segments (search, match, stats, sync) 
 * must be defined BEFORE the generic /:userId routes to avoid Express 
 * incorrectly matching them as :productId
 */

// ============================================
// SPECIFIC ROUTES (must be before /:userId and /:userId/:productId)
// ============================================

// GET /products/:userId/list-enriched - Products list with batch/expiry/distributor
// aggregated from BillItem (search, filters, sort, pagination)
router.get('/:userId/list-enriched', validateUserId, validatePagination, productController.getEnrichedProducts);

// GET /products/:userId/search - Search products for autocomplete
router.get('/:userId/search', validateUserId, validateSearchQuery, productController.searchProducts);

// GET /products/:userId/match - Find matching product for item name
router.get('/:userId/match', validateUserId, productController.matchProduct);

// GET /products/:userId/stats - Get product statistics
router.get('/:userId/stats', validateUserId, productController.getProductStats);

// POST /products/:userId/sync - Sync products from bill items
router.post('/:userId/sync', validateUserId, productController.syncFromBill);

// ============================================
// DYNAMIC ROUTES (:productId must be after specific ones)
// ============================================

// GET /products/:userId/:productId - Get single product
router.get('/:userId/:productId', validateUserId, validateProductId, productController.getProductById);

// PUT /products/:userId/:productId - Update product
router.put('/:userId/:productId', validateUserId, validateProductId, validateUpdateProduct, productController.updateProduct);

// DELETE /products/:userId/:productId - Delete product
router.delete('/:userId/:productId', validateUserId, validateProductId, productController.deleteProduct);

// ============================================
// GENERIC CRUD OPERATIONS (must be last)
// ============================================

// POST /products/:userId - Create new product
router.post('/:userId', validateUserId, validateCreateProduct, productController.createProduct);

// GET /products/:userId - Get all products (paginated)
router.get('/:userId', validateUserId, validatePagination, productController.getProducts);

module.exports = router;
