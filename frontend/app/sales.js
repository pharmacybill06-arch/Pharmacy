import React, { useState, useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { SalesProvider, useSales } from '@/contexts/SalesContext';
import QuickSellScreen from '@/components/screens/QuickSellScreen';
import DailySaleRegisterScreen from '@/components/screens/DailySaleRegisterScreen';
import PendingBillsScreen from '@/components/screens/PendingBillsScreen';
import Toast from '@/components/ui/Toast';

/**
 * Quick Sell + Daily Sale Register.
 *
 * Views: register (default) | sell | pending
 * Deep link: /sales?view=sell opens Quick Sell straight from the home screen or a
 * product row, so a sale is always one tap away.
 */
function SalesScreenContent() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const userId = user?.id;

  const {
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
    clearError,
  } = useSales();

  const [view, setView] = useState(params?.view === 'sell' ? 'sell' : 'register');
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info', title: '' });

  const showToast = useCallback(
    (message, type = 'info', title = '') => setToast({ visible: true, message, type, title }),
    []
  );
  const hideToast = useCallback(() => setToast((t) => ({ ...t, visible: false })), []);

  useEffect(() => {
    if (userId) fetchRegister(userId);
  }, [userId, fetchRegister]);

  useEffect(() => {
    if (error) {
      showToast(error, 'error', 'Error');
      clearError();
    }
  }, [error, clearError, showToast]);

  const handleBack = useCallback(() => {
    if (view === 'register') {
      router.back();
    } else {
      setView('register');
      fetchRegister(userId, registerDate);
    }
  }, [view, router, fetchRegister, userId, registerDate]);

  const handleSaveSale = useCallback(async (data) => {
    try {
      const response = await createSale(userId, data);
      const firstItem = response.sale.items[0];
      const summary = firstItem
        ? `${firstItem.quantityLabel} ${firstItem.productName}`
        : `${response.sale.itemCount} items`;

      if (response.warnings?.length > 0) {
        // Stock mismatch is surfaced, never blocking — the sale is already saved
        showToast(response.warnings[0], 'warning', 'Sale recorded · stock mismatch');
      } else if (response.sale.status === 'billed') {
        showToast(`Sale recorded and billed · ${summary}`, 'success', 'Schedule sale billed');
      } else {
        showToast(`Sale recorded · ${summary}`, 'success', 'Saved');
      }
      setView('register');
    } catch (err) {
      showToast(err.message || 'Failed to record sale', 'error', 'Save Failed');
    }
  }, [createSale, userId, showToast]);

  const handleOpenPending = useCallback(async () => {
    setView('pending');
    await fetchPending(userId);
  }, [fetchPending, userId]);

  const handleConvert = useCallback(async (saleId, data) => {
    try {
      await convertToBill(userId, saleId, data);
      showToast('Bill created successfully', 'success', 'Billed');
    } catch (err) {
      showToast(err.message || 'Failed to create bill', 'error', 'Error');
    }
  }, [convertToBill, userId, showToast]);

  const handleConvertMany = useCallback(async (saleIds) => {
    let ok = 0;
    const failures = [];
    for (const saleId of saleIds) {
      try {
        // Prices already on the sale lines carry over untouched
        await convertToBill(userId, saleId, {});
        ok++;
      } catch (err) {
        failures.push(err.message);
      }
    }
    if (failures.length === 0) {
      showToast(`${ok} sale${ok === 1 ? '' : 's'} billed`, 'success', 'Billed');
    } else {
      showToast(`${ok} billed, ${failures.length} failed: ${failures[0]}`, 'warning', 'Partially billed');
    }
  }, [convertToBill, userId, showToast]);

  const handleSalePress = useCallback(async (sale) => {
    // A quick sale taps straight through to its billing form; an already-billed
    // one has nothing to do here.
    if (sale?.status === 'quick') {
      await handleOpenPending();
    }
  }, [handleOpenPending]);

  if (view === 'sell') {
    return (
      <View style={{ flex: 1 }}>
        <QuickSellScreen
          userId={userId}
          onBack={handleBack}
          onSave={handleSaveSale}
          fetchBatches={fetchBatches}
          previewAllocation={previewAllocation}
          isSaving={isSaving}
        />
        <Toast {...toast} onHide={hideToast} />
      </View>
    );
  }

  if (view === 'pending') {
    return (
      <View style={{ flex: 1 }}>
        <PendingBillsScreen
          pending={pending}
          loading={isLoading}
          isSaving={isSaving}
          onBack={handleBack}
          onConvert={handleConvert}
          onConvertMany={handleConvertMany}
        />
        <Toast {...toast} onHide={hideToast} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <DailySaleRegisterScreen
        register={register}
        registerDate={registerDate}
        searchResults={searchResults}
        loading={isLoading}
        onBack={() => router.back()}
        onChangeDate={(date) => fetchRegister(userId, date)}
        onSearch={(query) => searchSales(userId, query)}
        onClearSearch={clearSearch}
        onSalePress={handleSalePress}
        onSellPress={() => setView('sell')}
        onPendingPress={handleOpenPending}
      />
      <Toast {...toast} onHide={hideToast} />
    </View>
  );
}

export default function SalesScreen() {
  return (
    <SalesProvider>
      <SalesScreenContent />
    </SalesProvider>
  );
}
