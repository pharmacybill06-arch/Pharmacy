import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
} from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import CollapsibleSection from '@/components/ui/CollapsibleSection';
import FormInput from '@/components/ui/FormInput';
import SecondaryButton from '@/components/ui/SecondaryButton';
import PrimaryButton from '@/components/ui/PrimaryButton';
import DistributorAutocomplete from '@/components/ui/DistributorAutocomplete';
import GSTLookup from '@/components/ui/GSTLookup';
import { useAuth } from '@/contexts/AuthContext';

const REVIEW_COLUMNS = [
  { key: 'sn', label: 'SN', width: 48, align: 'center', keyboardType: 'number-pad' },
  { key: 'quantity', label: 'QTY', width: 64, align: 'right', keyboardType: 'decimal-pad' },
  { key: 'freeQuantity', label: 'FREE', width: 64, align: 'right', keyboardType: 'decimal-pad' },
  { key: 'name', label: 'ITEM NAME & PACKING', width: 230 },
  { key: 'manufacturer', label: 'MFR', width: 96 },
  { key: 'batchNumber', label: 'BATCH', width: 104 },
  { key: 'expiryDate', label: 'EXP', width: 78, keyboardType: 'number-pad', placeholder: 'MM/YY' },
  { key: 'hsnCode', label: 'HSN', width: 82, keyboardType: 'number-pad' },
  { key: 'mrp', label: 'MRP', width: 82, align: 'right', keyboardType: 'decimal-pad' },
  { key: 'rate', label: 'RATE', width: 82, align: 'right', keyboardType: 'decimal-pad' },
  { key: 'discountPercent', label: 'DIS %', width: 72, align: 'right', keyboardType: 'decimal-pad' },
  { key: 'sgstPercent', label: 'SGST', width: 72, align: 'right', keyboardType: 'decimal-pad' },
  { key: 'cgstPercent', label: 'CGST', width: 72, align: 'right', keyboardType: 'decimal-pad' },
  { key: 'itemTotal', label: 'AMOUNT', width: 92, align: 'right', keyboardType: 'decimal-pad' },
  { key: 'status', label: 'CHECK', width: 132, align: 'center' },
];

const REVIEW_TABLE_WIDTH = REVIEW_COLUMNS.reduce((sum, column) => sum + column.width, 0);

/**
 * Item Row Component for column-based human review
 */
const ItemReviewRow = ({ item, index, onUpdateCell, onVerify, onRemove }) => {
  const getItemTotal = () => {
    if (item.itemTotal !== undefined && item.itemTotal !== null && item.itemTotal !== '') {
      return Math.round((parseFloat(item.itemTotal) || 0) * 100) / 100;
    }

    const qty = parseFloat(item.quantity) || 0;
    const rate = parseFloat(item.rate) || 0;
    const discount = parseFloat(item.discount) || 0;
    const calculatedTotal = qty * rate - discount;
    return Math.round(calculatedTotal * 100) / 100;
  };

  const totalValue = getItemTotal();
  const isVerified = item.humanVerified === true;
  const needsReview = item.needsReview || !isVerified;

  return (
    <View
      style={[
        styles.reviewRow,
        needsReview && styles.reviewRowNeedsCheck,
      ]}
    >
      {REVIEW_COLUMNS.map((column) => {
        const rawValue =
          column.key === 'sn'
            ? item.sn || index + 1
            : column.key === 'itemTotal'
              ? totalValue
              : item[column.key] === undefined || item[column.key] === null || item[column.key] === ''
                ? '-'
                : item[column.key];

        if (column.key === 'status') {
          return (
            <View key={column.key} style={[styles.reviewCell, { width: column.width }]}>
              <View style={styles.rowActions}>
                <Pressable
                  style={[
                    styles.verifyButton,
                    isVerified ? styles.verifyButtonDone : styles.verifyButtonPending,
                  ]}
                  onPress={() => onVerify(index)}
                >
                  <Ionicons
                    name={isVerified ? 'checkmark-circle' : 'alert-circle-outline'}
                    size={14}
                    color={isVerified ? '#047857' : '#B45309'}
                  />
                  <ThemedText
                    style={[
                      styles.verifyButtonText,
                      isVerified ? styles.verifyTextDone : styles.verifyTextPending,
                    ]}
                    numberOfLines={1}
                  >
                    {isVerified ? 'Done' : 'Check'}
                  </ThemedText>
                </Pressable>
                <Pressable style={styles.removeIconButton} onPress={() => onRemove(index)}>
                  <Ionicons name="trash-outline" size={15} color="#DC2626" />
                </Pressable>
              </View>
            </View>
          );
        }

        const cellText = rawValue === '-'
          ? rawValue
          : column.type === 'money' && Number.isFinite(Number(rawValue))
            ? Number(rawValue).toFixed(2)
            : String(rawValue);

        return (
          <View
            key={column.key}
            style={[
              styles.reviewCell,
              { width: column.width },
              column.align === 'right' && styles.reviewCellRight,
              column.align === 'center' && styles.reviewCellCenter,
            ]}
          >
            <TextInput
              style={[
                styles.reviewCellInput,
                column.key === 'name' && styles.reviewItemName,
                column.align === 'right' && styles.reviewInputRight,
                column.align === 'center' && styles.reviewInputCenter,
                rawValue === '-' && styles.reviewCellEmpty,
              ]}
              value={rawValue === '-' ? '' : cellText}
              onChangeText={(text) => onUpdateCell(index, column.key, text)}
              placeholder={column.placeholder || '-'}
              placeholderTextColor="#94A3B8"
              keyboardType={column.keyboardType || 'default'}
              selectTextOnFocus
            />
          </View>
        );
      })}
    </View>
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
  onSubmit,
  onSaveDraft,
  onCancel,
  geminiLoading = false,
  geminiConfidence = null,
  itemsNeedingManualReview = 0,
  onUpdateItemCell,
  onRemoveItem,
  onVerifyItem,
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

  // Prefer explicit parsed discount amount; calculate from percent after edits.
  const discountAmount = formData.discountAmount ?? formData.discount ?? ((formData.subtotal || 0) * ((formData.discountPercent || 0) / 100));
  const taxableAmount = (formData.subtotal || 0) - discountAmount;
  const itemCount = formData.items?.length || 0;
  const pendingReviewCount = (formData.items || []).filter(
    (item) => item.needsReview || item.humanVerified !== true
  ).length;
  const canSubmit = itemCount === 0 || pendingReviewCount === 0;

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
              <Ionicons name="sync-outline" size={16} color="#4F46E5" />
              <ThemedText style={styles.statusText}>
                Gemini AI is parsing your invoice...
              </ThemedText>
            </View>
          )}

          {geminiConfidence !== null && !geminiLoading && (
            <View style={styles.statusPill}>
              <Ionicons name="sparkles-outline" size={16} color="#4F46E5" />
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
                    color={distributorMode === 'search' ? '#4F46E5' : '#64748B'}
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
                    color={distributorMode === 'gst' ? '#4F46E5' : '#64748B'}
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
                      <Ionicons name="close-circle" size={16} color="#94A3B8" />
                    </Pressable>
                  </View>

                  <View style={styles.distributorInfoBody}>
                    <View style={styles.infoRow}>
                      <Ionicons name="business-outline" size={16} color="#64748B" />
                      <ThemedText style={styles.infoText}>{selectedDistributor.name}</ThemedText>
                    </View>
                    {selectedDistributor.gstin && (
                      <View style={styles.infoRow}>
                        <Ionicons name="document-text-outline" size={16} color="#64748B" />
                        <ThemedText style={styles.infoText}>GSTIN: {selectedDistributor.gstin}</ThemedText>
                      </View>
                    )}
                    {selectedDistributor.phone && (
                      <View style={styles.infoRow}>
                        <Ionicons name="call-outline" size={16} color="#64748B" />
                        <ThemedText style={styles.infoText}>{selectedDistributor.phone}</ThemedText>
                      </View>
                    )}
                    {selectedDistributor.address && (
                      <View style={styles.infoRow}>
                        <Ionicons name="location-outline" size={16} color="#64748B" />
                        <ThemedText style={styles.infoText}>{selectedDistributor.address}</ThemedText>
                      </View>
                    )}
                    {selectedDistributor.dlNumber && (
                      <View style={styles.infoRow}>
                        <Ionicons name="card-outline" size={16} color="#64748B" />
                        <ThemedText style={styles.infoText}>DL: {selectedDistributor.dlNumber}</ThemedText>
                      </View>
                    )}
                  </View>
                </View>
              )}
              
              {/* Show manual entry hint when searching with no selection */}
              {!selectedDistributor && distributorMode === 'search' && distributorSearchQuery && distributorSearchQuery.length > 0 && (
                <View style={styles.manualEntryHint}>
                  <Ionicons name="information-circle-outline" size={16} color="#4F46E5" />
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
            <View style={styles.reviewSummary}>
              <View style={styles.reviewSummaryItem}>
                <ThemedText style={styles.reviewSummaryValue}>{itemCount}</ThemedText>
                <ThemedText style={styles.reviewSummaryLabel}>Rows</ThemedText>
              </View>
              <View style={styles.reviewSummaryDivider} />
              <View style={styles.reviewSummaryItem}>
                <ThemedText
                  style={[
                    styles.reviewSummaryValue,
                    pendingReviewCount > 0 ? styles.pendingValue : styles.verifiedValue,
                  ]}
                >
                  {pendingReviewCount}
                </ThemedText>
                <ThemedText style={styles.reviewSummaryLabel}>Need check</ThemedText>
              </View>
            </View>

            <View style={styles.itemsContainer}>
              {formData.items && formData.items.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                  <View style={[styles.reviewTable, { width: REVIEW_TABLE_WIDTH }]}>
                    <View style={styles.reviewHeader}>
                      {REVIEW_COLUMNS.map((column) => (
                        <View
                          key={column.key}
                          style={[
                            styles.reviewHeaderCell,
                            { width: column.width },
                            column.align === 'right' && styles.reviewCellRight,
                            column.align === 'center' && styles.reviewCellCenter,
                          ]}
                        >
                          <ThemedText style={styles.reviewHeaderText} numberOfLines={1}>
                            {column.label}
                          </ThemedText>
                        </View>
                      ))}
                    </View>

                    {formData.items.map((item, index) => (
                      <ItemReviewRow
                        key={item.id || index}
                        item={item}
                        index={index}
                        onUpdateCell={onUpdateItemCell}
                        onVerify={onVerifyItem}
                        onRemove={onRemoveItem}
                      />
                    ))}
                  </View>
                </ScrollView>
              ) : (
                <ThemedText style={styles.emptyText}>
                  No items added yet
                </ThemedText>
              )}
            </View>
            
            <SecondaryButton
              title="Add Item"
              icon="add-outline"
              borderColor="#4F46E5"
              textColor="#4F46E5"
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
                          onUpdateInvoiceMetadata({ discountPercent: pct, discountAmount: undefined, discount: undefined });
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
                          onUpdateInvoiceMetadata({ discountPercent: pct, discountAmount: amt, discount: amt });
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
            title={canSubmit ? 'Confirm & Save Bill' : `Verify ${pendingReviewCount} Row${pendingReviewCount === 1 ? '' : 's'} First`}
            icon={canSubmit ? 'checkmark-circle-outline' : 'alert-circle-outline'}
            onPress={onSubmit}
            disabled={!canSubmit}
          />
          
          {onSaveDraft && (
            <>
              <View style={styles.buttonSpacer} />
              <SecondaryButton
                title="Save as Draft"
                icon="document-text-outline"
                onPress={onSaveDraft}
              />
            </>
          )}
          
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
    backgroundColor: '#F8FAFC',
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
    color: '#4F46E5',
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
  reviewSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  reviewSummaryItem: {
    minWidth: 78,
  },
  reviewSummaryValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  reviewSummaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  reviewSummaryDivider: {
    width: 1,
    height: 34,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 12,
  },
  pendingValue: {
    color: '#B45309',
  },
  verifiedValue: {
    color: '#047857',
  },
  reviewTable: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  reviewHeader: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  reviewHeaderCell: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
  },
  reviewHeaderText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#334155',
    letterSpacing: 0,
  },
  reviewRow: {
    flexDirection: 'row',
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  reviewRowNeedsCheck: {
    backgroundColor: '#FFFBEB',
  },
  reviewRowPressed: {
    backgroundColor: '#EEF2FF',
  },
  reviewCell: {
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  reviewCellRight: {
    alignItems: 'flex-end',
  },
  reviewCellCenter: {
    alignItems: 'center',
  },
  reviewCellText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 16,
  },
  reviewItemName: {
    fontSize: 12,
    fontWeight: '800',
  },
  reviewCellEmpty: {
    color: '#94A3B8',
  },
  verifyButton: {
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
  },
  verifyButtonPending: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
  },
  verifyButtonDone: {
    backgroundColor: '#D1FAE5',
    borderColor: '#86EFAC',
  },
  verifyButtonText: {
    fontSize: 11,
    fontWeight: '900',
  },
  verifyTextPending: {
    color: '#B45309',
  },
  verifyTextDone: {
    color: '#047857',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  itemRowPressed: {
    opacity: 0.7,
    backgroundColor: '#F8FAFC',
  },
  itemRowLeft: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  itemRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 20,
  },
  totalsCard: {
    padding: 14,
    backgroundColor: '#F8FAFC',
  },
  totalsContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
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
    color: '#475569',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
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
    backgroundColor: '#E2E8F0',
    marginVertical: 8,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  grandTotalValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  bottomSpacer: {
    height: 20,
  },
  editorContainer: {
    backgroundColor: '#EEF2FF',
    borderWidth: 2,
    borderColor: '#4F46E5',
    borderRadius: 16,
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
    borderTopColor: '#E2E8F0',
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
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
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
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  modeTabTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  distributorInfo: {
    marginTop: 12,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 14,
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
    color: '#475569',
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
    color: '#4F46E5',
    flex: 1,
  },
});
