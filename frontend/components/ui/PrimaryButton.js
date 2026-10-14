import React from 'react';
import { StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from '@/components/ui/PressableScale';

/**
 * Primary Button Component
 * Blue background, white text, optional icon.
 *
 * This is the app's "do the thing" button — save, confirm, record payment — so it gets a
 * scale-down and a light haptic tick: the feedback that tells you a commit-type tap
 * landed. While `loading`, it shows a spinner in place of the label instead of swapping
 * the text to "Loading...", which used to resize the label mid-tap.
 */
export default function PrimaryButton({
  title,
  onPress,
  icon,
  disabled = false,
  fullWidth = true,
  loading = false,
}) {
  const inactive = disabled || loading;
  return (
    <PressableScale
      style={[styles.button, fullWidth && styles.fullWidth, disabled && styles.disabled]}
      onPress={onPress}
      disabled={inactive}
      haptic={inactive ? false : 'light'}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={20} color="#FFFFFF" style={styles.icon} />}
          <ThemedText style={styles.text}>{title}</ThemedText>
        </>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 54,
    backgroundColor: '#4F46E5',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#4F46E5',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  fullWidth: {
    width: '100%',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    backgroundColor: '#94A3B8',
    opacity: 0.5,
  },
  icon: {
    marginRight: 10,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});
