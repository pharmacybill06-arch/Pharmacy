import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { SlideInRight, FadeInLeft, FadeIn, Easing } from 'react-native-reanimated';

/**
 * Animate a view that a screen swaps in place.
 *
 * Several routes show list -> detail -> edit by returning a different component from the
 * same screen (`if (view === 'detail') return <Detail/>`). That used to be an instant cut,
 * which is most of why the app felt abrupt next to native navigation. Wrapping each
 * branch gives it the motion people expect:
 *
 *   forward — slides in from the right, like a native push (list -> detail)
 *   back    — eases in from slightly left, like returning (detail -> list)
 *   fade    — a soft cross-in for views that are neither
 *   null    — no animation (first render: the native stack already animated the push)
 *
 * Each branch MUST pass its own `key` (e.g. key="detail"). Without one, React sees the
 * same component in the same position, reuses it instead of remounting, and the
 * entering animation never fires.
 *
 * Only `entering` is used, never `exiting`: with in-place swaps the outgoing and incoming
 * views would briefly both be in the layout and stack vertically. Enter-only is clean.
 *
 * Reanimated respects the OS "reduce motion" setting by default, so this degrades to no
 * animation for users who have asked for that.
 */
const EASE = Easing.bezier(0.22, 1, 0.36, 1); // fast start, gentle settle

const ANIMATIONS = {
  forward: SlideInRight.duration(280).easing(EASE),
  back: FadeInLeft.duration(220).easing(EASE),
  fade: FadeIn.duration(180),
};

export default function ScreenTransition({ direction = 'forward', children, style }) {
  return (
    <Animated.View
      entering={direction ? ANIMATIONS[direction] || ANIMATIONS.forward : undefined}
      style={[styles.fill, style]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Which way to animate, derived from how deep the current view is.
 *
 *   const transition = useTransitionDirection(viewingBill ? 1 : 0);
 *   if (viewingBill) return <ScreenTransition key="detail" direction={transition}>…
 *
 * Deeper than before -> 'forward'; shallower -> 'back'; first render -> null (the native
 * stack has already animated the push into this route).
 *
 * The direction is LATCHED when depth changes and held for every render at that depth.
 * An earlier version compared against the previous committed depth, so the direction
 * existed for only one render: if the incoming view actually mounted on the next render
 * — a data load or a double-tap landing at the same moment — it mounted with no
 * animation, and "back" was intermittently a hard cut. Uses React's documented
 * "store information from previous renders" pattern (setState during render), which is
 * safe under concurrent rendering.
 */
export function useTransitionDirection(depth) {
  const [latched, setLatched] = useState({ depth, direction: null });

  if (latched.depth !== depth) {
    const direction = depth > latched.depth ? 'forward' : 'back';
    setLatched({ depth, direction });
    return direction;
  }

  return latched.direction;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
