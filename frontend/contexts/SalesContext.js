import React, { createContext, useContext, useState, useCallback } from 'react';
import { salesApi, batchApi, todayLocalIso } from '@/services/api';

/**
 * Sales Context
 * Quick Sell (2-second sale capture) + Daily Sale Register state.
 */
const SalesContext = createContext(null);

const EMPTY_REGISTER = {
  date: null,
  sales: [],
  summary: { saleCount: 0, totalItems: 0, totalUnits: 0, totalAmount: 0, unbilledCount: 0, scheduledCount: 0 },
};

export function SalesProvider({ children }) {
  const [register, setRegister] = useState(EMPTY_REGISTER);
  const [registerDate, setRegisterDate] = useState(todayLocalIso());
  const [pending, setPending] = useState({ sales: [], summary: { pendingCount: 0 } });
  const [searchResults, setSearchResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const fetchRegister = useCallback(async (userId, date) => {
    if (!userId) return null;
    const day = date || todayLocalIso();
    try {
      setIsLoading(true);
      setError(null);
      const response = await salesApi.getDailyRegister(userId, day);
      setRegister(response);
      setRegisterDate(day);
      return response;
    } catch (err) {
      console.error('Error fetching daily register:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchPending = useCallback(async (userId) => {
    if (!userId) return null;
    try {
      setIsLoading(true);
      setError(null);
      const response = await salesApi.getPendingSales(userId);
      setPending(response);
      return response;
    } catch (err) {
      console.error('Error fetching pending sales:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const searchSales = useCallback(async (userId, query) => {
    if (!userId || !query || query.trim().length < 2) {
      setSearchResults(null);
      return null;
    }
    try {
      setIsLoading(true);
      setError(null);
      const response = await salesApi.searchSales(userId, query.trim());
      setSearchResults(response);
      return response;
    } catch (err) {
      console.error('Error searching sales:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearSearch = useCallback(() => setSearchResults(null), []);

  /** Batches for a product in FEFO order — the batch picker's data source. */
  const fetchBatches = useCallback(async (userId, productId) => {
    try {
      const response = await batchApi.getProductBatches(userId, productId);
      return response;
    } catch (err) {
      console.error('Error fetching batches:', err);
      setError(err.message);
      return null;
    }
  }, []);

  /** Preview the FEFO split ("10 from RSL25001 + 5 from RSL25009") before saving. */
  const previewAllocation = useCallback(async (productId, quantityBase, preferredBatchId) => {
    try {
      return await salesApi.previewAllocation(productId, quantityBase, preferredBatchId);
    } catch (err) {
      console.error('Error previewing allocation:', err);
      return null;
    }
  }, []);

  const createSale = useCallback(async (userId, data) => {
    try {
      setIsSaving(true);
      setError(null);
      const response = await salesApi.createSale(userId, data);
      // Keep the register in step if the sale landed on the day being viewed
      await fetchRegister(userId, registerDate);
      return response;
    } catch (err) {
      console.error('Error recording sale:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [fetchRegister, registerDate]);

  const convertToBill = useCallback(async (userId, saleId, data) => {
    try {
      setIsSaving(true);
      setError(null);
      const response = await salesApi.convertToBill(saleId, data);
      await fetchPending(userId);
      return response;
    } catch (err) {
      console.error('Error converting sale to bill:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [fetchPending]);

  const archiveSale = useCallback(async (userId, saleId) => {
    try {
      setIsSaving(true);
      setError(null);
      const response = await salesApi.archiveSale(saleId);
      await fetchRegister(userId, registerDate);
      return response;
    } catch (err) {
      console.error('Error archiving sale:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [fetchRegister, registerDate]);

  const clearError = useCallback(() => setError(null), []);

  const value = {
    register,
    registerDate,
    pending,
    searchResults,
    isLoading,
    isSaving,
    error,

    fetchRegister,
    fetchPending,
    searchSales,
    clearSearch,
    fetchBatches,
    previewAllocation,
    createSale,
    convertToBill,
    archiveSale,
    clearError,
  };

  return <SalesContext.Provider value={value}>{children}</SalesContext.Provider>;
}

export function useSales() {
  const context = useContext(SalesContext);
  if (!context) {
    throw new Error('useSales must be used within a SalesProvider');
  }
  return context;
}

export default SalesContext;
