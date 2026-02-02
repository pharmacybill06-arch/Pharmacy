import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  Modal,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * LoadingOverlay Component - A beautiful, animated loading overlay
 * 
 * @param {boolean} visible - Whether the overlay is visible
 * @param {string} message - The loading message to display
 * @param {string} submessage - Optional secondary message
 * @param {string} icon - Optional icon name (defaults to spinning sync)
 */
export default function LoadingOverlay({
  visible,
  message = 'Loading...',
  submessage,
  icon = 'sparkles',
}) {
  const rotation = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Fade in
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Continuous rotation
      const rotationAnimation = Animated.loop(
        Animated.timing(rotation, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      rotationAnimation.start();

      // Pulse animation
      const pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulseAnimation.start();

      return () => {
        rotationAnimation.stop();
        pulseAnimation.stop();
      };
    } else {
      fadeIn.setValue(0);
      rotation.setValue(0);
      pulse.setValue(1);
    }
  }, [visible]);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none">
      <Animated.View style={[styles.overlay, { opacity: fadeIn }]}>
        <View style={styles.content}>
          <Animated.View
            style={[
              styles.iconContainer,
              {
                transform: [{ rotate: spin }, { scale: pulse }],
              },
            ]}
          >
            <View style={styles.iconBackground}>
              <Ionicons name={icon} size={32} color="#1D4ED8" />
            </View>
          </Animated.View>
          
          <Text style={styles.message}>{message}</Text>
          {submessage && (
            <Text style={styles.submessage}>{submessage}</Text>
          )}

          <View style={styles.dotsContainer}>
            <LoadingDots />
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

/**
 * Animated loading dots
 */
function LoadingDots() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animateDot = (dot, delay) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      );
    };

    const anim1 = animateDot(dot1, 0);
    const anim2 = animateDot(dot2, 200);
    const anim3 = animateDot(dot3, 400);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, []);

  const dotStyle = (animValue) => ({
    opacity: animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 1],
    }),
    transform: [
      {
        scale: animValue.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.3],
        }),
      },
    ],
  });

  return (
    <View style={styles.dots}>
      <Animated.View style={[styles.dot, dotStyle(dot1)]} />
      <Animated.View style={[styles.dot, dotStyle(dot2)]} />
      <Animated.View style={[styles.dot, dotStyle(dot3)]} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    minWidth: 260,
    maxWidth: 320,
  },
  iconContainer: {
    marginBottom: 20,
  },
  iconBackground: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#C7D2FE',
  },
  message: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 6,
  },
  submessage: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  dotsContainer: {
    marginTop: 16,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1D4ED8',
  },
});
