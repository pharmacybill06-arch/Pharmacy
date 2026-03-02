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
          <Ionicons name="chevron-back" size={22} color="#0F172A" />
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
          <Ionicons name={rightIcon} size={22} color="#0F172A" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  appBar: {
    height: 60,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  iconButtonPressed: {
    opacity: 0.6,
    backgroundColor: '#F1F5F9',
  },
  title: {
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    letterSpacing: -0.3,
  },
  rightIconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
});
