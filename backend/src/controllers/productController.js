const productService = require('../services/productService');
const productAggregationService = require('../services/productAggregationService');
const batchService = require('../services/batchService');

/**
 * Product Controller
 * Handles HTTP requests for product management
 */

// ============================================
// BATCHES (batch-level stock, FEFO ordered)
// ============================================

/**
 * GET /products/:userId/:productId/batches
 * Batches sorted by expiry ASC (FEFO order) with remaining quantity.
 * Empty batches are returned too — the pharmacist must always be able to see
 * which physical strip to pick from.
 */
exports.getProductBatches = async (req, res) => {
  try {
    const { productId } = req.params;
    const { includeArchived } = req.query;
    const result = await batchService.getProductBatches(productId, {
      includeArchived: includeArchived === 'true',
    });
    res.json({ message: 'Product batches fetched successfully', ...result });
  } catch (error) {
    console.error('[PRODUCT] Get batches error:', error.message);
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to fetch product batches' });
  }
};

/**
 * POST /products/:userId/:productId/batches
 * Create or update a batch by hand — the user override that must always be available.
 */
exports.upsertProductBatch = async (req, res) => {
  try {
    const { userId, productId } = req.params;
    const batch = await batchService.upsertBatchManually(userId, productId, req.body);
    res.status(201).json({ message: 'Batch saved successfully', batch });
  } catch (error) {
    console.error('[PRODUCT] Upsert batch error:', error.message);
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('required')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to save batch' });
  }
};

/**
 * POST /products/:userId/batches/:batchId/archive — archive, never delete
 */
exports.archiveProductBatch = async (req, res) => {
  try {
    const { batchId } = req.params;
    const batch = await batchService.archiveBatch(batchId, req.body?.isArchived !== false);
    res.json({ message: 'Batch archive state updated successfully', batch });
  } catch (error) {
    console.error('[PRODUCT] Archive batch error:', error.message);
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to archive batch' });
  }
};

// ============================================
// LIST ENRICHED (batch/expiry/distributor aggregated from BillItem)
// ============================================

/**
 * GET /products/:userId/list-enriched
 */
exports.getEnrichedProducts = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      search = '',
      distributorIds,
      expiryMonth,
      receivedFrom,
      receivedTo,
      sort = 'fefo',
      page = 1,
      limit = 20,
    } = req.query;

    console.log(`[PRODUCT] Fetching enriched product list for user: ${userId}`);

    const result = await productAggregationService.getEnrichedProducts(userId, {
      search,
      distributorIds,
      expiryMonth,
      receivedFrom,
      receivedTo,
      sort,
      page: parseInt(page),
      limit: parseInt(limit),
    });

    res.json({
      message: 'Enriched product list fetched successfully',
      ...result,
    });
  } catch (error) {
    console.error('[PRODUCT] Get enriched products error:', error.message);
    res.status(500).json({ error: 'Failed to fetch enriched product list' });
  }
};

// ============================================
// CREATE PRODUCT
// ============================================

/**
 * Create a new product manually
 * POST /products
 */
exports.createProduct = async (req, res) => {
  try {
    const { userId } = req.params;
    const productData = req.body;
    
    console.log('[PRODUCT CONTROLLER] Received product data:', JSON.stringify(productData, null, 2));
    
    // Validation
    if (!productData.name || productData.name.trim().length === 0) {
      return res.status(400).json({ error: 'Product name is required' });
    }
    
    if (productData.defaultRate && parseFloat(productData.defaultRate) < 0) {
      return res.status(400).json({ error: 'Rate cannot be negative' });
    }
    
    if (productData.defaultMrp && parseFloat(productData.defaultMrp) < 0) {
      return res.status(400).json({ error: 'MRP cannot be negative' });
    }
    
    if (productData.gstPercent && (parseFloat(productData.gstPercent) < 0 || parseFloat(productData.gstPercent) > 100)) {
      return res.status(400).json({ error: 'GST percentage must be between 0 and 100' });
    }
    
    console.log(`[PRODUCT] Creating product for user: ${userId}`);
    
    const product = await productService.createProduct(userId, productData);
    
    console.log(`[PRODUCT] ✓ Product created: ${product.id}`);
    
    res.status(201).json({
      message: 'Product created successfully',
      product
    });
    
  } catch (error) {
    console.error('[PRODUCT] Create error:', error.message);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to create product' });
  }
};

// ============================================
// GET PRODUCTS (PAGINATED LIST)
// ============================================

/**
 * Get all products for a user (paginated)
 * GET /products
 */
exports.getProducts = async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      sortBy = 'lastUsedAt', 
      sortOrder = 'desc',
      activeOnly = 'true'
    } = req.query;
    
    console.log(`[PRODUCT] Fetching products for user: ${userId}`);
    
    const result = await productService.getProducts(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      sortBy,
      sortOrder,
      activeOnly: activeOnly === 'true'
    });
    
    res.json({
      message: 'Products fetched successfully',
      ...result
    });
    
  } catch (error) {
    console.error('[PRODUCT] Get products error:', error.message);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
};

// ============================================
// SEARCH PRODUCTS (AUTOCOMPLETE)
// ============================================

/**
 * Search products for autocomplete
 * GET /products/search
 */
exports.searchProducts = async (req, res) => {
  try {
    const { userId } = req.params;
    const { q = '', limit = 10, fuzzy = 'false' } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.json({
        message: 'Search results',
        products: []
      });
    }
    
    console.log(`[PRODUCT] Search: "${q}" for user: ${userId}`);
    
    let products;
    if (fuzzy === 'true') {
      products = await productService.fuzzySearchProducts(userId, q, parseInt(limit));
    } else {
      products = await productService.searchProducts(userId, q, parseInt(limit));
    }
    
    res.json({
      message: 'Search results',
      query: q,
      total: products.length,
      products
    });
    
  } catch (error) {
    console.error('[PRODUCT] Search error:', error.message);
    res.status(500).json({ error: 'Failed to search products' });
  }
};

// ============================================
// GET SINGLE PRODUCT
// ============================================

/**
 * Get a single product by ID
 * GET /products/:productId
 */
exports.getProductById = async (req, res) => {
  try {
    const { userId, productId } = req.params;
    
    const product = await productService.getProductById(productId, userId);
    
    res.json({
      message: 'Product fetched successfully',
      product
    });
    
  } catch (error) {
    console.error('[PRODUCT] Get by ID error:', error.message);
    
    if (error.message === 'Product not found') {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.status(500).json({ error: 'Failed to fetch product' });
  }
};

// ============================================
// UPDATE PRODUCT
// ============================================

/**
 * Update a product
 * PUT /products/:productId
 */
exports.updateProduct = async (req, res) => {
  try {
    const { userId, productId } = req.params;
    const updateData = req.body;
    
    // Validation
    if (updateData.name !== undefined && updateData.name.trim().length === 0) {
      return res.status(400).json({ error: 'Product name cannot be empty' });
    }
    
    if (updateData.defaultRate !== undefined && parseFloat(updateData.defaultRate) < 0) {
      return res.status(400).json({ error: 'Rate cannot be negative' });
    }
    
    if (updateData.defaultMrp !== undefined && parseFloat(updateData.defaultMrp) < 0) {
      return res.status(400).json({ error: 'MRP cannot be negative' });
    }
    
    if (updateData.gstPercent !== undefined && (parseFloat(updateData.gstPercent) < 0 || parseFloat(updateData.gstPercent) > 100)) {
      return res.status(400).json({ error: 'GST percentage must be between 0 and 100' });
    }
    
    console.log(`[PRODUCT] Updating product: ${productId}`);
    
    const product = await productService.updateProduct(productId, userId, updateData);
    
    console.log(`[PRODUCT] ✓ Product updated: ${product.id}`);
    
    res.json({
      message: 'Product updated successfully',
      product
    });
    
  } catch (error) {
    console.error('[PRODUCT] Update error:', error.message);
    
    if (error.message === 'Product not found') {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to update product' });
  }
};

// ============================================
// DELETE PRODUCT
// ============================================

/**
 * Delete a product (soft delete)
 * DELETE /products/:productId
 */
exports.deleteProduct = async (req, res) => {
  try {
    const { userId, productId } = req.params;
    const { permanent = 'false' } = req.query;
    
    console.log(`[PRODUCT] Deleting product: ${productId} (permanent: ${permanent})`);
    
    let product;
    if (permanent === 'true') {
      product = await productService.hardDeleteProduct(productId, userId);
    } else {
      product = await productService.deleteProduct(productId, userId);
    }
    
    console.log(`[PRODUCT] ✓ Product deleted: ${product.id}`);
    
    res.json({
      message: permanent === 'true' ? 'Product permanently deleted' : 'Product deleted successfully',
      product
    });
    
  } catch (error) {
    console.error('[PRODUCT] Delete error:', error.message);
    
    if (error.message === 'Product not found') {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.status(500).json({ error: 'Failed to delete product' });
  }
};

// ============================================
// PRODUCT STATISTICS
// ============================================

/**
 * Get product statistics for a user
 * GET /products/stats
 */
exports.getProductStats = async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log(`[PRODUCT] Fetching stats for user: ${userId}`);
    
    const stats = await productService.getProductStats(userId);
    
    res.json({
      message: 'Product statistics fetched successfully',
      stats
    });
    
  } catch (error) {
    console.error('[PRODUCT] Stats error:', error.message);
    res.status(500).json({ error: 'Failed to fetch product statistics' });
  }
};

// ============================================
// MATCH PRODUCT
// ============================================

/**
 * Find matching product for an item name
 * GET /products/match
 */
exports.matchProduct = async (req, res) => {
  try {
    const { userId } = req.params;
    const { name } = req.query;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Item name is required' });
    }
    
    const match = await productService.findMatchingProduct(userId, name);
    
    res.json({
      message: match ? 'Product match found' : 'No matching product',
      matched: !!match,
      product: match
    });
    
  } catch (error) {
    console.error('[PRODUCT] Match error:', error.message);
    res.status(500).json({ error: 'Failed to find matching product' });
  }
};

// ============================================
// BULK OPERATIONS
// ============================================

/**
 * Sync products from bill items (called internally)
 * POST /products/sync
 */
exports.syncFromBill = async (req, res) => {
  try {
    const { userId } = req.params;
    const { items } = req.body;
    
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Items array is required' });
    }
    
    console.log(`[PRODUCT] Syncing ${items.length} items for user: ${userId}`);
    
    const result = await productService.syncProductsFromBillItems(userId, items);
    
    console.log(`[PRODUCT] ✓ Sync complete: ${result.created} created, ${result.updated} updated`);
    
    res.json({
      message: 'Products synced successfully',
      result
    });
    
  } catch (error) {
    console.error('[PRODUCT] Sync error:', error.message);
    res.status(500).json({ error: 'Failed to sync products' });
  }
};
