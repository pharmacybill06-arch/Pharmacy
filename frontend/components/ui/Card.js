import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';

/**
 * Card Component
 * White background, rounded corners, subtle shadow
 */
export default function Card({ children, style, noPadding = false }) {
  return (
    <View style={[styles.card, !noPadding && styles.withPadding, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  withPadding: {
    padding: 14,
  },
});
