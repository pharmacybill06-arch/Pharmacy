import React, { useState, useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { billApi } from '@/services/api';
import BillsListScreen from '@/components/screens/BillsListScreen';
import BillDetailsScreen from '@/components/screens/BillDetailsScreen';
import BillFormRedesigned from '@/components/bill-form/BillFormRedesigned';
import Toast from '@/components/ui/Toast';

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

  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingBill, setViewingBill] = useState(null);
  const [editingBill, setEditingBill] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info', title: '' });

  const showToast = (message, type = 'info', title = '') =>
    setToast({ visible: true, message, type, title });
  const hideToast = () => setToast((t) => ({ ...t, visible: false }));

  const fetchBills = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const res = await billApi.getUserBills(userId);
      setBills(res.bills || []);
    } catch (err) {
      showToast(err.message || 'Failed to load bills', 'error', 'Error');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  // Keep the list, the open bill and the row in step after any edit — same rule as the
  // distributor screen: a date change must not leave two views disagreeing.
  const handleBillChanged = useCallback(
    async (updatedBill) => {
      if (updatedBill?.id) {
        setBills((prev) => prev.map((b) => (b.id === updatedBill.id ? { ...b, ...updatedBill } : b)));
        setViewingBill((prev) => (prev && prev.id === updatedBill.id ? { ...prev, ...updatedBill } : prev));
      }
      await fetchBills();
    },
    [fetchBills]
  );

  const handleSaveBillEdit = useCallback(
    async (formData) => {
      try {
        await billApi.updateBill(editingBill.id, formData);
        setEditingBill(null);
        showToast('Bill updated successfully', 'success', 'Updated');
        await fetchBills();
      } catch (err) {
        showToast(err.message || 'Failed to save bill', 'error', 'Error');
      }
    },
    [editingBill, fetchBills]
  );

  if (editingBill) {
    return (
      <View style={{ flex: 1 }}>
        <BillFormRedesigned
          initialData={editingBill}
          onSubmit={handleSaveBillEdit}
          onCancel={() => setEditingBill(null)}
        />
        <Toast {...toast} onHide={hideToast} />
      </View>
    );
  }

  if (viewingBill) {
    return (
      <View style={{ flex: 1 }}>
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
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <BillsListScreen
        bills={bills}
        loading={loading}
        onBillPress={setViewingBill}
        onBack={() => router.back()}
      />
      <Toast {...toast} onHide={hideToast} />
    </View>
  );
}
