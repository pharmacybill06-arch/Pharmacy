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
          iconBg: '#DBEAFE',
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    width: '100%',
    maxWidth: 340,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4B5563',
  },
  confirmButton: {
    backgroundColor: '#DC2626',
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
