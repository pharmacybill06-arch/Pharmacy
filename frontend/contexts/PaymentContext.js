import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { paymentApi } from '@/services/api';

/**
 * Payment Context
 * Manages payment state and provides CRUD operations
 * for tracking UPI payments to distributors
 */
const PaymentContext = createContext(null);

export function PaymentProvider({ children }) {
  const [payments, setPayments] = useState([]);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [paymentStats, setPaymentStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });

  // Shared text received from external app (Google Pay, PhonePe, etc.)
  const [sharedPaymentText, setSharedPaymentText] = useState(null);

  /**
   * Fetch all payments for a user
   */
  const fetchPayments = useCallback(async (userId, options = {}) => {
    if (!userId) return;

    try {
      setIsLoading(true);
      setError(null);
      const response = await paymentApi.getPayments(userId, options);
      setPayments(response.payments || []);
      setPagination({
        page: response.page || 1,
        total: response.total || 0,
        totalPages: response.totalPages || 0,
      });
      return response;
    } catch (err) {
      console.error('Error fetching payments:', err);
      setError(err.message);
      return { payments: [], total: 0 };
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Fetch payment stats for a user
   */
  const fetchPaymentStats = useCallback(async (userId) => {
    if (!userId) return;

    try {
      const response = await paymentApi.getPaymentStats(userId);
      setPaymentStats(response.stats);
      return response.stats;
    } catch (err) {
      console.error('Error fetching payment stats:', err);
      return null;
    }
  }, []);

  /**
   * Create a new payment
   */
  const createPayment = useCallback(async (userId, paymentData) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await paymentApi.createPayment(userId, paymentData);

      // Add to local state
      setPayments(prev => [response.payment, ...prev]);

      return response.payment;
    } catch (err) {
      console.error('Error creating payment:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get payments for a specific distributor
   */
  const getDistributorPayments = useCallback(async (distributorId, options = {}) => {
    try {
      const response = await paymentApi.getDistributorPayments(distributorId, options);
      return response;
    } catch (err) {
      console.error('Error fetching distributor payments:', err);
      return { payments: [], total: 0, stats: { totalPaid: 0, totalPayments: 0 } };
    }
  }, []);

  /**
   * Auto-match distributor from payee name
   */
  const matchDistributor = useCallback(async (userId, payeeName) => {
    try {
      const response = await paymentApi.matchDistributor(userId, payeeName);
      return response;
    } catch (err) {
      console.error('Error matching distributor:', err);
      return { matched: false, distributor: null };
    }
  }, []);

  /**
   * Update a payment
   */
  const updatePayment = useCallback(async (paymentId, updateData) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await paymentApi.updatePayment(paymentId, updateData);

      // Update local state
      setPayments(prev =>
        prev.map(p => (p.id === paymentId ? response.payment : p))
      );

      return response.payment;
    } catch (err) {
      console.error('Error updating payment:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Delete a payment
   */
  const deletePayment = useCallback(async (paymentId) => {
    try {
      setIsLoading(true);
      await paymentApi.deletePayment(paymentId);

      // Remove from local state
      setPayments(prev => prev.filter(p => p.id !== paymentId));

      return true;
    } catch (err) {
      console.error('Error deleting payment:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Set shared text received from another app
   */
  const handleSharedPaymentText = useCallback((text) => {
    setSharedPaymentText(text);
  }, []);

  /**
   * Clear shared text after processing
   */
  const clearSharedPaymentText = useCallback(() => {
    setSharedPaymentText(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = {
    // State
    payments,
    selectedPayment,
    paymentStats,
    isLoading,
    error,
    pagination,
    sharedPaymentText,

    // Actions
    fetchPayments,
    fetchPaymentStats,
    createPayment,
    getDistributorPayments,
    matchDistributor,
    updatePayment,
    deletePayment,
    handleSharedPaymentText,
    clearSharedPaymentText,
    setSelectedPayment,
    clearError,
  };

  return (
    <PaymentContext.Provider value={value}>
      {children}
    </PaymentContext.Provider>
  );
}

export function usePayments() {
  const context = useContext(PaymentContext);
  if (!context) {
    throw new Error('usePayments must be used within a PaymentProvider');
  }
  return context;
}

export default PaymentContext;
