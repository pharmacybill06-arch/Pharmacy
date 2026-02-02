import React from 'react';
import { Pressable, StyleSheet, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';

/**
 * Primary Button Component
 * Blue background, white text, optional icon
 */
export default function PrimaryButton({
  title,
  onPress,
  icon,
  disabled = false,
  fullWidth = true,
  loading = false,
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        fullWidth && styles.fullWidth,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {icon && <Ionicons name={icon} size={20} color="#FFFFFF" style={styles.icon} />}
      <ThemedText style={styles.text}>
        {loading ? 'Loading...' : title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    backgroundColor: '#1D4ED8',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  fullWidth: {
    width: '100%',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.6,
  },
  icon: {
    marginRight: 8,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
