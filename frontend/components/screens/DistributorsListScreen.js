import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import Card from '@/components/ui/Card';
import PrimaryButton from '@/components/ui/PrimaryButton';

/**
 * Distributor List Item Component
 */
const DistributorListItem = React.memo(({ item, onPress }) => {
  const formatAmount = (amount) => {
    if (!amount) return '₹0';
    return `₹${parseFloat(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.distributorCard,
        pressed && styles.distributorCardPressed,
      ]}
    >
      <Card style={styles.distributorCardInner}>
        {/* Top Row: Name + Total Amount */}
        <View style={styles.cardHeader}>
          <View style={styles.nameContainer}>
            <View style={styles.avatarCircle}>
              <ThemedText style={styles.avatarText}>
                {(item.name || 'D').charAt(0).toUpperCase()}
              </ThemedText>
            </View>
            <View style={styles.nameDetails}>
              <ThemedText style={styles.distributorName} numberOfLines={1}>
                {item.name}
              </ThemedText>
              {item.gstin && (
                <ThemedText style={styles.gstinText} numberOfLines={1}>
                  GSTIN: {item.gstin}
                </ThemedText>
              )}
            </View>
          </View>
          <View style={styles.amountContainer}>
            <ThemedText style={styles.totalAmount}>
              {formatAmount(item.totalAmount)}
            </ThemedText>
            <ThemedText style={styles.billCount}>
              {item.totalBills || 0} bills • {item.totalProducts || 0} products
            </ThemedText>
          </View>
        </View>

        {/* Bottom Row: Contact Info */}
        <View style={styles.cardFooter}>
          {item.phone && (
            <View style={styles.infoChip}>
              <Ionicons name="call-outline" size={12} color="#6B7280" />
              <ThemedText style={styles.infoText}>{item.phone}</ThemedText>
            </View>
          )}
          {item.address && (
            <View style={styles.infoChip}>
              <Ionicons name="location-outline" size={12} color="#6B7280" />
              <ThemedText style={styles.infoText} numberOfLines={1}>
                {item.address.substring(0, 30)}
              </ThemedText>
            </View>
          )}
        </View>
      </Card>
    </Pressable>
  );
});

DistributorListItem.displayName = 'DistributorListItem';

/**
 * Empty State Component
 */
const EmptyState = ({ onAddPress }) => (
  <View style={styles.emptyContainer}>
    <Ionicons name="business-outline" size={64} color="#C7C7CC" />
    <ThemedText style={styles.emptyText}>No distributors yet</ThemedText>
    <ThemedText style={styles.emptySubtext}>
      Add your first distributor to manage supplier data
    </ThemedText>
    <PrimaryButton
      title="Add Distributor"
      icon="add"
      onPress={onAddPress}
      style={styles.emptyButton}
    />
  </View>
);

/**
 * DistributorsListScreen
 * Shows all distributors with search and stats
 */
export default function DistributorsListScreen({
  distributors = [],
  onDistributorPress,
  onAddPress,
  onBack,
  onRefresh,
  loading = false,
  refreshing = false,
}) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter distributors based on search query
  const filteredDistributors = useCallback(() => {
    if (!searchQuery.trim()) return distributors;
    
    const query = searchQuery.toLowerCase();
    return distributors.filter(
      (dist) =>
        dist.name?.toLowerCase().includes(query) ||
        dist.gstin?.toLowerCase().includes(query) ||
        dist.phone?.includes(query)
    );
  }, [distributors, searchQuery])();

  // Calculate totals
  const totalStats = {
    count: distributors.length,
    totalBills: distributors.reduce((sum, d) => sum + (d.totalBills || 0), 0),
    totalAmount: distributors.reduce((sum, d) => sum + (d.totalAmount || 0), 0),
    totalProducts: distributors.reduce((sum, d) => sum + (d.totalProducts || 0), 0),
  };

  const renderDistributor = useCallback(({ item }) => (
    <DistributorListItem item={item} onPress={onDistributorPress} />
  ), [onDistributorPress]);

  const keyExtractor = useCallback((item) => item.id, []);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <AppBar 
          title="Distributors" 
          onBack={onBack}
          rightIcon="add"
          onRightPress={onAddPress}
        />

        {/* Stats Bar */}
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <ThemedText style={styles.statValue}>{totalStats.count}</ThemedText>
            <ThemedText style={styles.statLabel}>Distributors</ThemedText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <ThemedText style={styles.statValue}>{totalStats.totalBills}</ThemedText>
            <ThemedText style={styles.statLabel}>Total Bills</ThemedText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <ThemedText style={styles.statValue}>{totalStats.totalProducts}</ThemedText>
            <ThemedText style={styles.statLabel}>Products</ThemedText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <ThemedText style={styles.statValue}>
              ₹{(totalStats.totalAmount / 1000).toFixed(1)}K
            </ThemedText>
            <ThemedText style={styles.statLabel}>Total Value</ThemedText>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search distributors..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="#9CA3AF" />
              </Pressable>
            )}
          </View>
        </View>

        {/* Distributors List */}
        {loading && distributors.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1D4ED8" />
            <ThemedText style={styles.loadingText}>Loading distributors...</ThemedText>
          </View>
        ) : distributors.length === 0 ? (
          <EmptyState onAddPress={onAddPress} />
        ) : (
          <FlatList
            data={filteredDistributors}
            renderItem={renderDistributor}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#1D4ED8']}
                tintColor="#1D4ED8"
              />
            }
            ListEmptyComponent={
              <View style={styles.noResultsContainer}>
                <Ionicons name="search-outline" size={48} color="#C7C7CC" />
                <ThemedText style={styles.noResultsText}>
                  No distributors found for "{searchQuery}"
                </ThemedText>
              </View>
            }
          />
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
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 12,
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: '#1F2937',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  listContent: {
    padding: 16,
  },
  distributorCard: {
    marginBottom: 12,
  },
  distributorCardPressed: {
    opacity: 0.7,
  },
  distributorCardInner: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  nameDetails: {
    marginLeft: 12,
    flex: 1,
  },
  distributorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  gstinText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#059669',
  },
  billCount: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 8,
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  infoText: {
    fontSize: 12,
    color: '#6B7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
  },
  emptyButton: {
    marginTop: 24,
  },
  noResultsContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  noResultsText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 12,
  },
});
