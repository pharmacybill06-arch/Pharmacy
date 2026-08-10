import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import Card from '@/components/ui/Card';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DateField from '@/components/ui/DateField';
import { useEnrichedProductList, useProductCRUD } from '@/hooks/useProducts';
import { productApi, distributorApi } from '@/services/api';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getExpiryColor(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return '#94A3B8';
  if (daysLeft < 90) return '#EF4444';
  if (daysLeft < 180) return '#F59E0B';
  return '#10B981';
}

function ddmmyyyyToIso(value) {
  const m = String(value || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Batch row — used inside an expanded product card
 */
function BatchRow({ batch }) {
  const color = getExpiryColor(batch.daysLeft);
  return (
    <View style={[styles.batchRow, batch.isArchived && styles.batchRowArchived]}>
      <View style={styles.batchRowTop}>
        <ThemedText style={[styles.batchNumber, batch.matchedSearch && styles.batchNumberHighlight]} numberOfLines={1}>
          Batch {batch.batchNumber || '—'}
        </ThemedText>
        {batch.isArchived && (
          <View style={styles.archivedTag}>
            <ThemedText style={styles.archivedTagText}>Archived</ThemedText>
          </View>
        )}
      </View>
      <View style={styles.batchRowMeta}>
        <ThemedText style={styles.batchMetaText}>Qty {batch.quantity ?? '—'}</ThemedText>
        <ThemedText style={styles.batchMetaDot}>·</ThemedText>
        {batch.daysLeft !== null ? (
          <ThemedText style={[styles.batchMetaText, { color }]}>
            Exp: {batch.expiryDate} · {batch.daysLeft}d left
          </ThemedText>
        ) : (
          <ThemedText style={[styles.batchMetaText, { color: '#94A3B8' }]}>
            Exp: {batch.expiryDate || 'Unknown'}
          </ThemedText>
        )}
      </View>
      <View style={styles.batchRowMeta}>
        <ThemedText style={styles.batchMetaTextMuted} numberOfLines={1}>
          {batch.distributorName || 'Unknown distributor'}
        </ThemedText>
        {batch.invoiceNumber && (
          <>
            <ThemedText style={styles.batchMetaDot}>·</ThemedText>
            <ThemedText style={styles.batchMetaTextMuted} numberOfLines={1}>
              Inv #{batch.invoiceNumber}{batch.invoiceDate ? ` · ${batch.invoiceDate}` : ''}
            </ThemedText>
          </>
        )}
      </View>
    </View>
  );
}

/**
 * Product card — new redesigned layout with expand-in-place batch list
 */
const ProductCard = React.memo(({ item, expanded, onToggleExpand, onEdit, onLongPress, onSell }) => {
  const color = getExpiryColor(item.daysToEarliestExpiry);
  const searchMatch = item.batches.find((b) => b.matchedSearch);

  return (
    <Card style={styles.productCardInner} noPadding>
      <Pressable
        onPress={() => onToggleExpand(item.id)}
        onLongPress={() => onLongPress(item)}
        style={({ pressed }) => pressed && styles.pressedOverlay}
      >
        <View style={styles.cardTopRow}>
          <View style={styles.cardTextCol}>
            <ThemedText style={styles.productName} numberOfLines={1}>
              {item.name}
            </ThemedText>
            {item.daysToEarliestExpiry !== null ? (
              <ThemedText style={[styles.expiryLine, { color }]} numberOfLines={1}>
                Exp: {item.earliestExpiry} · {item.daysToEarliestExpiry}d left
              </ThemedText>
            ) : (
              <ThemedText style={[styles.expiryLine, { color: '#94A3B8' }]} numberOfLines={1}>
                Exp: {item.earliestExpiry || 'Unknown'}
              </ThemedText>
            )}
            <ThemedText style={styles.distributorLine} numberOfLines={1}>
              {item.distributors.length === 1
                ? item.distributors[0]
                : item.distributors.length > 1
                ? `${item.distributors.length} distributors`
                : 'No distributor on record'}
            </ThemedText>
            {searchMatch && (
              <View style={styles.matchTag}>
                <ThemedText style={styles.matchTagText} numberOfLines={1}>
                  Invoice #{searchMatch.invoiceNumber} · {searchMatch.distributorName} · {searchMatch.invoiceDate || ''}
                </ThemedText>
              </View>
            )}
          </View>
          <View style={styles.cardRightCol}>
            <View style={styles.batchBadge}>
              <ThemedText style={styles.batchBadgeText}>{item.batchCount}</ThemedText>
              <ThemedText style={styles.batchBadgeLabel}>batch{item.batchCount === 1 ? '' : 'es'}</ThemedText>
            </View>
            {/* Sell straight from the list — the counter path is never more than a tap away */}
            <Pressable onPress={() => onSell?.(item)} hitSlop={8} style={styles.sellIconButton}>
              <Ionicons name="cart-outline" size={16} color="#4F46E5" />
            </Pressable>
            <Pressable onPress={() => onEdit(item)} hitSlop={8} style={styles.editIconButton}>
              <Ionicons name="create-outline" size={16} color="#64748B" />
            </Pressable>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#94A3B8" />
          </View>
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.batchListContainer}>
          {item.batches.map((b, idx) => (
            <BatchRow key={`${b.billId}-${idx}`} batch={b} />
          ))}
        </View>
      )}
    </Card>
  );
});

ProductCard.displayName = 'ProductCard';

/**
 * Month-year picker modal (no native picker exists in this app — built inline)
 */
function ExpiryMonthModal({ visible, value, onClose, onSelect }) {
  const now = new Date();
  const [year, setYear] = useState(() => {
    if (value) {
      const [, y] = value.split('-');
      return Number(y);
    }
    return now.getFullYear();
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>Expiring in</ThemedText>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#64748B" />
            </Pressable>
          </View>
          <View style={styles.yearStepper}>
            <Pressable onPress={() => setYear((y) => y - 1)} hitSlop={8}>
              <Ionicons name="chevron-back" size={20} color="#4F46E5" />
            </Pressable>
            <ThemedText style={styles.yearText}>{year}</ThemedText>
            <Pressable onPress={() => setYear((y) => y + 1)} hitSlop={8}>
              <Ionicons name="chevron-forward" size={20} color="#4F46E5" />
            </Pressable>
          </View>
          <View style={styles.monthGrid}>
            {MONTH_NAMES.map((name, idx) => {
              const mm = String(idx + 1).padStart(2, '0');
              const key = `${mm}-${year}`;
              const isSelected = value === key;
              return (
                <Pressable
                  key={key}
                  style={[styles.monthCell, isSelected && styles.monthCellSelected]}
                  onPress={() => {
                    onSelect(key);
                    onClose();
                  }}
                >
                  <ThemedText style={[styles.monthCellText, isSelected && styles.monthCellTextSelected]}>
                    {name}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          {value && (
            <Pressable
              style={styles.modalClearButton}
              onPress={() => {
                onSelect(null);
                onClose();
              }}
            >
              <ThemedText style={styles.modalClearButtonText}>Clear</ThemedText>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Received-on date range modal
 */
function ReceivedRangeModal({ visible, from, to, onClose, onApply }) {
  const [fromLocal, setFromLocal] = useState(from || '');
  const [toLocal, setToLocal] = useState(to || '');

  useEffect(() => {
    if (visible) {
      setFromLocal(from || '');
      setToLocal(to || '');
    }
  }, [visible, from, to]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>Received on</ThemedText>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#64748B" />
            </Pressable>
          </View>
          <DateField label="From" value={fromLocal} onChange={setFromLocal} />
          <DateField label="To" value={toLocal} onChange={setToLocal} />
          <View style={styles.modalActionRow}>
            <Pressable
              style={styles.modalClearButton}
              onPress={() => {
                onApply(null, null);
                onClose();
              }}
            >
              <ThemedText style={styles.modalClearButtonText}>Clear</ThemedText>
            </Pressable>
            <Pressable
              style={styles.modalApplyButton}
              onPress={() => {
                onApply(ddmmyyyyToIso(fromLocal), ddmmyyyyToIso(toLocal));
                onClose();
              }}
            >
              <ThemedText style={styles.modalApplyButtonText}>Apply</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Distributor multi-select modal
 */
function DistributorModal({ visible, distributors, selectedIds, onClose, onApply }) {
  const [localSelected, setLocalSelected] = useState(selectedIds);

  useEffect(() => {
    if (visible) setLocalSelected(selectedIds);
  }, [visible, selectedIds]);

  const toggle = (id) => {
    setLocalSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>Distributor</ThemedText>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#64748B" />
            </Pressable>
          </View>
          <ScrollView style={styles.distributorList}>
            {distributors.map((d) => {
              const isSelected = localSelected.includes(d.id);
              return (
                <Pressable key={d.id} style={styles.distributorRow} onPress={() => toggle(d.id)}>
                  <Ionicons
                    name={isSelected ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={isSelected ? '#4F46E5' : '#94A3B8'}
                  />
                  <ThemedText style={styles.distributorRowText} numberOfLines={1}>
                    {d.name}
                  </ThemedText>
                </Pressable>
              );
            })}
            {distributors.length === 0 && (
              <ThemedText style={styles.noDistributorsText}>No distributors yet</ThemedText>
            )}
          </ScrollView>
          <View style={styles.modalActionRow}>
            <Pressable
              style={styles.modalClearButton}
              onPress={() => {
                onApply([]);
                onClose();
              }}
            >
              <ThemedText style={styles.modalClearButtonText}>Clear</ThemedText>
            </Pressable>
            <Pressable
              style={styles.modalApplyButton}
              onPress={() => {
                onApply(localSelected);
                onClose();
              }}
            >
              <ThemedText style={styles.modalApplyButtonText}>Apply</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Empty State
 */
const EmptyState = ({ hasActiveFilters, onClearFilters, onAddPress }) => (
  <View style={styles.emptyContainer}>
    <View style={styles.emptyIconContainer}>
      <Ionicons name="cube-outline" size={64} color="#CBD5E1" />
    </View>
    <ThemedText style={styles.emptyTitle}>
      {hasActiveFilters ? 'No products match' : 'No products yet'}
    </ThemedText>
    {hasActiveFilters ? (
      <Pressable style={styles.emptyAddButton} onPress={onClearFilters}>
        <ThemedText style={styles.emptyAddButtonText}>Clear filters?</ThemedText>
      </Pressable>
    ) : (
      <>
        <ThemedText style={styles.emptySubtitle}>
          Products will be automatically added when you save bills, or you can add them manually
        </ThemedText>
        <Pressable style={styles.emptyAddButton} onPress={onAddPress}>
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <ThemedText style={styles.emptyAddButtonText}>Add Product</ThemedText>
        </Pressable>
      </>
    )}
  </View>
);

/**
 * ProductsListScreen
 * Batch-aware product list: search across name/batch/invoice, distributor +
 * expiry-month + received-date filters, FEFO sort, expand-in-place batch view.
 */
export default function ProductsListScreen({ userId, onBack, onProductPress, onAddPress, onSellPress }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteDialog, setDeleteDialog] = useState({ visible: false, product: null });
  const [expandedId, setExpandedId] = useState(null);
  const [distributorModalVisible, setDistributorModalVisible] = useState(false);
  const [monthModalVisible, setMonthModalVisible] = useState(false);
  const [rangeModalVisible, setRangeModalVisible] = useState(false);
  const [distributors, setDistributors] = useState([]);

  const {
    products,
    pagination,
    distributorIds,
    setDistributorIds,
    expiryMonth,
    setExpiryMonth,
    receivedFrom,
    receivedTo,
    setReceivedRange,
    sort,
    setSort,
    activeFilterCount,
    clearAllFilters,
    isLoading,
    isRefreshing,
    error,
    refresh,
    loadMore,
    updateSearch,
  } = useEnrichedProductList(userId);

  const { deleteProduct, isLoading: isDeleting } = useProductCRUD(userId);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      updateSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, updateSearch]);

  // Fetch distributor options once
  useEffect(() => {
    if (!userId) return;
    distributorApi.getDistributors(userId).then((res) => {
      setDistributors(res.distributors || []);
    }).catch(() => {});
  }, [userId]);

  const distributorNameById = useMemo(
    () => new Map(distributors.map((d) => [d.id, d.name])),
    [distributors]
  );

  const handleToggleExpand = useCallback((id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleEdit = useCallback(async (item) => {
    try {
      const res = await productApi.getProductById(userId, item.id);
      onProductPress?.(res.product);
    } catch (err) {
      Alert.alert('Error', 'Failed to load product details.');
    }
  }, [userId, onProductPress]);

  const handleLongPress = useCallback((product) => {
    setDeleteDialog({ visible: true, product });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    const product = deleteDialog.product;
    setDeleteDialog({ visible: false, product: null });
    try {
      await deleteProduct(product.id);
      refresh();
    } catch (err) {
      Alert.alert('Error', 'Failed to delete product. Please try again.');
    }
  }, [deleteDialog.product, deleteProduct, refresh]);

  const renderItem = useCallback(
    ({ item }) => (
      <ProductCard
        item={item}
        expanded={expandedId === item.id}
        onToggleExpand={handleToggleExpand}
        onEdit={handleEdit}
        onLongPress={handleLongPress}
        onSell={onSellPress}
      />
    ),
    [expandedId, handleToggleExpand, handleEdit, handleLongPress, onSellPress]
  );

  const keyExtractor = useCallback((item) => item.id, []);

  const renderFooter = useCallback(() => {
    if (!pagination.hasMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#4F46E5" />
      </View>
    );
  }, [pagination.hasMore]);

  const hasActiveFilters = activeFilterCount > 0 || !!searchQuery;

  const ListEmptyComponent = useCallback(
    () => (
      <EmptyState
        hasActiveFilters={hasActiveFilters}
        onClearFilters={() => {
          setSearchQuery('');
          clearAllFilters();
        }}
        onAddPress={onAddPress}
      />
    ),
    [hasActiveFilters, clearAllFilters, onAddPress]
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <AppBar title="My Products" onBack={onBack} rightIcon="add" onRightPress={onAddPress} />

        <View style={styles.content}>
          {/* Search Bar */}
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={20} color="#64748B" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, batch or invoice #..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="#94A3B8" />
              </Pressable>
            )}
          </View>

          {/* Filter chip row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
            <Pressable
              style={[styles.filterChip, distributorIds.length > 0 && styles.filterChipActive]}
              onPress={() => setDistributorModalVisible(true)}
            >
              <ThemedText style={[styles.filterChipText, distributorIds.length > 0 && styles.filterChipTextActive]}>
                Distributor{distributorIds.length > 0 ? ` (${distributorIds.length})` : ''}
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.filterChip, expiryMonth && styles.filterChipActive]}
              onPress={() => setMonthModalVisible(true)}
            >
              <ThemedText style={[styles.filterChipText, expiryMonth && styles.filterChipTextActive]}>
                Expiring in{expiryMonth ? `: ${expiryMonth}` : ''}
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.filterChip, (receivedFrom || receivedTo) && styles.filterChipActive]}
              onPress={() => setRangeModalVisible(true)}
            >
              <ThemedText style={[styles.filterChipText, (receivedFrom || receivedTo) && styles.filterChipTextActive]}>
                Received on
              </ThemedText>
            </Pressable>
            <View style={styles.filterDivider} />
            <Pressable style={[styles.sortChip, sort === 'fefo' && styles.sortChipActive]} onPress={() => setSort('fefo')}>
              <ThemedText style={[styles.sortChipText, sort === 'fefo' && styles.sortChipTextActive]}>Earliest expiry</ThemedText>
            </Pressable>
            <Pressable style={[styles.sortChip, sort === 'name' && styles.sortChipActive]} onPress={() => setSort('name')}>
              <ThemedText style={[styles.sortChipText, sort === 'name' && styles.sortChipTextActive]}>A-Z</ThemedText>
            </Pressable>
          </ScrollView>

          {/* Active filter chips */}
          {(distributorIds.length > 0 || expiryMonth || receivedFrom || receivedTo) && (
            <View style={styles.activeChipsRow}>
              {distributorIds.map((id) => (
                <Pressable
                  key={id}
                  style={styles.activeChip}
                  onPress={() => setDistributorIds(distributorIds.filter((x) => x !== id))}
                >
                  <ThemedText style={styles.activeChipText} numberOfLines={1}>
                    {distributorNameById.get(id) || id}
                  </ThemedText>
                  <Ionicons name="close" size={12} color="#4F46E5" />
                </Pressable>
              ))}
              {expiryMonth && (
                <Pressable style={styles.activeChip} onPress={() => setExpiryMonth(null)}>
                  <ThemedText style={styles.activeChipText}>Exp {expiryMonth}</ThemedText>
                  <Ionicons name="close" size={12} color="#4F46E5" />
                </Pressable>
              )}
              {(receivedFrom || receivedTo) && (
                <Pressable style={styles.activeChip} onPress={() => setReceivedRange(null, null)}>
                  <ThemedText style={styles.activeChipText}>Received range</ThemedText>
                  <Ionicons name="close" size={12} color="#4F46E5" />
                </Pressable>
              )}
              {activeFilterCount >= 2 && (
                <Pressable style={styles.clearAllChip} onPress={clearAllFilters}>
                  <ThemedText style={styles.clearAllChipText}>Clear all</ThemedText>
                </Pressable>
              )}
            </View>
          )}

          {/* Stats Bar */}
          <View style={styles.statsBar}>
            <ThemedText style={styles.statsText}>
              {pagination.total} {pagination.total === 1 ? 'product' : 'products'}
            </ThemedText>
          </View>

          {error && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={24} color="#DC2626" />
              <ThemedText style={styles.errorText}>{error}</ThemedText>
              <Pressable style={styles.retryButton} onPress={refresh}>
                <ThemedText style={styles.retryText}>Retry</ThemedText>
              </Pressable>
            </View>
          )}

          <FlatList
            data={products}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={!isLoading ? ListEmptyComponent : null}
            ListFooterComponent={renderFooter}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={refresh} colors={['#4F46E5']} tintColor="#4F46E5" />
            }
          />
        </View>

        <ConfirmDialog
          visible={deleteDialog.visible}
          title="Delete Product"
          message={`Are you sure you want to delete "${deleteDialog.product?.name}"? This action cannot be undone.`}
          type="danger"
          confirmText={isDeleting ? 'Deleting...' : 'Delete'}
          cancelText="Cancel"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteDialog({ visible: false, product: null })}
        />

        <DistributorModal
          visible={distributorModalVisible}
          distributors={distributors}
          selectedIds={distributorIds}
          onClose={() => setDistributorModalVisible(false)}
          onApply={setDistributorIds}
        />
        <ExpiryMonthModal
          visible={monthModalVisible}
          value={expiryMonth}
          onClose={() => setMonthModalVisible(false)}
          onSelect={setExpiryMonth}
        />
        <ReceivedRangeModal
          visible={rangeModalVisible}
          from={receivedFrom}
          to={receivedTo}
          onClose={() => setRangeModalVisible(false)}
          onApply={setReceivedRange}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  safeArea: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15, color: '#0F172A', fontWeight: '500' },

  filterRow: { flexGrow: 0, marginBottom: 8 },
  filterRowContent: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: { backgroundColor: '#EEF2FF', borderColor: '#4F46E5' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  filterChipTextActive: { color: '#4F46E5' },
  filterDivider: { width: 1, height: 20, backgroundColor: '#E2E8F0', marginHorizontal: 2 },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sortChipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  sortChipText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  sortChipTextActive: { color: '#FFFFFF' },

  activeChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    maxWidth: 200,
  },
  activeChipText: { fontSize: 11, fontWeight: '600', color: '#4F46E5' },
  clearAllChip: { paddingHorizontal: 10, paddingVertical: 5 },
  clearAllChipText: { fontSize: 11, fontWeight: '700', color: '#DC2626' },

  statsBar: { paddingVertical: 6, paddingHorizontal: 4 },
  statsText: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  listContent: { paddingBottom: 100 },

  productCardInner: { padding: 0, borderRadius: 18, marginBottom: 10, overflow: 'hidden' },
  pressedOverlay: { opacity: 0.7 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 14 },
  cardTextCol: { flex: 1, marginRight: 10 },
  productName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  expiryLine: { fontSize: 13, fontWeight: '600', marginTop: 3 },
  distributorLine: { fontSize: 12, color: '#64748B', marginTop: 3 },
  matchTag: {
    marginTop: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  matchTagText: { fontSize: 11, fontWeight: '600', color: '#92400E' },
  cardRightCol: { alignItems: 'flex-end', gap: 6 },
  batchBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    minWidth: 56,
  },
  batchBadgeText: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  batchBadgeLabel: { fontSize: 9, color: '#64748B', textTransform: 'uppercase' },
  editIconButton: { padding: 2 },
  sellIconButton: {
    padding: 5,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
  },

  batchListContainer: { borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  batchRow: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  batchRowArchived: { opacity: 0.55 },
  batchRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  batchNumber: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  batchNumberHighlight: { backgroundColor: '#FEF3C7', paddingHorizontal: 4, borderRadius: 4 },
  archivedTag: { backgroundColor: '#E2E8F0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  archivedTagText: { fontSize: 9, fontWeight: '700', color: '#475569', textTransform: 'uppercase' },
  batchRowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  batchMetaText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  batchMetaTextMuted: { fontSize: 12, color: '#64748B' },
  batchMetaDot: { fontSize: 12, color: '#CBD5E1' },

  footerLoader: { paddingVertical: 20, alignItems: 'center' },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 32,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#0F172A', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
  },
  emptyAddButtonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },

  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    gap: 8,
  },
  errorText: { flex: 1, fontSize: 13, color: '#DC2626' },
  retryButton: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#DC2626', borderRadius: 6 },
  retryText: { fontSize: 12, fontWeight: '600', color: '#FFFFFF' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  modalActionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalClearButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  modalClearButtonText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  modalApplyButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#4F46E5' },
  modalApplyButtonText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  yearStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 16 },
  yearText: { fontSize: 16, fontWeight: '700', color: '#0F172A', minWidth: 60, textAlign: 'center' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  monthCell: {
    width: '30%',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    marginBottom: 8,
  },
  monthCellSelected: { backgroundColor: '#4F46E5' },
  monthCellText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  monthCellTextSelected: { color: '#FFFFFF' },

  distributorList: { maxHeight: 320 },
  distributorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  distributorRowText: { fontSize: 14, color: '#0F172A', flex: 1 },
  noDistributorsText: { fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingVertical: 20 },
});
