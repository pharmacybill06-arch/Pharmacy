import React, { useState, useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { billApi } from '@/services/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, invalidateBillData } from '@/lib/queryClient';
import BillsListScreen from '@/components/screens/BillsListScreen';
import BillDetailsScreen from '@/components/screens/BillDetailsScreen';
import BillFormRedesigned from '@/components/bill-form/BillFormRedesigned';
import Toast from '@/components/ui/Toast';
import ScreenTransition, { useTransitionDirection } from '@/components/ui/ScreenTransition';

/**
 * All purchase bills, searchable by invoice number.
 *
 * BillsListScreen already existed — search bar, cards, empty state and all — but was
 * never given a route, so the only place to browse bills on the phone was inside a
 * single distributor. The home screen's "view all" pointed at /explore (the scan tab)
 * with a TODO; it now lands here.
 *
 * Bills arrive ordered by the date printed ON the bill (newest first), not by when they
 * were uploaded — the backend does that sorting, so nothing re-sorts them here.
 */
export default function BillsRoute() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;

  const [viewingBill, setViewingBill] = useState(null);
  const [editingBill, setEditingBill] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info', title: '' });

  const showToast = (message, type = 'info', title = '') =>
    setToast({ visible: true, message, type, title });
  const hideToast = () => setToast((t) => ({ ...t, visible: false }));

  // Same cache key as the Home screen, so arriving here from Home is instant: the
  // bills are already loaded and this just revalidates them in the background.
  const queryClient = useQueryClient();
  const billsQuery = useQuery({
    queryKey: queryKeys.bills(userId),
    queryFn: async () => (await billApi.getUserBills(userId)).bills || [],
    enabled: !!userId,
  });
  const bills = billsQuery.data ?? [];
  const loading = billsQuery.isPending && !billsQuery.data;
  const fetchBills = billsQuery.refetch;

  useEffect(() => {
    if (billsQuery.error && !billsQuery.data) {
      showToast(billsQuery.error.message || 'Failed to load bills', 'error', 'Error');
    }
  }, [billsQuery.error, billsQuery.data]);

  const setBills = useCallback(
    (updater) =>
      queryClient.setQueryData(queryKeys.bills(userId), (prev = []) =>
        typeof updater === 'function' ? updater(prev) : updater
      ),
    [queryClient, userId]
  );

  // Keep the list, the open bill and the row in step after any edit — same rule as the
  // distributor screen: a date change must not leave two views disagreeing.
  const handleBillChanged = useCallback(
    async (updatedBill) => {
      if (updatedBill?.id) {
        setBills((prev) => prev.map((b) => (b.id === updatedBill.id ? { ...b, ...updatedBill } : b)));
        setViewingBill((prev) => (prev && prev.id === updatedBill.id ? { ...prev, ...updatedBill } : prev));
      }
      await invalidateBillData(userId);
    },
    [setBills, userId]
  );

  const handleSaveBillEdit = useCallback(
    async (formData) => {
      try {
        await billApi.updateBill(editingBill.id, formData);
        setEditingBill(null);
        showToast('Bill updated successfully', 'success', 'Updated');
        await invalidateBillData(userId);
      } catch (err) {
        showToast(err.message || 'Failed to save bill', 'error', 'Error');
      }
    },
    [editingBill, userId]
  );

  // How deep the current in-place view is: list 0, detail 1, edit 2+.
  const transition = useTransitionDirection(editingBill ? 2 : viewingBill ? 1 : 0);

  if (editingBill) {
    return (
      <ScreenTransition key="edit" direction={transition}>
        <BillFormRedesigned
          initialData={editingBill}
          onSubmit={handleSaveBillEdit}
          onCancel={() => setEditingBill(null)}
        />
        <Toast {...toast} onHide={hideToast} />
      </ScreenTransition>
    );
  }

  if (viewingBill) {
    return (
      <ScreenTransition key="detail" direction={transition}>
        <BillDetailsScreen
          bill={viewingBill}
          userId={userId}
          onBack={() => setViewingBill(null)}
          onEdit={(bill) => {
            setViewingBill(null);
            setEditingBill(bill);
          }}
          onRefresh={handleBillChanged}
        />
        <Toast {...toast} onHide={hideToast} />
      </ScreenTransition>
    );
  }

  return (
    <ScreenTransition key="list" direction={transition}>
      <BillsListScreen
        bills={bills}
        loading={loading}
        refreshing={billsQuery.isRefetching}
        onRefresh={fetchBills}
        onBillPress={setViewingBill}
        onBack={() => router.back()}
      />
      <Toast {...toast} onHide={hideToast} />
    </ScreenTransition>
  );
}
