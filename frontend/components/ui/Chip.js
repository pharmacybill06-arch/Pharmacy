import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';

/**
 * Chip Component
 * Small pill-shaped label with customizable colors
 */
export default function Chip({ label, variant = 'default', icon }) {
  const variantStyles = {
    default: { bg: '#F1F5F9', text: '#334155', border: '#E2E8F0' },
    credit: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
    cash: { bg: '#D1FAE5', text: '#065F46', border: '#A7F3D0' },
    primary: { bg: '#EEF2FF', text: '#4F46E5', border: '#C7D2FE' },
    warning: { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A' },
    success: { bg: '#D1FAE5', text: '#047857', border: '#A7F3D0' },
    danger: { bg: '#FEE2E2', text: '#DC2626', border: '#FECACA' },
  };

  const colors = variantStyles[variant] || variantStyles.default;

  return (
    <View style={[styles.chip, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <ThemedText style={[styles.text, { color: colors.text }]}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
