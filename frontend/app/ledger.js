import React, { useState, useCallback, useEffect } from 'react';
import { View, Modal, StyleSheet, TextInput, Pressable, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { LedgerProvider, useLedger } from '@/contexts/LedgerContext';
import { DistributorProvider, useDistributors } from '@/contexts/DistributorContext';
import { billApi } from '@/services/api';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import DateField from '@/components/ui/DateField';
import DistributorLedgerListScreen from '@/components/screens/DistributorLedgerListScreen';
import DistributorLedgerDetailScreen from '@/components/screens/DistributorLedgerDetailScreen';
import RecordPaymentScreen from '@/components/screens/RecordPaymentScreen';
import Toast from '@/components/ui/Toast';

function isoToDdmmyyyy(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function ddmmyyyyToIso(value) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value || '');
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Picker shown when "Record Payment" is triggered without a distributor pre-selected.
 */
function DistributorPickerModal({ visible, distributors, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const filtered = distributors.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <AppBar title="Select Distributor" onBack={onClose} />
        <View style={styles.pickerSearchRow}>
          <Ionicons name="search" size={18} color="#94A3B8" />
          <TextInput
            style={styles.pickerSearchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search distributors..."
            placeholderTextColor="#94A3B8"
            autoFocus
          />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {filtered.map((d) => (
            <Pressable key={d.id} style={styles.pickerRow} onPress={() => onSelect(d)}>
              <View style={styles.pickerAvatar}>
                <ThemedText style={styles.pickerAvatarText}>{d.name.charAt(0).toUpperCase()}</ThemedText>
              </View>
              <ThemedText style={styles.pickerRowText}>{d.name}</ThemedText>
            </Pressable>
          ))}
          {filtered.length === 0 && (
            <ThemedText style={styles.pickerEmptyText}>No distributors found</ThemedText>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

/**
 * Edit distributor opening balance, with a mandatory audit note.
 */
function OpeningBalanceModal({ visible, distributor, onSave, onClose }) {
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (visible) {
      setValue(distributor?.openingBalance ? String(distributor.openingBalance) : '0');
      setNote('');
    }
  }, [visible, distributor]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.dialogCard}>
          <ThemedText style={styles.dialogTitle}>Edit Opening Balance</ThemedText>
          <ThemedText style={styles.dialogLabel}>Amount</ThemedText>
          <TextInput
            style={styles.dialogInput}
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
          />
          <ThemedText style={styles.dialogLabel}>Note (why is this changing?)</ThemedText>
          <TextInput
            style={[styles.dialogInput, { minHeight: 60 }]}
            value={note}
            onChangeText={setNote}
            placeholder="e.g., Corrected from printed CURRANT BAL"
            placeholderTextColor="#94A3B8"
            multiline
          />
          <View style={styles.dialogButtons}>
            <Pressable style={styles.dialogCancel} onPress={onClose}>
              <ThemedText style={styles.dialogCancelText}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={styles.dialogConfirm}
              onPress={() => onSave(parseFloat(value) || 0, note)}
            >
              <ThemedText style={styles.dialogConfirmText}>Save</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Confirm a bill's grand total / due date (Phase 1: always manually confirmed).
 */
function BillConfirmModal({ visible, bill, onSave, onClose }) {
  const [grandTotal, setGrandTotal] = useState('');
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    if (visible && bill) {
      setGrandTotal(bill.grandTotal != null ? String(bill.grandTotal) : '');
      setDueDate(isoToDdmmyyyy(bill.dueDate));
    }
  }, [visible, bill]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.dialogCard}>
          <ThemedText style={styles.dialogTitle}>Confirm Bill {bill?.invoiceNumber || ''}</ThemedText>
          <ThemedText style={styles.dialogLabel}>Grand Total (₹)</ThemedText>
          <TextInput
            style={styles.dialogInput}
            value={grandTotal}
            onChangeText={setGrandTotal}
            keyboardType="decimal-pad"
            placeholder="0"
          />
          <DateField label="Due Date" value={dueDate} onChange={setDueDate} />
          <View style={styles.dialogButtons}>
            <Pressable style={styles.dialogCancel} onPress={onClose}>
              <ThemedText style={styles.dialogCancelText}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={styles.dialogConfirm}
              onPress={() => onSave({
                grandTotal: parseFloat(grandTotal) || 0,
                dueDate: ddmmyyyyToIso(dueDate),
              })}
            >
              <ThemedText style={styles.dialogConfirmText}>Save</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function LedgerScreenContent() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;

  const {
    summary,
    distributorLedger,
    isLoading,
    error,
    fetchSummary,
    fetchDistributorLedger,
    getAllocationTargets,
    uploadAttachment,
    recordPayment,
    archivePayment,
    updateOpeningBalance,
    clearError,
    clearDistributorLedger,
  } = useLedger();

  const { distributors, fetchDistributors } = useDistributors();

  const [view, setView] = useState('list'); // list | detail | pick-distributor | record
  const [recordingDistributor, setRecordingDistributor] = useState(null);
  const [allocationTargets, setAllocationTargets] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info', title: '' });
  const [openingBalanceModalVisible, setOpeningBalanceModalVisible] = useState(false);
  const [billModal, setBillModal] = useState(null); // bill being confirmed

  useEffect(() => {
    if (userId) {
      fetchSummary(userId);
      fetchDistributors(userId);
    }
  }, [userId, fetchSummary, fetchDistributors]);

  useEffect(() => {
    if (error) {
      showToast(error, 'error', 'Error');
      clearError();
    }
  }, [error, clearError]);

  const showToast = (message, type = 'info', title = '') => setToast({ visible: true, message, type, title });
  const hideToast = () => setToast((t) => ({ ...t, visible: false }));

  const handleBack = useCallback(() => {
    if (view === 'record') {
      setView(recordingDistributor && distributorLedger?.distributor?.id === recordingDistributor.id ? 'detail' : 'list');
    } else if (view === 'detail') {
      setView('list');
      clearDistributorLedger();
    } else {
      router.back();
    }
  }, [view, recordingDistributor, distributorLedger, router, clearDistributorLedger]);

  const handleDistributorPress = useCallback(async (distributor) => {
    await fetchDistributorLedger(distributor.id);
    setView('detail');
  }, [fetchDistributorLedger]);

  const openRecordPaymentFor = useCallback(async (distributor) => {
    setRecordingDistributor(distributor);
    const targets = await getAllocationTargets(distributor.id);
    setAllocationTargets(targets);
    setView('record');
  }, [getAllocationTargets]);

  const handleRecordPaymentFromList = useCallback(() => {
    setView('pick-distributor');
  }, []);

  const handleRecordPaymentFromDetail = useCallback(() => {
    if (distributorLedger?.distributor) {
      openRecordPaymentFor(distributorLedger.distributor);
    }
  }, [distributorLedger, openRecordPaymentFor]);

  const handlePickDistributor = useCallback((distributor) => {
    openRecordPaymentFor(distributor);
  }, [openRecordPaymentFor]);

  const handleSavePayment = useCallback(async (data) => {
    try {
      const response = await recordPayment(userId, recordingDistributor.id, data);
      if (response.duplicateWarning) {
        showToast('Saved — note: a payment with the same amount and date already exists for this distributor.', 'warning', 'Possible duplicate');
      } else {
        showToast('Payment recorded successfully', 'success', 'Saved');
      }
      await fetchSummary(userId);
      if (distributorLedger?.distributor?.id === recordingDistributor.id) {
        setView('detail');
      } else {
        await fetchDistributorLedger(recordingDistributor.id);
        setView('detail');
      }
    } catch (err) {
      showToast(err.message || 'Failed to record payment', 'error', 'Error');
    }
  }, [recordPayment, userId, recordingDistributor, fetchSummary, distributorLedger, fetchDistributorLedger]);

  const handleUploadAttachment = useCallback(async (uid, uri, mimeType) => {
    return uploadAttachment(uid, uri, mimeType);
  }, [uploadAttachment]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSummary(userId);
    setRefreshing(false);
  }, [userId, fetchSummary]);

  const handleEditOpeningBalance = useCallback(() => setOpeningBalanceModalVisible(true), []);

  const handleSaveOpeningBalance = useCallback(async (amount, note) => {
    try {
      await updateOpeningBalance(distributorLedger.distributor.id, { openingBalance: amount, note });
      setOpeningBalanceModalVisible(false);
      showToast('Opening balance updated', 'success', 'Saved');
      await fetchSummary(userId);
    } catch (err) {
      showToast(err.message || 'Failed to update opening balance', 'error', 'Error');
    }
  }, [updateOpeningBalance, distributorLedger, fetchSummary, userId]);

  const handleBillPress = useCallback((bill) => setBillModal(bill), []);

  const handleSaveBill = useCallback(async (data) => {
    try {
      await billApi.updateBill(billModal.id, data);
      setBillModal(null);
      showToast('Bill updated', 'success', 'Saved');
      await fetchDistributorLedger(distributorLedger.distributor.id);
      await fetchSummary(userId);
    } catch (err) {
      showToast(err.message || 'Failed to update bill', 'error', 'Error');
    }
  }, [billModal, fetchDistributorLedger, distributorLedger, fetchSummary, userId]);

  const handlePaymentPress = useCallback((payment) => {
    Alert.alert(
      `${payment.paymentMethod?.toUpperCase() || 'Payment'} — ₹${payment.amount}`,
      payment.referenceNumber ? `Ref: ${payment.referenceNumber}` : undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive Payment',
          style: 'destructive',
          onPress: async () => {
            try {
              await archivePayment(payment.id, distributorLedger.distributor.id);
              showToast('Payment archived', 'success', 'Archived');
              await fetchSummary(userId);
            } catch (err) {
              showToast(err.message || 'Failed to archive payment', 'error', 'Error');
            }
          },
        },
      ]
    );
  }, [archivePayment, distributorLedger, fetchSummary, userId]);

  if (view === 'record') {
    return (
      <View style={{ flex: 1 }}>
        <RecordPaymentScreen
          distributor={recordingDistributor}
          userId={userId}
          allocationTargets={allocationTargets}
          onBack={handleBack}
          onSave={handleSavePayment}
          onUploadAttachment={handleUploadAttachment}
          isLoading={isLoading}
        />
        <Toast {...toast} onHide={hideToast} />
      </View>
    );
  }

  if (view === 'detail') {
    return (
      <View style={{ flex: 1 }}>
        <DistributorLedgerDetailScreen
          distributor={distributorLedger?.distributor}
          bills={distributorLedger?.bills || []}
          payments={distributorLedger?.payments || []}
          ledgerRows={distributorLedger?.ledgerRows || []}
          onBack={handleBack}
          onRecordPayment={handleRecordPaymentFromDetail}
          onBillPress={handleBillPress}
          onPaymentPress={handlePaymentPress}
          onEditOpeningBalance={handleEditOpeningBalance}
          loading={isLoading}
        />
        <OpeningBalanceModal
          visible={openingBalanceModalVisible}
          distributor={distributorLedger?.distributor}
          onSave={handleSaveOpeningBalance}
          onClose={() => setOpeningBalanceModalVisible(false)}
        />
        <BillConfirmModal
          visible={!!billModal}
          bill={billModal}
          onSave={handleSaveBill}
          onClose={() => setBillModal(null)}
        />
        <Toast {...toast} onHide={hideToast} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <DistributorLedgerListScreen
        distributors={summary.distributors}
        totalOutstanding={summary.totalOutstanding}
        totalOverdue={summary.totalOverdue}
        onBack={() => router.back()}
        onDistributorPress={handleDistributorPress}
        onRecordPayment={handleRecordPaymentFromList}
        loading={isLoading}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />
      <DistributorPickerModal
        visible={view === 'pick-distributor'}
        distributors={distributors}
        onSelect={handlePickDistributor}
        onClose={() => setView('list')}
      />
      <Toast {...toast} onHide={hideToast} />
    </View>
  );
}

export default function LedgerScreen() {
  return (
    <LedgerProvider>
      <DistributorProvider>
        <LedgerScreenContent />
      </DistributorProvider>
    </LedgerProvider>
  );
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  pickerSearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF',
    marginHorizontal: 16, marginTop: 16, paddingHorizontal: 14, borderRadius: 14,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  pickerSearchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#0F172A' },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14,
    padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0',
  },
  pickerAvatar: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: '#EEF2FF',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  pickerAvatarText: { fontSize: 14, fontWeight: '700', color: '#4F46E5' },
  pickerRowText: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  pickerEmptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 32 },

  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  dialogCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 22, width: '100%', maxWidth: 380 },
  dialogTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A', marginBottom: 16 },
  dialogLabel: { fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  dialogInput: {
    backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0F172A', marginBottom: 14,
  },
  dialogButtons: { flexDirection: 'row', gap: 12, marginTop: 4 },
  dialogCancel: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#F1F5F9' },
  dialogCancelText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  dialogConfirm: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#4F46E5' },
  dialogConfirmText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
