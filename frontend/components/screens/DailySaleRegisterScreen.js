import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';

/**
 * Daily Sale Register
 * One day at a time, plus a cross-date medicine search
 * ("koi bhi day ki medicine dekh sakein").
 */

const SCHEDULE_LABEL = { h1: 'H1', nrx: 'NRX' };

function shiftDate(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayLocalIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function formatDayLabel(isoDate) {
  if (isoDate === todayLocalIso()) return 'Today';
  if (isoDate === shiftDate(todayLocalIso(), -1)) return 'Yesterday';
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

function formatTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function formatDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusChip({ status }) {
  const billed = status === 'billed';
  return (
    <View style={[styles.chip, billed ? styles.chipBilled : styles.chipQuick]}>
      <ThemedText style={[styles.chipText, billed ? styles.chipTextBilled : styles.chipTextQuick]}>
        {billed ? 'Billed' : 'Quick'}
      </ThemedText>
    </View>
  );
}

function SaleCard({ sale, onPress }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.saleCard, pressed && styles.saleCardPressed]}
      onPress={() => onPress?.(sale)}
    >
      <View style={styles.saleHeader}>
        <ThemedText style={styles.saleTime}>{formatTime(sale.saleDate)}</ThemedText>
        <View style={styles.saleHeaderRight}>
          {sale.hasScheduledItem && (
            <View style={styles.h1Badge}>
              <ThemedText style={styles.h1BadgeText}>H1</ThemedText>
            </View>
          )}
          <StatusChip status={sale.status} />
        </View>
      </View>

      {sale.items.map((item) => (
        <ThemedText key={item.id} style={styles.saleItemLine} numberOfLines={2}>
          {item.productName} × {item.quantityLabel}
          {item.batchNumber ? ` — Batch ${item.batchNumber}` : ''}
        </ThemedText>
      ))}

      <View style={styles.saleFooter}>
        {sale.customerName ? (
          <ThemedText style={styles.saleCustomer} numberOfLines={1}>
            {sale.customerName}
            {sale.doctorName ? ` · Dr. ${sale.doctorName.replace(/^dr\.?\s*/i, '')}` : ''}
          </ThemedText>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {sale.totalAmount != null && (
          <ThemedText style={styles.saleAmount}>
            ₹{sale.totalAmount.toLocaleString('en-IN')}
          </ThemedText>
        )}
      </View>
    </Pressable>
  );
}

export default function DailySaleRegisterScreen({
  register,
  registerDate,
  searchResults,
  loading = false,
  onBack,
  onChangeDate,
  onSearch,
  onClearSearch,
  onSalePress,
  onSellPress,
  onPendingPress,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const summary = register?.summary || {};
  const sales = register?.sales || [];
  const isSearching = !!searchResults;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await onChangeDate?.(registerDate);
    setRefreshing(false);
  }, [onChangeDate, registerDate]);

  const handleSearchChange = useCallback((text) => {
    setSearchQuery(text);
    if (text.trim().length < 2) {
      onClearSearch?.();
    } else {
      onSearch?.(text);
    }
  }, [onSearch, onClearSearch]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    onClearSearch?.();
  }, [onClearSearch]);

  const isToday = registerDate === todayLocalIso();

  const searchSummary = useMemo(() => {
    if (!searchResults?.products?.length) return null;
    return searchResults.products;
  }, [searchResults]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppBar title="Daily Sales" onBack={onBack} />

      {/* Cross-date medicine search */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={handleSearchChange}
            placeholder="Search a medicine across all days…"
            placeholderTextColor="#94A3B8"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={clearSearch} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#CBD5E1" />
            </Pressable>
          )}
        </View>
      </View>

      {isSearching ? (
        // ===== Cross-date search results =====
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {!searchSummary && (
            <ThemedText style={styles.emptyHint}>
              No sales found for “{searchResults.query}”.
            </ThemedText>
          )}
          {searchSummary?.map((group) => (
            <View key={group.productId} style={styles.searchGroup}>
              <View style={styles.searchGroupHeader}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.searchGroupTitle}>{group.productName}</ThemedText>
                  <ThemedText style={styles.searchGroupMeta}>
                    {group.saleCount} sale{group.saleCount === 1 ? '' : 's'}
                    {group.firstSoldAt ? ` since ${formatDate(group.firstSoldAt)}` : ''}
                  </ThemedText>
                </View>
                {(group.scheduleFlag === 'h1' || group.scheduleFlag === 'nrx') && (
                  <View style={styles.h1Badge}>
                    <ThemedText style={styles.h1BadgeText}>
                      {SCHEDULE_LABEL[group.scheduleFlag]}
                    </ThemedText>
                  </View>
                )}
              </View>

              {group.sales.map((sale, index) => (
                <Pressable
                  key={`${sale.saleId}-${index}`}
                  style={styles.searchRow}
                  onPress={() => onSalePress?.({ id: sale.saleId, status: sale.status })}
                >
                  <ThemedText style={styles.searchRowDate}>{formatDate(sale.saleDate)}</ThemedText>
                  <ThemedText style={styles.searchRowQty}>{sale.quantityLabel}</ThemedText>
                  <ThemedText style={styles.searchRowBatch} numberOfLines={1}>
                    {sale.batchNumber || '—'}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      ) : (
        // ===== Daily register =====
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          {/* Date picker strip */}
          <View style={styles.dateStrip}>
            <Pressable style={styles.dateArrow} onPress={() => onChangeDate?.(shiftDate(registerDate, -1))}>
              <Ionicons name="chevron-back" size={20} color="#4F46E5" />
            </Pressable>
            <View style={styles.dateCenter}>
              <ThemedText style={styles.dateLabel}>{formatDayLabel(registerDate)}</ThemedText>
              <ThemedText style={styles.dateSub}>{registerDate}</ThemedText>
            </View>
            <Pressable
              style={[styles.dateArrow, isToday && styles.dateArrowDisabled]}
              onPress={() => !isToday && onChangeDate?.(shiftDate(registerDate, 1))}
              disabled={isToday}
            >
              <Ionicons name="chevron-forward" size={20} color={isToday ? '#CBD5E1' : '#4F46E5'} />
            </Pressable>
          </View>

          {/* Summary strip */}
          <View style={styles.summaryStrip}>
            <View style={styles.summaryItem}>
              <ThemedText style={styles.summaryValue}>{summary.totalItems || 0}</ThemedText>
              <ThemedText style={styles.summaryLabel}>Items sold</ThemedText>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <ThemedText style={styles.summaryValue}>
                ₹{(summary.totalAmount || 0).toLocaleString('en-IN')}
              </ThemedText>
              <ThemedText style={styles.summaryLabel}>Total</ThemedText>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <ThemedText style={[styles.summaryValue, (summary.unbilledCount || 0) > 0 && styles.summaryValueAmber]}>
                {summary.unbilledCount || 0}
              </ThemedText>
              <ThemedText style={styles.summaryLabel}>Unbilled</ThemedText>
            </View>
          </View>

          {/* Pending-bills shortcut. Framing is deliberate: this is a record-keeping
              tool — every sale recorded now, billed when there is time. */}
          {(summary.unbilledCount || 0) > 0 && (
            <Pressable style={styles.pendingBanner} onPress={onPendingPress}>
              <Ionicons name="receipt-outline" size={18} color="#B45309" />
              <ThemedText style={styles.pendingBannerText}>
                {summary.unbilledCount} sale{summary.unbilledCount === 1 ? '' : 's'} ready to bill whenever you have time
              </ThemedText>
              <Ionicons name="chevron-forward" size={18} color="#B45309" />
            </Pressable>
          )}

          {/* Sales list */}
          {loading && sales.length === 0 ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color="#4F46E5" />
            </View>
          ) : sales.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="cart-outline" size={52} color="#CBD5E1" />
              <ThemedText style={styles.emptyTitle}>No sales recorded</ThemedText>
              <ThemedText style={styles.emptySubtitle}>
                Tap Sell to record a sale in a couple of taps.
              </ThemedText>
            </View>
          ) : (
            sales.map((sale) => <SaleCard key={sale.id} sale={sale} onPress={onSalePress} />)
          )}
        </ScrollView>
      )}

      {/* Sell FAB */}
      <Pressable style={styles.fab} onPress={onSellPress}>
        <Ionicons name="add" size={26} color="#FFFFFF" />
        <ThemedText style={styles.fabText}>Sell</ThemedText>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { padding: 16, paddingBottom: 110 },

  searchWrap: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: '#FFFFFF', paddingBottom: 12 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFC',
    paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: '#0F172A' },

  dateStrip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 16, padding: 8, marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9',
  },
  dateArrow: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#EEF2FF',
  },
  dateArrowDisabled: { backgroundColor: '#F8FAFC' },
  dateCenter: { flex: 1, alignItems: 'center' },
  dateLabel: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  dateSub: { fontSize: 11, color: '#94A3B8', marginTop: 1 },

  summaryStrip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 16, paddingVertical: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, height: 28, backgroundColor: '#F1F5F9' },
  summaryValue: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  summaryValueAmber: { color: '#D97706' },
  summaryLabel: { fontSize: 11, color: '#94A3B8', marginTop: 2, fontWeight: '600' },

  pendingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFBEB',
    borderRadius: 14, padding: 13, marginBottom: 12, borderWidth: 1, borderColor: '#FDE68A',
  },
  pendingBannerText: { flex: 1, fontSize: 12.5, fontWeight: '700', color: '#92400E' },

  saleCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  saleCardPressed: { opacity: 0.85, backgroundColor: '#F8FAFC' },
  saleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  saleHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  saleTime: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  saleItemLine: { fontSize: 13.5, color: '#0F172A', fontWeight: '600', lineHeight: 20 },
  saleFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 8, gap: 10,
  },
  saleCustomer: { flex: 1, fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  saleAmount: { fontSize: 15, fontWeight: '800', color: '#0F172A' },

  chip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
  chipQuick: { backgroundColor: '#FEF3C7' },
  chipBilled: { backgroundColor: '#CCFBF1' },
  chipText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  chipTextQuick: { color: '#B45309' },
  chipTextBilled: { color: '#0F766E' },

  h1Badge: {
    borderWidth: 1.5, borderColor: '#DC2626', borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  h1BadgeText: { fontSize: 10, fontWeight: '800', color: '#DC2626', letterSpacing: 0.3 },

  searchGroup: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  searchGroupHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
  searchGroupTitle: { fontSize: 14.5, fontWeight: '700', color: '#0F172A' },
  searchGroupMeta: { fontSize: 12, color: '#4F46E5', marginTop: 2, fontWeight: '600' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9,
    borderTopWidth: 1, borderTopColor: '#F8FAFC',
  },
  searchRowDate: { flex: 1.2, fontSize: 12, color: '#64748B', fontWeight: '600' },
  searchRowQty: { flex: 1, fontSize: 12, color: '#0F172A', fontWeight: '700' },
  searchRowBatch: { flex: 1, fontSize: 11.5, color: '#94A3B8', textAlign: 'right' },

  loadingBox: { paddingVertical: 48, alignItems: 'center' },
  emptyBox: {
    alignItems: 'center', paddingVertical: 48, gap: 8, backgroundColor: '#FFFFFF',
    borderRadius: 20, borderWidth: 1, borderColor: '#F1F5F9', borderStyle: 'dashed',
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#334155' },
  emptySubtitle: { fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingHorizontal: 24 },
  emptyHint: { textAlign: 'center', color: '#94A3B8', marginTop: 32, fontSize: 13 },

  fab: {
    position: 'absolute', right: 20, bottom: 28, flexDirection: 'row', alignItems: 'center',
    gap: 6, backgroundColor: '#4F46E5', paddingHorizontal: 22, height: 56, borderRadius: 28,
    shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4,
    shadowRadius: 14, elevation: 8,
  },
  fabText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
});
