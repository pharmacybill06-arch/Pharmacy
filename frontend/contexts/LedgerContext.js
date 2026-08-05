import React, { createContext, useContext, useState, useCallback } from 'react';
import { ledgerApi } from '@/services/api';

/**
 * Ledger Context
 * Distributor Payments (Khata) — per-distributor debit/credit ledger state.
 */
const LedgerContext = createContext(null);

export function LedgerProvider({ children }) {
  const [summary, setSummary] = useState({ distributors: [], totalOutstanding: 0, totalOverdue: 0 });
  const [overdueAlert, setOverdueAlert] = useState({ totalOverdue: 0, distributorsWithOverdue: 0 });
  const [distributorLedger, setDistributorLedger] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSummary = useCallback(async (userId) => {
    if (!userId) return;
    try {
      setIsLoading(true);
      setError(null);
      const response = await ledgerApi.getSummary(userId);
      setSummary(response);
      return response;
    } catch (err) {
      console.error('Error fetching ledger summary:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchOverdueAlert = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const response = await ledgerApi.getOverdueAlert(userId);
      setOverdueAlert(response);
      return response;
    } catch (err) {
      console.error('Error fetching overdue alert:', err);
      return null;
    }
  }, []);

  const fetchDistributorLedger = useCallback(async (distributorId) => {
    if (!distributorId) return;
    try {
      setIsLoading(true);
      setError(null);
      const response = await ledgerApi.getDistributorLedger(distributorId);
      setDistributorLedger(response);
      return response;
    } catch (err) {
      console.error('Error fetching distributor ledger:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getAllocationTargets = useCallback(async (distributorId) => {
    try {
      const response = await ledgerApi.getAllocationTargets(distributorId);
      return response.targets || [];
    } catch (err) {
      console.error('Error fetching allocation targets:', err);
      return [];
    }
  }, []);

  const uploadAttachment = useCallback(async (userId, imageUri, mimeType) => {
    const response = await ledgerApi.uploadAttachment(userId, imageUri, mimeType);
    return response.attachmentPath;
  }, []);

  const recordPayment = useCallback(async (userId, distributorId, data) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await ledgerApi.recordPayment(userId, distributorId, data);
      // Refresh the currently-viewed ledger so balances stay in sync
      if (distributorLedger?.distributor?.id === distributorId) {
        await fetchDistributorLedger(distributorId);
      }
      return response;
    } catch (err) {
      console.error('Error recording payment:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [distributorLedger, fetchDistributorLedger]);

  const updatePayment = useCallback(async (paymentId, data, distributorId) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await ledgerApi.updatePayment(paymentId, data);
      if (distributorId) await fetchDistributorLedger(distributorId);
      return response.payment;
    } catch (err) {
      console.error('Error updating payment:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [fetchDistributorLedger]);

  const archivePayment = useCallback(async (paymentId, distributorId) => {
    try {
      setIsLoading(true);
      await ledgerApi.archivePayment(paymentId);
      if (distributorId) await fetchDistributorLedger(distributorId);
    } catch (err) {
      console.error('Error archiving payment:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [fetchDistributorLedger]);

  const updateOpeningBalance = useCallback(async (distributorId, data) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await ledgerApi.updateOpeningBalance(distributorId, data);
      await fetchDistributorLedger(distributorId);
      return response.distributor;
    } catch (err) {
      console.error('Error updating opening balance:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [fetchDistributorLedger]);

  const clearError = useCallback(() => setError(null), []);
  const clearDistributorLedger = useCallback(() => setDistributorLedger(null), []);

  const value = {
    summary,
    overdueAlert,
    distributorLedger,
    isLoading,
    error,

    fetchSummary,
    fetchOverdueAlert,
    fetchDistributorLedger,
    getAllocationTargets,
    uploadAttachment,
    recordPayment,
    updatePayment,
    archivePayment,
    updateOpeningBalance,
    clearError,
    clearDistributorLedger,
  };

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger() {
  const context = useContext(LedgerContext);
  if (!context) {
    throw new Error('useLedger must be used within a LedgerProvider');
  }
  return context;
}

export default LedgerContext;
