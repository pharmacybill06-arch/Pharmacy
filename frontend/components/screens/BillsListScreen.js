import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
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
            <Ionicons name="search-outline" size={20} color="#64748B" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search bills..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="#64748B" />
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
    backgroundColor: '#F8FAFC',
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
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    height: 50,
    paddingHorizontal: 14,
    marginTop: 16,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#0F172A',
    marginLeft: 10,
  },
  listContent: {
    paddingBottom: 16,
  },
  billCard: {
    marginBottom: 10,
  },
  billCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  billCardInner: {
    borderWidth: 1,
    borderColor: '#F1F5F9',
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
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
  },
  legacyBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  legacyBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#92400E',
  },
  amount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
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
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 8,
  },
  skeletonContainer: {
    padding: 16,
  },
  skeletonCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 10,
    height: 80,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  skeletonLine: {
    height: 20,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    width: '70%',
  },
  skeletonLineSm: {
    height: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    width: '40%',
  },
});
