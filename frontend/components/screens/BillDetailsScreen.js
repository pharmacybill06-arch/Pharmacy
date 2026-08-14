import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import Card from '@/components/ui/Card';
import Chip from '@/components/ui/Chip';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import DateField from '@/components/ui/DateField';
import DistributorAutocomplete from '@/components/ui/DistributorAutocomplete';
import { billApi } from '@/services/api';

function ddmmyyyyToIso(value) {
  const m = String(value || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function isoToDdmmyyyy(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}

/**
 * Quick date-fix modal — the fastest path for the most common real-world edit.
 * Single field, one save button.
 */
function QuickDateModal({ visible, label, value, onClose, onSave, saving }) {
  const [local, setLocal] = useState(value || '');
  useEffect(() => { if (visible) setLocal(value || ''); }, [visible, value]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalKeyboardView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Fix {label}</ThemedText>
              <Pressable onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={22} color="#64748B" />
              </Pressable>
            </View>
            <DateField label={label} value={local} onChange={setLocal} />
            <PrimaryButton
              title={saving ? 'Saving…' : 'Save'}
              onPress={() => onSave(local)}
              disabled={saving || !local}
            />
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Header edit modal — invoice number, invoice date, due date, distributor.
 */
function HeaderEditModal({ visible, bill, userId, onClose, onSave, saving }) {
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [distributor, setDistributor] = useState(null);

  useEffect(() => {
    if (visible) {
      setInvoiceNumber(bill?.invoiceNumber || '');
      setInvoiceDate(isoToDdmmyyyy(bill?.invoiceDate));
      setDueDate(isoToDdmmyyyy(bill?.dueDate));
      setDistributor(bill?.distributor || null);
    }
  }, [visible, bill]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalKeyboardView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Edit Bill Details</ThemedText>
              <Pressable onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={22} color="#64748B" />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <ThemedText style={styles.fieldLabel}>Invoice Number</ThemedText>
              <TextInput
                style={styles.textInput}
                value={invoiceNumber}
                onChangeText={setInvoiceNumber}
                placeholder="Invoice #"
                placeholderTextColor="#94A3B8"
              />

              <DateField label="Invoice Date" value={invoiceDate} onChange={setInvoiceDate} />
              <DateField label="Due Date" value={dueDate} onChange={setDueDate} />

              <ThemedText style={styles.fieldLabel}>Distributor</ThemedText>
              <DistributorAutocomplete
                userId={userId}
                value={distributor?.name || ''}
                onChangeText={() => {}}
                onDistributorSelect={setDistributor}
                selectedDistributor={distributor}
              />

              <PrimaryButton
                title={saving ? 'Saving…' : 'Save Changes'}
                onPress={() =>
                  onSave({
                    invoiceNumber,
                    invoiceDate: ddmmyyyyToIso(invoiceDate),
                    dueDate: ddmmyyyyToIso(dueDate),
                    distributorId: distributor?.id || null,
                  })
                }
                disabled={saving}
              />
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Line-item edit modal — batch number, expiry, quantity, MRP, rate. Qty/batch edits are
 * stock-aware server-side (propagate to the linked ProductBatch, warn on negative stock).
 */
function ItemEditModal({ visible, item, onClose, onSave, saving }) {
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [quantity, setQuantity] = useState('');
  const [mrp, setMrp] = useState('');
  const [rate, setRate] = useState('');

  useEffect(() => {
    if (visible && item) {
      setBatchNumber(item.batchNumber || '');
      setExpiryDate(item.expiryDate || '');
      setQuantity(item.quantity?.toString() || '');
      setMrp(item.mrp?.toString() || '');
      setRate(item.rate?.toString() || '');
    }
  }, [visible, item]);

  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalKeyboardView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle} numberOfLines={1}>{item.name}</ThemedText>
              <Pressable onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={22} color="#64748B" />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <ThemedText style={styles.fieldLabel}>Batch Number</ThemedText>
              <TextInput style={styles.textInput} value={batchNumber} onChangeText={setBatchNumber} placeholder="Batch" placeholderTextColor="#94A3B8" />

              <ThemedText style={styles.fieldLabel}>Expiry (MM/YY)</ThemedText>
              <TextInput style={styles.textInput} value={expiryDate} onChangeText={setExpiryDate} placeholder="MM/YY" placeholderTextColor="#94A3B8" />

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.fieldLabel}>Quantity</ThemedText>
                  <TextInput style={styles.textInput} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.fieldLabel}>MRP</ThemedText>
                  <TextInput style={styles.textInput} value={mrp} onChangeText={setMrp} keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.fieldLabel}>Rate</ThemedText>
                  <TextInput style={styles.textInput} value={rate} onChangeText={setRate} keyboardType="decimal-pad" />
                </View>
              </View>

              <View style={styles.editWarningBox}>
                <Ionicons name="information-circle-outline" size={14} color="#64748B" />
                <ThemedText style={styles.editWarningText}>
                  Batch/expiry/quantity corrections flow through to stock automatically.
                </ThemedText>
              </View>

              <PrimaryButton
                title={saving ? 'Saving…' : 'Save Changes'}
                onPress={() => onSave({ batchNumber, expiryDate, quantity, mrp, rate })}
                disabled={saving}
              />
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * History modal — before/after audit trail (header + item edits), newest first.
 */
function HistoryModal({ visible, history, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>Edit History</ThemedText>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#64748B" />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 400 }}>
            {history.length === 0 && (
              <ThemedText style={styles.emptyHistoryText}>No edits recorded yet.</ThemedText>
            )}
            {history.map((h) => (
              <View key={h.id} style={styles.historyRow}>
                <View style={styles.historyRowTop}>
                  <ThemedText style={styles.historyField}>
                    {h.billItem ? `${h.billItem.name} · ` : ''}{h.field}
                  </ThemedText>
                  <ThemedText style={styles.historyDate}>
                    {new Date(h.editedAt).toLocaleDateString()}
                  </ThemedText>
                </View>
                <ThemedText style={styles.historyChange} numberOfLines={2}>
                  {h.oldValue || '(empty)'} → {h.newValue || '(empty)'}
                </ThemedText>
                {h.note && <ThemedText style={styles.historyNote}>{h.note}</ThemedText>}
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Item Row Component — tappable to edit
 */
const ItemRow = ({ item, onPress }) => (
  <Pressable style={styles.itemRow} onPress={() => onPress(item)}>
    <View style={styles.itemLeft}>
      <ThemedText style={styles.itemName}>{item.itemName || item.name}</ThemedText>
      <ThemedText style={styles.itemMeta}>
        {item.quantity} × ₹{item.rate}{item.batchNumber ? ` · Batch ${item.batchNumber}` : ''}
      </ThemedText>
    </View>
    <ThemedText style={styles.itemTotal}>₹{item.itemTotal}</ThemedText>
    <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
  </Pressable>
);

/**
 * Total Row Component
 */
const TotalRow = ({ label, value, isGrandTotal = false }) => (
  <View style={styles.totalRow}>
    <ThemedText
      style={[styles.totalLabel, isGrandTotal && styles.grandTotalLabel]}
    >
      {label}
    </ThemedText>
    <ThemedText
      style={[styles.totalValue, isGrandTotal && styles.grandTotalValue]}
    >
      ₹{value}
    </ThemedText>
  </View>
);

/**
 * BillDetailsScreen
 * Shows complete bill information with breakdown, plus whole-bill edit: header fields
 * (invoice #, invoice date, due date, distributor) and per-line batch/expiry/qty/rate,
 * every edit audit-logged. Date correction (the most common real-world edit) has a
 * dedicated one-tap fast path.
 */
export default function BillDetailsScreen({
  bill,
  userId,
  onBack,
  onShare,
  onExportPdf,
  onEdit,
  onRefresh,
}) {
  const [currentBill, setCurrentBill] = useState(bill);
  const [quickDateModal, setQuickDateModal] = useState({ visible: false, field: null, label: '' });
  const [headerModalVisible, setHeaderModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setCurrentBill(bill); }, [bill]);

  // The bill list this screen is usually opened from returns a trimmed item shape
  // (no rate/mrp/itemTotal) — always load the full record so editing has real values.
  useEffect(() => {
    if (!bill?.id) return;
    billApi.getBillById(bill.id).then((res) => setCurrentBill(res.bill)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill?.id]);

  const refetchAfterEdit = useCallback(async () => {
    try {
      const res = await billApi.getBillById(currentBill.id);
      setCurrentBill(res.bill);
      onRefresh?.(res.bill);
    } catch (err) {
      // Non-fatal — local optimistic state stays if refetch fails
    }
  }, [currentBill?.id, onRefresh]);

  if (!currentBill) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <AppBar title="Bill Details" onBack={onBack} />
          <View style={styles.emptyContainer}>
            <ThemedText style={styles.emptyText}>No bill data</ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const getPaymentVariant = (type) => {
    if (type?.toLowerCase() === 'credit') return 'credit';
    if (type?.toLowerCase() === 'cash') return 'cash';
    return 'default';
  };

  const handleQuickDateSave = async (value) => {
    setSaving(true);
    try {
      const result = await billApi.updateBillHeader(currentBill.id, {
        [quickDateModal.field]: ddmmyyyyToIso(value),
      });
      setQuickDateModal({ visible: false, field: null, label: '' });
      await refetchAfterEdit();
      if (result.warnings?.length) Alert.alert('Note', result.warnings.join('\n'));
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save date.');
    } finally {
      setSaving(false);
    }
  };

  const handleHeaderSave = async (changes) => {
    setSaving(true);
    try {
      await billApi.updateBillHeader(currentBill.id, changes);
      setHeaderModalVisible(false);
      await refetchAfterEdit();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleItemSave = async (changes) => {
    setSaving(true);
    try {
      const result = await billApi.updateBillItemFields(editingItem.id, changes);
      setEditingItem(null);
      await refetchAfterEdit();
      if (result.warnings?.length) {
        Alert.alert('Stock warning', result.warnings.join('\n'));
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save item.');
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async () => {
    try {
      const res = await billApi.getBillEditHistory(currentBill.id);
      setHistory(res.history || []);
      setHistoryModalVisible(true);
    } catch (err) {
      Alert.alert('Error', 'Failed to load edit history.');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <AppBar
          title="Bill Details"
          onBack={onBack}
          rightIcon="share-outline"
          onRightPress={onShare}
        />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary Card */}
          <Card style={styles.summaryCard}>
            <ThemedText style={styles.amountLarge}>
              ₹{currentBill.grandTotal || currentBill.totalAmount || '0'}
            </ThemedText>
            <View style={styles.paymentTypeContainer}>
              <Chip
                label={currentBill.paymentType || 'Cash'}
                variant={getPaymentVariant(currentBill.paymentType)}
              />
            </View>

            <View style={styles.summaryDivider} />

            <View style={styles.summaryInfo}>
              <View style={styles.summaryRow}>
                <Ionicons name="storefront-outline" size={16} color="#64748B" />
                <ThemedText style={styles.summaryLabel}>
                  {currentBill.distributor?.name || currentBill.pharmacyName || 'Unknown Pharmacy'}
                </ThemedText>
              </View>

              <View style={styles.summaryRow}>
                <Ionicons name="receipt-outline" size={16} color="#64748B" />
                <ThemedText style={styles.summaryMeta}>
                  Invoice #{currentBill.invoiceNumber || 'N/A'}
                </ThemedText>
              </View>

              {/* Invoice date — tap the pencil for the fastest path (the most common edit) */}
              <View style={styles.summaryRow}>
                <Ionicons name="calendar-outline" size={16} color="#64748B" />
                <ThemedText style={styles.summaryMeta}>
                  {isoToDdmmyyyy(currentBill.invoiceDate) || 'No date'}
                </ThemedText>
                <Pressable
                  hitSlop={8}
                  style={styles.quickEditPencil}
                  onPress={() =>
                    setQuickDateModal({ visible: true, field: 'invoiceDate', label: 'Invoice Date' })
                  }
                >
                  <Ionicons name="pencil" size={13} color="#4F46E5" />
                </Pressable>
              </View>

              {currentBill.dueDate && (
                <View style={styles.summaryRow}>
                  <Ionicons name="alarm-outline" size={16} color="#64748B" />
                  <ThemedText style={styles.summaryMeta}>
                    Due {isoToDdmmyyyy(currentBill.dueDate)}
                  </ThemedText>
                  <Pressable
                    hitSlop={8}
                    style={styles.quickEditPencil}
                    onPress={() => setQuickDateModal({ visible: true, field: 'dueDate', label: 'Due Date' })}
                  >
                    <Ionicons name="pencil" size={13} color="#4F46E5" />
                  </Pressable>
                </View>
              )}
            </View>

            <Pressable style={styles.editDetailsLink} onPress={() => setHeaderModalVisible(true)}>
              <ThemedText style={styles.editDetailsLinkText}>Edit bill details</ThemedText>
            </Pressable>
          </Card>

          {/* Items Breakdown Card */}
          {currentBill.items && currentBill.items.length > 0 && (
            <Card style={styles.itemsCard}>
              <View style={styles.cardHeaderRow}>
                <Ionicons name="list-outline" size={20} color="#4F46E5" />
                <ThemedText style={styles.cardTitle}>Items</ThemedText>
                <ThemedText style={styles.cardHeaderHint}>Tap to edit</ThemedText>
              </View>

              <View style={styles.itemsList}>
                {currentBill.items.map((item, index) => (
                  <ItemRow key={item.id || index} item={item} onPress={setEditingItem} />
                ))}
              </View>
            </Card>
          )}

          {/* Totals Card */}
          <Card style={styles.totalsCard}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="calculator-outline" size={20} color="#4F46E5" />
              <ThemedText style={styles.cardTitle}>Totals</ThemedText>
            </View>

            <View style={styles.totalsBreakdown}>
              <TotalRow label="Subtotal" value={currentBill.subtotal || 0} />
              {currentBill.discount > 0 && (
                <TotalRow label="Discount" value={currentBill.discount} />
              )}
              {currentBill.cgst > 0 && <TotalRow label="CGST" value={currentBill.cgst} />}
              {currentBill.sgst > 0 && <TotalRow label="SGST" value={currentBill.sgst} />}
              {currentBill.roundOff !== 0 && (
                <TotalRow label="Round Off" value={currentBill.roundOff} />
              )}

              <View style={styles.grandTotalDivider} />

              <TotalRow
                label="Grand Total"
                value={currentBill.grandTotal || 0}
                isGrandTotal
              />
            </View>
          </Card>

          <Pressable style={styles.historyLink} onPress={openHistory}>
            <Ionicons name="time-outline" size={16} color="#64748B" />
            <ThemedText style={styles.historyLinkText}>View edit history</ThemedText>
          </Pressable>

          {/* Bottom Spacer for Sticky Actions */}
          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Sticky Bottom Actions */}
        <View style={styles.stickyActions}>
          <PrimaryButton
            title="Export PDF"
            icon="download-outline"
            onPress={onExportPdf}
          />

          <View style={styles.buttonSpacer} />

          <SecondaryButton
            title="Full Edit"
            icon="create-outline"
            onPress={() => onEdit?.(currentBill)}
          />
        </View>

        <QuickDateModal
          visible={quickDateModal.visible}
          label={quickDateModal.label}
          value={isoToDdmmyyyy(currentBill[quickDateModal.field])}
          onClose={() => setQuickDateModal({ visible: false, field: null, label: '' })}
          onSave={handleQuickDateSave}
          saving={saving}
        />
        <HeaderEditModal
          visible={headerModalVisible}
          bill={currentBill}
          userId={userId}
          onClose={() => setHeaderModalVisible(false)}
          onSave={handleHeaderSave}
          saving={saving}
        />
        <ItemEditModal
          visible={!!editingItem}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={handleItemSave}
          saving={saving}
        />
        <HistoryModal
          visible={historyModalVisible}
          history={history}
          onClose={() => setHistoryModalVisible(false)}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 160,
  },
  summaryCard: {
    marginBottom: 16,
    alignItems: 'center',
  },
  amountLarge: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 12,
  },
  paymentTypeContainer: {
    marginBottom: 16,
  },
  summaryDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#E2E8F0',
    marginBottom: 16,
  },
  summaryInfo: {
    width: '100%',
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  summaryMeta: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  quickEditPencil: {
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
    padding: 4,
  },
  editDetailsLink: {
    marginTop: 14,
    paddingVertical: 6,
  },
  editDetailsLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },
  itemsCard: {
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardHeaderHint: {
    marginLeft: 'auto',
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  itemsList: {
    gap: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  itemLeft: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  totalsCard: {
    marginBottom: 16,
  },
  totalsBreakdown: {
    gap: 10,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  grandTotalDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  grandTotalValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  historyLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  bottomSpacer: {
    height: 20,
  },
  stickyActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  buttonSpacer: {
    height: 10,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
  },

  // Modals
  modalKeyboardView: { flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A', flex: 1, marginRight: 8 },
  fieldLabel: {
    fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase',
    letterSpacing: 0.4, marginBottom: 6, marginTop: 8,
  },
  textInput: {
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 13, borderWidth: 1.5,
    borderColor: '#E2E8F0', fontSize: 14, color: '#0F172A', marginBottom: 4,
  },
  row: { flexDirection: 'row', gap: 10 },
  editWarningBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, marginBottom: 14,
  },
  editWarningText: { fontSize: 11, color: '#94A3B8', flex: 1 },

  emptyHistoryText: { fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingVertical: 24 },
  historyRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  historyRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyField: { fontSize: 12, fontWeight: '700', color: '#4F46E5', textTransform: 'capitalize' },
  historyDate: { fontSize: 11, color: '#94A3B8' },
  historyChange: { fontSize: 13, color: '#334155', marginTop: 3 },
  historyNote: { fontSize: 11, color: '#B45309', marginTop: 3 },
});
