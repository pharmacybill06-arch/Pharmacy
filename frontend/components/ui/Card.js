import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';

/**
 * Card Component
 * White background, rounded corners, refined shadow system
 */
export default function Card({ children, style, noPadding = false, variant = 'default' }) {
  return (
    <View style={[
      styles.card,
      !noPadding && styles.withPadding,
      variant === 'elevated' && styles.elevated,
      variant === 'outlined' && styles.outlined,
      style,
    ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.6)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  withPadding: {
    padding: 16,
  },
  elevated: {
    borderColor: 'transparent',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  outlined: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowOpacity: 0,
      },
      android: {
        elevation: 0,
      },
    }),
  },
});
