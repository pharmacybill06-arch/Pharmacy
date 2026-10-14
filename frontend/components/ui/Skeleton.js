import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

/**
 * Placeholder shapes shown while a screen loads for the first time.
 *
 * A skeleton tells the user what is coming and where it will sit, so content appears to
 * fill in rather than the screen blanking to a spinner and then jumping. The pulse runs
 * on the UI thread via Reanimated, so it keeps moving even while JS is busy parsing the
 * response it is waiting for — a JS-driven animation would stutter at exactly that
 * moment.
 */
export function SkeletonBlock({ width = '100%', height = 14, radius = 6, style }) {
  const opacity = useSharedValue(0.55);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 750, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[styles.block, { width, height, borderRadius: radius }, animated, style]}
    />
  );
}

/** A card-shaped row: title, subtitle, and a value on the right. */
export function SkeletonRow() {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <SkeletonBlock width="58%" height={15} />
        <SkeletonBlock width="38%" height={12} style={styles.gap} />
      </View>
      <View style={styles.rowRight}>
        <SkeletonBlock width={64} height={15} />
        <SkeletonBlock width={44} height={18} radius={9} style={styles.gap} />
      </View>
    </View>
  );
}

/** A list of skeleton rows, sized to roughly fill a phone screen. */
export function SkeletonList({ rows = 7, style }) {
  return (
    <View style={[styles.list, style]} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}

/** A summary card: label + big number, as used on the dashboard tiles. */
export function SkeletonCard({ style }) {
  return (
    <View style={[styles.card, style]}>
      <SkeletonBlock width="40%" height={12} />
      <SkeletonBlock width="65%" height={26} style={styles.gapLg} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: '#E2E8F0' },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.6)',
  },
  rowLeft: { flex: 1, marginRight: 16 },
  rowRight: { alignItems: 'flex-end' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.6)',
  },
  gap: { marginTop: 8 },
  gapLg: { marginTop: 12 },
});

export default SkeletonList;
