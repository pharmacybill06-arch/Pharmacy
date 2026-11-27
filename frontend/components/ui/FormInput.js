import React from 'react';
import { TextInput, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';

/**
 * FormInput Component
 * Styled input field following design system
 */
export default function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  multiline = false,
  numberOfLines = 1,
  editable = true,
  onFocus,
  onBlur,
  uncertain = false,
  // Validation message: red border + text under the field (e.g. a mandatory bill field)
  error = null,
  required = false,
}) {
  return (
    <View style={styles.container}>
      {label && (
        <View style={styles.labelRow}>
          <ThemedText style={[styles.label, error && styles.labelError]}>{label}{required ? ' *' : ''}</ThemedText>
          {uncertain && (
            <Ionicons name="alert-circle" size={12} color="#D97706" style={styles.uncertainIcon} />
          )}
        </View>
      )}
      <TextInput
        style={[
          styles.input,
          multiline && styles.multilineInput,
          !editable && styles.disabledInput,
          uncertain && styles.inputUncertain,
          error && styles.inputError,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={numberOfLines}
        editable={editable}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  uncertainIcon: {
    marginTop: 1,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    fontWeight: '500',
    color: '#0F172A',
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  disabledInput: {
    backgroundColor: '#F9FAFB',
    color: '#94A3B8',
  },
  labelError: {
    color: '#B91C1C',
  },
  inputError: {
    borderColor: '#DC2626',
    borderWidth: 2,
    backgroundColor: '#FEF2F2',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  inputUncertain: {
    borderColor: '#D97706',
    borderWidth: 2,
    backgroundColor: '#FFFBEB',
  },
});
