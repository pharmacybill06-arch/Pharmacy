import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import AppBar from '@/components/ui/AppBar';
import Card from '@/components/ui/Card';
import FormInput from '@/components/ui/FormInput';
import PrimaryButton from '@/components/ui/PrimaryButton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Toast from '@/components/ui/Toast';
import OnAccountPromptDialog from '@/components/ui/OnAccountPromptDialog';
import { billApi, getFileUrl } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { queryKeys, invalidateBillData } from '@/lib/queryClient';
import { formatDDMMYYYY, ddmmyyyyToIso } from '@/utils/dateFormat';
import { checkBillHeader, DATE_MESSAGES } from '@/utils/dateRules';

const ISSUE_LABEL = {
  MISSING_INVOICE_NUMBER: 'Invoice number nahi hai',
  MISSING_INVOICE_DATE: 'Invoice date nahi hai',
  FUTURE_INVOICE_DATE: 'Date future ki hai',
  DUE_BEFORE_INVOICE: 'Due date invoice date se pehle hai',
};

function photoUrl(bill) {
  const path = bill.filePath || '';
  if (!path || path.startsWith('email://') || path.startsWith('/temp/')) return null;
  if (/\.pdf($|\?)/i.test(path) || bill.mimeType === 'application/pdf') return null;
  if (/^(https?:|file:|content:)/i.test(path)) return path;
  return getFileUrl(path);
}

/** One bill's fill-in card: invoice number + date (+ optional due date), photo alongside. */
function BillDetailsCard({ bill, onSaved, showToast }) {
  const [form, setForm] = useState({
    invoiceNumber: bill.invoiceNumber || '',
    invoiceDate: formatDDMMYYYY(bill.invoiceDate) || '',
    dueDate: formatDDMMYYYY(bill.dueDate) || '',
  });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOld, setConfirmOld] = useState(false);
  const [serverErrors, setServerErrors] = useState({});

  const check = checkBillHeader(form);
  const errors = touched ? { ...serverErrors, ...check.errors } : serverErrors;
  const uri = photoUrl(bill);

  const save = async (confirmOldDate = false) => {
    setTouched(true);
    if (Object.keys(check.errors).length > 0) return;
    if (check.oldDateWarning && !confirmOldDate) {
      setConfirmOld(true);
      return;
    }
    try {
      setSaving(true);
      setServerErrors({});
      const res = await billApi.updateBillHeader(bill.id, {
        invoiceNumber: form.invoiceNumber.trim(),
        invoiceDate: ddmmyyyyToIso(form.invoiceDate),
        dueDate: form.dueDate.trim() ? ddmmyyyyToIso(form.dueDate) : null,
        confirmOldDate,
      });
      onSaved(bill, res);
    } catch (err) {
      if (err.code === 'CONFIRM_OLD_INVOICE_DATE') {
        setConfirmOld(true);
      } else {
        const fe = {};
        for (const e of err.details?.errors || []) fe[e.field] = e.message;
        setServerErrors(fe);
        showToast(err.message || 'Save nahi ho paya', 'error', 'Bill details');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.distributor}>{bill.distributor?.name || bill.pharmacyName || 'Distributor ?'}</ThemedText>
          <ThemedText style={styles.meta}>
            ₹{Number(bill.grandTotal || 0).toLocaleString('en-IN')} · upload {formatDDMMYYYY(bill.createdAt)}
          </ThemedText>
        </View>
      </View>
      {(bill.detailIssues || []).length > 0 && (
        <ThemedText style={styles.issues}>
          {(bill.detailIssues || []).map((c) => ISSUE_LABEL[c] || c).join(' · ')}
        </ThemedText>
      )}
      {uri ? <Image source={{ uri }} style={styles.photo} resizeMode="contain" /> : null}
      <FormInput
        label="Invoice Number"
        required
        value={form.invoiceNumber}
        onChangeText={(t) => setForm((f) => ({ ...f, invoiceNumber: t }))}
        placeholder="INV-001"
        error={errors.invoiceNumber}
      />
      <FormInput
        label="Invoice Date"
        required
        value={form.invoiceDate}
        onChangeText={(t) => setForm((f) => ({ ...f, invoiceDate: t }))}
        placeholder="DD-MM-YYYY"
        error={errors.invoiceDate}
      />
      <FormInput
        label="Due Date"
        value={form.dueDate}
        onChangeText={(t) => setForm((f) => ({ ...f, dueDate: t }))}
        placeholder="DD-MM-YYYY (optional)"
        error={errors.dueDate}
      />
      <PrimaryButton title="Save" icon="checkmark" onPress={() => save(false)} loading={saving} disabled={saving} />
      <ConfirmDialog
        visible={confirmOld}
        title="Purani date"
        message={DATE_MESSAGES.oldInvoice}
        type="warning"
        confirmText="Haan, save karein"
        cancelText="Date badlein"
        onConfirm={() => {
          setConfirmOld(false);
          save(true);
        }}
        onCancel={() => setConfirmOld(false)}
      />
    </Card>
  );
}

/**
 * "X bills me details baaki" — every bill missing an invoice number/date (email
 * imports and older bills alike), filled in one place. A bill only joins FIFO
 * auto-allocation once it is complete; its stock and outstanding already count.
 */
export default function NeedsDetailsRoute() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info', title: '' });
  const [prompt, setPrompt] = useState(null);
  const showToast = (message, type = 'info', title = '') => setToast({ visible: true, message, type, title });

  const query = useQuery({
    queryKey: queryKeys.needsDetails(userId),
    queryFn: async () => (await billApi.getBillsNeedingDetails(userId)).bills || [],
    enabled: !!userId,
  });
  const bills = Array.isArray(query.data) ? query.data : [];

  const handleSaved = useCallback(async (bill, res) => {
    showToast('Bill complete ho gaya', 'success', 'Saved');
    await invalidateBillData(userId);
    if (res?.onAccountPrompt) setPrompt(res.onAccountPrompt);
  }, [userId]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <AppBar title="Bills me details baaki" onBack={() => router.back()} />
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}
        >
          <ThemedText style={styles.intro}>
            Invoice number aur date bharne tak ye bills payment ke auto-allocation me nahi aate. Stock aur outstanding me ye pehle se gine ja rahe hain.
          </ThemedText>
          {query.isPending ? (
            <ThemedText style={styles.empty}>Loading…</ThemedText>
          ) : bills.length === 0 ? (
            <ThemedText style={styles.empty}>Sab bills complete hain.</ThemedText>
          ) : (
            bills.map((bill) => (
              <BillDetailsCard key={bill.id} bill={bill} onSaved={handleSaved} showToast={showToast} />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
      <OnAccountPromptDialog
        prompt={prompt}
        onDone={async ({ applied, error }) => {
          setPrompt(null);
          if (error) showToast(error.message, 'error', 'Advance');
          else if (applied > 0) {
            showToast(`₹${applied.toLocaleString('en-IN')} advance adjust ho gaya`, 'success', 'Advance');
            await invalidateBillData(userId);
          }
        }}
      />
      <Toast {...toast} onHide={() => setToast((t) => ({ ...t, visible: false }))} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 40 },
  intro: { fontSize: 12, color: '#64748B', marginBottom: 12, lineHeight: 17 },
  empty: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginTop: 40 },
  card: { padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  distributor: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  meta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  issues: { fontSize: 12, color: '#B45309', fontWeight: '600', marginBottom: 10 },
  photo: { width: '100%', height: 200, borderRadius: 10, backgroundColor: '#0F172A', marginBottom: 12 },
});
