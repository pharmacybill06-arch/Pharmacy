import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { productApi } from '@/services/api';

/**
 * Products Context
 * State management for product catalog with caching and optimistic updates
 */

const ProductsContext = createContext(null);

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

export function ProductsProvider({ children }) {
  // Products list state
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });
  
  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Error state
  const [error, setError] = useState(null);
  
  // Search results for autocomplete
  const [searchResults, setSearchResults] = useState([]);
  
  // Cache for search results
  const searchCache = useRef(new Map());
  const lastFetch = useRef(null);
  
  // Current user ID
  const [currentUserId, setCurrentUserId] = useState(null);

  /**
   * Clear all cached data
   */
  const clearCache = useCallback(() => {
    searchCache.current.clear();
    lastFetch.current = null;
  }, []);

  /**
   * Fetch products list (paginated)
   */
  const fetchProducts = useCallback(async (userId, options = {}) => {
    try {
      setIsLoading(true);
      setError(null);
      setCurrentUserId(userId);
      
      const result = await productApi.getProducts(userId, options);
      
      if (options.page && options.page > 1) {
        // Append for infinite scroll
        setProducts(prev => [...prev, ...result.products]);
      } else {
        // Replace for initial load or refresh
        setProducts(result.products);
      }
      
      setPagination(result.pagination);
      lastFetch.current = Date.now();
      
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Refresh products (force re-fetch)
   */
  const refreshProducts = useCallback(async (userId) => {
    clearCache();
    return fetchProducts(userId || currentUserId, { page: 1 });
  }, [fetchProducts, clearCache, currentUserId]);

  /**
   * Load more products (pagination)
   */
  const loadMoreProducts = useCallback(async () => {
    if (!pagination.hasMore || isLoading) return;
    
    return fetchProducts(currentUserId, {
      page: pagination.page + 1,
      limit: pagination.limit,
    });
  }, [fetchProducts, pagination, isLoading, currentUserId]);

  /**
   * Search products for autocomplete (with caching)
   */
  const searchProducts = useCallback(async (userId, query, options = {}) => {
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      return [];
    }
    
    const cacheKey = `${userId}:${query.toLowerCase()}`;
    const cached = searchCache.current.get(cacheKey);
    
    // Return cached results if fresh
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setSearchResults(cached.results);
      return cached.results;
    }
    
    try {
      setIsSearching(true);
      
      const result = await productApi.searchProducts(
        userId,
        query,
        options.limit || 10,
        options.fuzzy || false
      );
      
      // Cache the results
      searchCache.current.set(cacheKey, {
        results: result.products,
        timestamp: Date.now(),
      });
      
      // Limit cache size
      if (searchCache.current.size > 100) {
        const firstKey = searchCache.current.keys().next().value;
        searchCache.current.delete(firstKey);
      }
      
      setSearchResults(result.products);
      return result.products;
    } catch (err) {
      console.error('[ProductsContext] Search error:', err.message);
      return [];
    } finally {
      setIsSearching(false);
    }
  }, []);

  /**
   * Clear search results
   */
  const clearSearch = useCallback(() => {
    setSearchResults([]);
  }, []);

  /**
   * Create a new product
   */
  const createProduct = useCallback(async (userId, productData) => {
    try {
      setIsSaving(true);
      setError(null);
      
      const result = await productApi.createProduct(userId, productData);
      
      // Optimistic update - add to list
      setProducts(prev => [result.product, ...prev]);
      setPagination(prev => ({ ...prev, total: prev.total + 1 }));
      
      // Clear search cache as new product might affect results
      clearCache();
      
      return result.product;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [clearCache]);

  /**
   * Update a product
   */
  const updateProduct = useCallback(async (userId, productId, updateData) => {
    try {
      setIsSaving(true);
      setError(null);
      
      // Optimistic update
      setProducts(prev => 
        prev.map(p => p.id === productId ? { ...p, ...updateData } : p)
      );
      
      const result = await productApi.updateProduct(userId, productId, updateData);
      
      // Update with server response
      setProducts(prev => 
        prev.map(p => p.id === productId ? result.product : p)
      );
      
      // Clear search cache
      clearCache();
      
      return result.product;
    } catch (err) {
      // Revert optimistic update
      await refreshProducts(userId);
      setError(err.message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [clearCache, refreshProducts]);

  /**
   * Delete a product
   */
  const deleteProduct = useCallback(async (userId, productId, permanent = false) => {
    try {
      setIsSaving(true);
      setError(null);
      
      // Optimistic update - remove from list
      const previousProducts = [...products];
      setProducts(prev => prev.filter(p => p.id !== productId));
      setPagination(prev => ({ ...prev, total: prev.total - 1 }));
      
      await productApi.deleteProduct(userId, productId, permanent);
      
      // Clear search cache
      clearCache();
      
      return true;
    } catch (err) {
      // Revert optimistic update
      setProducts(previousProducts);
      setPagination(prev => ({ ...prev, total: prev.total + 1 }));
      setError(err.message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [products, clearCache]);

  /**
   * Get product by ID (from local cache or fetch)
   */
  const getProductById = useCallback(async (userId, productId) => {
    // Check local list first
    const local = products.find(p => p.id === productId);
    if (local) return local;
    
    // Fetch from server
    const result = await productApi.getProductById(userId, productId);
    return result.product;
  }, [products]);

  /**
   * Match product by name
   */
  const matchProduct = useCallback(async (userId, itemName) => {
    try {
      const result = await productApi.matchProduct(userId, itemName);
      return result.matched ? result.product : null;
    } catch (err) {
      console.error('[ProductsContext] Match error:', err.message);
      return null;
    }
  }, []);

  /**
   * Get product statistics
   */
  const getStats = useCallback(async (userId) => {
    try {
      const result = await productApi.getProductStats(userId);
      return result.stats;
    } catch (err) {
      console.error('[ProductsContext] Stats error:', err.message);
      return null;
    }
  }, []);

  const value = {
    // State
    products,
    pagination,
    searchResults,
    isLoading,
    isSearching,
    isSaving,
    error,
    
    // Actions
    fetchProducts,
    refreshProducts,
    loadMoreProducts,
    searchProducts,
    clearSearch,
    createProduct,
    updateProduct,
    deleteProduct,
    getProductById,
    matchProduct,
    getStats,
    clearCache,
  };

  return (
    <ProductsContext.Provider value={value}>
      {children}
    </ProductsContext.Provider>
  );
}

/**
 * Hook to use products context
 */
export function useProducts() {
  const context = useContext(ProductsContext);
  if (!context) {
    throw new Error('useProducts must be used within a ProductsProvider');
  }
  return context;
}

export default ProductsContext;
