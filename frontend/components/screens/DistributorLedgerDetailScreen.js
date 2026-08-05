import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import Card from '@/components/ui/Card';
import Chip from '@/components/ui/Chip';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { getFileUrl } from '@/services/api';

function formatAmount(amount) {
  const n = parseFloat(amount) || 0;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatDate(dateString, opts) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', opts || { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_VARIANT = { unpaid: 'default', partial: 'warning', paid: 'success', overdue: 'danger' };
const STATUS_LABEL = { unpaid: 'Unpaid', partial: 'Partial', paid: 'Paid', overdue: 'Overdue' };

const MODE_ICON = {
  upi: 'phone-portrait-outline',
  cash: 'cash-outline',
  cheque: 'document-text-outline',
  neft_rtgs: 'swap-horizontal-outline',
  credit_note: 'receipt-outline',
};
const MODE_LABEL = {
  upi: 'UPI',
  cash: 'Cash',
  cheque: 'Cheque',
  neft_rtgs: 'NEFT/RTGS',
  credit_note: 'Credit Note',
};

function TabBar({ active, onChange }) {
  const tabs = [
    { key: 'bills', label: 'Bills' },
    { key: 'payments', label: 'Payments' },
    { key: 'ledger', label: 'Ledger' },
  ];
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          style={[styles.tabButton, active === tab.key && styles.tabButtonActive]}
          onPress={() => onChange(tab.key)}
        >
          <ThemedText style={[styles.tabButtonText, active === tab.key && styles.tabButtonTextActive]}>
            {tab.label}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

const BillRow = React.memo(({ bill, onPress }) => (
  <Pressable onPress={() => onPress?.(bill)} style={({ pressed }) => [styles.billCard, pressed && styles.rowPressed]}>
    <View style={styles.billCardTop}>
      <ThemedText style={styles.billInvoice} numberOfLines={1}>
        {bill.invoiceNumber || `Invoice (${bill.id.slice(-6)})`}
      </ThemedText>
      <Chip label={STATUS_LABEL[bill.status] || bill.status} variant={STATUS_VARIANT[bill.status] || 'default'} />
    </View>
    <View style={styles.billCardDates}>
      <ThemedText style={styles.billDateText}>Billed {formatDate(bill.invoiceDate || bill.createdAt)}</ThemedText>
      {bill.dueDate && <ThemedText style={styles.billDateText}>· Due {formatDate(bill.dueDate)}</ThemedText>}
    </View>
    <View style={styles.billCardAmounts}>
      <View style={styles.billAmountBox}>
        <ThemedText style={styles.billAmountLabel}>Billed</ThemedText>
        <ThemedText style={styles.billAmountValue}>{formatAmount(bill.grandTotal)}</ThemedText>
      </View>
      <View style={styles.billAmountBox}>
        <ThemedText style={styles.billAmountLabel}>Paid</ThemedText>
        <ThemedText style={[styles.billAmountValue, { color: '#059669' }]}>{formatAmount(bill.paidAmount)}</ThemedText>
      </View>
      <View style={styles.billAmountBox}>
        <ThemedText style={styles.billAmountLabel}>Balance</ThemedText>
        <ThemedText style={[styles.billAmountValue, bill.balance > 0 && { color: '#DC2626' }]}>
          {formatAmount(bill.balance)}
        </ThemedText>
      </View>
    </View>
  </Pressable>
));
BillRow.displayName = 'BillRow';

const PaymentRow = React.memo(({ payment, onPress }) => (
  <Pressable onPress={() => onPress?.(payment)} style={({ pressed }) => [styles.paymentCard, pressed && styles.rowPressed]}>
    <View style={styles.paymentIconWrap}>
      <Ionicons name={MODE_ICON[payment.paymentMethod] || 'cash-outline'} size={20} color="#4F46E5" />
    </View>
    <View style={styles.paymentMain}>
      <View style={styles.paymentTopLine}>
        <ThemedText style={styles.paymentAmount}>{formatAmount(payment.amount)}</ThemedText>
        <ThemedText style={styles.paymentMode}>{MODE_LABEL[payment.paymentMethod] || payment.paymentMethod}</ThemedText>
      </View>
      <ThemedText style={styles.paymentMeta}>
        {formatDate(payment.paymentDate)}
        {payment.referenceNumber ? ` · Ref ${payment.referenceNumber}` : ''}
      </ThemedText>
      {payment.allocations?.length > 0 && (
        <ThemedText style={styles.paymentAllocations} numberOfLines={1}>
          {payment.allocations.map((a) =>
            a.allocationType === 'opening_balance' ? 'Opening balance' :
            a.allocationType === 'on_account' ? 'On account' :
            a.bill?.invoiceNumber || 'Invoice'
          ).join(', ')}
        </ThemedText>
      )}
    </View>
    {payment.screenshotPath ? (
      <Image source={{ uri: getFileUrl(payment.screenshotPath) }} style={styles.paymentThumb} />
    ) : (
      <View style={styles.paymentThumbPlaceholder}>
        <Ionicons name="image-outline" size={16} color="#CBD5E1" />
      </View>
    )}
  </Pressable>
));
PaymentRow.displayName = 'PaymentRow';

const LedgerStatementRow = React.memo(({ row }) => (
  <View style={styles.ledgerRow}>
    <View style={styles.ledgerRowLeft}>
      <ThemedText style={styles.ledgerDate}>{formatDate(row.date, { day: '2-digit', month: 'short', year: '2-digit' })}</ThemedText>
      <ThemedText style={styles.ledgerParticulars} numberOfLines={2}>{row.particulars}</ThemedText>
    </View>
    <View style={styles.ledgerRowRight}>
      <ThemedText style={[styles.ledgerAmount, row.debit > 0 && styles.ledgerDebit]}>
        {row.debit > 0 ? formatAmount(row.debit) : '—'}
      </ThemedText>
      <ThemedText style={[styles.ledgerAmount, row.credit > 0 && styles.ledgerCredit]}>
        {row.credit > 0 ? formatAmount(row.credit) : '—'}
      </ThemedText>
      <ThemedText style={styles.ledgerRunning}>{formatAmount(row.runningBalance)}</ThemedText>
    </View>
  </View>
));
LedgerStatementRow.displayName = 'LedgerStatementRow';

/**
 * Screen B — Distributor Ledger Detail
 */
export default function DistributorLedgerDetailScreen({
  distributor,
  bills = [],
  payments = [],
  ledgerRows = [],
  onBack,
  onRecordPayment,
  onBillPress,
  onPaymentPress,
  onEditOpeningBalance,
  loading = false,
}) {
  const [activeTab, setActiveTab] = useState('bills');

  const overdueBills = useMemo(() => bills.filter((b) => b.status === 'overdue'), [bills]);

  if (!distributor) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <AppBar title="Distributor" onBack={onBack} />
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4F46E5" />
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <AppBar title={distributor.name} onBack={onBack} />

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Header card */}
          <Card style={styles.headerCard}>
            <View style={styles.headerTop}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.headerName}>{distributor.name}</ThemedText>
                {distributor.phone && (
                  <Pressable onPress={() => Linking.openURL(`tel:${distributor.phone}`)} style={styles.phoneRow}>
                    <Ionicons name="call-outline" size={14} color="#4F46E5" />
                    <ThemedText style={styles.phoneText}>{distributor.phone}</ThemedText>
                  </Pressable>
                )}
              </View>
            </View>

            <View style={styles.outstandingBlock}>
              <ThemedText style={styles.outstandingLabel}>Outstanding Balance</ThemedText>
              <ThemedText style={[styles.outstandingValue, distributor.outstanding <= 0 && { color: '#059669' }]}>
                {formatAmount(distributor.outstanding)}
              </ThemedText>
              {distributor.overdue > 0 && (
                <View style={styles.overduePill}>
                  <Ionicons name="alert-circle" size={12} color="#DC2626" />
                  <ThemedText style={styles.overduePillText}>{formatAmount(distributor.overdue)} overdue ({overdueBills.length} bill{overdueBills.length !== 1 ? 's' : ''})</ThemedText>
                </View>
              )}
            </View>

            {distributor.openingBalance > 0 && (
              <Pressable onPress={onEditOpeningBalance} style={styles.openingBalanceRow}>
                <ThemedText style={styles.openingBalanceLabel}>Opening balance</ThemedText>
                <View style={styles.openingBalanceValueRow}>
                  <ThemedText style={styles.openingBalanceValue}>{formatAmount(distributor.openingBalance)}</ThemedText>
                  {distributor.openingBalanceRemaining < distributor.openingBalance && (
                    <ThemedText style={styles.openingBalanceSettled}>
                      ({formatAmount(distributor.openingBalanceRemaining)} remaining)
                    </ThemedText>
                  )}
                  <Ionicons name="create-outline" size={14} color="#94A3B8" style={{ marginLeft: 6 }} />
                </View>
              </Pressable>
            )}

            <PrimaryButton title="Record Payment" icon="add-circle-outline" onPress={onRecordPayment} fullWidth />
          </Card>

          <TabBar active={activeTab} onChange={setActiveTab} />

          {activeTab === 'bills' && (
            <View style={styles.tabContent}>
              {bills.length === 0 ? (
                <ThemedText style={styles.emptyTabText}>No bills recorded for this distributor yet.</ThemedText>
              ) : (
                bills.map((bill) => <BillRow key={bill.id} bill={bill} onPress={onBillPress} />)
              )}
            </View>
          )}

          {activeTab === 'payments' && (
            <View style={styles.tabContent}>
              {payments.length === 0 ? (
                <ThemedText style={styles.emptyTabText}>No payments recorded yet.</ThemedText>
              ) : (
                payments.map((payment) => <PaymentRow key={payment.id} payment={payment} onPress={onPaymentPress} />)
              )}
            </View>
          )}

          {activeTab === 'ledger' && (
            <View style={styles.tabContent}>
              <View style={styles.ledgerHeaderRow}>
                <View style={styles.ledgerRowLeft}>
                  <ThemedText style={styles.ledgerHeaderText}>Particulars</ThemedText>
                </View>
                <View style={styles.ledgerRowRight}>
                  <ThemedText style={styles.ledgerHeaderText}>Debit</ThemedText>
                  <ThemedText style={styles.ledgerHeaderText}>Credit</ThemedText>
                  <ThemedText style={styles.ledgerHeaderText}>Balance</ThemedText>
                </View>
              </View>
              {ledgerRows.length === 0 ? (
                <ThemedText style={styles.emptyTabText}>Nothing to reconcile yet.</ThemedText>
              ) : (
                ledgerRows.map((row, idx) => <LedgerStatementRow key={idx} row={row} />)
              )}
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#4F46E5" />
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  safeArea: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16, paddingBottom: 8 },

  headerCard: { padding: 20, marginBottom: 16 },
  headerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  headerName: { fontSize: 19, fontWeight: '700', color: '#0F172A' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  phoneText: { fontSize: 13, color: '#4F46E5', fontWeight: '600' },

  outstandingBlock: {
    backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center',
  },
  outstandingLabel: { fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 },
  outstandingValue: { fontSize: 30, fontWeight: '800', color: '#0F172A', marginTop: 6 },
  overduePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10,
    backgroundColor: '#FEE2E2', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#FECACA',
  },
  overduePillText: { fontSize: 11, fontWeight: '700', color: '#DC2626' },

  openingBalanceRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 4, marginBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  openingBalanceLabel: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  openingBalanceValueRow: { flexDirection: 'row', alignItems: 'center' },
  openingBalanceValue: { fontSize: 13, color: '#0F172A', fontWeight: '700' },
  openingBalanceSettled: { fontSize: 11, color: '#94A3B8', marginLeft: 6 },

  tabBar: {
    flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 14, padding: 4, marginBottom: 16,
  },
  tabButton: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 1,
  },
  tabButtonText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  tabButtonTextActive: { color: '#0F172A' },

  tabContent: { minHeight: 100 },
  emptyTabText: { fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingVertical: 32 },

  // Bills
  billCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(226,232,240,0.6)',
  },
  rowPressed: { opacity: 0.7 },
  billCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  billInvoice: { fontSize: 14, fontWeight: '700', color: '#0F172A', flex: 1, marginRight: 8 },
  billCardDates: { flexDirection: 'row', marginTop: 4 },
  billDateText: { fontSize: 11, color: '#94A3B8', marginRight: 4 },
  billCardAmounts: { flexDirection: 'row', marginTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 10 },
  billAmountBox: { flex: 1 },
  billAmountLabel: { fontSize: 10, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.3 },
  billAmountValue: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginTop: 2 },

  // Payments
  paymentCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(226,232,240,0.6)',
  },
  paymentIconWrap: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#EEF2FF',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  paymentMain: { flex: 1 },
  paymentTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paymentAmount: { fontSize: 15, fontWeight: '700', color: '#059669' },
  paymentMode: { fontSize: 11, fontWeight: '700', color: '#4F46E5', textTransform: 'uppercase' },
  paymentMeta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  paymentAllocations: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  paymentThumb: { width: 40, height: 40, borderRadius: 10, marginLeft: 10, backgroundColor: '#F1F5F9' },
  paymentThumbPlaceholder: {
    width: 40, height: 40, borderRadius: 10, marginLeft: 10, backgroundColor: '#F8FAFC',
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9',
  },

  // Ledger statement
  ledgerHeaderRow: { flexDirection: 'row', paddingHorizontal: 4, paddingBottom: 8 },
  ledgerHeaderText: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.3 },
  ledgerRow: {
    flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, marginBottom: 6,
    borderWidth: 1, borderColor: 'rgba(226,232,240,0.5)',
  },
  ledgerRowLeft: { flex: 1.4, marginRight: 8 },
  ledgerRowRight: { flex: 1.6, flexDirection: 'row', justifyContent: 'space-between' },
  ledgerDate: { fontSize: 10, color: '#94A3B8', marginBottom: 2 },
  ledgerParticulars: { fontSize: 12, color: '#0F172A', fontWeight: '600' },
  ledgerAmount: { fontSize: 11, color: '#CBD5E1', flex: 1, textAlign: 'right' },
  ledgerDebit: { color: '#DC2626', fontWeight: '600' },
  ledgerCredit: { color: '#059669', fontWeight: '600' },
  ledgerRunning: { fontSize: 12, color: '#0F172A', fontWeight: '700', flex: 1, textAlign: 'right' },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(248, 250, 252, 0.8)',
  },
});
