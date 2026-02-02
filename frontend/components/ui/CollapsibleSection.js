import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import Card from './Card';

/**
 * CollapsibleSection Component
 * Card with collapsible header
 */
export default function CollapsibleSection({
  title,
  icon,
  children,
  defaultExpanded = true,
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <Card style={styles.card}>
      {/* Header */}
      <Pressable
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
      >
        <View style={styles.headerLeft}>
          <View style={styles.iconContainer}>
            <Ionicons name={icon} size={18} color="#1D4ED8" />
          </View>
          <ThemedText style={styles.title}>{title}</ThemedText>
        </View>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#6B7280"
        />
      </Pressable>

      {/* Content */}
      {isExpanded && <View style={styles.content}>{children}</View>}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  content: {
    marginTop: 14,
  },
});
