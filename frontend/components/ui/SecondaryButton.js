import React from 'react';
import { Pressable, StyleSheet, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';

/**
 * Secondary Button Component
 * White background, border, dark text, optional icon
 */
export default function SecondaryButton({
  title,
  onPress,
  icon,
  disabled = false,
  fullWidth = true,
  borderColor = '#E2E8F0',
  textColor = '#0F172A',
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        { borderColor },
        fullWidth && styles.fullWidth,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      {icon && <Ionicons name={icon} size={20} color={textColor} style={styles.icon} />}
      <ThemedText style={[styles.text, { color: textColor }]}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 54,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  fullWidth: {
    width: '100%',
  },
  pressed: {
    opacity: 0.8,
    backgroundColor: '#F8FAFC',
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.4,
  },
  icon: {
    marginRight: 10,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
