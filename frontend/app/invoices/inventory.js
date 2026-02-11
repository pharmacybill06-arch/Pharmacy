import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal
} from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';

/**
 * InventoryScreen
 * Manage product inventory with stock levels and low stock warnings
 */
export default function InventoryScreen() {
  const router = useRouter();
  const { userId, apiUrl } = useAuth();
  
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [stockAdjustment, setStockAdjustment] = useState('');

  useFocusEffect(
    React.useCallback(() => {
      loadProducts();
    }, [userId, apiUrl])
  );

  const loadProducts = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/products/${userId}?limit=100&activeOnly=true`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to load products');
      }

      const data = await response.json();
      setProducts(data.products || []);
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadProducts();
    } catch (error) {
      Alert.alert('Error', 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredProducts(products);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredProducts(
        products.filter(
          (product) =>
            product.name?.toLowerCase().includes(query) ||
            product.manufacturer?.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, products]);

  const handleAdjustStock = async () => {
    if (!stockAdjustment || isNaN(stockAdjustment)) {
      Alert.alert('Invalid Input', 'Please enter a valid adjustment amount');
      return;
    }

    const adjustment = parseFloat(stockAdjustment);
    const newStock = (editingProduct.stock || 0) + adjustment;

    if (newStock < 0) {
      Alert.alert('Invalid Stock', 'Stock cannot go negative');
      return;
    }

    try {
      const response = await fetch(
        `${apiUrl}/products/${userId}/${editingProduct.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stock: newStock })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update stock');
      }

      Alert.alert('Success', 'Stock updated successfully');
      setModalVisible(false);
      setStockAdjustment('');
      await loadProducts();
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const handleDeleteProduct = (productId, productName) => {
    Alert.alert(
      'Delete Product',
      `Are you sure you want to delete ${productName}?`,
      [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              const response = await fetch(
                `${apiUrl}/products/${userId}/${productId}`,
                { method: 'DELETE' }
              );

              if (!response.ok) {
                throw new Error('Failed to delete product');
              }

              Alert.alert('Success', 'Product deleted');
              await loadProducts();
            } catch (error) {
              Alert.alert('Error', error.message);
            }
          },
          style: 'destructive'
        }
      ]
    );
  };

  const getStockStatus = (product) => {
    if (product.stock <= 0) {
      return { status: 'out', color: Colors.light.danger, label: 'Out of Stock' };
    }
    if (product.stock < (product.minStock || 5)) {
      return { status: 'low', color: Colors.light.warning, label: 'Low Stock' };
    }
    return { status: 'good', color: Colors.light.success, label: 'In Stock' };
  };

  const renderProductItem = ({ item }) => {
    const status = getStockStatus(item);

    return (
      <View style={styles.productCard}>
        <View style={styles.cardHeader}>
          <View style={styles.headerInfo}>
            <Text style={styles.productName}>{item.name}</Text>
            {item.manufacturer && (
              <Text style={styles.manufacturer}>{item.manufacturer}</Text>
            )}
            <View style={styles.codesRow}>
              {item.hsnCode && (
                <Text style={styles.code}>HSN: {item.hsnCode}</Text>
              )}
              {item.batchNumber && (
                <Text style={styles.code}>Batch: {item.batchNumber}</Text>
              )}
            </View>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: status.color + '20', borderColor: status.color }
            ]}
          >
            <Text style={[styles.statusText, { color: status.color }]}>
              {status.label}
            </Text>
            <Text style={[styles.stockCount, { color: status.color }]}>
              {item.stock}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.priceRow}>
            <View style={styles.priceItem}>
              <Text style={styles.priceLabel}>MRP</Text>
              <Text style={styles.priceValue}>₹{(item.mrp || 0).toFixed(2)}</Text>
            </View>
            <View style={styles.priceItem}>
              <Text style={styles.priceLabel}>Selling Rate</Text>
              <Text style={styles.priceValue}>₹{(item.sellingRate || 0).toFixed(2)}</Text>
            </View>
            <View style={styles.priceItem}>
              <Text style={styles.priceLabel}>Purchase Rate</Text>
              <Text style={styles.priceValue}>₹{(item.purchaseRate || 0).toFixed(2)}</Text>
            </View>
          </View>

          {item.minStock && (
            <View style={styles.minStockRow}>
              <Ionicons name="alert-circle-outline" size={14} color={Colors.light.gray} />
              <Text style={styles.minStockText}>
                Min Stock: {item.minStock} {item.unit || 'units'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.cardFooter}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              setEditingProduct(item);
              setStockAdjustment('');
              setModalVisible(true);
            }}
          >
            <Ionicons name="create-outline" size={16} color={Colors.light.primary} />
            <Text style={styles.actionButtonText}>Adjust Stock</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.editButton]}
            onPress={() =>
              router.push({
                pathname: '/products',
                params: { productId: item.id, edit: 'true' }
              })
            }
          >
            <Ionicons name="pencil-outline" size={16} color={Colors.light.primary} />
            <Text style={styles.actionButtonText}>Edit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() => handleDeleteProduct(item.id, item.name)}
          >
            <Ionicons name="trash-outline" size={16} color={Colors.light.danger} />
            <Text style={[styles.actionButtonText, styles.dangerText]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="cube-outline" size={64} color={Colors.light.gray} />
      <Text style={styles.emptyTitle}>No Products</Text>
      <Text style={styles.emptySubtitle}>
        {searchQuery ? 'Try adjusting your search' : 'Add your first product'}
      </Text>
      {!searchQuery && (
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push('/products')}
        >
          <Ionicons name="add-circle" size={24} color={Colors.light.white} />
          <Text style={styles.createButtonText}>Add Product</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Inventory',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/products')}
              style={styles.headerButton}
            >
              <Ionicons name="add-circle" size={24} color={Colors.light.primary} />
            </TouchableOpacity>
          )
        }}
      />

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={Colors.light.gray} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={Colors.light.gray}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={Colors.light.gray} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.loadingText}>Loading inventory...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          renderItem={renderProductItem}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          contentContainerStyle={filteredProducts.length === 0 ? styles.emptyListContainer : null}
        />
      )}

      {/* Stock Adjustment Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Adjust Stock</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.light.text} />
              </TouchableOpacity>
            </View>

            {editingProduct && (
              <>
                <View style={styles.modalBody}>
                  <Text style={styles.productInfo}>{editingProduct.name}</Text>
                  <Text style={styles.currentStock}>
                    Current Stock: {editingProduct.stock} {editingProduct.unit || 'units'}
                  </Text>

                  <Text style={styles.label}>Adjustment Amount</Text>
                  <View style={styles.adjustmentContainer}>
                    <TouchableOpacity
                      style={styles.quickButton}
                      onPress={() => setStockAdjustment(String(-10))}
                    >
                      <Text style={styles.quickButtonText}>-10</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.quickButton}
                      onPress={() => setStockAdjustment(String(-5))}
                    >
                      <Text style={styles.quickButtonText}>-5</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={styles.adjustmentInput}
                      keyboardType="decimal-pad"
                      value={stockAdjustment}
                      onChangeText={setStockAdjustment}
                      placeholder="0"
                      placeholderTextColor={Colors.light.gray}
                    />
                    <TouchableOpacity
                      style={styles.quickButton}
                      onPress={() => setStockAdjustment(String(5))}
                    >
                      <Text style={styles.quickButtonText}>+5</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.quickButton}
                      onPress={() => setStockAdjustment(String(10))}
                    >
                      <Text style={styles.quickButtonText}>+10</Text>
                    </TouchableOpacity>
                  </View>

                  {stockAdjustment && (
                    <View style={styles.previewBox}>
                      <Text style={styles.previewLabel}>New Stock:</Text>
                      <Text style={styles.previewValue}>
                        {(editingProduct.stock || 0) + parseFloat(stockAdjustment || 0)}{' '}
                        {editingProduct.unit || 'units'}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={[styles.button, styles.cancelButton]}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.confirmButton]}
                    onPress={handleAdjustStock}
                  >
                    <Text style={styles.confirmButtonText}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.lightGray
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.light.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.lightGray
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.light.text,
    paddingVertical: 0
  },
  headerButton: {
    paddingRight: 12
  },
  productCard: {
    backgroundColor: Colors.light.white,
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.light.lightGray
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.lightGray
  },
  headerInfo: {
    flex: 1,
    marginRight: 12
  },
  productName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 2
  },
  manufacturer: {
    fontSize: 12,
    color: Colors.light.gray,
    marginBottom: 4
  },
  codesRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap'
  },
  code: {
    fontSize: 11,
    color: Colors.light.gray,
    fontWeight: '500'
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 80
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2
  },
  stockCount: {
    fontSize: 16,
    fontWeight: '700'
  },
  cardBody: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  priceItem: {
    alignItems: 'center'
  },
  priceLabel: {
    fontSize: 11,
    color: Colors.light.gray,
    marginBottom: 2
  },
  priceValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.light.primary
  },
  minStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.light.lightGray
  },
  minStockText: {
    fontSize: 12,
    color: Colors.light.gray
  },
  cardFooter: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.light.lightGray
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: Colors.light.white,
    borderWidth: 1,
    borderColor: Colors.light.lightGray
  },
  editButton: {},
  deleteButton: {},
  actionButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.light.primary
  },
  dangerText: {
    color: Colors.light.danger
  },
  emptyListContainer: {
    flexGrow: 1
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 16
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.light.gray,
    textAlign: 'center'
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: Colors.light.primary,
    borderRadius: 8,
    marginTop: 8
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.white
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16
  },
  loadingText: {
    fontSize: 14,
    color: Colors.light.gray
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: Colors.light.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.lightGray
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12
  },
  productInfo: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text
  },
  currentStock: {
    fontSize: 14,
    color: Colors.light.gray,
    marginBottom: 8
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.text,
    marginTop: 8
  },
  adjustmentContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center'
  },
  quickButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.light.primary,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center'
  },
  quickButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.primary
  },
  adjustmentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.light.primary,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.light.text,
    textAlign: 'center'
  },
  previewBox: {
    backgroundColor: Colors.light.lightGray,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 6,
    marginTop: 8
  },
  previewLabel: {
    fontSize: 12,
    color: Colors.light.gray,
    marginBottom: 4
  },
  previewValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.primary
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 16
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  cancelButton: {
    backgroundColor: Colors.light.lightGray,
    borderWidth: 1,
    borderColor: Colors.light.gray
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.text
  },
  confirmButton: {
    backgroundColor: Colors.light.primary
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.white
  }
});