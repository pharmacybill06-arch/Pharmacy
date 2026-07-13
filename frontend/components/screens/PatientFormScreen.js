import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import Card from '@/components/ui/Card';
import PrimaryButton from '@/components/ui/PrimaryButton';
import {
  DOSAGE_FORM_OPTIONS,
  getDosageFieldConfig,
  getDaysOfSupply,
  getDosageSummary,
  normalizeDosageForm,
  buildDosageDetails,
  toNumber,
} from '@/utils/dosageForms';

let tempIdCounter = 0;
function makeTempId() {
  tempIdCounter += 1;
  return `temp-${Date.now()}-${tempIdCounter}`;
}

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
      style={[styles.input, error && styles.inputError, multiline && styles.inputMultiline]}
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

const DosageChip = ({ label, selected, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.dosageChip,
      selected && styles.dosageChipSelected,
      pressed && styles.dosageChipPressed,
    ]}
  >
    <ThemedText style={[styles.dosageChipText, selected && styles.dosageChipTextSelected]}>
      {label}
    </ThemedText>
  </Pressable>
);

const DosageField = ({ field, value, onChangeText }) => (
  <View style={styles.formGroup}>
    <ThemedText style={styles.formGroupLabel}>{field.label}</ThemedText>
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={field.placeholder}
      placeholderTextColor="#94A3B8"
      keyboardType={field.keyboardType || 'default'}
    />
  </View>
);

function createEmptyMedicine() {
  return {
    tempId: makeTempId(),
    name: '',
    dosageForm: 'tablet',
    stripsDispensed: '',
    tabletsPerStrip: '',
    bottleSizeMl: '',
    mlPerDose: '',
    tubeSizeG: '',
    gPerDose: '',
    inhalerCount: '',
    puffsPerDose: '',
    unitsPerVial: '',
    unitsPerDose: '',
    dropsPerDose: '',
    dosePerDay: '',
  };
}

function hydrateMedicine(medicine) {
  const dosageForm = normalizeDosageForm(medicine?.dosageForm);
  const details = medicine?.dosageDetails || medicine || {};
  return {
    id: medicine.id,
    name: medicine.name || '',
    dosageForm,
    stripsDispensed: String(details.stripsDispensed ?? medicine.stripsDispensed ?? ''),
    tabletsPerStrip: String(details.tabletsPerStrip ?? medicine.tabletsPerStrip ?? ''),
    bottleSizeMl: String(details.bottleSizeMl ?? ''),
    mlPerDose: String(details.mlPerDose ?? ''),
    tubeSizeG: String(details.tubeSizeG ?? ''),
    gPerDose: String(details.gPerDose ?? ''),
    inhalerCount: String(details.inhalerCount ?? ''),
    puffsPerDose: String(details.puffsPerDose ?? ''),
    unitsPerVial: String(details.unitsPerVial ?? ''),
    unitsPerDose: String(details.unitsPerDose ?? ''),
    dropsPerDose: String(details.dropsPerDose ?? ''),
    dosePerDay: String(details.dosePerDay ?? medicine.dosePerDay ?? ''),
  };
}

/**
 * One medicine row with dosage-form specific fields.
 */
const MedicineRow = ({ medicine, onChange, onRemove, error }) => {
  const fieldConfig = getDosageFieldConfig(medicine.dosageForm);

  return (
    <View style={styles.medicineRow}>
    <View style={styles.medicineRowHeader}>
      <View>
        <ThemedText style={styles.medicineRowTitle}>Medicine</ThemedText>
        <ThemedText style={styles.medicineRowSubtitle}>
          {getDosageSummary(medicine)}
        </ThemedText>
      </View>
      <Pressable onPress={onRemove} hitSlop={8}>
        <Ionicons name="trash-outline" size={18} color="#DC2626" />
      </Pressable>
    </View>

    <TextInput
      style={styles.input}
      value={medicine.name}
      onChangeText={(v) => onChange({ ...medicine, name: v })}
      placeholder="e.g., Telmisartan 40mg"
      placeholderTextColor="#94A3B8"
    />

    <View style={styles.dosageFormSection}>
      <ThemedText style={styles.smallLabel}>Dosage form</ThemedText>
      <View style={styles.dosageSelect}>
        <ThemedText style={styles.dosageSelectValue}>
          {DOSAGE_FORM_OPTIONS.find((opt) => opt.value === medicine.dosageForm)?.label || 'Tablet'}
        </ThemedText>
        <Ionicons name="chevron-down" size={18} color="#8C6D2F" />
      </View>

      <View style={styles.dosageChipRow}>
        {DOSAGE_FORM_OPTIONS.map((option) => (
          <DosageChip
            key={option.value}
            label={option.label}
            selected={medicine.dosageForm === option.value}
            onPress={() => onChange({ ...medicine, dosageForm: option.value })}
          />
        ))}
      </View>

      <View style={styles.dosageDivider} />

      <ThemedText style={styles.medicineRowSubtitle}>
        {medicine.dosageForm === 'tablet'
          ? 'Fields for tablet'
          : `Fields for ${DOSAGE_FORM_OPTIONS.find((opt) => opt.value === medicine.dosageForm)?.label.toLowerCase() || 'medicine'}`}
      </ThemedText>

      <View style={styles.fieldsRow}>
        {fieldConfig.fields.slice(0, 2).map((field) => (
          <View key={field.key} style={styles.halfWidthField}>
            <DosageField
              field={field}
              value={medicine[field.key]}
              onChangeText={(v) => onChange({ ...medicine, [field.key]: v })}
            />
          </View>
        ))}
      </View>
      {fieldConfig.fields[2] && (
        <DosageField
          field={fieldConfig.fields[2]}
          value={medicine[fieldConfig.fields[2].key]}
          onChangeText={(v) => onChange({ ...medicine, [fieldConfig.fields[2].key]: v })}
        />
      )}
      <View style={styles.runOutBanner}>
        <ThemedText style={styles.runOutBannerLabel}>Runs out in</ThemedText>
        <ThemedText style={styles.runOutBannerValue}>
          {Math.max(0, Math.round(getDaysOfSupply(medicine) * 10) / 10)} days
        </ThemedText>
      </View>
    </View>
    {error && (
      <View style={styles.errorRow}>
        <Ionicons name="alert-circle" size={14} color="#DC2626" />
        <ThemedText style={styles.errorText}>{error}</ThemedText>
      </View>
    )}
    </View>
  );
};

/**
 * PatientFormScreen
 * Add/Edit patient + their chronic medicines
 */
export default function PatientFormScreen({
  patient = null, // null for create, object (with .medicines) for edit
  onBack,
  onSave,
  isLoading = false,
}) {
  const isEditing = !!patient;

  const [formData, setFormData] = useState({
    name: patient?.name || '',
    phone: patient?.phone || '',
    notes: patient?.notes || '',
  });
  const [medicines, setMedicines] = useState(
    (patient?.medicines || []).map((m) => ({
      ...hydrateMedicine(m),
    }))
  );

  const [errors, setErrors] = useState({});
  const [medicineErrors, setMedicineErrors] = useState({});

  const phoneRef = useRef(null);
  const notesRef = useRef(null);

  const updateField = useCallback((field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
  }, [errors]);

  const updateMedicine = useCallback((key, updated) => {
    setMedicines((prev) => prev.map((m) => ((m.id || m.tempId) === key ? updated : m)));
    if (medicineErrors[key]) {
      setMedicineErrors((prev) => ({ ...prev, [key]: null }));
    }
  }, [medicineErrors]);

  const addMedicineRow = useCallback(() => {
    setMedicines((prev) => [
      ...prev,
      createEmptyMedicine(),
    ]);
  }, []);

  const removeMedicineRow = useCallback((key) => {
    setMedicines((prev) => prev.filter((m) => (m.id || m.tempId) !== key));
  }, []);

  const validate = useCallback(() => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Patient name is required';
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required';

    const newMedicineErrors = {};
    medicines.forEach((m) => {
      const key = m.id || m.tempId;
      if (!m.name.trim()) {
        newMedicineErrors[key] = 'Medicine name is required';
      } else {
        const config = getDosageFieldConfig(m.dosageForm);
        const invalidField = config.fields.find((field) => !(toNumber(m[field.key]) > 0));
        if (invalidField) {
          newMedicineErrors[key] = `${invalidField.label} must be greater than 0`;
        }
      }
    });

    setErrors(newErrors);
    setMedicineErrors(newMedicineErrors);
    return Object.keys(newErrors).length === 0 && Object.keys(newMedicineErrors).length === 0;
  }, [formData, medicines]);

  const handleSubmit = useCallback(() => {
    if (!validate()) return;

    const patientData = {
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      notes: formData.notes.trim() || null,
    };

    const medicinesData = medicines.map((m) => ({
      id: m.id, // present for existing medicines, undefined for new ones
      name: m.name.trim(),
      dosageForm: normalizeDosageForm(m.dosageForm),
      ...buildDosageDetails(m.dosageForm, m),
      stripsDispensed: normalizeDosageForm(m.dosageForm) === 'tablet' ? toNumber(m.stripsDispensed) : 0,
      tabletsPerStrip: normalizeDosageForm(m.dosageForm) === 'tablet' ? toNumber(m.tabletsPerStrip) : 0,
      dosePerDay: toNumber(m.dosePerDay),
      dosageDetails: buildDosageDetails(m.dosageForm, m),
    }));

    onSave?.({ patientData, medicines: medicinesData });
  }, [formData, medicines, validate, onSave]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <AppBar title={isEditing ? 'Edit Patient' : 'Add Patient'} onBack={onBack} />

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
              <ThemedText style={styles.sectionTitle}>Patient Details</ThemedText>

              <FormField
                label="Patient Name"
                value={formData.name}
                onChangeText={(v) => updateField('name', v)}
                placeholder="e.g., Ramesh Kumar"
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
                required
                error={errors.phone}
                inputRef={phoneRef}
                onSubmitEditing={() => notesRef.current?.focus()}
              />

              <FormField
                label="Notes"
                value={formData.notes}
                onChangeText={(v) => updateField('notes', v)}
                placeholder="Optional notes..."
                multiline
                numberOfLines={3}
                inputRef={notesRef}
                returnKeyType="done"
              />
            </Card>

            <Card style={styles.formCard}>
              <View style={styles.medicinesHeader}>
                <ThemedText style={styles.sectionTitle}>Medicines</ThemedText>
                <Pressable style={styles.addMedicineButton} onPress={addMedicineRow}>
                  <Ionicons name="add-circle" size={18} color="#4F46E5" />
                  <ThemedText style={styles.addMedicineText}>Add Medicine</ThemedText>
                </Pressable>
              </View>

              {medicines.length === 0 && (
                <ThemedText style={styles.noMedicinesText}>
                  No medicines added yet. Tap "Add Medicine" to add a chronic medicine.
                </ThemedText>
              )}

              {medicines.map((m) => {
                const key = m.id || m.tempId;
                return (
                  <MedicineRow
                    key={key}
                    medicine={m}
                    onChange={(updated) => updateMedicine(key, updated)}
                    onRemove={() => removeMedicineRow(key)}
                    error={medicineErrors[key]}
                  />
                );
              })}
            </Card>

            <View style={styles.infoCard}>
              <Ionicons name="information-circle-outline" size={20} color="#64748B" />
              <ThemedText style={styles.infoText}>
                Days of supply is computed from the selected dosage form. The run-out date and
                medication sync recommendation are computed automatically on the patient's detail page.
              </ThemedText>
            </View>
          </ScrollView>

          <View style={styles.buttonContainer}>
            <PrimaryButton
              title={isEditing ? 'Save Changes' : 'Add Patient'}
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
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  safeArea: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 24, paddingBottom: 32 },
  formCard: { padding: 18, marginBottom: 16, borderRadius: 18 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldContainer: { marginBottom: 16 },
  labelRow: { flexDirection: 'row', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#334155' },
  smallLabel: { fontSize: 11, fontWeight: '600', color: '#64748B', marginBottom: 6 },
  required: { color: '#DC2626', marginLeft: 4 },
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
  inputMultiline: { minHeight: 80, paddingTop: 12 },
  inputError: { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  errorText: { fontSize: 12, color: '#DC2626' },
  medicinesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addMedicineButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addMedicineText: { fontSize: 13, fontWeight: '600', color: '#4F46E5' },
  noMedicinesText: { fontSize: 13, color: '#94A3B8', paddingVertical: 8 },
  medicineRow: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  medicineRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  medicineRowTitle: { fontSize: 12, fontWeight: '700', color: '#334155' },
  medicineRowSubtitle: { fontSize: 11, color: '#64748B', marginTop: 2 },
  dosageFormSection: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  dosageSelect: {
    marginTop: 6,
    backgroundColor: '#FFF7E8',
    borderWidth: 1.5,
    borderColor: '#E8C76C',
    borderRadius: 12,
    minHeight: 46,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dosageSelectValue: { fontSize: 15, color: '#4A3A12', fontWeight: '600' },
  dosageChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  dosageChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#2F2F2F',
    borderWidth: 1,
    borderColor: '#494949',
  },
  dosageChipSelected: {
    backgroundColor: '#FFF2CF',
    borderColor: '#FFF2CF',
  },
  dosageChipPressed: { opacity: 0.85 },
  dosageChipText: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  dosageChipTextSelected: { color: '#4A3A12' },
  dosageDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginTop: 12,
    marginBottom: 12,
  },
  formGroup: { marginBottom: 12 },
  formGroupLabel: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  halfWidthField: { flex: 1 },
  fieldsRow: { flexDirection: 'row', gap: 8 },
  fullWidthField: { width: '100%' },
  runOutBanner: {
    marginTop: 6,
    backgroundColor: '#E6F5F1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  runOutBannerLabel: { fontSize: 13, fontWeight: '600', color: '#225E52' },
  runOutBannerValue: { fontSize: 14, fontWeight: '700', color: '#225E52' },
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
  infoText: { flex: 1, fontSize: 13, color: '#64748B', lineHeight: 18 },
  buttonContainer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
});
