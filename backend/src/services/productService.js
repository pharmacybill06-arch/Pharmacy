const prisma = require('../models/prisma');

/**
 * Product Service
 * Handles business logic for product catalog management
 */

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Normalize product name for matching
 * Removes spaces, special chars, converts to lowercase
 * @param {string} name - Product name
 * @returns {string} Normalized name
 */
function normalizeProductName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric
    .trim();
}

/**
 * Calculate similarity between two strings (for fuzzy matching)
 * Uses Levenshtein distance
 * @param {string} str1 
 * @param {string} str2 
 * @returns {number} Similarity score (0-1)
 */
function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// ============================================
// PRODUCT CRUD OPERATIONS
// ============================================

/**
 * Create a new product
 * @param {string} userId - User ID
 * @param {Object} productData - Product data
 * @returns {Promise<Object>} Created product
 */
async function createProduct(userId, productData) {
  const nameNormalized = normalizeProductName(productData.name);
  
  // Check for existing product with same normalized name
  const existing = await prisma.product.findUnique({
    where: {
      userId_nameNormalized: {
        userId,
        nameNormalized
      }
    }
  });
  
  if (existing) {
    throw new Error('A product with this name already exists');
  }
  
  const product = await prisma.product.create({
    data: {
      userId,
      name: productData.name.trim(),
      nameNormalized,
      salt: productData.salt?.trim() || null,
      manufacturer: productData.manufacturer?.trim() || null,
      hsnCode: productData.hsnCode?.trim() || null,
      batchNumber: productData.batchNumber?.trim() || null,
      expiryDate: productData.expiryDate?.trim() || null,
      quantity: productData.quantity ? parseFloat(productData.quantity) : null,
      purchaseDate: productData.purchaseDate?.trim() || null,
      defaultMrp: productData.defaultMrp ? parseFloat(productData.defaultMrp) : null,
      defaultRate: productData.defaultRate ? parseFloat(productData.defaultRate) : null,
      ptr: productData.ptr ? parseFloat(productData.ptr) : null,
      gstPercent: productData.gstPercent ? parseFloat(productData.gstPercent) : null,
      notes: productData.notes?.trim() || null,
      usageCount: 0,
      lastUsedAt: null,
      isActive: true
    }
  });
  
  console.log('[PRODUCT CREATE] Created product:', product);
  
  return product;
}

/**
 * Get all products for a user (paginated)
 * @param {string} userId - User ID
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>} Products with pagination info
 */
async function getProducts(userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    search = '',
    sortBy = 'lastUsedAt',
    sortOrder = 'desc',
    activeOnly = true
  } = options;
  
  const skip = (page - 1) * limit;
  
  const where = {
    userId,
    ...(activeOnly && { isActive: true }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { manufacturer: { contains: search, mode: 'insensitive' } },
        { hsnCode: { contains: search, mode: 'insensitive' } }
      ]
    })
  };
  
  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder }
    }),
    prisma.product.count({ where })
  ]);
  
  return {
    products,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + products.length < total
    }
  };
}

/**
 * Get single product by ID
 * @param {string} productId - Product ID
 * @param {string} userId - User ID (for authorization)
 * @returns {Promise<Object>} Product
 */
async function getProductById(productId, userId) {
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      userId
    },
    include: {
      _count: {
        select: { billItems: true }
      }
    }
  });
  
  if (!product) {
    throw new Error('Product not found');
  }
  
  return product;
}

/**
 * Update a product
 * @param {string} productId - Product ID
 * @param {string} userId - User ID (for authorization)
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated product
 */
async function updateProduct(productId, userId, updateData) {
  // Verify ownership
  const existing = await prisma.product.findFirst({
    where: { id: productId, userId }
  });
  
  if (!existing) {
    throw new Error('Product not found');
  }
  
  const data = {};
  
  if (updateData.name !== undefined) {
    data.name = updateData.name.trim();
    data.nameNormalized = normalizeProductName(updateData.name);
    
    // Check if new name conflicts with another product
    const conflict = await prisma.product.findFirst({
      where: {
        userId,
        nameNormalized: data.nameNormalized,
        NOT: { id: productId }
      }
    });
    
    if (conflict) {
      throw new Error('A product with this name already exists');
    }
  }
  
  if (updateData.salt !== undefined) {
    data.salt = updateData.salt?.trim() || null;
  }
  if (updateData.manufacturer !== undefined) {
    data.manufacturer = updateData.manufacturer?.trim() || null;
  }
  if (updateData.hsnCode !== undefined) {
    data.hsnCode = updateData.hsnCode?.trim() || null;
  }
  if (updateData.batchNumber !== undefined) {
    data.batchNumber = updateData.batchNumber?.trim() || null;
  }
  if (updateData.expiryDate !== undefined) {
    data.expiryDate = updateData.expiryDate?.trim() || null;
  }
  if (updateData.quantity !== undefined) {
    data.quantity = updateData.quantity ? parseFloat(updateData.quantity) : null;
  }
  if (updateData.purchaseDate !== undefined) {
    data.purchaseDate = updateData.purchaseDate?.trim() || null;
  }
  if (updateData.defaultMrp !== undefined) {
    data.defaultMrp = updateData.defaultMrp ? parseFloat(updateData.defaultMrp) : null;
  }
  if (updateData.defaultRate !== undefined) {
    data.defaultRate = updateData.defaultRate ? parseFloat(updateData.defaultRate) : null;
  }
  if (updateData.ptr !== undefined) {
    data.ptr = updateData.ptr ? parseFloat(updateData.ptr) : null;
  }
  if (updateData.gstPercent !== undefined) {
    data.gstPercent = updateData.gstPercent ? parseFloat(updateData.gstPercent) : null;
  }
  if (updateData.notes !== undefined) {
    data.notes = updateData.notes?.trim() || null;
  }
  
  console.log('[PRODUCT UPDATE] Updating product with data:', data);
  
  const product = await prisma.product.update({
    where: { id: productId },
    data
  });
  
  console.log('[PRODUCT UPDATE] Updated product:', product);
  
  return product;
}

/**
 * Soft delete a product
 * @param {string} productId - Product ID
 * @param {string} userId - User ID (for authorization)
 * @returns {Promise<Object>} Deleted product
 */
async function deleteProduct(productId, userId) {
  // Verify ownership
  const existing = await prisma.product.findFirst({
    where: { id: productId, userId }
  });
  
  if (!existing) {
    throw new Error('Product not found');
  }
  
  // Soft delete - set isActive to false
  const product = await prisma.product.update({
    where: { id: productId },
    data: { isActive: false }
  });
  
  return product;
}

/**
 * Hard delete a product (permanent)
 * @param {string} productId - Product ID
 * @param {string} userId - User ID (for authorization)
 * @returns {Promise<Object>} Deleted product
 */
async function hardDeleteProduct(productId, userId) {
  // Verify ownership
  const existing = await prisma.product.findFirst({
    where: { id: productId, userId }
  });
  
  if (!existing) {
    throw new Error('Product not found');
  }
  
  // First, unlink all bill items
  await prisma.billItem.updateMany({
    where: { productId },
    data: { productId: null, isProductMatched: false }
  });
  
  // Then delete the product
  const product = await prisma.product.delete({
    where: { id: productId }
  });
  
  return product;
}

// ============================================
// SEARCH AND AUTOCOMPLETE
// ============================================

/**
 * Search products for autocomplete
 * @param {string} userId - User ID
 * @param {string} query - Search query
 * @param {number} limit - Max results
 * @returns {Promise<Array>} Matching products
 */
async function searchProducts(userId, query, limit = 10) {
  if (!query || query.trim().length < 2) {
    return [];
  }
  
  const searchTerm = query.trim();
  const normalizedSearch = normalizeProductName(searchTerm);
  
  // First try exact prefix match on normalized name
  let products = await prisma.product.findMany({
    where: {
      userId,
      isActive: true,
      nameNormalized: { startsWith: normalizedSearch }
    },
    take: limit,
    orderBy: [
      { usageCount: 'desc' },
      { lastUsedAt: 'desc' }
    ]
  });
  
  // If not enough results, try contains match
  if (products.length < limit) {
    const moreProducts = await prisma.product.findMany({
      where: {
        userId,
        isActive: true,
        name: { contains: searchTerm, mode: 'insensitive' },
        NOT: { id: { in: products.map(p => p.id) } }
      },
      take: limit - products.length,
      orderBy: [
        { usageCount: 'desc' },
        { lastUsedAt: 'desc' }
      ]
    });
    
    products = [...products, ...moreProducts];
  }
  
  return products;
}

/**
 * Search products with fuzzy matching
 * @param {string} userId - User ID
 * @param {string} query - Search query
 * @param {number} limit - Max results
 * @param {number} threshold - Similarity threshold (0-1)
 * @returns {Promise<Array>} Matching products with scores
 */
async function fuzzySearchProducts(userId, query, limit = 10, threshold = 0.6) {
  if (!query || query.trim().length < 2) {
    return [];
  }
  
  // Get all active products for user (consider caching for large datasets)
  const allProducts = await prisma.product.findMany({
    where: {
      userId,
      isActive: true
    }
  });
  
  // Calculate similarity scores
  const scoredProducts = allProducts
    .map(product => ({
      ...product,
      similarity: calculateSimilarity(query, product.name)
    }))
    .filter(p => p.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
  
  return scoredProducts;
}

// ============================================
// AUTO-SYNC FROM BILL ITEMS
// ============================================

/**
 * Sync products from bill items
 * Called when a bill is saved - creates/updates products from items
 * @param {string} userId - User ID
 * @param {Array} items - Bill items
 * @returns {Promise<Object>} Sync results
 */
async function syncProductsFromBillItems(userId, items) {
  console.log('[PRODUCT SYNC] Starting sync for', items.length, 'items');
  
  const results = {
    created: 0,
    updated: 0,
    linked: 0,
    errors: []
  };
  
  for (const item of items) {
    if (!item.name || item.name.trim().length === 0) {
      continue;
    }
    
    try {
      console.log('[PRODUCT SYNC] Processing item:', {
        name: item.name,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        quantity: item.quantity
      });
      
      const nameNormalized = normalizeProductName(item.name);
      
      if (!nameNormalized) {
        continue;
      }
      
      // Try to find existing product
      let product = await prisma.product.findUnique({
        where: {
          userId_nameNormalized: {
            userId,
            nameNormalized
          }
        }
      });
      
      if (product) {
        console.log('[PRODUCT SYNC] Found existing product:', product.id);
        
        const updateData = {
          ...(item.quantity && { quantity: parseFloat(item.quantity), stock: parseFloat(item.quantity) }),
          ...(item.batchNumber && { batchNumber: item.batchNumber }),
          ...(item.expiryDate && { expiryDate: item.expiryDate }),
          usageCount: { increment: 1 },
          lastUsedAt: new Date()
        };
        
        console.log('[PRODUCT SYNC] Updating product with data:', updateData);
        
        // Update existing product with latest values
        product = await prisma.product.update({
          where: { id: product.id },
          data: updateData
        });
        
        console.log('[PRODUCT SYNC] Updated product:', product);
        results.updated++;
      } else {
        console.log('[PRODUCT SYNC] Creating new product');
        
        const createData = {
          userId,
          name: item.name.trim(),
          nameNormalized,
          batchNumber: item.batchNumber || null,
          expiryDate: item.expiryDate || null,
          quantity: item.quantity ? parseFloat(item.quantity) : null,
          stock: item.quantity ? parseFloat(item.quantity) : 0,
          usageCount: 1,
          lastUsedAt: new Date(),
          isActive: true
        };
        
        console.log('[PRODUCT SYNC] Creating product with data:', createData);
        
        // Create new product
        product = await prisma.product.create({
          data: createData
        });
        
        console.log('[PRODUCT SYNC] Created product:', product);
        results.created++;
      }
      
      // Link bill item to product if item has an ID
      if (item.id) {
        await prisma.billItem.update({
          where: { id: item.id },
          data: {
            productId: product.id,
            isProductMatched: true
          }
        });
        results.linked++;
      }
      
    } catch (error) {
      results.errors.push({
        itemName: item.name,
        error: error.message
      });
    }
  }
  
  return results;
}

/**
 * Find matching product for a bill item name
 * @param {string} userId - User ID
 * @param {string} itemName - Item name to match
 * @returns {Promise<Object|null>} Matching product or null
 */
async function findMatchingProduct(userId, itemName) {
  if (!itemName || itemName.trim().length === 0) {
    return null;
  }
  
  const nameNormalized = normalizeProductName(itemName);
  
  // Exact match first
  const exactMatch = await prisma.product.findUnique({
    where: {
      userId_nameNormalized: {
        userId,
        nameNormalized
      }
    }
  });
  
  if (exactMatch) {
    return { ...exactMatch, matchType: 'exact' };
  }
  
  // Fuzzy match if no exact match
  const fuzzyMatches = await fuzzySearchProducts(userId, itemName, 1, 0.85);
  if (fuzzyMatches.length > 0) {
    return { ...fuzzyMatches[0], matchType: 'fuzzy' };
  }
  
  return null;
}

// ============================================
// ANALYTICS
// ============================================

/**
 * Get product statistics for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Statistics
 */
async function getProductStats(userId) {
  const [totalProducts, activeProducts, recentlyUsed, mostUsed] = await Promise.all([
    prisma.product.count({ where: { userId } }),
    prisma.product.count({ where: { userId, isActive: true } }),
    prisma.product.findMany({
      where: { userId, isActive: true, lastUsedAt: { not: null } },
      orderBy: { lastUsedAt: 'desc' },
      take: 5
    }),
    prisma.product.findMany({
      where: { userId, isActive: true, usageCount: { gt: 0 } },
      orderBy: { usageCount: 'desc' },
      take: 5
    })
  ]);
  
  return {
    totalProducts,
    activeProducts,
    inactiveProducts: totalProducts - activeProducts,
    recentlyUsed,
    mostUsed
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Utilities
  normalizeProductName,
  calculateSimilarity,
  
  // CRUD
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  hardDeleteProduct,
  
  // Search
  searchProducts,
  fuzzySearchProducts,
  
  // Auto-sync
  syncProductsFromBillItems,
  findMatchingProduct,
  
  // Analytics
  getProductStats
};
