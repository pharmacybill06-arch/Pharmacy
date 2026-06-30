import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import Card from '@/components/ui/Card';
import Chip from '@/components/ui/Chip';
import PrimaryButton from '@/components/ui/PrimaryButton';

/**
 * Days-left -> color/label, mirrors the expiry action-window thresholds
 */
function getRunOutStatus(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) {
    return { color: '#64748B', label: 'No medicines' };
  }
  if (daysLeft < 0) return { color: '#DC2626', label: `${Math.abs(daysLeft)}d overdue` };
  if (daysLeft === 0) return { color: '#DC2626', label: 'Runs out today' };
  if (daysLeft <= 7) return { color: '#D97706', label: `Runs out in ${daysLeft}d` };
  return { color: '#059669', label: `Runs out in ${daysLeft}d` };
}

/**
 * Patient List Item Component
 */
const PatientListItem = React.memo(({ item, onPress }) => {
  const status = getRunOutStatus(item.daysLeft);

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.patientCard,
        pressed && styles.patientCardPressed,
      ]}
    >
      <Card style={styles.patientCardInner}>
        <View style={styles.cardHeader}>
          <View style={styles.nameContainer}>
            <View style={styles.avatarCircle}>
              <ThemedText style={styles.avatarText}>
                {(item.name || 'P').charAt(0).toUpperCase()}
              </ThemedText>
            </View>
            <View style={styles.nameDetails}>
              <ThemedText style={styles.patientName} numberOfLines={1}>
                {item.name}
              </ThemedText>
              <ThemedText style={styles.phoneText} numberOfLines={1}>
                {item.phone}
              </ThemedText>
            </View>
          </View>
          <View style={styles.statusContainer}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <ThemedText style={[styles.statusLabel, { color: status.color }]}>
              {status.label}
            </ThemedText>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.infoChip}>
            <Ionicons name="medkit-outline" size={12} color="#64748B" />
            <ThemedText style={styles.infoText}>
              {item.medicines?.length || 0} medicine{item.medicines?.length === 1 ? '' : 's'}
            </ThemedText>
          </View>
          {item.lowStock && <Chip label="Low stock" variant="danger" />}
        </View>
      </Card>
    </Pressable>
  );
});

PatientListItem.displayName = 'PatientListItem';

/**
 * Empty State Component
 */
const EmptyState = ({ onAddPress }) => (
  <View style={styles.emptyContainer}>
    <Ionicons name="medkit-outline" size={64} color="#C7C7CC" />
    <ThemedText style={styles.emptyText}>No patients yet</ThemedText>
    <ThemedText style={styles.emptySubtext}>
      Add a chronic patient to start tracking refills
    </ThemedText>
    <PrimaryButton
      title="Add Patient"
      icon="add"
      onPress={onAddPress}
      style={styles.emptyButton}
    />
  </View>
);

/**
 * PatientsListScreen
 * Dashboard of patients sorted by soonest medicine run-out
 */
export default function PatientsListScreen({
  patients = [],
  onPatientPress,
  onAddPress,
  onBack,
  onRefresh,
  loading = false,
  refreshing = false,
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPatients = useCallback(() => {
    if (!searchQuery.trim()) return patients;
    const query = searchQuery.toLowerCase();
    return patients.filter(
      (p) => p.name?.toLowerCase().includes(query) || p.phone?.includes(query)
    );
  }, [patients, searchQuery])();

  const dueSoonCount = patients.filter((p) => p.daysLeft !== null && p.daysLeft <= 7).length;
  const lowStockCount = patients.filter((p) => p.lowStock).length;

  const renderPatient = useCallback(({ item }) => (
    <PatientListItem item={item} onPress={onPatientPress} />
  ), [onPatientPress]);

  const keyExtractor = useCallback((item) => item.id, []);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <AppBar
          title="Refill Reminders"
          onBack={onBack}
          rightIcon="add"
          onRightPress={onAddPress}
        />

        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <ThemedText style={styles.statValue}>{patients.length}</ThemedText>
            <ThemedText style={styles.statLabel}>Patients</ThemedText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <ThemedText style={[styles.statValue, { color: '#D97706' }]}>{dueSoonCount}</ThemedText>
            <ThemedText style={styles.statLabel}>Due in 7d</ThemedText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <ThemedText style={[styles.statValue, { color: '#DC2626' }]}>{lowStockCount}</ThemedText>
            <ThemedText style={styles.statLabel}>Low Stock</ThemedText>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="#94A3B8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search patients..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="#94A3B8" />
              </Pressable>
            )}
          </View>
        </View>

        {loading && patients.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <ThemedText style={styles.loadingText}>Loading patients...</ThemedText>
          </View>
        ) : patients.length === 0 ? (
          <EmptyState onAddPress={onAddPress} />
        ) : (
          <FlatList
            data={filteredPatients}
            renderItem={renderPatient}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#4F46E5']}
                tintColor="#4F46E5"
              />
            }
            ListEmptyComponent={
              <View style={styles.noResultsContainer}>
                <Ionicons name="search-outline" size={48} color="#C7C7CC" />
                <ThemedText style={styles.noResultsText}>
                  No patients found for "{searchQuery}"
                </ThemedText>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  safeArea: { flex: 1 },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700', color: '#4F46E5' },
  statLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statDivider: { width: 1, backgroundColor: '#E2E8F0', marginHorizontal: 12 },
  searchContainer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15, color: '#0F172A', fontWeight: '500' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#64748B' },
  listContent: { padding: 16 },
  patientCard: { marginBottom: 12 },
  patientCardPressed: { opacity: 0.7 },
  patientCardInner: { padding: 16, borderRadius: 18 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  nameContainer: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#4F46E5' },
  nameDetails: { marginLeft: 12, flex: 1 },
  patientName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  phoneText: { fontSize: 12, color: '#64748B', marginTop: 2 },
  statusContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 12, fontWeight: '700' },
  cardFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 8,
    alignItems: 'center',
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoText: { fontSize: 12, color: '#64748B' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  emptyButton: { marginTop: 24 },
  noResultsContainer: { alignItems: 'center', paddingVertical: 48 },
  noResultsText: { fontSize: 14, color: '#64748B', marginTop: 12 },
});
