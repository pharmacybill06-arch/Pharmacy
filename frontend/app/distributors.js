import React, { useState, useCallback, useEffect } from 'react';
import { View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useDistributors, DistributorProvider } from '@/contexts/DistributorContext';
import DistributorsListScreen from '@/components/screens/DistributorsListScreen';
import DistributorFormScreen from '@/components/screens/DistributorFormScreen';
import DistributorDetailScreen from '@/components/screens/DistributorDetailScreen';
import Toast from '@/components/ui/Toast';

/**
 * Distributors Screen Content
 * Manages distributor list, form, and detail views
 */
function DistributorsScreenContent() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    distributors,
    selectedDistributor,
    isLoading,
    error,
    fetchDistributors,
    getDistributor,
    getDistributorBills,
    createDistributor,
    updateDistributor,
    deleteDistributor,
    clearSelectedDistributor,
    clearError,
  } = useDistributors();

  const [currentView, setCurrentView] = useState('list'); // 'list' | 'form' | 'detail'
  const [editingDistributor, setEditingDistributor] = useState(null);
  const [distributorBills, setDistributorBills] = useState([]);
  const [billsPage, setBillsPage] = useState(1);
  const [hasMoreBills, setHasMoreBills] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info', title: '' });

  const userId = user?.id;

  // Fetch distributors on mount
  useEffect(() => {
    if (userId) {
      fetchDistributors(userId);
    }
  }, [userId, fetchDistributors]);

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

  const hideToast = () => {
    setToast({ ...toast, visible: false });
  };

  // Navigate back
  const handleBack = useCallback(() => {
    if (currentView === 'form') {
      setCurrentView(editingDistributor ? 'detail' : 'list');
      setEditingDistributor(null);
    } else if (currentView === 'detail') {
      setCurrentView('list');
      clearSelectedDistributor();
      setDistributorBills([]);
    } else {
      router.back();
    }
  }, [currentView, editingDistributor, router, clearSelectedDistributor]);

  // Open distributor detail
  const handleDistributorPress = useCallback(async (distributor) => {
    await getDistributor(distributor.id);
    
    // Load bills
    const billsResult = await getDistributorBills(distributor.id, { page: 1, limit: 10 });
    setDistributorBills(billsResult.bills || []);
    setBillsPage(1);
    setHasMoreBills((billsResult.bills?.length || 0) < (billsResult.total || 0));
    
    setCurrentView('detail');
  }, [getDistributor, getDistributorBills]);

  // Open add form
  const handleAddPress = useCallback(() => {
    setEditingDistributor(null);
    setCurrentView('form');
  }, []);

  // Open edit form
  const handleEditPress = useCallback(() => {
    setEditingDistributor(selectedDistributor);
    setCurrentView('form');
  }, [selectedDistributor]);

  // Handle form save
  const handleSave = useCallback(async (data) => {
    try {
      if (editingDistributor) {
        await updateDistributor(editingDistributor.id, data);
        showToast('Distributor updated successfully', 'success', 'Updated');
        
        // Refresh detail view
        await getDistributor(editingDistributor.id);
      } else {
        await createDistributor(userId, data);
        showToast('Distributor added successfully', 'success', 'Created');
      }
      
      setCurrentView(editingDistributor ? 'detail' : 'list');
      setEditingDistributor(null);
    } catch (err) {
      showToast(err.message || 'Failed to save distributor', 'error', 'Error');
    }
  }, [editingDistributor, userId, createDistributor, updateDistributor, getDistributor]);

  // Handle delete
  const handleDelete = useCallback(async () => {
    try {
      await deleteDistributor(selectedDistributor.id);
      showToast('Distributor deleted successfully', 'success', 'Deleted');
      setCurrentView('list');
      clearSelectedDistributor();
    } catch (err) {
      showToast(err.message || 'Failed to delete distributor', 'error', 'Error');
    }
  }, [selectedDistributor, deleteDistributor, clearSelectedDistributor]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    await fetchDistributors(userId);
    setRefreshing(false);
  }, [userId, fetchDistributors]);

  // Load more bills
  const handleLoadMoreBills = useCallback(async () => {
    if (!selectedDistributor || !hasMoreBills) return;
    
    const nextPage = billsPage + 1;
    const billsResult = await getDistributorBills(selectedDistributor.id, { page: nextPage, limit: 10 });
    
    setDistributorBills(prev => [...prev, ...(billsResult.bills || [])]);
    setBillsPage(nextPage);
    setHasMoreBills(distributorBills.length + (billsResult.bills?.length || 0) < (billsResult.total || 0));
  }, [selectedDistributor, hasMoreBills, billsPage, distributorBills.length, getDistributorBills]);

  // Handle bill press (navigate to bill detail)
  const handleBillPress = useCallback((bill) => {
    // TODO: Navigate to bill detail
    console.log('Bill pressed:', bill.id);
  }, []);

  // Render based on current view
  if (currentView === 'form') {
    return (
      <View style={{ flex: 1 }}>
        <DistributorFormScreen
          distributor={editingDistributor}
          onBack={handleBack}
          onSave={handleSave}
          isLoading={isLoading}
        />
        <Toast
          visible={toast.visible}
          message={toast.message}
          type={toast.type}
          title={toast.title}
          onHide={hideToast}
        />
      </View>
    );
  }

  if (currentView === 'detail') {
    return (
      <View style={{ flex: 1 }}>
        <DistributorDetailScreen
          distributor={selectedDistributor}
          bills={distributorBills}
          onBack={handleBack}
          onEdit={handleEditPress}
          onDelete={handleDelete}
          onBillPress={handleBillPress}
          onLoadMoreBills={handleLoadMoreBills}
          loading={isLoading}
          hasMoreBills={hasMoreBills}
        />
        <Toast
          visible={toast.visible}
          message={toast.message}
          type={toast.type}
          title={toast.title}
          onHide={hideToast}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <DistributorsListScreen
        distributors={distributors}
        onDistributorPress={handleDistributorPress}
        onAddPress={handleAddPress}
        onBack={handleBack}
        onRefresh={handleRefresh}
        loading={isLoading}
        refreshing={refreshing}
      />
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        title={toast.title}
        onHide={hideToast}
      />
    </View>
  );
}

/**
 * Distributors Screen
 * Wraps content with DistributorProvider
 */
export default function DistributorsScreen() {
  return (
    <DistributorProvider>
      <DistributorsScreenContent />
    </DistributorProvider>
  );
}
