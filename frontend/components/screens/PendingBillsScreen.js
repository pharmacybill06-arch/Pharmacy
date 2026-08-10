import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import PrimaryButton from '@/components/ui/PrimaryButton';

/**
 * Pending Bills — the convert-to-bill queue.
 *
 * Positioning: this is a record-keeping tool. Every sale is recorded at the counter
 * and billed later when there is time. Batch and quantity are locked at conversion
 * (the stock was already deducted); only prices and customer details are editable.
 */

function formatDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ============================================================
// Conversion form — prices + customer only
// ============================================================
function ConvertForm({ sale, onBack, onConfirm, isSaving }) {
  const [customerName, setCustomerName] = useState(sale.customerName || '');
  const [customerPhone, setCustomerPhone] = useState(sale.customerPhone || '');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [prices, setPrices] = useState(() => {
    const seed = {};
    for (const item of sale.items) {
      seed[item.id] = item.pricePerBase != null ? String(item.pricePerBase) : '';
    }
    return seed;
  });

  const total = useMemo(() => {
    return round2(
      sale.items.reduce((sum, item) => {
        const price = parseFloat(prices[item.id]);
        return sum + (Number.isNaN(price) ? 0 : item.quantityBase * price);
      }, 0)
    );
  }, [sale.items, prices]);

  const handleConfirm = useCallback(() => {
    onConfirm(sale.id, {
      customerName: customerName.trim() || null,
      customerPhone: customerPhone.trim() || null,
      invoiceNumber: invoiceNumber.trim() || null,
      items: sale.items.map((item) => ({
        saleItemId: item.id,
        pricePerBase: prices[item.id] === '' ? null : parseFloat(prices[item.id]),
      })),
      totalAmount: total,
    });
  }, [sale, customerName, customerPhone, invoiceNumber, prices, total, onConfirm]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppBar title="Create Bill" onBack={onBack} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <ThemedText style={styles.saleDateLine}>
            Sale recorded {formatDate(sale.saleDate)}
          </ThemedText>

          {/* Items — batch/qty locked, price editable */}
          <ThemedText style={styles.sectionTitle}>Items</ThemedText>
          {sale.items.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <ThemedText style={styles.itemName} numberOfLines={1}>
                  {item.productName}
                </ThemedText>
                <View style={styles.lockedTag}>
                  <Ionicons name="lock-closed" size={10} color="#64748B" />
                  <ThemedText style={styles.lockedTagText}>locked</ThemedText>
                </View>
              </View>
              <ThemedText style={styles.itemMeta}>
                {item.quantityLabel}
                {item.batchNumber ? ` · Batch ${item.batchNumber}` : ''}
              </ThemedText>

              <View style={styles.priceRow}>
                <ThemedText style={styles.priceLabel}>Price per unit</ThemedText>
                <TextInput
                  style={styles.priceInput}
                  value={prices[item.id]}
                  onChangeText={(text) => setPrices((prev) => ({ ...prev, [item.id]: text }))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>
          ))}

          {/* Customer */}
          <ThemedText style={styles.sectionTitle}>Customer (optional)</ThemedText>
          <ThemedText style={styles.fieldLabel}>Name</ThemedText>
          <TextInput
            style={styles.textInput}
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="Walk-in customer"
            placeholderTextColor="#94A3B8"
          />
          <ThemedText style={styles.fieldLabel}>Phone</ThemedText>
          <TextInput
            style={styles.textInput}
            value={customerPhone}
            onChangeText={setCustomerPhone}
            keyboardType="phone-pad"
            placeholder="Contact number"
            placeholderTextColor="#94A3B8"
          />
          <ThemedText style={styles.fieldLabel}>Invoice Number</ThemedText>
          <TextInput
            style={styles.textInput}
            value={invoiceNumber}
            onChangeText={setInvoiceNumber}
            placeholder="Auto if left blank"
            placeholderTextColor="#94A3B8"
          />
        </ScrollView>

        <View style={styles.saveBar}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.saveBarLabel}>Bill total</ThemedText>
            <ThemedText style={styles.saveBarTotal}>₹{total.toLocaleString('en-IN')}</ThemedText>
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton title="Create Bill" onPress={handleConfirm} loading={isSaving} disabled={isSaving} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ============================================================
// Queue
// ============================================================
export default function PendingBillsScreen({
  pending,
  loading = false,
  isSaving = false,
  onBack,
  onConvert,
  onConvertMany,
}) {
  const [selected, setSelected] = useState({});
  const [converting, setConverting] = useState(null); // sale being priced

  const sales = pending?.sales || [];
  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected]
  );

  const toggle = useCallback((id) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleConfirmOne = useCallback(async (saleId, data) => {
    await onConvert(saleId, data);
    setConverting(null);
  }, [onConvert]);

  const handleConvertSelected = useCallback(async () => {
    await onConvertMany(selectedIds);
    setSelected({});
  }, [onConvertMany, selectedIds]);

  if (converting) {
    return (
      <ConvertForm
        sale={converting}
        onBack={() => setConverting(null)}
        onConfirm={handleConfirmOne}
        isSaving={isSaving}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppBar title="Pending Bills" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.introCard}>
          <Ionicons name="time-outline" size={18} color="#4F46E5" />
          <ThemedText style={styles.introText}>
            Every sale is already recorded and stock is deducted. Bill them here whenever you have time.
          </ThemedText>
        </View>

        {loading && sales.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#4F46E5" />
          </View>
        ) : sales.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="checkmark-done-circle-outline" size={52} color="#CBD5E1" />
            <ThemedText style={styles.emptyTitle}>Nothing pending</ThemedText>
            <ThemedText style={styles.emptySubtitle}>Every recorded sale has been billed.</ThemedText>
          </View>
        ) : (
          sales.map((sale) => {
            const isSelected = !!selected[sale.id];
            return (
              <View key={sale.id} style={[styles.saleCard, isSelected && styles.saleCardSelected]}>
                <Pressable style={styles.checkboxArea} onPress={() => toggle(sale.id)} hitSlop={6}>
                  <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                    {isSelected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                  </View>
                </Pressable>

                <Pressable style={{ flex: 1 }} onPress={() => setConverting(sale)}>
                  <ThemedText style={styles.saleDate}>{formatDate(sale.saleDate)}</ThemedText>
                  {sale.items.map((item) => (
                    <ThemedText key={item.id} style={styles.saleItemLine} numberOfLines={1}>
                      {item.productName} × {item.quantityLabel}
                      {item.batchNumber ? ` — ${item.batchNumber}` : ''}
                    </ThemedText>
                  ))}
                  {sale.totalAmount != null && (
                    <ThemedText style={styles.saleAmount}>
                      ₹{sale.totalAmount.toLocaleString('en-IN')}
                    </ThemedText>
                  )}
                </Pressable>

                <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
              </View>
            );
          })
        )}
      </ScrollView>

      {selectedIds.length > 0 && (
        <View style={styles.saveBar}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.saveBarLabel}>Selected</ThemedText>
            <ThemedText style={styles.saveBarTotal}>{selectedIds.length}</ThemedText>
          </View>
          <View style={{ flex: 1.4 }}>
            <PrimaryButton
              title="Bill Selected"
              onPress={handleConvertSelected}
              loading={isSaving}
              disabled={isSaving}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { padding: 16, paddingBottom: 32 },

  introCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#EEF2FF',
    borderRadius: 14, padding: 13, marginBottom: 14,
  },
  introText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: '#3730A3', lineHeight: 18 },

  saleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF',
    borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: '#F1F5F9',
  },
  saleCardSelected: { borderColor: '#4F46E5', backgroundColor: '#F5F7FF' },
  checkboxArea: { padding: 2 },
  checkbox: {
    width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: '#CBD5E1',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  saleDate: { fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 4 },
  saleItemLine: { fontSize: 13.5, fontWeight: '600', color: '#0F172A', lineHeight: 19 },
  saleAmount: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 4 },

  saleDateLine: { fontSize: 12.5, color: '#64748B', fontWeight: '600', marginBottom: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 10, marginTop: 8 },

  itemCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { flex: 1, fontSize: 14, fontWeight: '700', color: '#0F172A' },
  lockedTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F1F5F9',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  lockedTagText: { fontSize: 9.5, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' },
  itemMeta: { fontSize: 12, color: '#64748B', marginTop: 3 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  priceLabel: { flex: 1, fontSize: 12, fontWeight: '600', color: '#64748B' },
  priceInput: {
    width: 100, backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14,
    fontWeight: '700', color: '#0F172A', textAlign: 'right',
  },

  fieldLabel: {
    fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase',
    letterSpacing: 0.4, marginBottom: 6, marginTop: 8,
  },
  textInput: {
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 12, fontSize: 14, color: '#0F172A',
  },

  saveBar: {
    flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#FFFFFF',
    paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0',
  },
  saveBarLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  saveBarTotal: { fontSize: 17, fontWeight: '800', color: '#0F172A' },

  loadingBox: { paddingVertical: 48, alignItems: 'center' },
  emptyBox: {
    alignItems: 'center', paddingVertical: 48, gap: 8, backgroundColor: '#FFFFFF',
    borderRadius: 20, borderWidth: 1, borderColor: '#F1F5F9', borderStyle: 'dashed',
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#334155' },
  emptySubtitle: { fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingHorizontal: 24 },
});
