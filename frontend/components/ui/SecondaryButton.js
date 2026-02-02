import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
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
  borderColor = '#E5E7EB',
  textColor = '#111827',
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
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  fullWidth: {
    width: '100%',
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: '#F9FAFB',
  },
  disabled: {
    opacity: 0.5,
  },
  icon: {
    marginRight: 8,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
  },
});
