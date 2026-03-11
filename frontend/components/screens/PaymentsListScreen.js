import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AppBar from '@/components/ui/AppBar';
import Card from '@/components/ui/Card';
import Chip from '@/components/ui/Chip';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { getPaymentAppName, formatPaymentAmount } from '@/utils/paymentParser';

/**
 * Payment App Badge
 */
const AppBadge = ({ app }) => {
  const colors = {
    google_pay: { bg: '#E8F5E9', text: '#2E7D32', border: '#A5D6A7' },
    phonepe: { bg: '#E8EAF6', text: '#283593', border: '#9FA8DA' },
    paytm: { bg: '#E3F2FD', text: '#1565C0', border: '#90CAF9' },
    bhim: { bg: '#FFF3E0', text: '#E65100', border: '#FFCC80' },
    amazon_pay: { bg: '#FFF8E1', text: '#F57F17', border: '#FFE082' },
    default: { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' },
  };
  const c = colors[app] || colors.default;

  return (
    <View style={[styles.appBadge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <ThemedText style={[styles.appBadgeText, { color: c.text }]}>
        {getPaymentAppName(app)}
      </ThemedText>
    </View>
  );
};

/**
 * Payment Row Component
 */
const PaymentRow = React.memo(({ item, onPress, onDelete }) => {
  const formatDate = (dateString) => {
    if (!dateString) return 'No Date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return '#059669';
      case 'failed': return '#DC2626';
      case 'pending': return '#D97706';
      default: return '#64748B';
    }
  };

  const handleLongPress = () => {
    Alert.alert(
      'Delete Payment',
      `Delete this payment of ${formatPaymentAmount(item.amount)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete?.(item.id) },
      ]
    );
  };

  return (
    <Pressable
      onPress={() => onPress?.(item)}
      onLongPress={handleLongPress}
      style={({ pressed }) => [
        styles.paymentRow,
        pressed && styles.paymentRowPressed,
      ]}
    >
      <View style={styles.paymentRowLeft}>
        <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.paymentStatus) }]} />
        <View style={styles.paymentRowInfo}>
          <ThemedText style={styles.paymentPayee} numberOfLines={1}>
            {item.distributor?.name || item.payeeName || 'Unknown Payee'}
          </ThemedText>
          <View style={styles.paymentMeta}>
            <ThemedText style={styles.paymentDate}>
              {formatDate(item.paymentDate)}
            </ThemedText>
            {item.transactionId && (
              <ThemedText style={styles.paymentTxnId} numberOfLines={1}>
                • ID: {item.transactionId.substring(0, 12)}{item.transactionId.length > 12 ? '...' : ''}
              </ThemedText>
            )}
          </View>
        </View>
      </View>
      <View style={styles.paymentRowRight}>
        <ThemedText style={styles.paymentAmount}>
          {formatPaymentAmount(item.amount)}
        </ThemedText>
        {item.paymentApp && <AppBadge app={item.paymentApp} />}
      </View>
    </Pressable>
  );
});

PaymentRow.displayName = 'PaymentRow';

/**
 * Stats Card Component
 */
const StatsCard = ({ stats }) => {
  if (!stats) return null;

  return (
    <Card style={styles.statsCard}>
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <ThemedText style={styles.statValue}>
            {formatPaymentAmount(stats.totalPaid)}
          </ThemedText>
          <ThemedText style={styles.statLabel}>Total Paid</ThemedText>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <ThemedText style={[styles.statValue, { color: '#4F46E5' }]}>
            {stats.totalPayments || 0}
          </ThemedText>
          <ThemedText style={styles.statLabel}>Payments</ThemedText>
        </View>
      </View>
    </Card>
  );
};

/**
 * PaymentsListScreen
 * Shows payment history with filtering and stats
 */
export default function PaymentsListScreen({
  payments = [],
  stats = null,
  onBack,
  onPaymentPress,
  onDeletePayment,
  onAddPayment,
  onRefresh,
  loading = false,
  refreshing = false,
  onLoadMore,
  hasMore = false,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterApp, setFilterApp] = useState(null);

  // Filter payments
  const filteredPayments = useMemo(() => {
    let result = payments;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        (p.distributor?.name || '').toLowerCase().includes(q) ||
        (p.payeeName || '').toLowerCase().includes(q) ||
        (p.transactionId || '').toLowerCase().includes(q) ||
        (p.notes || '').toLowerCase().includes(q)
      );
    }

    if (filterApp) {
      result = result.filter(p => p.paymentApp === filterApp);
    }

    return result;
  }, [payments, searchQuery, filterApp]);

  // Get unique payment apps for filter
  const paymentApps = useMemo(() => {
    const apps = new Set(payments.map(p => p.paymentApp).filter(Boolean));
    return Array.from(apps);
  }, [payments]);

  const renderPayment = useCallback(({ item }) => (
    <PaymentRow
      item={item}
      onPress={onPaymentPress}
      onDelete={onDeletePayment}
    />
  ), [onPaymentPress, onDeletePayment]);

  const keyExtractor = useCallback((item) => item.id, []);

  const ListHeader = () => (
    <>
      {/* Stats */}
      <StatsCard stats={stats} />

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#94A3B8" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search payments..."
          placeholderTextColor="#94A3B8"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </Pressable>
        )}
      </View>

      {/* App Filters */}
      {paymentApps.length > 0 && (
        <View style={styles.filterRow}>
          <Pressable
            style={[styles.filterChip, !filterApp && styles.filterChipActive]}
            onPress={() => setFilterApp(null)}
          >
            <ThemedText style={[styles.filterChipText, !filterApp && styles.filterChipTextActive]}>
              All
            </ThemedText>
          </Pressable>
          {paymentApps.map(app => (
            <Pressable
              key={app}
              style={[styles.filterChip, filterApp === app && styles.filterChipActive]}
              onPress={() => setFilterApp(filterApp === app ? null : app)}
            >
              <ThemedText style={[styles.filterChipText, filterApp === app && styles.filterChipTextActive]}>
                {getPaymentAppName(app)}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      )}

      {/* Results Count */}
      <View style={styles.resultsHeader}>
        <ThemedText style={styles.resultsCount}>
          {filteredPayments.length} payment{filteredPayments.length !== 1 ? 's' : ''}
        </ThemedText>
      </View>
    </>
  );

  const ListEmpty = () => (
    <View style={styles.emptyContainer}>
      <MaterialIcons name="payment" size={64} color="#CBD5E1" />
      <ThemedText style={styles.emptyTitle}>No Payments Yet</ThemedText>
      <ThemedText style={styles.emptySubtitle}>
        When you make a payment via Google Pay, PhonePe, or any UPI app,{'\n'}
        share the receipt with this app to track it.
      </ThemedText>
      <PrimaryButton
        title="Record Payment"
        icon="add-circle-outline"
        onPress={onAddPayment}
        fullWidth={false}
      />
    </View>
  );

  const ListFooter = () => {
    if (!hasMore) return <View style={styles.bottomSpacer} />;

    return (
      <Pressable style={styles.loadMoreButton} onPress={onLoadMore}>
        {loading ? (
          <ActivityIndicator size="small" color="#4F46E5" />
        ) : (
          <ThemedText style={styles.loadMoreText}>Load More</ThemedText>
        )}
      </Pressable>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <AppBar
          title="Payments"
          onBack={onBack}
          rightIcon="add-circle-outline"
          onRightPress={onAddPayment}
        />

        <FlatList
          data={filteredPayments}
          renderItem={renderPayment}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={payments.length === 0 && !loading ? ListEmpty : null}
          ListFooterComponent={ListFooter}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#4F46E5']}
              tintColor="#4F46E5"
            />
          }
        />

        {loading && payments.length === 0 && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#4F46E5" />
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  safeArea: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },

  // Stats Card
  statsCard: {
    padding: 20,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 16,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#059669',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
  },

  // Filter
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  // Results Header
  resultsHeader: {
    marginBottom: 8,
  },
  resultsCount: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },

  // Payment Row
  paymentRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.6)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  paymentRowPressed: {
    opacity: 0.7,
  },
  paymentRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  paymentRowInfo: {
    flex: 1,
  },
  paymentPayee: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  paymentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  paymentDate: {
    fontSize: 12,
    color: '#64748B',
  },
  paymentTxnId: {
    fontSize: 12,
    color: '#94A3B8',
    maxWidth: 140,
  },
  paymentRowRight: {
    alignItems: 'flex-end',
    gap: 6,
    marginLeft: 12,
  },
  paymentAmount: {
    fontSize: 17,
    fontWeight: '700',
    color: '#059669',
  },
  appBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  appBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 20,
  },

  // Footer
  loadMoreButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadMoreText: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 24,
  },

  // Loading
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(248, 250, 252, 0.8)',
  },
});
