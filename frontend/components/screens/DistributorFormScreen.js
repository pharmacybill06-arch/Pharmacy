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

/**
 * Form Input Component
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
  autoCapitalize = 'words',
  multiline = false,
  numberOfLines = 1,
}) => (
  <View style={styles.fieldContainer}>
    <View style={styles.labelRow}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      {required && <ThemedText style={styles.required}>*</ThemedText>}
    </View>
    <TextInput
      ref={inputRef}
      style={[
        styles.input, 
        error && styles.inputError,
        multiline && styles.inputMultiline
      ]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#94A3B8"
      keyboardType={keyboardType}
      autoFocus={autoFocus}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      onSubmitEditing={onSubmitEditing}
      returnKeyType={returnKeyType}
      multiline={multiline}
      numberOfLines={numberOfLines}
      textAlignVertical={multiline ? 'top' : 'center'}
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
 * DistributorFormScreen
 * Add/Edit distributor form
 */
export default function DistributorFormScreen({
  distributor = null, // null for create, object for edit
  initialData = null, // Initial data for pre-filling form (used when adding from bill form)
  onBack,
  onCancel, // Alternative to onBack
  onSave,
  isLoading = false,
}) {
  const isEditing = !!distributor;
  const handleBack = onBack || onCancel;
  
  // Form state - prioritize distributor, then initialData
  const [formData, setFormData] = useState({
    name: distributor?.name || initialData?.name || '',
    phone: distributor?.phone || initialData?.phone || '',
    gstin: distributor?.gstin || initialData?.gstin || '',
    address: distributor?.address || initialData?.address || '',
    dlNumber: distributor?.dlNumber || initialData?.dlNumber || '',
    email: distributor?.email || initialData?.email || '',
    notes: distributor?.notes || initialData?.notes || '',
  });
  
  // Validation errors
  const [errors, setErrors] = useState({});
  
  // Refs for field navigation
  const phoneRef = useRef(null);
  const gstinRef = useRef(null);
  const addressRef = useRef(null);
  const dlRef = useRef(null);
  const emailRef = useRef(null);
  const notesRef = useRef(null);

  // Update form field
  const updateField = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user types
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  }, [errors]);

  // Validate GSTIN format
  const validateGstin = (gstin) => {
    if (!gstin) return true;
    // GSTIN format: 15 alphanumeric characters
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return gstinRegex.test(gstin.toUpperCase());
  };

  // Validate form
  const validate = useCallback(() => {
    const newErrors = {};
    
    // Name is required
    if (!formData.name.trim()) {
      newErrors.name = 'Distributor name is required';
    }
    
    // GSTIN format validation (if provided)
    if (formData.gstin && !validateGstin(formData.gstin)) {
      newErrors.gstin = 'Invalid GSTIN format';
    }
    
    // Email format validation (if provided)
    if (formData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        newErrors.email = 'Invalid email format';
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
    
    const distributorData = {
      name: formData.name.trim(),
      phone: formData.phone.trim() || null,
      gstin: formData.gstin.trim().toUpperCase() || null,
      address: formData.address.trim() || null,
      dlNumber: formData.dlNumber.trim() || null,
      email: formData.email.trim().toLowerCase() || null,
      notes: formData.notes.trim() || null,
    };
    
    onSave?.(distributorData);
  }, [formData, validate, onSave]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <AppBar
          title={isEditing ? 'Edit Distributor' : 'Add Distributor'}
          onBack={handleBack}
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
              <ThemedText style={styles.sectionTitle}>Basic Information</ThemedText>
              
              <FormField
                label="Distributor Name"
                value={formData.name}
                onChangeText={(v) => updateField('name', v)}
                placeholder="e.g., Bhalla Medical Agencies"
                required
                error={errors.name}
                autoFocus={!isEditing}
                onSubmitEditing={() => phoneRef.current?.focus()}
              />
              
              <FormField
                label="Phone Number"
                value={formData.phone}
                onChangeText={(v) => updateField('phone', v)}
                placeholder="e.g., 9876543210"
                keyboardType="phone-pad"
                inputRef={phoneRef}
                onSubmitEditing={() => gstinRef.current?.focus()}
              />
              
              <FormField
                label="GSTIN"
                value={formData.gstin}
                onChangeText={(v) => updateField('gstin', v.toUpperCase())}
                placeholder="e.g., 07AAACB1234F1ZV"
                autoCapitalize="characters"
                error={errors.gstin}
                inputRef={gstinRef}
                onSubmitEditing={() => dlRef.current?.focus()}
              />
              
              <FormField
                label="Drug License Number"
                value={formData.dlNumber}
                onChangeText={(v) => updateField('dlNumber', v)}
                placeholder="e.g., DL-DEL-123456"
                autoCapitalize="characters"
                inputRef={dlRef}
                onSubmitEditing={() => addressRef.current?.focus()}
              />
            </Card>
            
            <Card style={styles.formCard}>
              <ThemedText style={styles.sectionTitle}>Contact Details</ThemedText>
              
              <FormField
                label="Address"
                value={formData.address}
                onChangeText={(v) => updateField('address', v)}
                placeholder="Enter full address"
                multiline
                numberOfLines={3}
                inputRef={addressRef}
                returnKeyType="default"
              />
              
              <FormField
                label="Email"
                value={formData.email}
                onChangeText={(v) => updateField('email', v)}
                placeholder="e.g., contact@distributor.com"
                keyboardType="email-address"
                autoCapitalize="none"
                error={errors.email}
                inputRef={emailRef}
                onSubmitEditing={() => notesRef.current?.focus()}
              />
            </Card>
            
            <Card style={styles.formCard}>
              <ThemedText style={styles.sectionTitle}>Additional Notes</ThemedText>
              
              <FormField
                label="Notes"
                value={formData.notes}
                onChangeText={(v) => updateField('notes', v)}
                placeholder="Add any additional notes..."
                multiline
                numberOfLines={4}
                inputRef={notesRef}
                returnKeyType="done"
              />
            </Card>
            
            {/* Info Card */}
            <View style={styles.infoCard}>
              <Ionicons name="information-circle-outline" size={20} color="#64748B" />
              <ThemedText style={styles.infoText}>
                Distributors are automatically linked to bills based on name and GSTIN matching.
              </ThemedText>
            </View>
          </ScrollView>
          
          {/* Submit Button */}
          <View style={styles.buttonContainer}>
            <PrimaryButton
              title={isEditing ? 'Save Changes' : 'Add Distributor'}
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
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  required: {
    color: '#DC2626',
    marginLeft: 4,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: '#0F172A',
    minHeight: 48,
    fontWeight: '500',
  },
  inputMultiline: {
    minHeight: 80,
    paddingTop: 12,
  },
  inputError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    padding: 14,
    gap: 10,
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
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
});
