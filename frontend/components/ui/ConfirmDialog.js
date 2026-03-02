import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * ConfirmDialog Component - A beautiful confirmation dialog
 * 
 * @param {boolean} visible - Whether the dialog is visible
 * @param {string} title - The dialog title
 * @param {string} message - The dialog message
 * @param {string} type - 'warning' | 'danger' | 'info' | 'success'
 * @param {string} confirmText - Text for confirm button
 * @param {string} cancelText - Text for cancel button
 * @param {function} onConfirm - Callback for confirm action
 * @param {function} onCancel - Callback for cancel action
 */
export default function ConfirmDialog({
  visible,
  title,
  message,
  type = 'warning',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}) {
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scale.setValue(0.8);
      opacity.setValue(0);
    }
  }, [visible]);

  const getTypeConfig = () => {
    switch (type) {
      case 'danger':
        return {
          icon: 'trash-outline',
          iconBg: '#FEE2E2',
          iconColor: '#DC2626',
          confirmBg: '#DC2626',
          confirmTextColor: '#FFFFFF',
        };
      case 'warning':
        return {
          icon: 'warning-outline',
          iconBg: '#FEF3C7',
          iconColor: '#D97706',
          confirmBg: '#D97706',
          confirmTextColor: '#FFFFFF',
        };
      case 'success':
        return {
          icon: 'checkmark-circle-outline',
          iconBg: '#D1FAE5',
          iconColor: '#059669',
          confirmBg: '#059669',
          confirmTextColor: '#FFFFFF',
        };
      case 'info':
      default:
        return {
          icon: 'information-circle-outline',
          iconBg: '#EEF2FF',
          iconColor: '#2563EB',
          confirmBg: '#2563EB',
          confirmTextColor: '#FFFFFF',
        };
    }
  };

  if (!visible) return null;

  const config = getTypeConfig();

  return (
    <Modal transparent visible={visible} animationType="none">
      <Animated.View style={[styles.overlay, { opacity }]}>
        <Animated.View
          style={[
            styles.dialog,
            { transform: [{ scale }] },
          ]}
        >
          <View style={[styles.iconContainer, { backgroundColor: config.iconBg }]}>
            <Ionicons name={config.icon} size={28} color={config.iconColor} />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.buttons}>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.cancelButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={onCancel}
            >
              <Text style={styles.cancelButtonText}>{cancelText}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.confirmButton,
                { backgroundColor: config.confirmBg },
                pressed && styles.buttonPressed,
              ]}
              onPress={onConfirm}
            >
              <Text style={[styles.confirmButtonText, { color: config.confirmTextColor }]}>
                {confirmText}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 32,
    elevation: 12,
    width: '100%',
    maxWidth: 340,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  cancelButton: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
  },
  confirmButton: {
    backgroundColor: '#DC2626',
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
