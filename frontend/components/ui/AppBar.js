import React from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';

/**
 * Reusable AppBar Component
 * Follows design system: white bg, proper spacing, icon buttons
 */
export default function AppBar({
  title,
  onBack,
  rightIcon,
  onRightPress,
  titleSize = 18,
}) {
  return (
    <View style={styles.appBar}>
      {onBack && (
        <Pressable
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.iconButtonPressed,
          ]}
          onPress={onBack}
        >
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </Pressable>
      )}
      
      <ThemedText style={[styles.title, { fontSize: titleSize }]}>
        {title}
      </ThemedText>
      
      {rightIcon && (
        <Pressable
          style={({ pressed }) => [
            styles.rightIconButton,
            pressed && styles.iconButtonPressed,
          ]}
          onPress={onRightPress}
        >
          <Ionicons name={rightIcon} size={22} color="#111827" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  appBar: {
    height: 56,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  iconButtonPressed: {
    opacity: 0.6,
  },
  title: {
    fontWeight: '800',
    color: '#111827',
    flex: 1,
  },
  rightIconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
