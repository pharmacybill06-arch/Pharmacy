import React from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import CollapsibleSection from '@/components/ui/CollapsibleSection';
import FormInput from '@/components/ui/FormInput';
import SecondaryButton from '@/components/ui/SecondaryButton';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Card from '@/components/ui/Card';
import Chip from '@/components/ui/Chip';
import ItemRowEditor from '@/components/bill-form/ItemRowEditor';

/**
 * Item Row Component for table-like display
 */
const ItemRow = ({ item, index, onPress }) => {
  // Use the stored itemTotal (calculated in ItemRowEditor) or calculate as fallback
  const getItemTotal = () => {
    // Check if itemTotal exists and is greater than 0
    if (item.itemTotal !== undefined && item.itemTotal !== null && item.itemTotal > 0) {
      return item.itemTotal;
    }
    // Fallback: Calculate as Qty × Rate - Discount (same as ItemRowEditor)
    const qty = parseFloat(item.quantity) || 0;
    const rate = parseFloat(item.rate) || 0;
    const discount = parseFloat(item.discount) || 0;
    const calculatedTotal = qty * rate - discount;
    return Math.round(calculatedTotal * 100) / 100;
  };

  const totalValue = getItemTotal();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.itemRow,
        pressed && styles.itemRowPressed,
      ]}
      onPress={() => onPress(index)}
    >
      <View style={styles.itemRowLeft}>
        <ThemedText style={styles.itemName} numberOfLines={1}>
          {item.name || item.itemName || `Item ${index + 1}`}
        </ThemedText>
        <ThemedText style={styles.itemMeta}>
          Qty: {item.quantity} {item.unit}
        </ThemedText>
      </View>
      <View style={styles.itemRowRight}>
        <ThemedText style={styles.itemTotal}>₹{totalValue.toFixed(2)}</ThemedText>
        <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
      </View>
    </Pressable>
  );
};

/**
 * BillFormScreen (Redesigned)
 * IMPORTANT: This wraps the existing BillForm logic with new UI
 * All form logic, state, handlers remain unchanged
 */
export default function BillFormScreen({
  formData,
  onUpdatePharmacyDetails,
  onUpdateInvoiceMetadata,
  onUpdateItems,
  onUpdateRoundOff,
  onAddItem,
  onEditItem,
  onSubmit,
  onCancel,
  geminiLoading = false,
  geminiConfidence = null,
  itemsNeedingManualReview = 0,
  editingItemIndex = null,
  onUpdateEditingItem,
  onRemoveEditingItem,
  onSaveEditingItem,
}) {
  // Calculate discount amount from percentage
  const discountAmount = ((formData.subtotal || 0) * ((formData.discountPercent || 0) / 100));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <AppBar title="Edit Bill" onBack={onCancel} />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Status Pills */}
          {geminiLoading && (
            <View style={styles.statusPill}>
              <Ionicons name="sync-outline" size={16} color="#1D4ED8" />
              <ThemedText style={styles.statusText}>
                Gemini AI is parsing your invoice...
              </ThemedText>
            </View>
          )}

          {geminiConfidence !== null && !geminiLoading && (
            <View style={styles.statusPill}>
              <Ionicons name="sparkles-outline" size={16} color="#1D4ED8" />
              <ThemedText style={styles.statusText}>
                Gemini Parse • {(geminiConfidence * 100).toFixed(1)}% confidence
                {itemsNeedingManualReview > 0 &&
                  ` • ${itemsNeedingManualReview} items need review`}
              </ThemedText>
            </View>
          )}

          {/* Pharmacy Details Section */}
          <CollapsibleSection
            title="Pharmacy Details"
            icon="storefront-outline"
            defaultExpanded={true}
          >
            <FormInput
              label="Pharmacy Name"
              value={formData.pharmacyName}
              onChangeText={(text) =>
                onUpdatePharmacyDetails({ pharmacyName: text })
              }
              placeholder="Enter pharmacy name"
            />
            <FormInput
              label="Shop Address"
              value={formData.shopAddress}
              onChangeText={(text) =>
                onUpdatePharmacyDetails({ shopAddress: text })
              }
              placeholder="Enter address"
              multiline
              numberOfLines={2}
            />
            <View style={styles.row}>
              <View style={styles.halfWidth}>
                <FormInput
                  label="Phone Numbers"
                  value={formData.phoneNumbers}
                  onChangeText={(text) =>
                    onUpdatePharmacyDetails({ phoneNumbers: text })
                  }
                  placeholder="Phone"
                  keyboardType="phone-pad"
                />
              </View>
              <View style={styles.halfWidth}>
                <FormInput
                  label="GSTIN"
                  value={formData.gstin}
                  onChangeText={(text) =>
                    onUpdatePharmacyDetails({ gstin: text })
                  }
                  placeholder="GSTIN"
                />
              </View>
            </View>
            <FormInput
              label="DL Number"
              value={formData.dlNumber}
              onChangeText={(text) =>
                onUpdatePharmacyDetails({ dlNumber: text })
              }
              placeholder="Drug License Number"
            />
          </CollapsibleSection>

          {/* Invoice Metadata Section */}
          <CollapsibleSection
            title="Invoice Metadata"
            icon="receipt-outline"
            defaultExpanded={true}
          >
            <View style={styles.row}>
              <View style={styles.halfWidth}>
                <FormInput
                  label="Invoice Number"
                  value={formData.invoiceNumber}
                  onChangeText={(text) =>
                    onUpdateInvoiceMetadata({ invoiceNumber: text })
                  }
                  placeholder="INV-001"
                />
              </View>
              <View style={styles.halfWidth}>
                <FormInput
                  label="Invoice Date"
                  value={formData.invoiceDate}
                  onChangeText={(text) =>
                    onUpdateInvoiceMetadata({ invoiceDate: text })
                  }
                  placeholder="DD/MM/YYYY"
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.halfWidth}>
                <FormInput
                  label="Due Date"
                  value={formData.dueDate}
                  onChangeText={(text) =>
                    onUpdateInvoiceMetadata({ dueDate: text })
                  }
                  placeholder="DD/MM/YYYY"
                />
              </View>
              <View style={styles.halfWidth}>
                <FormInput
                  label="Payment Type"
                  value={formData.paymentType}
                  onChangeText={(text) =>
                    onUpdateInvoiceMetadata({ paymentType: text })
                  }
                  placeholder="Cash/Credit"
                />
              </View>
            </View>
          </CollapsibleSection>

          {/* Items Section */}
          <CollapsibleSection
            title="Items"
            icon="list-outline"
            defaultExpanded={true}
          >
            <View style={styles.itemsContainer}>
              {formData.items && formData.items.length > 0 ? (
                formData.items.map((item, index) => (
                  <View key={index}>
                    {editingItemIndex === index ? (
                      // Show inline editor when item is being edited
                      <View style={styles.editorContainer}>
                        <ItemRowEditor
                          item={item}
                          onUpdate={onUpdateEditingItem}
                          onRemove={onRemoveEditingItem}
                        />
                        <PrimaryButton
                          title="Done Editing"
                          onPress={onSaveEditingItem}
                          style={styles.doneButton}
                        />
                      </View>
                    ) : (
                      // Show item row when not editing
                      <ItemRow
                        item={item}
                        index={index}
                        onPress={onEditItem}
                      />
                    )}
                  </View>
                ))
              ) : (
                <ThemedText style={styles.emptyText}>
                  No items added yet
                </ThemedText>
              )}
            </View>
            
            <SecondaryButton
              title="Add Item"
              icon="add-outline"
              borderColor="#1D4ED8"
              textColor="#1D4ED8"
              onPress={onAddItem}
            />
          </CollapsibleSection>

          {/* Tax & Totals Section */}
          <CollapsibleSection
            title="Tax & Totals"
            icon="calculator-outline"
            defaultExpanded={true}
          >
            <View style={styles.totalsContainer}>
              {/* Subtotal - Auto-calculated, Read-only */}
              <View style={styles.totalRow}>
                <ThemedText style={styles.totalLabel}>Subtotal (Sum of Items)</ThemedText>
                <ThemedText style={[styles.totalValue, styles.autoValue]}>
                  ₹{(formData.subtotal || 0).toFixed(2)}
                </ThemedText>
              </View>

              {/* Discount - Editable (Percentage-based) */}
              <View style={styles.editableRow}>
                <FormInput
                  label="Discount (%)"
                  value={formData.discountPercent?.toString() || '0'}
                  onChangeText={(text) =>
                    onUpdateInvoiceMetadata({ discountPercent: parseFloat(text) || 0 })
                  }
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
                <ThemedText style={styles.calculatedAmountText}>
                  Discount Amount: ₹{discountAmount.toFixed(2)}
                </ThemedText>
              </View>

              {/* CGST - Editable */}
              <View style={styles.editableRow}>
                <FormInput
                  label="CGST"
                  value={formData.cgst?.toString() || '0'}
                  onChangeText={(text) =>
                    onUpdateInvoiceMetadata({ cgst: parseFloat(text) || 0 })
                  }
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </View>

              {/* SGST - Editable */}
              <View style={styles.editableRow}>
                <FormInput
                  label="SGST"
                  value={formData.sgst?.toString() || '0'}
                  onChangeText={(text) =>
                    onUpdateInvoiceMetadata({ sgst: parseFloat(text) || 0 })
                  }
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </View>

              {/* Round Off - Editable */}
              <View style={styles.editableRow}>
                <FormInput
                  label="Round Off"
                  value={formData.roundOff?.toString() || '0'}
                  onChangeText={(text) =>
                    onUpdateRoundOff(parseFloat(text) || 0)
                  }
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.divider} />
              
              {/* Grand Total - Auto-calculated, Read-only */}
              <View style={styles.totalRow}>
                <ThemedText style={styles.grandTotalLabel}>
                  Grand Total
                </ThemedText>
                <ThemedText style={styles.grandTotalValue}>
                  ₹{(formData.grandTotal || 0).toFixed(2)}
                </ThemedText>
              </View>
            </View>
          </CollapsibleSection>

          {/* Bottom Spacer for Sticky Actions */}
          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Sticky Bottom Actions */}
        <View style={styles.stickyActions}>
          <PrimaryButton
            title="Confirm & Save Bill"
            icon="checkmark-circle-outline"
            onPress={onSubmit}
          />
          
          {onCancel && (
            <>
              <View style={styles.buttonSpacer} />
              <SecondaryButton title="Cancel" onPress={onCancel} />
            </>
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
    paddingTop: Platform.OS === 'android' ? 25 : 0,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 160,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
    marginLeft: 6,
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  itemsContainer: {
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  itemRowPressed: {
    opacity: 0.7,
    backgroundColor: '#F9FAFB',
  },
  itemRowLeft: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  itemRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 20,
  },
  totalsCard: {
    padding: 14,
    backgroundColor: '#F9FAFB',
  },
  totalsContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  editableRow: {
    marginBottom: 8,
  },
  autoValue: {
    fontStyle: 'italic',
    color: '#4B5563',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  calculatedAmountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
    marginTop: 4,
    marginLeft: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  grandTotalValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },
  bottomSpacer: {
    height: 20,
  },
  editorContainer: {
    backgroundColor: '#F0F4FF',
    borderWidth: 2,
    borderColor: '#1D4ED8',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  doneButton: {
    marginTop: 10,
  },
  stickyActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  buttonSpacer: {
    height: 10,
  },
});