import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';

/**
 * Chip Component
 * Small pill-shaped label with customizable colors
 */
export default function Chip({ label, variant = 'default' }) {
  const variantStyles = {
    default: { bg: '#F3F4F6', text: '#111827' },
    credit: { bg: '#FEF3C7', text: '#92400E' },
    cash: { bg: '#DCFCE7', text: '#166534' },
    primary: { bg: '#EEF2FF', text: '#1D4ED8' },
    warning: { bg: '#FEF3C7', text: '#F59E0B' },
    success: { bg: '#DCFCE7', text: '#16A34A' },
    danger: { bg: '#FEE2E2', text: '#EF4444' },
  };

  const colors = variantStyles[variant] || variantStyles.default;

  return (
    <View style={[styles.chip, { backgroundColor: colors.bg }]}>
      <ThemedText style={[styles.text, { color: colors.text }]}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
});
