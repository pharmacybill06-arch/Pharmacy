import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import Card from '@/components/ui/Card';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useProductList, useProductCRUD } from '@/hooks/useProducts';

/**
 * Product List Item Component (Memoized for performance)
 */
const ProductListItem = React.memo(({ item, onPress, onLongPress }) => {
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never used';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  return (
    <Pressable
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      style={({ pressed }) => [
        styles.productCard,
        pressed && styles.productCardPressed,
      ]}
    >
      <Card style={styles.productCardInner}>
        <View style={styles.productHeader}>
          <View style={styles.productInfo}>
            <ThemedText style={styles.productName} numberOfLines={1}>
              {item.name}
            </ThemedText>
            {item.manufacturer && (
              <ThemedText style={styles.manufacturer} numberOfLines={1}>
                {item.manufacturer}
              </ThemedText>
            )}
          </View>
          <View style={styles.priceInfo}>
            {item.defaultRate && (
              <ThemedText style={styles.rate}>₹{item.defaultRate}</ThemedText>
            )}
            {item.defaultMrp && item.defaultMrp !== item.defaultRate && (
              <ThemedText style={styles.mrp}>MRP: ₹{item.defaultMrp}</ThemedText>
            )}
          </View>
        </View>
        
        <View style={styles.productFooter}>
          <View style={styles.usageInfo}>
            <Ionicons name="repeat-outline" size={14} color="#6B7280" />
            <ThemedText style={styles.usageText}>
              Used {item.usageCount || 0} times
            </ThemedText>
          </View>
          <ThemedText style={styles.lastUsed}>
            {formatDate(item.lastUsedAt)}
          </ThemedText>
        </View>
        
        {item.isProductMatched && (
          <View style={styles.matchedBadge}>
            <Ionicons name="checkmark-circle" size={12} color="#059669" />
            <ThemedText style={styles.matchedText}>Linked</ThemedText>
          </View>
        )}
      </Card>
    </Pressable>
  );
});

ProductListItem.displayName = 'ProductListItem';

/**
 * Loading Skeleton Component
 */
const LoadingSkeleton = () => (
  <View style={styles.skeletonContainer}>
    {[1, 2, 3, 4, 5].map((i) => (
      <View key={i} style={styles.skeletonCard}>
        <View style={styles.skeletonLine} />
        <View style={styles.skeletonLineSm} />
        <View style={styles.skeletonLineXs} />
      </View>
    ))}
  </View>
);

/**
 * Empty State Component
 */
const EmptyState = ({ searchQuery, onAddPress }) => (
  <View style={styles.emptyContainer}>
    <View style={styles.emptyIconContainer}>
      <Ionicons name="cube-outline" size={64} color="#CBD5E1" />
    </View>
    <ThemedText style={styles.emptyTitle}>
      {searchQuery ? 'No products found' : 'No products yet'}
    </ThemedText>
    <ThemedText style={styles.emptySubtitle}>
      {searchQuery
        ? 'Try adjusting your search'
        : 'Products will be automatically added when you save bills, or you can add them manually'}
    </ThemedText>
    {!searchQuery && (
      <Pressable style={styles.emptyAddButton} onPress={onAddPress}>
        <Ionicons name="add" size={20} color="#FFFFFF" />
        <ThemedText style={styles.emptyAddButtonText}>Add Product</ThemedText>
      </Pressable>
    )}
  </View>
);

/**
 * ProductsListScreen
 * Shows all products with search, filter, and CRUD actions
 */
export default function ProductsListScreen({
  userId,
  onBack,
  onProductPress,
  onAddPress,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteDialog, setDeleteDialog] = useState({ visible: false, product: null });
  
  const {
    products,
    pagination,
    isLoading,
    isRefreshing,
    error,
    refresh,
    loadMore,
    updateSearch,
    removeFromList,
  } = useProductList(userId);

  const { deleteProduct, isLoading: isDeleting } = useProductCRUD(userId);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      updateSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, updateSearch]);

  const handleProductPress = useCallback((product) => {
    onProductPress?.(product);
  }, [onProductPress]);

  const handleLongPress = useCallback((product) => {
    setDeleteDialog({ visible: true, product });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    const product = deleteDialog.product;
    setDeleteDialog({ visible: false, product: null });
    
    try {
      await deleteProduct(product.id);
      removeFromList(product.id);
    } catch (err) {
      Alert.alert('Error', 'Failed to delete product. Please try again.');
    }
  }, [deleteDialog.product, deleteProduct, removeFromList]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteDialog({ visible: false, product: null });
  }, []);

  const renderItem = useCallback(
    ({ item }) => (
      <ProductListItem 
        item={item} 
        onPress={handleProductPress}
        onLongPress={handleLongPress}
      />
    ),
    [handleProductPress, handleLongPress]
  );

  const keyExtractor = useCallback((item) => item.id, []);

  const renderFooter = useCallback(() => {
    if (!pagination.hasMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#1D4ED8" />
      </View>
    );
  }, [pagination.hasMore]);

  const ListEmptyComponent = useCallback(
    () => (
      <EmptyState 
        searchQuery={searchQuery}
        onAddPress={onAddPress}
      />
    ),
    [searchQuery, onAddPress]
  );

  if (isLoading && products.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <AppBar title="My Products" onBack={onBack} />
          <LoadingSkeleton />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <AppBar
          title="My Products"
          onBack={onBack}
          rightIcon="add"
          onRightPress={onAddPress}
        />

        <View style={styles.content}>
          {/* Search Bar */}
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={20} color="#6B7280" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search products..."
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

          {/* Stats Bar */}
          <View style={styles.statsBar}>
            <ThemedText style={styles.statsText}>
              {pagination.total} {pagination.total === 1 ? 'product' : 'products'}
            </ThemedText>
          </View>

          {/* Error State */}
          {error && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={24} color="#DC2626" />
              <ThemedText style={styles.errorText}>{error}</ThemedText>
              <Pressable style={styles.retryButton} onPress={refresh}>
                <ThemedText style={styles.retryText}>Retry</ThemedText>
              </Pressable>
            </View>
          )}

          {/* Products List */}
          <FlatList
            data={products}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={ListEmptyComponent}
            ListFooterComponent={renderFooter}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={refresh}
                colors={['#1D4ED8']}
                tintColor="#1D4ED8"
              />
            }
          />
        </View>

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          visible={deleteDialog.visible}
          title="Delete Product"
          message={`Are you sure you want to delete "${deleteDialog.product?.name}"? This action cannot be undone.`}
          type="danger"
          confirmText={isDeleting ? 'Deleting...' : 'Delete'}
          cancelText="Cancel"
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
        />
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
    paddingTop: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  statsBar: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  statsText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 100,
  },
  productCard: {
    marginBottom: 10,
  },
  productCardPressed: {
    opacity: 0.7,
  },
  productCardInner: {
    padding: 14,
    position: 'relative',
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  productInfo: {
    flex: 1,
    marginRight: 12,
  },
  productName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  manufacturer: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  priceInfo: {
    alignItems: 'flex-end',
  },
  rate: {
    fontSize: 16,
    fontWeight: '700',
    color: '#059669',
  },
  mrp: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  productFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  usageInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  usageText: {
    fontSize: 12,
    color: '#6B7280',
  },
  lastUsed: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  matchedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 2,
  },
  matchedText: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '600',
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  skeletonContainer: {
    padding: 16,
  },
  skeletonCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  skeletonLine: {
    backgroundColor: '#E5E7EB',
    height: 16,
    borderRadius: 4,
    width: '70%',
    marginBottom: 8,
  },
  skeletonLineSm: {
    backgroundColor: '#F3F4F6',
    height: 12,
    borderRadius: 4,
    width: '40%',
    marginBottom: 8,
  },
  skeletonLineXs: {
    backgroundColor: '#F3F4F6',
    height: 10,
    borderRadius: 4,
    width: '30%',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1D4ED8',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  emptyAddButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#DC2626',
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#DC2626',
    borderRadius: 6,
  },
  retryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
