import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import Card from '@/components/ui/Card';
import Chip from '@/components/ui/Chip';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import {
  getDosageSummary,
  getPackQuantity,
  getDosageFieldConfig,
  normalizeDosageForm,
  toNumber,
} from '@/utils/dosageForms';
import { callPatient, messagePatientOnWhatsApp, buildRefillReminderMessage } from '@/utils/contactActions';

function formatDate(date) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getRunOutStatus(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return { color: '#64748B', label: 'Unknown' };
  if (daysLeft < 0) return { color: '#DC2626', label: `${Math.abs(daysLeft)}d overdue` };
  if (daysLeft === 0) return { color: '#DC2626', label: 'Runs out today' };
  if (daysLeft <= 7) return { color: '#D97706', label: `${daysLeft}d left` };
  return { color: '#059669', label: `${daysLeft}d left` };
}

/**
 * One medicine card with computed supply info
 */
const MedicineCard = ({ medicine }) => {
  const status = getRunOutStatus(medicine.daysLeft);

  return (
    <View style={styles.medicineCard}>
      <View style={styles.medicineCardTop}>
        <ThemedText style={styles.medicineName} numberOfLines={1}>{medicine.name}</ThemedText>
        <View style={[styles.statusPill, { backgroundColor: status.color + '15' }]}>
          <ThemedText style={[styles.statusPillText, { color: status.color }]}>
            {status.label}
          </ThemedText>
        </View>
      </View>
      <ThemedText style={styles.medicineMeta}>{getDosageSummary(medicine)}</ThemedText>
      <View style={styles.medicineFooterRow}>
        <ThemedText style={styles.medicineRunOut}>
          Runs out: {formatDate(medicine.runOutDate)}
        </ThemedText>
        {medicine.lowStock && <Chip label="Low stock" variant="danger" />}
      </View>
    </View>
  );
};

/**
 * Confirm Pickup Modal — lets the pharmacist review/adjust the actual
 * quantity dispensed per medicine before resetting the cycle.
 */
const ConfirmPickupModal = ({ visible, medicines, syncItems, onClose, onConfirm, isLoading }) => {
  const [quantities, setQuantities] = useState({});

  const getDefault = useCallback((medicine) => {
    const normalQuantity = getPackQuantity(medicine);
    const syncItem = syncItems.find((s) => s.medicineId === medicine.id);
    const extra = syncItem ? syncItem.extraAmount ?? syncItem.extraTablets ?? 0 : 0;
    return String(normalQuantity + extra);
  }, [syncItems]);

  React.useEffect(() => {
    if (visible) {
      const initial = {};
      medicines.forEach((m) => {
        initial[m.id] = getDefault(m);
      });
      setQuantities(initial);
    }
  }, [visible, medicines, getDefault]);

  const handleConfirm = () => {
    const updates = medicines.map((m) => {
      const dosageForm = normalizeDosageForm(m.dosageForm);
      const config = getDosageFieldConfig(dosageForm);
      const enteredQuantity = parseFloat(quantities[m.id]) || 0;
      const packField = config.fields[0]?.key;

      if (dosageForm === 'tablet') {
        const tabletsPerStrip = toNumber(m.tabletsPerStrip || m.dosageDetails?.tabletsPerStrip);
        const stripsDispensed = tabletsPerStrip > 0 ? enteredQuantity / tabletsPerStrip : 0;
        return {
          medicineId: m.id,
          dosageForm,
          stripsDispensed,
          tabletsPerStrip,
          dosePerDay: toNumber(m.dosePerDay || m.dosageDetails?.dosePerDay),
          dosageDetails: {
            stripsDispensed,
            tabletsPerStrip,
            dosePerDay: toNumber(m.dosePerDay || m.dosageDetails?.dosePerDay),
          },
        };
      }

      return {
        medicineId: m.id,
        dosageForm,
        dosePerDay: toNumber(m.dosePerDay || m.dosageDetails?.dosePerDay),
        dosageDetails: {
          ...(m.dosageDetails || {}),
          [packField]: enteredQuantity,
        },
      };
    });
    onConfirm(updates);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalContainer}
        >
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>Confirm Pickup</ThemedText>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#0F172A" />
            </Pressable>
          </View>
          <ThemedText style={styles.modalSubtitle}>
            Enter the quantity actually dispensed today. The cycle resets from today's date.
          </ThemedText>

          <ScrollView style={styles.modalScroll}>
            {medicines.map((m) => {
              const syncItem = syncItems.find((s) => s.medicineId === m.id);
              return (
                <View key={m.id} style={styles.modalMedicineRow}>
                  <ThemedText style={styles.modalMedicineName}>{m.name}</ThemedText>
                  {syncItem && (
                    <ThemedText style={styles.modalSyncHint}>
                      Sync recommends +{syncItem.extraAmount ?? syncItem.extraTablets} {syncItem.quantityLabel || 'units'} to align refills
                    </ThemedText>
                  )}
                  <TextInput
                    style={styles.modalInput}
                    value={quantities[m.id] ?? ''}
                    onChangeText={(v) => setQuantities((prev) => ({ ...prev, [m.id]: v }))}
                    keyboardType="decimal-pad"
                    placeholder="Quantity dispensed today"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.modalButtonRow}>
            <PrimaryButton
              title="Confirm Pickup"
              icon="checkmark"
              onPress={handleConfirm}
              loading={isLoading}
              disabled={isLoading}
            />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

/**
 * PatientDetailScreen
 * Patient profile, medicines, sync recommendation, reminder + pickup actions
 */
export default function PatientDetailScreen({
  patient,
  onBack,
  onEdit,
  onDelete,
  onSendReminder,
  onConfirmPickup,
  loading = false,
  actionLoading = false,
}) {
  const [pickupModalVisible, setPickupModalVisible] = useState(false);

  const sync = patient?.sync || { targetDate: null, items: [] };
  const activeMedicines = useMemo(
    () => (patient?.medicines || []).filter((m) => m.isActive),
    [patient]
  );

  if (!patient) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <AppBar title="Patient" onBack={onBack} />
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4F46E5" />
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const handleDelete = () => {
    Alert.alert(
      'Delete Patient',
      `Are you sure you want to delete "${patient.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]
    );
  };

  const handleSendReminder = () => {
    Alert.alert(
      'Send Reminder',
      `Send a refill reminder to ${patient.name}? (v1: this just logs the reminder — no WhatsApp/SMS is sent yet.)`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: onSendReminder },
      ]
    );
  };

  const handleConfirmPickup = (updates) => {
    setPickupModalVisible(false);
    onConfirmPickup(updates);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <AppBar title="Patient Details" onBack={onBack} />

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Card style={styles.profileCard}>
            <View style={styles.profileHeader}>
              <View style={styles.avatarLarge}>
                <ThemedText style={styles.avatarTextLarge}>
                  {(patient.name || 'P').charAt(0).toUpperCase()}
                </ThemedText>
              </View>
              <View style={styles.profileInfo}>
                <ThemedText style={styles.profileName}>{patient.name}</ThemedText>
                <ThemedText style={styles.profilePhone}>{patient.phone}</ThemedText>
              </View>
            </View>
            {patient.notes && (
              <View style={styles.notesSection}>
                <ThemedText style={styles.notesLabel}>Notes</ThemedText>
                <ThemedText style={styles.notesText}>{patient.notes}</ThemedText>
              </View>
            )}
          </Card>

          <View style={styles.actionButtons}>
            <SecondaryButton
              title="Call"
              icon="call-outline"
              borderColor="#4F46E5"
              textColor="#4F46E5"
              onPress={() => callPatient(patient.phone)}
              style={styles.actionButton}
            />
            <SecondaryButton
              title="WhatsApp"
              icon="logo-whatsapp"
              borderColor="#25D366"
              textColor="#25D366"
              onPress={() => messagePatientOnWhatsApp(patient.phone, buildRefillReminderMessage(patient))}
              style={styles.actionButton}
            />
          </View>

          <View style={styles.actionButtons}>
            <SecondaryButton title="Edit" icon="create-outline" onPress={onEdit} style={styles.actionButton} />
            <SecondaryButton
              title="Delete"
              icon="trash-outline"
              borderColor="#DC2626"
              textColor="#DC2626"
              onPress={handleDelete}
              style={styles.actionButton}
            />
          </View>

          {sync.items.length > 0 && (
            <Card style={styles.syncCard}>
              <View style={styles.syncHeader}>
                <Ionicons name="sync-circle" size={20} color="#4F46E5" />
                <ThemedText style={styles.sectionTitle}>Medication Sync Recommendation</ThemedText>
              </View>
              <ThemedText style={styles.syncTargetText}>
                Target common refill date: {formatDate(sync.targetDate)}
              </ThemedText>
              {sync.items.map((item) => (
                <View key={item.medicineId} style={styles.syncItemRow}>
                  <ThemedText style={styles.syncItemName}>{item.name}</ThemedText>
                  <ThemedText style={styles.syncItemDetail}>
                    Short-fill +{item.extraAmount ?? item.extraTablets} {item.quantityLabel || 'units'} to bridge {item.gapDays}d
                  </ThemedText>
                </View>
              ))}
            </Card>
          )}

          <View style={styles.medicinesHeader}>
            <ThemedText style={styles.sectionTitle}>Medicines</ThemedText>
            <ThemedText style={styles.medicinesCount}>{activeMedicines.length}</ThemedText>
          </View>

          {activeMedicines.length === 0 ? (
            <View style={styles.emptyMedicines}>
              <Ionicons name="medkit-outline" size={40} color="#CBD5E1" />
              <ThemedText style={styles.emptyMedicinesText}>
                No medicines added. Tap Edit to add chronic medicines.
              </ThemedText>
            </View>
          ) : (
            activeMedicines.map((m) => <MedicineCard key={m.id} medicine={m} />)
          )}

          <View style={styles.bottomActions}>
            <SecondaryButton
              title="Send Reminder"
              icon="chatbox-ellipses-outline"
              onPress={handleSendReminder}
              style={styles.bottomActionButton}
            />
            <PrimaryButton
              title="Confirm Pickup"
              icon="checkmark-circle-outline"
              onPress={() => setPickupModalVisible(true)}
              disabled={activeMedicines.length === 0}
            />
          </View>
        </ScrollView>

        <ConfirmPickupModal
          visible={pickupModalVisible}
          medicines={activeMedicines}
          syncItems={sync.items}
          onClose={() => setPickupModalVisible(false)}
          onConfirm={handleConfirmPickup}
          isLoading={actionLoading}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  safeArea: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  profileCard: { padding: 20, marginBottom: 16 },
  profileHeader: { flexDirection: 'row', alignItems: 'center' },
  avatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
  },
  avatarTextLarge: { fontSize: 28, fontWeight: '700', color: '#4F46E5' },
  profileInfo: { marginLeft: 16, flex: 1 },
  profileName: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  profilePhone: { fontSize: 14, color: '#64748B', marginTop: 4 },
  notesSection: {
    marginTop: 16,
    padding: 14,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  notesLabel: { fontSize: 12, color: '#92400E', fontWeight: '600' },
  notesText: { fontSize: 14, color: '#92400E', marginTop: 4 },
  actionButtons: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  actionButton: { flex: 1 },
  syncCard: {
    padding: 16,
    marginBottom: 16,
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  syncHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  syncTargetText: { fontSize: 13, fontWeight: '700', color: '#4F46E5', marginBottom: 10 },
  syncItemRow: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#C7D2FE',
  },
  syncItemName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  syncItemDetail: { fontSize: 12, color: '#4F46E5', marginTop: 2 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  medicinesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  medicinesCount: { fontSize: 14, color: '#64748B' },
  emptyMedicines: { alignItems: 'center', paddingVertical: 32 },
  emptyMedicinesText: { fontSize: 13, color: '#64748B', marginTop: 12, textAlign: 'center' },
  medicineCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.6)',
  },
  medicineCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  medicineName: { fontSize: 15, fontWeight: '700', color: '#0F172A', flex: 1, marginRight: 8 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  medicineMeta: { fontSize: 12, color: '#64748B', marginTop: 6 },
  medicineFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  medicineRunOut: { fontSize: 12, color: '#334155', fontWeight: '600' },
  bottomActions: { marginTop: 8, gap: 12 },
  bottomActionButton: {},
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    padding: 20,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  modalSubtitle: { fontSize: 13, color: '#64748B', marginTop: 8, marginBottom: 16, lineHeight: 18 },
  modalScroll: { maxHeight: 360 },
  modalMedicineRow: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 12,
  },
  modalMedicineName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  modalSyncHint: { fontSize: 11, color: '#4F46E5', marginTop: 4, marginBottom: 8, lineHeight: 16 },
  modalInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    marginTop: 8,
  },
  modalButtonRow: { marginTop: 12 },
});
