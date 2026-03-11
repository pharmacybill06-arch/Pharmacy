import React, { useState, useCallback, useEffect } from 'react';
import { View, Alert, Clipboard } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { usePayments, PaymentProvider } from '@/contexts/PaymentContext';
import { useDistributors, DistributorProvider } from '@/contexts/DistributorContext';
import PaymentsListScreen from '@/components/screens/PaymentsListScreen';
import SharedPaymentScreen from '@/components/screens/SharedPaymentScreen';
import Toast from '@/components/ui/Toast';

/**
 * Payments Screen Content
 * Manages payment list, shared payment handler, and manual entry
 */
function PaymentsScreenContent() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();

  const {
    payments,
    paymentStats,
    isLoading,
    error,
    pagination,
    sharedPaymentText,
    fetchPayments,
    fetchPaymentStats,
    createPayment,
    deletePayment,
    matchDistributor,
    clearSharedPaymentText,
    clearError,
    handleSharedPaymentText,
  } = usePayments();

  const {
    distributors,
    fetchDistributors,
  } = useDistributors();

  // Views: 'list' | 'shared' | 'manual'
  const [currentView, setCurrentView] = useState('list');
  const [matchedDistributor, setMatchedDistributor] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info', title: '' });

  const userId = user?.id;

  // Check if opened with shared text from params
  useEffect(() => {
    if (params?.sharedText) {
      handleSharedPaymentText(params.sharedText);
      setCurrentView('shared');
    }
  }, [params?.sharedText]);

  // If shared text is set externally, switch to shared view
  useEffect(() => {
    if (sharedPaymentText && currentView !== 'shared') {
      setCurrentView('shared');
    }
  }, [sharedPaymentText]);

  // Fetch data on mount
  useEffect(() => {
    if (userId) {
      fetchPayments(userId);
      fetchPaymentStats(userId);
      fetchDistributors(userId);
    }
  }, [userId, fetchPayments, fetchPaymentStats, fetchDistributors]);

  // Try to match distributor when shared text changes
  useEffect(() => {
    async function autoMatch() {
      if (sharedPaymentText && userId) {
        // Parse and try to match
        const { parseUpiPaymentText } = require('@/utils/paymentParser');
        const result = parseUpiPaymentText(sharedPaymentText);
        if (result.data?.payeeName) {
          const matchResult = await matchDistributor(userId, result.data.payeeName);
          if (matchResult?.matched) {
            setMatchedDistributor(matchResult.distributor);
          }
        }
      }
    }
    autoMatch();
  }, [sharedPaymentText, userId, matchDistributor]);

  // Show error toast
  useEffect(() => {
    if (error) {
      showToast(error, 'error', 'Error');
      clearError();
    }
  }, [error, clearError]);

  const showToast = (message, type = 'info', title = '') => {
    setToast({ visible: true, message, type, title });
  };

  const handleBack = useCallback(() => {
    if (currentView === 'shared' || currentView === 'manual') {
      setCurrentView('list');
      clearSharedPaymentText();
      setMatchedDistributor(null);
    } else {
      router.back();
    }
  }, [currentView, router, clearSharedPaymentText]);

  const handleRefresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    await Promise.all([
      fetchPayments(userId),
      fetchPaymentStats(userId),
    ]);
    setRefreshing(false);
  }, [userId, fetchPayments, fetchPaymentStats]);

  const handleAddPayment = useCallback(() => {
    // Open manual entry (empty shared screen for paste/manual input)
    handleSharedPaymentText('');
    setCurrentView('shared');
  }, [handleSharedPaymentText]);

  const handleSavePayment = useCallback(async (paymentData) => {
    if (!userId) return;

    try {
      await createPayment(userId, paymentData);
      showToast('Payment recorded successfully!', 'success', 'Saved');
      setCurrentView('list');
      clearSharedPaymentText();
      setMatchedDistributor(null);

      // Refresh stats
      fetchPaymentStats(userId);
    } catch (err) {
      showToast(err.message || 'Failed to save payment', 'error', 'Error');
    }
  }, [userId, createPayment, clearSharedPaymentText, fetchPaymentStats]);

  const handleDeletePayment = useCallback(async (paymentId) => {
    try {
      await deletePayment(paymentId);
      showToast('Payment deleted', 'success', 'Deleted');
      fetchPaymentStats(userId);
    } catch (err) {
      showToast(err.message || 'Failed to delete payment', 'error', 'Error');
    }
  }, [deletePayment, userId, fetchPaymentStats]);

  const handlePaymentPress = useCallback((payment) => {
    // Show payment details (could be expanded to a detail view)
    Alert.alert(
      'Payment Details',
      [
        `Amount: ₹${payment.amount}`,
        `To: ${payment.distributor?.name || payment.payeeName || 'Unknown'}`,
        `Txn ID: ${payment.transactionId || 'N/A'}`,
        `Date: ${payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString('en-IN') : 'N/A'}`,
        `App: ${payment.paymentApp ? require('@/utils/paymentParser').getPaymentAppName(payment.paymentApp) : 'N/A'}`,
        payment.notes ? `Notes: ${payment.notes}` : '',
      ].filter(Boolean).join('\n'),
      [{ text: 'OK' }]
    );
  }, []);

  const handleLoadMore = useCallback(() => {
    if (!userId || isLoading || pagination.page >= pagination.totalPages) return;
    fetchPayments(userId, { page: pagination.page + 1, limit: 20 });
  }, [userId, isLoading, pagination, fetchPayments]);

  // Render current view
  if (currentView === 'shared') {
    return (
      <>
        <SharedPaymentScreen
          sharedText={sharedPaymentText || ''}
          distributors={distributors}
          onSave={handleSavePayment}
          onBack={handleBack}
          loading={isLoading}
          matchedDistributor={matchedDistributor}
        />
        <Toast
          visible={toast.visible}
          message={toast.message}
          type={toast.type}
          title={toast.title}
          onDismiss={() => setToast({ ...toast, visible: false })}
        />
      </>
    );
  }

  return (
    <>
      <PaymentsListScreen
        payments={payments}
        stats={paymentStats}
        onBack={handleBack}
        onPaymentPress={handlePaymentPress}
        onDeletePayment={handleDeletePayment}
        onAddPayment={handleAddPayment}
        onRefresh={handleRefresh}
        loading={isLoading}
        refreshing={refreshing}
        onLoadMore={handleLoadMore}
        hasMore={pagination.page < pagination.totalPages}
      />
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        title={toast.title}
        onDismiss={() => setToast({ ...toast, visible: false })}
      />
    </>
  );
}

/**
 * Payments Screen with Providers
 */
export default function PaymentsScreen() {
  return (
    <PaymentProvider>
      <DistributorProvider>
        <PaymentsScreenContent />
      </DistributorProvider>
    </PaymentProvider>
  );
}
