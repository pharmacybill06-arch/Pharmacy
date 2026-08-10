import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { useProductSearch } from '@/hooks/useProducts';

/**
 * Quick Sell — 2-second sale capture at the counter.
 *
 * Search -> tap product -> Save. The FEFO batch is pre-selected but never hidden:
 * the pharmacist must always see which physical strip to pick from the shelf.
 */

const SCHEDULE_LABEL = { h1: 'H1', nrx: 'NRX' };

function isScheduled(product) {
  return product?.scheduleFlag === 'h1' || product?.scheduleFlag === 'nrx';
}

function round3(n) {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/** Mirrors batchService.formatQuantity so the UI reads the same as the register. */
function formatQuantity(quantityBase, product = {}) {
  const { packSize = 1, packLabel = 'pack', baseUnit = 'unit' } = product;
  const qty = round3(quantityBase || 0);
  const plural = (n, word) => `${n} ${word}${Math.abs(n) === 1 ? '' : 's'}`;

  if (!packSize || packSize <= 1) return plural(qty, baseUnit);
  if (qty < 0) return plural(qty, baseUnit);

  const packs = Math.floor(qty / packSize);
  const loose = round3(qty - packs * packSize);
  if (packs === 0) return plural(loose, baseUnit);
  if (loose === 0) return plural(packs, packLabel);
  return `${plural(packs, packLabel)} + ${plural(loose, baseUnit)}`;
}

function formatExpiry(value) {
  if (!value) return 'No expiry';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'No expiry';
  // Expiry is stored as a UTC calendar date — read it back in UTC or it shifts a day
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `Exp ${mm}/${String(d.getUTCFullYear()).slice(-2)}`;
}

/** FEFO: earliest expiry first, undated last. Mirrors the backend ordering. */
function firstAvailableBatch(batches) {
  return batches.find((b) => b.quantityBase > 0) || batches[0] || null;
}

// ============================================================
// Batch picker — every batch stays visible, sorted by expiry
// ============================================================
function BatchPickerModal({ visible, batches, product, selectedId, onSelect, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <ThemedText style={styles.sheetTitle}>Choose Batch</ThemedText>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color="#64748B" />
            </Pressable>
          </View>
          <ThemedText style={styles.sheetSubtitle}>
            Sorted by expiry — earliest first (FEFO)
          </ThemedText>

          <ScrollView style={{ maxHeight: 380 }}>
            {batches.map((batch, index) => {
              const selected = batch.id === selectedId;
              return (
                <Pressable
                  key={batch.id}
                  style={[styles.batchRow, selected && styles.batchRowSelected]}
                  onPress={() => onSelect(batch)}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.batchRowTop}>
                      <ThemedText style={styles.batchNumber}>{batch.batchNumber}</ThemedText>
                      {index === 0 && (
                        <View style={styles.fefoBadge}>
                          <ThemedText style={styles.fefoBadgeText}>FEFO</ThemedText>
                        </View>
                      )}
                    </View>
                    <ThemedText style={styles.batchMeta}>
                      {formatExpiry(batch.expiryDate)} · {formatQuantity(batch.quantityBase, product)} left
                    </ThemedText>
                  </View>
                  {batch.isEmpty && (
                    <ThemedText style={styles.batchEmptyTag}>empty</ThemedText>
                  )}
                  {selected && <Ionicons name="checkmark-circle" size={22} color="#4F46E5" />}
                </Pressable>
              );
            })}
            {batches.length === 0 && (
              <ThemedText style={styles.emptyHint}>No batches on record for this product.</ThemedText>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ============================================================
// Item builder — product, batch, quantity, price
// ============================================================
function ItemBuilder({ userId, product, onAdd, onCancel, fetchBatches, previewAllocation }) {
  const [batchData, setBatchData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState(null);
  // Did the pharmacist explicitly override the FEFO suggestion?
  const [batchOverridden, setBatchOverridden] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [useBaseUnits, setUseBaseUnits] = useState(false);
  const [qtyInput, setQtyInput] = useState('1');
  const [price, setPrice] = useState('');
  const [split, setSplit] = useState(null);

  const packSize = product.packSize || 1;
  const hasPacks = packSize > 1;

  // Load batches and pre-select the FEFO one
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const response = await fetchBatches(userId, product.id);
      if (cancelled) return;
      setBatchData(response);
      const fefo = firstAvailableBatch(response?.batches || []);
      setSelectedBatch(fefo);
      if (response?.product?.mrp || product.defaultMrp) {
        setPrice(String(response?.product?.mrp || product.defaultMrp));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, product.id, fetchBatches, product.defaultMrp]);

  const quantityBase = useMemo(() => {
    const n = parseFloat(qtyInput);
    if (Number.isNaN(n)) return 0;
    return round3(useBaseUnits || !hasPacks ? n : n * packSize);
  }, [qtyInput, useBaseUnits, hasPacks, packSize]);

  // Ask the server how this quantity will actually be drawn, so the split the
  // pharmacist sees is exactly what will be saved.
  useEffect(() => {
    let cancelled = false;
    if (!selectedBatch || quantityBase <= 0) {
      setSplit(null);
      return;
    }
    (async () => {
      const preview = await previewAllocation(
        product.id,
        quantityBase,
        batchOverridden ? selectedBatch.id : null
      );
      if (!cancelled) setSplit(preview);
    })();
    return () => { cancelled = true; };
  }, [product.id, quantityBase, selectedBatch, batchOverridden, previewAllocation]);

  const step = useCallback((delta) => {
    const current = parseFloat(qtyInput) || 0;
    const next = Math.max(0, round3(current + delta));
    setQtyInput(String(next));
  }, [qtyInput]);

  const handleAdd = useCallback(() => {
    if (!selectedBatch || quantityBase <= 0) return;
    const allocations = split?.allocations?.length
      ? split.allocations
      : [{ productBatchId: selectedBatch.id, batchNumber: selectedBatch.batchNumber, quantityBase }];

    onAdd({
      product: batchData?.product || product,
      pricePerBase: price === '' ? null : parseFloat(price),
      // One cart entry per batch drawn from, so the sale keeps exact batch traceability
      lines: allocations.map((a) => ({
        productId: product.id,
        productBatchId: a.productBatchId,
        batchNumber: a.batchNumber,
        quantityBase: a.quantityBase,
        pricePerBase: price === '' ? null : parseFloat(price),
      })),
      warnings: split?.warnings || [],
    });
  }, [selectedBatch, quantityBase, split, price, product, batchData, onAdd]);

  if (loading) {
    return (
      <View style={styles.builderLoading}>
        <ActivityIndicator color="#4F46E5" />
        <ThemedText style={styles.loadingText}>Loading batches…</ThemedText>
      </View>
    );
  }

  const batches = batchData?.batches || [];
  const productInfo = batchData?.product || product;
  const noBatches = batches.length === 0;
  const isSplit = (split?.allocations?.length || 0) > 1;

  return (
    <View style={styles.builderCard}>
      {/* Product header */}
      <View style={styles.builderHeader}>
        <View style={{ flex: 1 }}>
          <View style={styles.builderTitleRow}>
            <ThemedText style={styles.builderTitle}>{productInfo.name}</ThemedText>
            {isScheduled(productInfo) && (
              <View style={styles.h1Badge}>
                <ThemedText style={styles.h1BadgeText}>
                  {SCHEDULE_LABEL[productInfo.scheduleFlag]}
                </ThemedText>
              </View>
            )}
          </View>
          <ThemedText style={styles.builderStock}>
            In stock: {productInfo.stockLabel || formatQuantity(productInfo.totalStock || 0, productInfo)}
          </ThemedText>
        </View>
        <Pressable onPress={onCancel} hitSlop={10}>
          <Ionicons name="close-circle" size={24} color="#CBD5E1" />
        </Pressable>
      </View>

      {noBatches ? (
        <View style={styles.warningBox}>
          <Ionicons name="alert-circle" size={18} color="#B45309" />
          <ThemedText style={styles.warningText}>
            No batches on record. Add a batch or confirm a purchase bill before selling this item.
          </ThemedText>
        </View>
      ) : (
        <>
          {/* Batch — never hidden; FEFO pre-selected, tap to change */}
          <ThemedText style={styles.fieldLabel}>Batch</ThemedText>
          <Pressable style={styles.batchSelector} onPress={() => setPickerVisible(true)}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.batchSelectorTitle}>
                {selectedBatch?.batchNumber || 'Select batch'}
              </ThemedText>
              <ThemedText style={styles.batchSelectorMeta}>
                {formatExpiry(selectedBatch?.expiryDate)} ·{' '}
                {formatQuantity(selectedBatch?.quantityBase || 0, productInfo)} left
              </ThemedText>
            </View>
            {!batchOverridden && (
              <View style={styles.fefoBadge}>
                <ThemedText style={styles.fefoBadgeText}>FEFO</ThemedText>
              </View>
            )}
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </Pressable>

          {/* Quantity */}
          <View style={styles.qtyHeaderRow}>
            <ThemedText style={styles.fieldLabel}>Quantity</ThemedText>
            {hasPacks && (
              <View style={styles.unitToggle}>
                <Pressable
                  style={[styles.unitOption, !useBaseUnits && styles.unitOptionActive]}
                  onPress={() => setUseBaseUnits(false)}
                >
                  <ThemedText style={[styles.unitOptionText, !useBaseUnits && styles.unitOptionTextActive]}>
                    {productInfo.packLabel || 'pack'}
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.unitOption, useBaseUnits && styles.unitOptionActive]}
                  onPress={() => setUseBaseUnits(true)}
                >
                  <ThemedText style={[styles.unitOptionText, useBaseUnits && styles.unitOptionTextActive]}>
                    {productInfo.baseUnit || 'unit'}
                  </ThemedText>
                </Pressable>
              </View>
            )}
          </View>

          <View style={styles.stepperRow}>
            <Pressable style={styles.stepperButton} onPress={() => step(-1)}>
              <Ionicons name="remove" size={22} color="#4F46E5" />
            </Pressable>
            <TextInput
              style={styles.stepperInput}
              value={qtyInput}
              onChangeText={setQtyInput}
              keyboardType="decimal-pad"
              selectTextOnFocus
            />
            <Pressable style={styles.stepperButton} onPress={() => step(1)}>
              <Ionicons name="add" size={22} color="#4F46E5" />
            </Pressable>
            <View style={styles.qtySummary}>
              <ThemedText style={styles.qtySummaryText}>
                = {formatQuantity(quantityBase, productInfo)}
              </ThemedText>
            </View>
          </View>

          {/* Auto-split preview — shown before saving */}
          {isSplit && (
            <View style={styles.splitBox}>
              <Ionicons name="git-branch-outline" size={16} color="#4F46E5" />
              <ThemedText style={styles.splitText}>
                {split.allocations
                  .map((a) => `${formatQuantity(a.quantityBase, productInfo)} from ${a.batchNumber}`)
                  .join(' + ')}
              </ThemedText>
            </View>
          )}

          {/* Negative stock warning — never blocks the sale */}
          {split?.warnings?.length > 0 && (
            <View style={styles.warningBox}>
              <Ionicons name="alert-circle" size={18} color="#B45309" />
              <ThemedText style={styles.warningText}>{split.warnings[0]}</ThemedText>
            </View>
          )}

          {/* Price — optional in quick mode */}
          <ThemedText style={styles.fieldLabel}>
            Price per {productInfo.baseUnit || 'unit'} (optional)
          </ThemedText>
          <TextInput
            style={styles.textInput}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            placeholder="Skip to record without a price"
            placeholderTextColor="#94A3B8"
          />

          <PrimaryButton
            title={`Add ${formatQuantity(quantityBase, productInfo)}`}
            onPress={handleAdd}
            disabled={quantityBase <= 0 || !selectedBatch}
          />
        </>
      )}

      <BatchPickerModal
        visible={pickerVisible}
        batches={batches}
        product={productInfo}
        selectedId={selectedBatch?.id}
        onSelect={(batch) => {
          setSelectedBatch(batch);
          setBatchOverridden(true);
          setPickerVisible(false);
        }}
        onClose={() => setPickerVisible(false)}
      />
    </View>
  );
}

// ============================================================
// Quick Sell screen
// ============================================================
export default function QuickSellScreen({
  userId,
  onBack,
  onSave,
  fetchBatches,
  previewAllocation,
  isSaving = false,
  initialProduct = null,
}) {
  const [cart, setCart] = useState([]);
  const [activeProduct, setActiveProduct] = useState(initialProduct);
  const [customerName, setCustomerName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const searchInputRef = useRef(null);

  const { query, results, isSearching, search, clearSearch } = useProductSearch(userId, {
    debounceMs: 200,
    minChars: 2,
    maxResults: 8,
  });

  // Any H1/NRX item forces the prescription flow: customer + doctor, billed immediately
  const scheduledItems = cart.filter((entry) => isScheduled(entry.product));
  const needsPrescriptionFlow = scheduledItems.length > 0;
  const prescriptionComplete = customerName.trim() && doctorName.trim();
  const canSave = cart.length > 0 && (!needsPrescriptionFlow || prescriptionComplete);

  const handleSelectProduct = useCallback((product) => {
    setActiveProduct(product);
    clearSearch();
    search('');
  }, [clearSearch, search]);

  const handleAddItem = useCallback((entry) => {
    setCart((prev) => [...prev, entry]);
    setActiveProduct(null);
    // Straight back to search so the next item is one tap away
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);

  const handleRemoveItem = useCallback((index) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const total = useMemo(() => {
    let sum = 0;
    let anyPriced = false;
    for (const entry of cart) {
      for (const line of entry.lines) {
        if (line.pricePerBase != null && !Number.isNaN(line.pricePerBase)) {
          anyPriced = true;
          sum += line.quantityBase * line.pricePerBase;
        }
      }
    }
    return anyPriced ? round3(sum) : null;
  }, [cart]);

  const handleSave = useCallback(() => {
    if (!canSave) return;
    onSave({
      items: cart.flatMap((entry) => entry.lines),
      customerName: customerName.trim() || null,
      doctorName: doctorName.trim() || null,
      customerPhone: customerPhone.trim() || null,
      totalAmount: total,
    });
  }, [canSave, cart, customerName, doctorName, customerPhone, total, onSave]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppBar title="Quick Sell" onBack={onBack} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Search */}
          {!activeProduct && (
            <>
              <View style={styles.searchBar}>
                <Ionicons name="search" size={18} color="#94A3B8" />
                <TextInput
                  ref={searchInputRef}
                  style={styles.searchInput}
                  value={query}
                  onChangeText={search}
                  placeholder="Search medicine…"
                  placeholderTextColor="#94A3B8"
                  autoFocus={cart.length === 0}
                  returnKeyType="search"
                />
                {isSearching && <ActivityIndicator size="small" color="#4F46E5" />}
                {query.length > 0 && !isSearching && (
                  <Pressable onPress={() => search('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color="#CBD5E1" />
                  </Pressable>
                )}
              </View>

              {results.map((product) => (
                <Pressable
                  key={product.id}
                  style={styles.resultRow}
                  onPress={() => handleSelectProduct(product)}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.builderTitleRow}>
                      <ThemedText style={styles.resultName} numberOfLines={1}>
                        {product.name}
                      </ThemedText>
                      {isScheduled(product) && (
                        <View style={styles.h1Badge}>
                          <ThemedText style={styles.h1BadgeText}>
                            {SCHEDULE_LABEL[product.scheduleFlag]}
                          </ThemedText>
                        </View>
                      )}
                    </View>
                    <ThemedText style={styles.resultMeta}>
                      {formatQuantity(product.stock || 0, product)} in stock
                      {product.manufacturer ? ` · ${product.manufacturer}` : ''}
                    </ThemedText>
                  </View>
                  <Ionicons name="add-circle" size={26} color="#4F46E5" />
                </Pressable>
              ))}

              {query.length >= 2 && !isSearching && results.length === 0 && (
                <ThemedText style={styles.emptyHint}>No medicines match “{query}”.</ThemedText>
              )}
            </>
          )}

          {/* Item builder */}
          {activeProduct && (
            <ItemBuilder
              userId={userId}
              product={activeProduct}
              onAdd={handleAddItem}
              onCancel={() => setActiveProduct(null)}
              fetchBatches={fetchBatches}
              previewAllocation={previewAllocation}
            />
          )}

          {/* Cart */}
          {cart.length > 0 && !activeProduct && (
            <View style={styles.cartSection}>
              <ThemedText style={styles.sectionTitle}>This Sale</ThemedText>
              {cart.map((entry, index) => (
                <View key={`${entry.product.id}-${index}`} style={styles.cartRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.builderTitleRow}>
                      <ThemedText style={styles.cartName} numberOfLines={1}>
                        {entry.product.name}
                      </ThemedText>
                      {isScheduled(entry.product) && (
                        <View style={styles.h1Badge}>
                          <ThemedText style={styles.h1BadgeText}>
                            {SCHEDULE_LABEL[entry.product.scheduleFlag]}
                          </ThemedText>
                        </View>
                      )}
                    </View>
                    {entry.lines.map((line, i) => (
                      <ThemedText key={i} style={styles.cartMeta}>
                        {formatQuantity(line.quantityBase, entry.product)} · Batch {line.batchNumber}
                      </ThemedText>
                    ))}
                  </View>
                  <Pressable onPress={() => handleRemoveItem(index)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </Pressable>
                </View>
              ))}

              <Pressable style={styles.addMoreButton} onPress={() => searchInputRef.current?.focus()}>
                <Ionicons name="add" size={18} color="#4F46E5" />
                <ThemedText style={styles.addMoreText}>Add another item</ThemedText>
              </Pressable>
            </View>
          )}

          {/* Schedule H1/NRX forced flow */}
          {needsPrescriptionFlow && !activeProduct && (
            <View style={styles.scheduleSection}>
              <View style={styles.scheduleBanner}>
                <Ionicons name="shield-checkmark" size={18} color="#B91C1C" />
                <ThemedText style={styles.scheduleBannerText}>
                  Schedule {scheduledItems.map((e) => SCHEDULE_LABEL[e.product.scheduleFlag]).join('/')} item
                  in this sale — patient and doctor are required, and a bill is created immediately.
                </ThemedText>
              </View>

              <ThemedText style={styles.fieldLabel}>Patient Name *</ThemedText>
              <TextInput
                style={styles.textInput}
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="Full name"
                placeholderTextColor="#94A3B8"
              />

              <ThemedText style={styles.fieldLabel}>Doctor Name *</ThemedText>
              <TextInput
                style={styles.textInput}
                value={doctorName}
                onChangeText={setDoctorName}
                placeholder="Prescribing doctor"
                placeholderTextColor="#94A3B8"
              />

              <ThemedText style={styles.fieldLabel}>Patient Phone (optional)</ThemedText>
              <TextInput
                style={styles.textInput}
                value={customerPhone}
                onChangeText={setCustomerPhone}
                keyboardType="phone-pad"
                placeholder="Contact number"
                placeholderTextColor="#94A3B8"
              />
            </View>
          )}
        </ScrollView>

        {/* Save bar */}
        {cart.length > 0 && !activeProduct && (
          <View style={styles.saveBar}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.saveBarLabel}>
                {cart.length} item{cart.length === 1 ? '' : 's'}
              </ThemedText>
              <ThemedText style={styles.saveBarTotal}>
                {total != null ? `₹${total.toLocaleString('en-IN')}` : 'No price entered'}
              </ThemedText>
            </View>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                title={needsPrescriptionFlow ? 'Save & Bill' : 'Save Sale'}
                onPress={handleSave}
                disabled={!canSave || isSaving}
                loading={isSaving}
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { padding: 16, paddingBottom: 32 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF',
    paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  searchInput: { flex: 1, paddingVertical: 13, fontSize: 15, color: '#0F172A' },

  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF',
    borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9',
  },
  resultName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  resultMeta: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  emptyHint: { textAlign: 'center', color: '#94A3B8', marginTop: 24, fontSize: 13 },

  builderCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  builderLoading: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  loadingText: { fontSize: 13, color: '#64748B' },
  builderHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16 },
  builderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  builderTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', flexShrink: 1 },
  builderStock: { fontSize: 12, color: '#64748B', marginTop: 3 },

  h1Badge: {
    borderWidth: 1.5, borderColor: '#DC2626', borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  h1BadgeText: { fontSize: 10, fontWeight: '800', color: '#DC2626', letterSpacing: 0.3 },

  fieldLabel: {
    fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase',
    letterSpacing: 0.4, marginBottom: 6, marginTop: 8,
  },

  batchSelector: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC',
    borderRadius: 12, padding: 13, borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  batchSelectorTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  batchSelectorMeta: { fontSize: 12, color: '#64748B', marginTop: 2 },

  fefoBadge: {
    backgroundColor: '#EEF2FF', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  fefoBadgeText: { fontSize: 9, fontWeight: '800', color: '#4F46E5', letterSpacing: 0.4 },

  qtyHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  unitToggle: {
    flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 3, marginTop: 8,
  },
  unitOption: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  unitOptionActive: { backgroundColor: '#FFFFFF' },
  unitOptionText: { fontSize: 11, fontWeight: '700', color: '#94A3B8' },
  unitOptionTextActive: { color: '#4F46E5' },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperButton: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center',
  },
  stepperInput: {
    width: 70, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC', textAlign: 'center', fontSize: 16, fontWeight: '700',
    color: '#0F172A',
  },
  qtySummary: { flex: 1, alignItems: 'flex-end' },
  qtySummaryText: { fontSize: 13, fontWeight: '600', color: '#4F46E5' },

  splitBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EEF2FF',
    borderRadius: 12, padding: 12, marginTop: 12,
  },
  splitText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#3730A3', lineHeight: 17 },

  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FFFBEB',
    borderRadius: 12, padding: 12, marginTop: 12, borderWidth: 1, borderColor: '#FDE68A',
  },
  warningText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#92400E', lineHeight: 17 },

  textInput: {
    backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 12, fontSize: 14, color: '#0F172A', marginBottom: 4,
  },

  cartSection: { marginTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 10 },
  cartRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF',
    borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9',
  },
  cartName: { fontSize: 14, fontWeight: '700', color: '#0F172A', flexShrink: 1 },
  cartMeta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  addMoreButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#C7D2FE',
    borderStyle: 'dashed',
  },
  addMoreText: { fontSize: 13, fontWeight: '700', color: '#4F46E5' },

  scheduleSection: { marginTop: 20 },
  scheduleBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FEF2F2',
    borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#FECACA', marginBottom: 4,
  },
  scheduleBannerText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#991B1B', lineHeight: 17 },

  saveBar: {
    flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#FFFFFF',
    paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0',
  },
  saveBarLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  saveBarTotal: { fontSize: 17, fontWeight: '800', color: '#0F172A' },

  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 32,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  sheetSubtitle: { fontSize: 12, color: '#94A3B8', marginTop: 4, marginBottom: 14 },
  batchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFC',
    borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  batchRowSelected: { borderColor: '#4F46E5', backgroundColor: '#EEF2FF' },
  batchRowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  batchNumber: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  batchMeta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  batchEmptyTag: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },
});
