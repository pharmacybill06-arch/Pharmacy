import { useState, useCallback, useRef, useEffect } from 'react';
import { productApi } from '@/services/api';

/**
 * useProductSearch Hook
 * Debounced product search for autocomplete functionality
 */
export function useProductSearch(userId, options = {}) {
  const {
    debounceMs = 300,
    minChars = 2,
    maxResults = 10,
    fuzzy = false,
  } = options;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);
  
  const debounceTimer = useRef(null);
  const abortController = useRef(null);

  // Debounced search function
  const performSearch = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.trim().length < minChars) {
      setResults([]);
      return;
    }

    // Cancel previous request
    if (abortController.current) {
      abortController.current.abort();
    }

    try {
      setIsSearching(true);
      setError(null);
      abortController.current = new AbortController();

      const response = await productApi.searchProducts(
        userId,
        searchQuery.trim(),
        maxResults,
        fuzzy
      );

      setResults(response.products || []);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
        setResults([]);
      }
    } finally {
      setIsSearching(false);
    }
  }, [userId, minChars, maxResults, fuzzy]);

  // Handle query change with debounce
  const search = useCallback((newQuery) => {
    setQuery(newQuery);
    
    // Clear previous timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Clear results immediately if query is too short
    if (!newQuery || newQuery.trim().length < minChars) {
      setResults([]);
      return;
    }

    // Debounce the search
    debounceTimer.current = setTimeout(() => {
      performSearch(newQuery);
    }, debounceMs);
  }, [debounceMs, minChars, performSearch]);

  // Clear search
  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    if (abortController.current) {
      abortController.current.abort();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      if (abortController.current) {
        abortController.current.abort();
      }
    };
  }, []);

  return {
    query,
    results,
    isSearching,
    error,
    search,
    clearSearch,
  };
}

/**
 * useProductAutofill Hook
 * Provides autofill functionality when selecting a product
 */
export function useProductAutofill() {
  const [selectedProduct, setSelectedProduct] = useState(null);

  const autofillFromProduct = useCallback((product) => {
    if (!product) return null;

    setSelectedProduct(product);

    // Return autofill data
    return {
      name: product.name,
      manufacturer: product.manufacturer || '',
      hsnCode: product.hsnCode || '',
      mrp: product.defaultMrp || '',
      rate: product.defaultRate || '',
      gstPercent: product.gstPercent || '',
      productId: product.id,
      isProductMatched: true,
    };
  }, []);

  const clearAutofill = useCallback(() => {
    setSelectedProduct(null);
  }, []);

  return {
    selectedProduct,
    autofillFromProduct,
    clearAutofill,
  };
}

/**
 * useProductCRUD Hook
 * CRUD operations for products with loading states
 */
export function useProductCRUD(userId) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const createProduct = useCallback(async (productData) => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await productApi.createProduct(userId, productData);
      return result.product;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const updateProduct = useCallback(async (productId, updateData) => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await productApi.updateProduct(userId, productId, updateData);
      return result.product;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const deleteProduct = useCallback(async (productId, permanent = false) => {
    try {
      setIsLoading(true);
      setError(null);
      await productApi.deleteProduct(userId, productId, permanent);
      return true;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    createProduct,
    updateProduct,
    deleteProduct,
    clearError,
  };
}

/**
 * useProductList Hook
 * Paginated product list with search filter
 */
export function useProductList(userId, options = {}) {
  const { initialLimit = 20 } = options;

  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: initialLimit,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });
  const [searchFilter, setSearchFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Fetch products
  const fetchProducts = useCallback(async (page = 1, search = searchFilter) => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await productApi.getProducts(userId, {
        page,
        limit: pagination.limit,
        search,
        sortBy: 'lastUsedAt',
        sortOrder: 'desc',
      });

      if (page === 1) {
        setProducts(result.products);
      } else {
        setProducts(prev => [...prev, ...result.products]);
      }
      
      setPagination(result.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [userId, pagination.limit, searchFilter]);

  // Initial fetch
  useEffect(() => {
    if (userId) {
      fetchProducts(1, searchFilter);
    }
  }, [userId, searchFilter]);

  // Refresh products
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchProducts(1, searchFilter);
  }, [fetchProducts, searchFilter]);

  // Load more products
  const loadMore = useCallback(async () => {
    if (pagination.hasMore && !isLoading) {
      await fetchProducts(pagination.page + 1);
    }
  }, [fetchProducts, pagination, isLoading]);

  // Update search filter
  const updateSearch = useCallback((search) => {
    setSearchFilter(search);
    // Reset to first page when search changes
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  // Remove product from local list (after delete)
  const removeFromList = useCallback((productId) => {
    setProducts(prev => prev.filter(p => p.id !== productId));
    setPagination(prev => ({ ...prev, total: prev.total - 1 }));
  }, []);

  // Update product in local list
  const updateInList = useCallback((productId, updatedData) => {
    setProducts(prev => 
      prev.map(p => p.id === productId ? { ...p, ...updatedData } : p)
    );
  }, []);

  // Add product to local list
  const addToList = useCallback((product) => {
    setProducts(prev => [product, ...prev]);
    setPagination(prev => ({ ...prev, total: prev.total + 1 }));
  }, []);

  return {
    products,
    pagination,
    searchFilter,
    isLoading,
    isRefreshing,
    error,
    refresh,
    loadMore,
    updateSearch,
    removeFromList,
    updateInList,
    addToList,
  };
}

/**
 * useEnrichedProductList Hook
 * Products list with batch/expiry/distributor info aggregated from BillItem —
 * single search box (name/batch/invoice), distributor + expiry-month +
 * received-date filters (AND logic), FEFO/name sort, pagination.
 */
export function useEnrichedProductList(userId, options = {}) {
  const { initialLimit = 20 } = options;

  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: initialLimit,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });
  const [searchFilter, setSearchFilter] = useState('');
  const [distributorIds, setDistributorIds] = useState([]);
  const [expiryMonth, setExpiryMonth] = useState(null); // "MM-YYYY"
  const [receivedFrom, setReceivedFrom] = useState(null);
  const [receivedTo, setReceivedTo] = useState(null);
  const [sort, setSort] = useState('fefo'); // 'fefo' | 'name'
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const filtersKey = JSON.stringify({ searchFilter, distributorIds, expiryMonth, receivedFrom, receivedTo, sort });

  const fetchProducts = useCallback(async (page = 1) => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await productApi.getEnrichedProducts(userId, {
        page,
        limit: pagination.limit,
        search: searchFilter,
        distributorIds,
        expiryMonth,
        receivedFrom,
        receivedTo,
        sort,
      });

      if (page === 1) {
        setProducts(result.products);
      } else {
        setProducts((prev) => [...prev, ...result.products]);
      }

      setPagination(result.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, pagination.limit, filtersKey]);

  useEffect(() => {
    if (userId) {
      fetchProducts(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, filtersKey]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchProducts(1);
  }, [fetchProducts]);

  const loadMore = useCallback(async () => {
    if (pagination.hasMore && !isLoading) {
      await fetchProducts(pagination.page + 1);
    }
  }, [fetchProducts, pagination, isLoading]);

  const updateSearch = useCallback((search) => {
    setSearchFilter(search);
  }, []);

  const clearAllFilters = useCallback(() => {
    setDistributorIds([]);
    setExpiryMonth(null);
    setReceivedFrom(null);
    setReceivedTo(null);
  }, []);

  const activeFilterCount =
    (distributorIds.length > 0 ? 1 : 0) + (expiryMonth ? 1 : 0) + (receivedFrom || receivedTo ? 1 : 0);

  return {
    products,
    pagination,
    searchFilter,
    distributorIds,
    setDistributorIds,
    expiryMonth,
    setExpiryMonth,
    receivedFrom,
    receivedTo,
    setReceivedRange: (from, to) => {
      setReceivedFrom(from);
      setReceivedTo(to);
    },
    sort,
    setSort,
    activeFilterCount,
    clearAllFilters,
    isLoading,
    isRefreshing,
    error,
    refresh,
    loadMore,
    updateSearch,
  };
}

export default {
  useProductSearch,
  useProductAutofill,
  useProductCRUD,
  useProductList,
  useEnrichedProductList,
};
