import React, { useCallback } from 'react';
import { Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Pressable that visibly gives under the finger.
 *
 * The plain opacity flicker most rows used reads as "nothing happened" on a slow tap.
 * A quick scale-down on press-in and a spring back on release is the feedback food
 * delivery apps use on every card — it confirms the tap landed before the next screen
 * has rendered. Driven by Reanimated, so it stays responsive while JS is busy.
 *
 * Haptics are opt-in: a tick on every list row gets tiring quickly. Use them on
 * meaningful actions (save, confirm, toggle), not on scrolling through rows.
 *
 *   haptic: false | 'selection' | 'light' | 'medium'
 */
export default function PressableScale({
  children,
  onPress,
  onPressIn,
  onPressOut,
  scaleTo = 0.97,
  haptic = false,
  disabled,
  style,
  ...rest
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(
    (e) => {
      scale.value = withTiming(scaleTo, { duration: 90 });
      onPressIn?.(e);
    },
    [scale, scaleTo, onPressIn]
  );

  const handlePressOut = useCallback(
    (e) => {
      scale.value = withSpring(1, { damping: 15, stiffness: 300 });
      onPressOut?.(e);
    },
    [scale, onPressOut]
  );

  const handlePress = useCallback(
    (e) => {
      if (haptic) {
        // Fire-and-forget: a device without a haptic engine must never block the tap.
        const run =
          haptic === 'selection'
            ? Haptics.selectionAsync()
            : Haptics.impactAsync(
                haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
              );
        run.catch(() => {});
      }
      onPress?.(e);
    },
    [haptic, onPress]
  );

  // Reanimated cannot reliably detect an animated style returned from a *function*
  // style prop, so a `({ pressed }) => ...` style is resolved once to its resting form.
  // The pressed variant it would have produced (usually an opacity dip) is exactly what
  // the scale animation replaces.
  const resolvedStyle = typeof style === 'function' ? style({ pressed: false }) : style;

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[resolvedStyle, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
