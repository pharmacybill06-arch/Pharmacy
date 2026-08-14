import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { capitalize } from '@/constants/units';

/**
 * UnitPickerField — label + tappable pill showing the current value, opens a bottom
 * sheet to pick from a fixed option list. Used for Unit 1 (pack) / Unit 2 (base) on the
 * bill-confirm screen and the product form — same fixed 15-unit list in both places.
 */
export default function UnitPickerField({ label, value, options, onChange, placeholder = 'Select' }) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.container}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <Pressable style={styles.field} onPress={() => setVisible(true)} android_ripple={{ color: '#E0E7FF' }}>
        <ThemedText style={[styles.fieldText, !value && styles.fieldTextPlaceholder]}>
          {value ? capitalize(value) : placeholder}
        </ThemedText>
        <Ionicons name="chevron-down" size={16} color="#94A3B8" />
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ThemedText style={styles.sheetTitle}>{label}</ThemedText>
            <ScrollView style={{ maxHeight: 320 }}>
              {options.map((opt) => {
                const selected = opt === value;
                return (
                  <Pressable
                    key={opt}
                    style={[styles.optionRow, selected && styles.optionRowSelected]}
                    onPress={() => {
                      onChange(opt);
                      setVisible(false);
                    }}
                  >
                    <ThemedText style={[styles.optionText, selected && styles.optionTextSelected]}>
                      {capitalize(opt)}
                    </ThemedText>
                    {selected && <Ionicons name="checkmark" size={18} color="#4F46E5" />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  label: {
    fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase',
    letterSpacing: 0.4, marginBottom: 6,
  },
  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 13,
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  fieldText: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  fieldTextPlaceholder: { color: '#94A3B8', fontWeight: '500' },

  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16, paddingBottom: 28,
  },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 10 },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, paddingHorizontal: 8, borderRadius: 10,
  },
  optionRowSelected: { backgroundColor: '#EEF2FF' },
  optionText: { fontSize: 14, fontWeight: '600', color: '#334155' },
  optionTextSelected: { color: '#4F46E5', fontWeight: '700' },
});
