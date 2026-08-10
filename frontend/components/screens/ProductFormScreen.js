import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import Card from '@/components/ui/Card';
import PrimaryButton from '@/components/ui/PrimaryButton';
import DateField from '@/components/ui/DateField';
import { useProductCRUD } from '@/hooks/useProducts';

/**
 * Form Input Component with validation
 */
const FormField = ({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  required = false,
  error = null,
  autoFocus = false,
  inputRef,
  onSubmitEditing,
  returnKeyType = 'next',
}) => (
  <View style={styles.fieldContainer}>
    <View style={styles.labelRow}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      {required && <ThemedText style={styles.required}>*</ThemedText>}
    </View>
    <TextInput
      ref={inputRef}
      style={[styles.input, error && styles.inputError]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#94A3B8"
      keyboardType={keyboardType}
      autoFocus={autoFocus}
      autoCapitalize="words"
      autoCorrect={false}
      onSubmitEditing={onSubmitEditing}
      returnKeyType={returnKeyType}
    />
    {error && (
      <View style={styles.errorRow}>
        <Ionicons name="alert-circle" size={14} color="#DC2626" />
        <ThemedText style={styles.errorText}>{error}</ThemedText>
      </View>
    )}
  </View>
);

/**
 * ProductFormScreen
 * Add/Edit product form with validation
 */
export default function ProductFormScreen({
  userId,
  product = null, // null for create, object for edit
  onBack,
  onSave,
}) {
  const isEditing = !!product;
  
  // Form state
  const [formData, setFormData] = useState({
    name: product?.name || '',
    batchNumber: product?.batchNumber || '',
    expiryDate: product?.expiryDate || '',
    manufacturer: product?.manufacturer || '',
    quantity: product?.quantity?.toString() || '1',
    purchaseDate: product?.purchaseDate || '',
    defaultMrp: product?.defaultMrp?.toString() || '',
    defaultRate: product?.defaultRate?.toString() || '',
    ptr: product?.ptr?.toString() || '',
    notes: product?.notes || '',
    // Pack definition — drives every pack <-> base-unit conversion in Quick Sell
    packSize: product?.packSize?.toString() || '1',
    baseUnit: product?.baseUnit || 'unit',
    packLabel: product?.packLabel || 'pack',
    // Regulatory: h1/nrx force a billed sale with patient + doctor captured
    scheduleFlag: product?.scheduleFlag || 'none',
  });
  
  // Validation errors
  const [errors, setErrors] = useState({});
  
  // Refs for field navigation
  const batchRef = useRef(null);
  const expiryRef = useRef(null);
  const manufacturerRef = useRef(null);
  const quantityRef = useRef(null);
  const purchaseRef = useRef(null);
  const mrpRef = useRef(null);
  const rateRef = useRef(null);
  const ptrRef = useRef(null);
  const notesRef = useRef(null);
  
  const { createProduct, updateProduct, isLoading, error: apiError } = useProductCRUD(userId);

  // Show API errors
  useEffect(() => {
    if (apiError) {
      Alert.alert('Error', apiError);
    }
  }, [apiError]);

  // Update form field
  const updateField = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user types
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  }, [errors]);

  // Validate form
  const validate = useCallback(() => {
    const newErrors = {};
    
    // Name is required
    if (!formData.name.trim()) {
      newErrors.name = 'Item name is required';
    }
    
    // Expiry date is required
    if (!formData.expiryDate.trim()) {
      newErrors.expiryDate = 'Expiry date is required';
    }
    
    // Quantity validation
    if (formData.quantity) {
      const qty = parseFloat(formData.quantity);
      if (isNaN(qty) || qty <= 0) {
        newErrors.quantity = 'Quantity must be greater than 0';
      }
    }
    
    // MRP validation
    if (formData.defaultMrp) {
      const mrp = parseFloat(formData.defaultMrp);
      if (isNaN(mrp) || mrp < 0) {
        newErrors.defaultMrp = 'MRP must be a positive number';
      }
    }
    
    // Rate validation
    if (formData.defaultRate) {
      const rate = parseFloat(formData.defaultRate);
      if (isNaN(rate) || rate < 0) {
        newErrors.defaultRate = 'Rate must be a positive number';
      }
    }
    
    // PTR validation
    if (formData.ptr) {
      const ptr = parseFloat(formData.ptr);
      if (isNaN(ptr) || ptr < 0) {
        newErrors.ptr = 'PTR must be a positive number';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    if (!validate()) {
      return;
    }
    
    try {
      const productData = {
        name: formData.name.trim(),
        batchNumber: formData.batchNumber.trim() || null,
        expiryDate: formData.expiryDate.trim(),
        manufacturer: formData.manufacturer.trim() || null,
        quantity: formData.quantity ? parseFloat(formData.quantity) : 1,
        purchaseDate: formData.purchaseDate.trim() || null,
        defaultMrp: formData.defaultMrp ? parseFloat(formData.defaultMrp) : null,
        defaultRate: formData.defaultRate ? parseFloat(formData.defaultRate) : null,
        ptr: formData.ptr ? parseFloat(formData.ptr) : null,
        notes: formData.notes.trim() || null,
        packSize: formData.packSize ? parseInt(formData.packSize, 10) : 1,
        baseUnit: formData.baseUnit.trim() || 'unit',
        packLabel: formData.packLabel.trim() || 'pack',
        scheduleFlag: formData.scheduleFlag || 'none',
      };
      
      let savedProduct;
      if (isEditing) {
        savedProduct = await updateProduct(product.id, productData);
      } else {
        savedProduct = await createProduct(productData);
      }
      
      onSave?.(savedProduct);
    } catch (err) {
      // Error is handled by the hook
    }
  }, [formData, validate, isEditing, product, createProduct, updateProduct, onSave]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <AppBar
          title={isEditing ? 'Edit Product' : 'Add Product'}
          onBack={onBack}
        />
        
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Card style={styles.formCard}>
              <ThemedText style={styles.sectionTitle}>Item Details</ThemedText>
              <ThemedText style={styles.sectionSubtitle}>Enter item details to track expiry dates</ThemedText>
              
              <FormField
                label="Item Name"
                value={formData.name}
                onChangeText={(v) => updateField('name', v)}
                placeholder="e.g., Paracetamol 500mg"
                required
                error={errors.name}
                autoFocus={!isEditing}
                onSubmitEditing={() => batchRef.current?.focus()}
              />
              
              <FormField
                label="Batch Number"
                value={formData.batchNumber}
                onChangeText={(v) => updateField('batchNumber', v)}
                placeholder="e.g., B12345"
                inputRef={batchRef}
                onSubmitEditing={() => expiryRef.current?.focus()}
              />
              
              <DateField
                label="Expiry Date"
                value={formData.expiryDate}
                onChange={(v) => updateField('expiryDate', v)}
                placeholder="Select expiry date"
                required
                error={errors.expiryDate}
              />
              
              <FormField
                label="Manufacturer"
                value={formData.manufacturer}
                onChangeText={(v) => updateField('manufacturer', v)}
                placeholder="e.g., ABC Pharma"
                inputRef={manufacturerRef}
                onSubmitEditing={() => quantityRef.current?.focus()}
              />
              
              <View style={styles.row}>
                <View style={styles.halfField}>
                  <FormField
                    label="Quantity"
                    value={formData.quantity}
                    onChangeText={(v) => updateField('quantity', v)}
                    placeholder="1"
                    keyboardType="decimal-pad"
                    error={errors.quantity}
                    inputRef={quantityRef}
                    onSubmitEditing={() => purchaseRef.current?.focus()}
                  />
                </View>
                <View style={styles.halfField}>
                  <DateField
                    label="Purchase Date"
                    value={formData.purchaseDate}
                    onChange={(v) => updateField('purchaseDate', v)}
                    placeholder="Select purchase date"
                  />
                </View>
              </View>
            </Card>

            <Card style={styles.formCard}>
              <ThemedText style={styles.sectionTitle}>Pack & Schedule</ThemedText>

              <View style={styles.row}>
                <View style={styles.halfField}>
                  <FormField
                    label="Base units per pack"
                    value={formData.packSize}
                    onChangeText={(v) => updateField('packSize', v)}
                    placeholder="e.g., 15"
                    keyboardType="number-pad"
                    error={errors.packSize}
                  />
                </View>
                <View style={styles.halfField}>
                  <FormField
                    label="Base unit"
                    value={formData.baseUnit}
                    onChangeText={(v) => updateField('baseUnit', v)}
                    placeholder="tablet / ml / unit"
                  />
                </View>
              </View>

              <FormField
                label="Pack label"
                value={formData.packLabel}
                onChangeText={(v) => updateField('packLabel', v)}
                placeholder="strip / bottle / vial / tube"
              />

              <ThemedText style={styles.scheduleHint}>
                1 {formData.packLabel || 'pack'} = {formData.packSize || 1}{' '}
                {formData.baseUnit || 'unit'}
                {String(formData.packSize) === '1' ? '' : 's'}. Stock is always counted in{' '}
                {formData.baseUnit || 'unit'}s.
              </ThemedText>

              {/* Schedule selector — drives the forced billing flow */}
              <ThemedText style={styles.scheduleLabel}>Schedule</ThemedText>
              <View style={styles.scheduleRow}>
                {[
                  { key: 'none', label: 'None' },
                  { key: 'h1', label: 'H1' },
                  { key: 'nrx', label: 'NRX' },
                ].map((option) => {
                  const selected = formData.scheduleFlag === option.key;
                  const restricted = option.key !== 'none';
                  return (
                    <Pressable
                      key={option.key}
                      style={[
                        styles.scheduleOption,
                        selected && (restricted ? styles.scheduleOptionRestricted : styles.scheduleOptionActive),
                      ]}
                      onPress={() => updateField('scheduleFlag', option.key)}
                    >
                      <ThemedText
                        style={[
                          styles.scheduleOptionText,
                          selected && (restricted ? styles.scheduleOptionTextRestricted : styles.scheduleOptionTextActive),
                        ]}
                      >
                        {option.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              {formData.scheduleFlag !== 'none' && (
                <ThemedText style={styles.scheduleWarning}>
                  Sales of this medicine require the patient and doctor name, and are billed
                  immediately — they cannot be saved as a quick sale.
                </ThemedText>
              )}
            </Card>

            <Card style={styles.formCard}>
              <ThemedText style={styles.sectionTitle}>Pricing</ThemedText>
              
              <View style={styles.row}>
                <View style={styles.halfField}>
                  <FormField
                    label="MRP (₹)"
                    value={formData.defaultMrp}
                    onChangeText={(v) => updateField('defaultMrp', v)}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    error={errors.defaultMrp}
                    inputRef={mrpRef}
                    onSubmitEditing={() => rateRef.current?.focus()}
                  />
                </View>
                <View style={styles.halfField}>
                  <FormField
                    label="Rate (₹)"
                    value={formData.defaultRate}
                    onChangeText={(v) => updateField('defaultRate', v)}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    error={errors.defaultRate}
                    inputRef={rateRef}
                    onSubmitEditing={() => ptrRef.current?.focus()}
                  />
                </View>
              </View>
              
              <FormField
                label="PTR (₹)"
                value={formData.ptr}
                onChangeText={(v) => updateField('ptr', v)}
                placeholder="0.00"
                keyboardType="decimal-pad"
                error={errors.ptr}
                inputRef={ptrRef}
                onSubmitEditing={() => notesRef.current?.focus()}
              />
            </Card>
            
            <Card style={styles.formCard}>
              <ThemedText style={styles.sectionTitle}>Additional Notes</ThemedText>
              
              <View style={styles.fieldContainer}>
                <ThemedText style={styles.label}>Notes</ThemedText>
                <TextInput
                  ref={notesRef}
                  style={styles.notesInput}
                  value={formData.notes}
                  onChangeText={(v) => updateField('notes', v)}
                  placeholder="Add any additional notes..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
              </View>
            </Card>
            
            {/* Info Card */}
            <View style={styles.infoCard}>
              <Ionicons name="information-circle-outline" size={20} color="#64748B" />
              <ThemedText style={styles.infoText}>
                Track inventory and monitor expiry dates for better stock management.
              </ThemedText>
            </View>
          </ScrollView>
          
          {/* Submit Button */}
          <View style={styles.buttonContainer}>
            <PrimaryButton
              title={isEditing ? 'Save Changes' : 'Add Product'}
              onPress={handleSubmit}
              icon={isEditing ? 'checkmark' : 'add'}
              loading={isLoading}
              disabled={isLoading}
            />
          </View>
        </KeyboardAvoidingView>
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
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 24,
    paddingBottom: 32,
  },
  formCard: {
    padding: 18,
    marginBottom: 16,
    borderRadius: 18,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
    marginBottom: 16,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  required: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
    marginLeft: 2,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  inputError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },

  // Pack & Schedule
  scheduleHint: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginTop: -4,
    marginBottom: 14,
    lineHeight: 17,
  },
  scheduleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  scheduleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  scheduleOption: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  scheduleOptionActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  scheduleOptionRestricted: {
    backgroundColor: '#FEF2F2',
    borderColor: '#DC2626',
  },
  scheduleOptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },
  scheduleOptionTextActive: {
    color: '#4F46E5',
  },
  scheduleOptionTextRestricted: {
    color: '#DC2626',
  },
  scheduleWarning: {
    fontSize: 12,
    fontWeight: '600',
    color: '#991B1B',
    lineHeight: 17,
    marginTop: 10,
  },
  notesInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '500',
    color: '#0F172A',
    minHeight: 100,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EEF2FF',
    padding: 14,
    borderRadius: 14,
    gap: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  buttonContainer: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
});
