import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';

/**
 * InvoiceItemsTable
 * Displays and manages invoice line items with stock validation
 */
const InvoiceItemsTable = ({
  items = [],
  onAddItem,
  onRemoveItem,
  onUpdateItem,
  onCalculateTotals
}) => {
  const [editingIndex, setEditingIndex] = useState(null);

  const handleQuantityChange = (index, quantity) => {
    const item = items[index];
    
    if (!quantity || quantity <= 0) {
      Alert.alert('Invalid Quantity', 'Quantity must be greater than 0');
      return;
    }

    if (quantity > item.stock) {
      Alert.alert(
        'Insufficient Stock',
        `Available stock: ${item.stock}, Requested: ${quantity}`
      );
      return;
    }

    const updatedItem = {
      ...item,
      quantity,
      itemTotal: (item.rate || 0) * quantity - (item.discount || 0)
    };

    onUpdateItem(index, updatedItem);
    recalculateTotals();
    setEditingIndex(null);
  };

  const handleDiscountChange = (index, discount) => {
    const item = items[index];
    const updatedItem = {
      ...item,
      discount: Math.min(discount || 0, (item.rate || 0) * (item.quantity || 0)),
      itemTotal: (item.rate || 0) * (item.quantity || 0) - (discount || 0)
    };

    onUpdateItem(index, updatedItem);
    recalculateTotals();
  };

  const recalculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + (item.itemTotal || 0), 0);
    onCalculateTotals(subtotal);
  };

  const handleRemoveItem = (index) => {
    Alert.alert(
      'Remove Item',
      'Are you sure you want to remove this item?',
      [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Remove',
          onPress: () => {
            onRemoveItem(index);
            recalculateTotals();
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Invoice Items</Text>
        <TouchableOpacity style={styles.addButton} onPress={onAddItem}>
          <Ionicons name="add-circle" size={24} color={Colors.light.primary} />
          <Text style={styles.addButtonText}>Add Item</Text>
        </TouchableOpacity>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="cart-outline" size={48} color={Colors.light.gray} />
          <Text style={styles.emptyText}>No items added yet</Text>
          <Text style={styles.emptySubtext}>Tap "Add Item" to get started</Text>
        </View>
      ) : (
        <View>
          <View style={styles.tableHeader}>
            <Text style={[styles.cell, styles.nameCell]}>Product</Text>
            <Text style={[styles.cell, styles.numberCell]}>Qty</Text>
            <Text style={[styles.cell, styles.numberCell]}>Rate</Text>
            <Text style={[styles.cell, styles.numberCell]}>Total</Text>
            <Text style={[styles.cell, styles.actionCell]}></Text>
          </View>

          <FlatList
            data={items}
            keyExtractor={(item, index) => `${item.productId}-${index}`}
            scrollEnabled={false}
            renderItem={({ item, index }) => (
              <View style={styles.tableRow}>
                <View style={[styles.cell, styles.nameCell]}>
                  <View>
                    <Text style={styles.productName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.manufacturer && (
                      <Text style={styles.manufacturer} numberOfLines={1}>
                        {item.manufacturer}
                      </Text>
                    )}
                    {item.stock < (item.minStock || 5) && item.stock > 0 && (
                      <Text style={styles.lowStockWarning}>
                        ⚠️ Low stock: {item.stock}
                      </Text>
                    )}
                    {item.stock <= 0 && (
                      <Text style={styles.outOfStockWarning}>
                        🚫 Out of stock
                      </Text>
                    )}
                  </View>
                </View>

                <View style={[styles.cell, styles.numberCell]}>
                  {editingIndex === index ? (
                    <TextInput
                      style={styles.input}
                      keyboardType="decimal-pad"
                      value={String(item.quantity || '')}
                      onChangeText={(val) => handleQuantityChange(index, parseFloat(val))}
                      onBlur={() => setEditingIndex(null)}
                      autoFocus
                    />
                  ) : (
                    <TouchableOpacity
                      onPress={() => setEditingIndex(index)}
                    >
                      <Text style={styles.cellValue}>{item.quantity}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={[styles.cell, styles.numberCell]}>
                  <Text style={styles.cellValue}>₹{(item.rate || 0).toFixed(2)}</Text>
                </View>

                <View style={[styles.cell, styles.numberCell]}>
                  <Text style={styles.cellValueBold}>
                    ₹{(item.itemTotal || 0).toFixed(2)}
                  </Text>
                </View>

                <View style={[styles.cell, styles.actionCell]}>
                  <TouchableOpacity
                    onPress={() => handleRemoveItem(index)}
                    style={styles.deleteButton}
                  >
                    <Ionicons name="trash" size={18} color={Colors.light.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />

          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>Subtotal:</Text>
            <Text style={styles.summaryValue}>
              ₹{items.reduce((sum, item) => sum + (item.itemTotal || 0), 0).toFixed(2)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

// FIX: StyleSheet.create() runs at module load time, before any component renders.
// The `colors` variable was defined inside the component, so it didn't exist yet.
// Solution: reference Colors.light directly everywhere in the stylesheet.
const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
    borderRadius: 8,
    backgroundColor: Colors.light.white,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.light.lightGray
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.light.lightGray,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.gray
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.primary
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text
  },
  emptySubtext: {
    fontSize: 12,
    color: Colors.light.gray
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.light.lightGray,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.gray
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.lightGray,
    alignItems: 'center'
  },
  cell: {
    justifyContent: 'center'
  },
  nameCell: {
    flex: 2,
    marginRight: 8
  },
  numberCell: {
    flex: 0.8,
    justifyContent: 'center',
    alignItems: 'center'
  },
  actionCell: {
    flex: 0.4,
    justifyContent: 'center',
    alignItems: 'center'
  },
  productName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 2
  },
  manufacturer: {
    fontSize: 11,
    color: Colors.light.gray,
    marginBottom: 4
  },
  lowStockWarning: {
    fontSize: 10,
    color: Colors.light.warning,
    fontWeight: '500'
  },
  outOfStockWarning: {
    fontSize: 10,
    color: Colors.light.danger,
    fontWeight: '500'
  },
  cellValue: {
    fontSize: 12,
    color: Colors.light.text,
    fontWeight: '500'
  },
  cellValueBold: {
    fontSize: 12,
    color: Colors.light.primary,
    fontWeight: '700'
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.light.primary,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 12,
    width: '100%',
    textAlign: 'center'
  },
  deleteButton: {
    padding: 6
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.light.lightGray,
    borderTopWidth: 1,
    borderTopColor: Colors.light.gray
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.text,
    marginRight: 12
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.primary
  }
});

export default InvoiceItemsTable;