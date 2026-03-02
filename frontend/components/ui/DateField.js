import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TextInput, Modal, Pressable, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';

/**
 * DateField Component
 * A date input field with calendar icon and date format validation
 */
export default function DateField({
  label,
  value,
  onChange,
  required = false,
  error = null,
  placeholder = 'DD-MM-YYYY',
}) {
  const [localValue, setLocalValue] = useState(value || '');

  // Sync with external value changes
  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  // Format input as user types
  const handleTextChange = (text) => {
    // Remove non-numeric characters
    const cleaned = text.replace(/[^0-9]/g, '');
    
    let formatted = '';
    if (cleaned.length > 0) {
      formatted = cleaned.substring(0, 2);
      if (cleaned.length >= 3) {
        formatted += '-' + cleaned.substring(2, 4);
      }
      if (cleaned.length >= 5) {
        formatted += '-' + cleaned.substring(4, 8);
      }
    }
    
    setLocalValue(formatted);
    onChange(formatted);
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <ThemedText style={styles.label}>{label}</ThemedText>
        {required && <ThemedText style={styles.required}>*</ThemedText>}
      </View>
      
      <View style={[styles.inputContainer, error && styles.inputContainerError]}>
        <TextInput
          style={styles.input}
          value={localValue}
          onChangeText={handleTextChange}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          keyboardType="numeric"
          maxLength={10}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Ionicons name="calendar-outline" size={20} color="#64748B" style={styles.icon} />
      </View>

      {error && (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={14} color="#DC2626" />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  required: {
    color: '#DC2626',
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  inputContainerError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    paddingVertical: 12,
    fontWeight: '500',
  },
  icon: {
    marginLeft: 8,
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
});
