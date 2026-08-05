import React, { useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AppBar from '@/components/ui/AppBar';
import Card from '@/components/ui/Card';

function formatAmount(amount) {
  const n = parseFloat(amount) || 0;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatDate(dateString) {
  if (!dateString) return 'No payments yet';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Distributor Row — Screen A
 */
const DistributorLedgerRow = React.memo(({ item, onPress }) => (
  <Pressable
    onPress={() => onPress?.(item)}
    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
  >
    <View style={styles.avatar}>
      <ThemedText style={styles.avatarText}>{(item.name || 'D').charAt(0).toUpperCase()}</ThemedText>
    </View>

    <View style={styles.rowMain}>
      <View style={styles.rowNameLine}>
        <ThemedText style={styles.rowName} numberOfLines={1}>{item.name}</ThemedText>
        {item.overdue > 0 && (
          <View style={styles.overdueBadge}>
            <ThemedText style={styles.overdueBadgeText}>Overdue</ThemedText>
          </View>
        )}
      </View>
      <ThemedText style={styles.rowMeta}>
        Last payment: {formatDate(item.lastPaymentDate)}
      </ThemedText>
    </View>

    <View style={styles.rowRight}>
      <ThemedText style={[styles.rowOutstanding, item.outstanding <= 0 && styles.rowOutstandingZero]}>
        {formatAmount(item.outstanding)}
      </ThemedText>
      {item.overdue > 0 && (
        <ThemedText style={styles.rowOverdue}>{formatAmount(item.overdue)} overdue</ThemedText>
      )}
    </View>
  </Pressable>
));
DistributorLedgerRow.displayName = 'DistributorLedgerRow';

/**
 * Screen A — Distributor Payments List
 */
export default function DistributorLedgerListScreen({
  distributors = [],
  totalOutstanding = 0,
  totalOverdue = 0,
  onBack,
  onDistributorPress,
  onRecordPayment,
  loading = false,
  refreshing = false,
  onRefresh,
}) {
  const renderItem = useCallback(({ item }) => (
    <DistributorLedgerRow item={item} onPress={onDistributorPress} />
  ), [onDistributorPress]);

  const keyExtractor = useCallback((item) => item.id, []);

  const ListHeader = () => (
    <Card style={styles.summaryCard}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryBox}>
          <ThemedText style={styles.summaryValue}>{formatAmount(totalOutstanding)}</ThemedText>
          <ThemedText style={styles.summaryLabel}>Total Outstanding</ThemedText>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryBox}>
          <ThemedText style={[styles.summaryValue, styles.summaryValueRed]}>{formatAmount(totalOverdue)}</ThemedText>
          <ThemedText style={styles.summaryLabel}>Total Overdue</ThemedText>
        </View>
      </View>
    </Card>
  );

  const ListEmpty = () => (
    <View style={styles.emptyContainer}>
      <MaterialIcons name="account-balance-wallet" size={64} color="#CBD5E1" />
      <ThemedText style={styles.emptyTitle}>No Distributor Dues Yet</ThemedText>
      <ThemedText style={styles.emptySubtitle}>
        Once you add bills from distributors, their outstanding balances will show up here.
      </ThemedText>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <AppBar
          title="Distributor Payments"
          onBack={onBack}
          rightIcon="add-circle-outline"
          onRightPress={onRecordPayment}
        />

        <FlatList
          data={distributors}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={!loading ? ListEmpty : null}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} tintColor="#4F46E5" />
          }
        />

        {loading && distributors.length === 0 && (
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
  listContent: { padding: 16, paddingBottom: 32 },

  summaryCard: { padding: 20, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryBox: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, height: 40, backgroundColor: '#E2E8F0', marginHorizontal: 16 },
  summaryValue: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  summaryValueRed: { color: '#DC2626' },
  summaryLabel: { fontSize: 11, color: '#64748B', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.3 },

  row: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.6)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  rowPressed: { opacity: 0.7 },
  avatar: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#C7D2FE', marginRight: 12,
  },
  avatarText: { fontSize: 17, fontWeight: '700', color: '#4F46E5' },
  rowMain: { flex: 1, marginRight: 8 },
  rowNameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName: { fontSize: 15, fontWeight: '600', color: '#0F172A', flexShrink: 1 },
  rowMeta: { fontSize: 12, color: '#94A3B8', marginTop: 3 },
  overdueBadge: { backgroundColor: '#FEE2E2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#FECACA' },
  overdueBadgeText: { fontSize: 9, fontWeight: '700', color: '#DC2626', textTransform: 'uppercase', letterSpacing: 0.3 },
  rowRight: { alignItems: 'flex-end' },
  rowOutstanding: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  rowOutstandingZero: { color: '#94A3B8' },
  rowOverdue: { fontSize: 11, color: '#DC2626', marginTop: 3, fontWeight: '600' },

  emptyContainer: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 8, lineHeight: 20 },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(248, 250, 252, 0.8)',
  },
});
