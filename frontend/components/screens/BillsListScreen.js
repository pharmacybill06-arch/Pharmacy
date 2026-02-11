import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import Card from '@/components/ui/Card';
import Chip from '@/components/ui/Chip';

/**
 * Bill List Item Component (Memoized for performance)
 */
const BillListItem = React.memo(({ item, onPress }) => {
  const getPaymentVariant = (type) => {
    if (type?.toLowerCase() === 'credit') return 'credit';
    if (type?.toLowerCase() === 'cash') return 'cash';
    return 'default';
  };

  // Get distributor name (prefer distributor relation, fallback to pharmacyName)
  const getDistributorName = () => {
    if (item.distributor?.name) return item.distributor.name;
    if (item.pharmacyName) return item.pharmacyName;
    return 'Unknown Distributor';
  };

  // Check if this is a legacy record (no distributor linked)
  const isLegacyRecord = !item.distributorId && item.pharmacyName;

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.billCard,
        pressed && styles.billCardPressed,
      ]}
    >
      <Card style={styles.billCardInner}>
        {/* Top Row: Distributor Name + Amount */}
        <View style={styles.billCardHeader}>
          <View style={styles.distributorNameContainer}>
            <ThemedText style={styles.pharmacyName} numberOfLines={1}>
              {getDistributorName()}
            </ThemedText>
            {isLegacyRecord && (
              <View style={styles.legacyBadge}>
                <ThemedText style={styles.legacyBadgeText}>Legacy</ThemedText>
              </View>
            )}
          </View>
          <ThemedText style={styles.amount}>
            ₹{item.grandTotal || item.totalAmount || '0'}
          </ThemedText>
        </View>

        {/* Bottom Row: Date + Payment Type Chips */}
        <View style={styles.billCardFooter}>
          <Chip
            label={item.invoiceDate || 'No Date'}
            variant="default"
          />
          <View style={styles.chipSpacer} />
          <Chip
            label={item.paymentType || 'Cash'}
            variant={getPaymentVariant(item.paymentType)}
          />
        </View>
      </Card>
    </Pressable>
  );
});

BillListItem.displayName = 'BillListItem';

/**
 * Loading Skeleton Component
 */
const LoadingSkeleton = () => (
  <View style={styles.skeletonContainer}>
    {[1, 2, 3, 4].map((i) => (
      <View key={i} style={styles.skeletonCard}>
        <View style={styles.skeletonLine} />
        <View style={styles.skeletonLineSm} />
      </View>
    ))}
  </View>
);

/**
 * BillsListScreen
 * Shows all bills with search and filter
 * IMPORTANT: Keep existing navigation logic
 */
export default function BillsListScreen({
  bills = [],
  onBillPress,
  onFilterPress,
  onBack,
  loading = false,
}) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter bills based on search query
  const filteredBills = useCallback(() => {
    if (!searchQuery.trim()) return bills;
    
    const query = searchQuery.toLowerCase();
    return bills.filter(
      (bill) =>
        bill.pharmacyName?.toLowerCase().includes(query) ||
        bill.invoiceNumber?.toLowerCase().includes(query) ||
        bill.invoiceDate?.toLowerCase().includes(query)
    );
  }, [bills, searchQuery]);

  const renderItem = useCallback(
    ({ item }) => <BillListItem item={item} onPress={onBillPress} />,
    [onBillPress]
  );

  const keyExtractor = useCallback((item) => item.id || item.invoiceNumber, []);

  const ListEmptyComponent = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <Ionicons name="receipt-outline" size={64} color="#CBD5E1" />
        <ThemedText style={styles.emptyTitle}>No bills found</ThemedText>
        <ThemedText style={styles.emptySubtitle}>
          {searchQuery
            ? 'Try adjusting your search'
            : 'Start by scanning your first bill'}
        </ThemedText>
      </View>
    ),
    [searchQuery]
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <AppBar
          title="All Bills"
          onBack={onBack}
          rightIcon="options-outline"
          onRightPress={onFilterPress}
        />

        <View style={styles.content}>
          {/* Search Bar */}
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={20} color="#6B7280" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search bills..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="#6B7280" />
              </Pressable>
            )}
          </View>

          {/* Bills List */}
          {loading ? (
            <LoadingSkeleton />
          ) : (
            <FlatList
              data={filteredBills()}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={ListEmptyComponent}
            />
          )}
        </View>
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
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    height: 46,
    paddingHorizontal: 12,
    marginTop: 16,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 8,
  },
  listContent: {
    paddingBottom: 16,
  },
  billCard: {
    marginBottom: 12,
  },
  billCardPressed: {
    opacity: 0.7,
  },
  billCardInner: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  billCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  distributorNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  pharmacyName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    flexShrink: 1,
  },
  legacyBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  legacyBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#92400E',
  },
  amount: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
  },
  billCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipSpacer: {
    width: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 8,
  },
  skeletonContainer: {
    padding: 16,
  },
  skeletonCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    height: 80,
    justifyContent: 'space-between',
  },
  skeletonLine: {
    height: 20,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    width: '70%',
  },
  skeletonLineSm: {
    height: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    width: '40%',
  },
});
