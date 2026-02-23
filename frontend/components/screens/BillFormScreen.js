import React, { useState, useCallback } from 'react';
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
import DistributorAutocomplete from '@/components/ui/DistributorAutocomplete';
import GSTLookup from '@/components/ui/GSTLookup';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Item Row Component for table-like display
 */
const ItemRow = ({ item, index, onPress }) => {
  // Always calculate total from the source fields for consistency
  const getItemTotal = () => {
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
  // Distributor-related props
  selectedDistributor = null,
  distributorSearchQuery = '',
  onDistributorSearchChange,
  onDistributorSelect,
  onAddNewDistributor,
  // GST Lookup props
  onGstLookupDistributorFound,
  onGstLookupError,
  distributorMode = 'search', // 'search' | 'gst'
  onDistributorModeChange,
}) {
  // Get user ID for product suggestions
  const { user } = useAuth();
  const userId = user?.id;

  // Calculate discount amount from percentage
  const discountAmount = ((formData.subtotal || 0) * ((formData.discountPercent || 0) / 100));
  const taxableAmount = (formData.subtotal || 0) - discountAmount;

  // Local string state for Tax & Totals fields to allow decimal input (e.g. "1." while typing)
  const [localTaxFields, setLocalTaxFields] = useState({
    discountPercent: '',
    discountAmount: '',
    cgstPercent: '',
    cgst: '',
    sgstPercent: '',
    sgst: '',
    roundOff: '',
  });
  // Track which field is currently being edited
  const [activeTaxField, setActiveTaxField] = useState(null);

  // Helper: get display value - use local string while editing, formData otherwise
  const getTaxFieldValue = useCallback((fieldName, formValue) => {
    if (activeTaxField === fieldName) {
      return localTaxFields[fieldName];
    }
    return formValue?.toString() || '0';
  }, [activeTaxField, localTaxFields]);

  // Helper: start editing a tax field
  const startEditTaxField = useCallback((fieldName, currentValue) => {
    setActiveTaxField(fieldName);
    setLocalTaxFields(prev => ({ ...prev, [fieldName]: currentValue?.toString() || '0' }));
  }, []);

  // Helper: finish editing (blur)
  const finishEditTaxField = useCallback(() => {
    setActiveTaxField(null);
  }, []);

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

          {/* Distributor Details Section */}
          <CollapsibleSection
            title="Distributor Details"
            icon="business-outline"
            defaultExpanded={true}
          >
            <View style={styles.distributorSection}>
              {/* Mode Toggle Tabs */}
              <View style={styles.modeToggle}>
                <Pressable
                  style={[
                    styles.modeTab,
                    distributorMode === 'search' && styles.modeTabActive,
                  ]}
                  onPress={() => onDistributorModeChange?.('search')}
                >
                  <Ionicons
                    name="search-outline"
                    size={15}
                    color={distributorMode === 'search' ? '#1D4ED8' : '#6B7280'}
                  />
                  <ThemedText
                    style={[
                      styles.modeTabText,
                      distributorMode === 'search' && styles.modeTabTextActive,
                    ]}
                  >
                    Search by Name
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[
                    styles.modeTab,
                    distributorMode === 'gst' && styles.modeTabActive,
                  ]}
                  onPress={() => onDistributorModeChange?.('gst')}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={15}
                    color={distributorMode === 'gst' ? '#1D4ED8' : '#6B7280'}
                  />
                  <ThemedText
                    style={[
                      styles.modeTabText,
                      distributorMode === 'gst' && styles.modeTabTextActive,
                    ]}
                  >
                    Lookup by GST
                  </ThemedText>
                </Pressable>
              </View>

              {/* Mode: Search by Name (existing) */}
              {distributorMode === 'search' && (
                <>
                  <ThemedText style={styles.fieldLabel}>Distributor Name *</ThemedText>
                  <DistributorAutocomplete
                    userId={userId}
                    value={distributorSearchQuery || formData.pharmacyName}
                    onChangeText={onDistributorSearchChange}
                    onDistributorSelect={onDistributorSelect}
                    onAddNew={onAddNewDistributor}
                    placeholder="Search or add distributor"
                    selectedDistributor={selectedDistributor}
                  />
                </>
              )}

              {/* Mode: GST Lookup */}
              {distributorMode === 'gst' && (
                <>
                  <ThemedText style={styles.fieldLabel}>Enter GST Number</ThemedText>
                  <GSTLookup
                    onDistributorFound={onGstLookupDistributorFound}
                    onError={onGstLookupError}
                    initialGstin={formData.gstin || ''}
                  />
                </>
              )}
              
              {/* Show additional details when distributor is selected */}
              {selectedDistributor && (
                <View style={styles.distributorInfo}>
                  <View style={styles.distributorInfoHeader}>
                    <Ionicons name="checkmark-circle" size={16} color="#059669" />
                    <ThemedText style={styles.distributorSelectedText}>
                      Distributor Selected
                    </ThemedText>
                    <Pressable
                      onPress={() => onDistributorSelect?.(null)}
                      style={styles.clearDistributorButton}
                    >
                      <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                    </Pressable>
                  </View>

                  <View style={styles.distributorInfoBody}>
                    <View style={styles.infoRow}>
                      <Ionicons name="business-outline" size={16} color="#6B7280" />
                      <ThemedText style={styles.infoText}>{selectedDistributor.name}</ThemedText>
                    </View>
                    {selectedDistributor.gstin && (
                      <View style={styles.infoRow}>
                        <Ionicons name="document-text-outline" size={16} color="#6B7280" />
                        <ThemedText style={styles.infoText}>GSTIN: {selectedDistributor.gstin}</ThemedText>
                      </View>
                    )}
                    {selectedDistributor.phone && (
                      <View style={styles.infoRow}>
                        <Ionicons name="call-outline" size={16} color="#6B7280" />
                        <ThemedText style={styles.infoText}>{selectedDistributor.phone}</ThemedText>
                      </View>
                    )}
                    {selectedDistributor.address && (
                      <View style={styles.infoRow}>
                        <Ionicons name="location-outline" size={16} color="#6B7280" />
                        <ThemedText style={styles.infoText}>{selectedDistributor.address}</ThemedText>
                      </View>
                    )}
                    {selectedDistributor.dlNumber && (
                      <View style={styles.infoRow}>
                        <Ionicons name="card-outline" size={16} color="#6B7280" />
                        <ThemedText style={styles.infoText}>DL: {selectedDistributor.dlNumber}</ThemedText>
                      </View>
                    )}
                  </View>
                </View>
              )}
              
              {/* Show manual entry hint when searching with no selection */}
              {!selectedDistributor && distributorMode === 'search' && distributorSearchQuery && distributorSearchQuery.length > 0 && (
                <View style={styles.manualEntryHint}>
                  <Ionicons name="information-circle-outline" size={16} color="#1D4ED8" />
                  <ThemedText style={styles.hintText}>
                    Type at least 2 characters to search, or add as new distributor
                  </ThemedText>
                </View>
              )}
            </View>
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
                          userId={userId}
                          enableProductSuggestions={!!userId}
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

              {/* Discount - Dual Input (% and ₹) */}
              <View style={styles.editableRow}>
                <View style={styles.dualInputRow}>
                  <View style={styles.dualInputHalf}>
                    <FormInput
                      label="Discount (%)"
                      value={getTaxFieldValue('discountPercent', formData.discountPercent)}
                      onChangeText={(text) => {
                        setLocalTaxFields(prev => ({ ...prev, discountPercent: text }));
                        const pct = parseFloat(text);
                        if (!isNaN(pct)) {
                          onUpdateInvoiceMetadata({ discountPercent: pct });
                        }
                      }}
                      onFocus={() => startEditTaxField('discountPercent', formData.discountPercent)}
                      onBlur={finishEditTaxField}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.dualInputHalf}>
                    <FormInput
                      label="Discount (₹)"
                      value={getTaxFieldValue('discountAmount', discountAmount)}
                      onChangeText={(text) => {
                        setLocalTaxFields(prev => ({ ...prev, discountAmount: text }));
                        const amt = parseFloat(text);
                        if (!isNaN(amt)) {
                          const sub = formData.subtotal || 0;
                          const pct = sub > 0 ? Math.round((amt / sub * 100) * 100) / 100 : 0;
                          onUpdateInvoiceMetadata({ discountPercent: pct });
                        }
                      }}
                      onFocus={() => startEditTaxField('discountAmount', discountAmount)}
                      onBlur={finishEditTaxField}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              </View>

              {/* CGST - Dual Input (% and ₹) */}
              <View style={styles.editableRow}>
                <View style={styles.dualInputRow}>
                  <View style={styles.dualInputHalf}>
                    <FormInput
                      label="CGST (%)"
                      value={getTaxFieldValue('cgstPercent', formData.cgstPercent)}
                      onChangeText={(text) => {
                        setLocalTaxFields(prev => ({ ...prev, cgstPercent: text }));
                        const pct = parseFloat(text);
                        if (!isNaN(pct)) {
                          const amt = taxableAmount > 0 ? Math.round((taxableAmount * pct / 100) * 100) / 100 : 0;
                          onUpdateInvoiceMetadata({ cgstPercent: pct, cgst: amt });
                        }
                      }}
                      onFocus={() => startEditTaxField('cgstPercent', formData.cgstPercent)}
                      onBlur={finishEditTaxField}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.dualInputHalf}>
                    <FormInput
                      label="CGST (₹)"
                      value={getTaxFieldValue('cgst', formData.cgst)}
                      onChangeText={(text) => {
                        setLocalTaxFields(prev => ({ ...prev, cgst: text }));
                        const amt = parseFloat(text);
                        if (!isNaN(amt)) {
                          const pct = taxableAmount > 0 ? Math.round((amt / taxableAmount * 100) * 100) / 100 : 0;
                          onUpdateInvoiceMetadata({ cgst: amt, cgstPercent: pct });
                        }
                      }}
                      onFocus={() => startEditTaxField('cgst', formData.cgst)}
                      onBlur={finishEditTaxField}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              </View>

              {/* SGST - Dual Input (% and ₹) */}
              <View style={styles.editableRow}>
                <View style={styles.dualInputRow}>
                  <View style={styles.dualInputHalf}>
                    <FormInput
                      label="SGST (%)"
                      value={getTaxFieldValue('sgstPercent', formData.sgstPercent)}
                      onChangeText={(text) => {
                        setLocalTaxFields(prev => ({ ...prev, sgstPercent: text }));
                        const pct = parseFloat(text);
                        if (!isNaN(pct)) {
                          const amt = taxableAmount > 0 ? Math.round((taxableAmount * pct / 100) * 100) / 100 : 0;
                          onUpdateInvoiceMetadata({ sgstPercent: pct, sgst: amt });
                        }
                      }}
                      onFocus={() => startEditTaxField('sgstPercent', formData.sgstPercent)}
                      onBlur={finishEditTaxField}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.dualInputHalf}>
                    <FormInput
                      label="SGST (₹)"
                      value={getTaxFieldValue('sgst', formData.sgst)}
                      onChangeText={(text) => {
                        setLocalTaxFields(prev => ({ ...prev, sgst: text }));
                        const amt = parseFloat(text);
                        if (!isNaN(amt)) {
                          const pct = taxableAmount > 0 ? Math.round((amt / taxableAmount * 100) * 100) / 100 : 0;
                          onUpdateInvoiceMetadata({ sgst: amt, sgstPercent: pct });
                        }
                      }}
                      onFocus={() => startEditTaxField('sgst', formData.sgst)}
                      onBlur={finishEditTaxField}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              </View>

              {/* Round Off - Editable */}
              <View style={styles.editableRow}>
                <FormInput
                  label="Round Off"
                  value={getTaxFieldValue('roundOff', formData.roundOff)}
                  onChangeText={(text) => {
                    setLocalTaxFields(prev => ({ ...prev, roundOff: text }));
                    const val = parseFloat(text);
                    if (!isNaN(val)) {
                      onUpdateRoundOff(val);
                    }
                  }}
                  onFocus={() => startEditTaxField('roundOff', formData.roundOff)}
                  onBlur={finishEditTaxField}
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
  dualInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dualInputHalf: {
    flex: 1,
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
  // Distributor section styles
  distributorSection: {
    position: 'relative',
    zIndex: 100,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 5,
  },
  modeTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  modeTabTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  distributorInfo: {
    marginTop: 12,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  distributorInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  distributorSelectedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
    flex: 1,
  },
  clearDistributorButton: {
    padding: 2,
  },
  distributorInfoBody: {
    padding: 12,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4B5563',
    flex: 1,
  },
  manualEntryHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  hintText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1D4ED8',
    flex: 1,
  },
});