import { Collapsible } from '@/components/collapsible.js';
import ThemedText from '@/components/themed-text';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useState } from 'react';
import {
    Pressable,
    StyleSheet,
    View
} from 'react-native';
import ItemRowEditor from '../ItemRowEditor';

export default function ItemListSection({
  items,
  onUpdate,
}) {
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [removeDialog, setRemoveDialog] = useState({ visible: false, itemId: null });

  const addItem = () => {
    const newItem = {
      id: Date.now().toString(),
      name: '',
      quantity: 1,
      unit: 'tabs',
      rate: 0,
      gstPercent: 5,
    };
    onUpdate([...items, newItem]);
    setExpandedItemId(newItem.id);
  };

  const removeItem = (id) => {
    setRemoveDialog({ visible: true, itemId: id });
  };

  const confirmRemoveItem = () => {
    const id = removeDialog.itemId;
    onUpdate(items.filter((item) => item.id !== id));
    if (expandedItemId === id) {
      setExpandedItemId(null);
    }
    setRemoveDialog({ visible: false, itemId: null });
  };

  const cancelRemoveItem = () => {
    setRemoveDialog({ visible: false, itemId: null });
  };

  const updateItem = (id, updates) => {
    onUpdate(
      items.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const calculateItemTotal = (item) => {
    if (item.itemTotal !== undefined && item.itemTotal > 0) {
      return item.itemTotal;
    }
    const subtotal = item.quantity * item.rate;
    const afterDiscount = subtotal - (item.discount || 0);
    const gstAmount = (afterDiscount * item.gstPercent) / 100;
    return Math.round((afterDiscount + gstAmount) * 100) / 100;
  };

  return (
    <View style={styles.section}>
      <Collapsible title={`Items (${items.length})`}>
        <View style={styles.itemsContainer}>
          {items.length === 0 ? (
            <ThemedText style={styles.emptyText}>
              No items added yet. Tap &quot;Add Item&quot; to start.
            </ThemedText>
          ) : (
            <View style={styles.itemsTable}>
              <View style={styles.tableHeader}>
                <ThemedText style={[styles.headerCell, { flex: 2 }]}>
                  Item
                </ThemedText>
                <ThemedText style={[styles.headerCell, { flex: 1 }]}>
                  Qty
                </ThemedText>
                <ThemedText style={[styles.headerCell, { flex: 1 }]}>
                  Rate
                </ThemedText>
                <ThemedText style={[styles.headerCell, { flex: 1 }]}>
                  Total
                </ThemedText>
              </View>

              {items.map((item, index) => {
                const itemTotal = calculateItemTotal(item);
                const isExpanded = expandedItemId === item.id;

                return (
                  <View key={item.id} style={styles.itemRow}>
                    <Pressable
                      style={[
                        styles.compactRow,
                        isExpanded && styles.compactRowExpanded,
                      ]}
                      onPress={() =>
                        setExpandedItemId(
                          isExpanded ? null : item.id
                        )
                      }
                    >
                      <View style={styles.compactContent}>
                        <ThemedText
                          style={[styles.cell, { flex: 2 }]}
                          numberOfLines={1}
                        >
                          {item.name || `Item ${index + 1}`}
                        </ThemedText>
                        <ThemedText style={[styles.cell, { flex: 1 }]}>
                          {item.quantity} {item.unit}
                        </ThemedText>
                        <ThemedText style={[styles.cell, { flex: 1 }]}>
                          ₹{item.rate.toFixed(2)}
                        </ThemedText>
                        <ThemedText
                          style={[
                            styles.cell,
                            { flex: 1 },
                            styles.totalCell,
                          ]}
                        >
                          ₹{itemTotal.toFixed(2)}
                        </ThemedText>
                      </View>
                      <ThemedText style={styles.expandIcon}>
                        {isExpanded ? '▼' : '▶'}
                      </ThemedText>
                    </Pressable>

                    {isExpanded && (
                      <ItemRowEditor
                        item={item}
                        onUpdate={(updates) => updateItem(item.id, updates)}
                        onRemove={() => removeItem(item.id)}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          )}

          <Pressable style={styles.addButton} onPress={addItem}>
            <ThemedText style={styles.addButtonText}>+ Add Item</ThemedText>
          </Pressable>
        </View>
      </Collapsible>

      {/* Confirm Dialog for Item Removal */}
      <ConfirmDialog
        visible={removeDialog.visible}
        title="Remove Item?"
        message="This item will be removed from the bill. This action cannot be undone."
        type="danger"
        confirmText="Remove"
        cancelText="Keep"
        onConfirm={confirmRemoveItem}
        onCancel={cancelRemoveItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  itemsContainer: {
    paddingTop: 12,
    gap: 12,
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.6,
    paddingVertical: 20,
  },
  itemsTable: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    alignItems: 'center',
  },
  headerCell: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
  },
  itemRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  compactRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  compactRowExpanded: {
    backgroundColor: '#f9f9f9',
  },
  compactContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cell: {
    fontSize: 13,
    color: '#333',
  },
  totalCell: {
    fontWeight: '600',
    color: '#007AFF',
  },
  expandIcon: {
    marginLeft: 8,
    fontSize: 12,
    color: '#999',
  },
  addButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#007AFF',
    alignItems: 'center',
    marginTop: 8,
  },
  addButtonText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 14,
  },
});
