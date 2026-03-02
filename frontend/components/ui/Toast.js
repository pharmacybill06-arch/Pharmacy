import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  Pressable,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

/**
 * Toast Component - A beautiful, animated toast notification
 * 
 * @param {boolean} visible - Whether the toast is visible
 * @param {string} message - The message to display
 * @param {string} type - 'success' | 'error' | 'warning' | 'info'
 * @param {number} duration - How long to show the toast (ms)
 * @param {function} onHide - Callback when toast hides
 * @param {string} title - Optional title for the toast
 */
export default function Toast({
  visible,
  message,
  type = 'info',
  duration = 3000,
  onHide,
  title,
}) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Slide in
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto hide
      if (duration > 0) {
        const timer = setTimeout(() => {
          hideToast();
        }, duration);
        return () => clearTimeout(timer);
      }
    }
  }, [visible]);

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onHide && onHide();
    });
  };

  const getTypeConfig = () => {
    switch (type) {
      case 'success':
        return {
          icon: 'checkmark-circle',
          backgroundColor: '#ECFDF5',
          borderColor: '#10B981',
          iconColor: '#10B981',
          textColor: '#065F46',
        };
      case 'error':
        return {
          icon: 'close-circle',
          backgroundColor: '#FEF2F2',
          borderColor: '#EF4444',
          iconColor: '#EF4444',
          textColor: '#991B1B',
        };
      case 'warning':
        return {
          icon: 'warning',
          backgroundColor: '#FFFBEB',
          borderColor: '#F59E0B',
          iconColor: '#F59E0B',
          textColor: '#92400E',
        };
      case 'info':
      default:
        return {
          icon: 'information-circle',
          backgroundColor: '#EFF6FF',
          borderColor: '#3B82F6',
          iconColor: '#3B82F6',
          textColor: '#1E40AF',
        };
    }
  };

  if (!visible) return null;

  const config = getTypeConfig();

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
          backgroundColor: config.backgroundColor,
          borderColor: config.borderColor,
        },
      ]}
    >
      <Pressable style={styles.content} onPress={hideToast}>
        <View style={styles.iconContainer}>
          <Ionicons name={config.icon} size={24} color={config.iconColor} />
        </View>
        <View style={styles.textContainer}>
          {title && (
            <Text style={[styles.title, { color: config.textColor }]}>
              {title}
            </Text>
          )}
          <Text style={[styles.message, { color: config.textColor }]}>
            {message}
          </Text>
        </View>
        <Pressable onPress={hideToast} style={styles.closeButton}>
          <Ionicons name="close" size={20} color={config.iconColor} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 9999,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  iconContainer: {
    marginRight: 14,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
    letterSpacing: -0.2,
  },
  message: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  closeButton: {
    padding: 4,
    marginLeft: 8,
  },
});
