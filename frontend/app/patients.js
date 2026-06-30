import React, { useState, useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { usePatients, PatientProvider } from '@/contexts/PatientContext';
import PatientsListScreen from '@/components/screens/PatientsListScreen';
import PatientFormScreen from '@/components/screens/PatientFormScreen';
import PatientDetailScreen from '@/components/screens/PatientDetailScreen';
import Toast from '@/components/ui/Toast';

/**
 * Patients (Refill Reminders) Screen Content
 * Manages patient list, form, and detail views
 */
function PatientsScreenContent() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    patients,
    selectedPatient,
    isLoading,
    error,
    fetchPatients,
    getPatient,
    createPatient,
    updatePatient,
    deletePatient,
    addMedicine,
    updateMedicine,
    deleteMedicine,
    confirmPickup,
    sendReminder,
    clearSelectedPatient,
    clearError,
  } = usePatients();

  const [currentView, setCurrentView] = useState('list'); // 'list' | 'form' | 'detail'
  const [editingPatient, setEditingPatient] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info', title: '' });

  const userId = user?.id;

  useEffect(() => {
    if (userId) fetchPatients(userId);
  }, [userId, fetchPatients]);

  useEffect(() => {
    if (error) {
      showToast(error, 'error', 'Error');
      clearError();
    }
  }, [error, clearError]);

  const showToast = (message, type = 'info', title = '') => {
    setToast({ visible: true, message, type, title });
  };

  const hideToast = () => setToast((prev) => ({ ...prev, visible: false }));

  const handleBack = useCallback(() => {
    if (currentView === 'form') {
      setCurrentView(editingPatient ? 'detail' : 'list');
      setEditingPatient(null);
    } else if (currentView === 'detail') {
      setCurrentView('list');
      clearSelectedPatient();
    } else {
      router.back();
    }
  }, [currentView, editingPatient, router, clearSelectedPatient]);

  const handlePatientPress = useCallback(async (patient) => {
    await getPatient(userId, patient.id);
    setCurrentView('detail');
  }, [userId, getPatient]);

  const handleAddPress = useCallback(() => {
    setEditingPatient(null);
    setCurrentView('form');
  }, []);

  const handleEditPress = useCallback(() => {
    setEditingPatient(selectedPatient);
    setCurrentView('form');
  }, [selectedPatient]);

  /**
   * Save handler — creates a new patient (with bundled medicines), or for
   * edits, updates patient fields and diffs the medicines list against the
   * original to add/update/remove the right rows.
   */
  const handleSave = useCallback(async ({ patientData, medicines }) => {
    try {
      if (editingPatient) {
        await updatePatient(userId, editingPatient.id, patientData);

        const originalIds = (editingPatient.medicines || []).map((m) => m.id);
        const finalIds = medicines.filter((m) => m.id).map((m) => m.id);
        const toDelete = originalIds.filter((id) => !finalIds.includes(id));
        const toAdd = medicines.filter((m) => !m.id);
        const toUpdate = medicines.filter((m) => m.id);

        await Promise.all([
          ...toDelete.map((id) => deleteMedicine(userId, editingPatient.id, id)),
          ...toAdd.map((m) => addMedicine(userId, editingPatient.id, m)),
          ...toUpdate.map((m) => updateMedicine(userId, editingPatient.id, m.id, m)),
        ]);

        await getPatient(userId, editingPatient.id);
        await fetchPatients(userId);
        showToast('Patient updated successfully', 'success', 'Updated');
        setCurrentView('detail');
      } else {
        const patient = await createPatient(userId, { ...patientData, medicines });
        showToast('Patient added successfully', 'success', 'Created');
        await getPatient(userId, patient.id);
        setCurrentView('detail');
      }
      setEditingPatient(null);
    } catch (err) {
      showToast(err.message || 'Failed to save patient', 'error', 'Error');
    }
  }, [editingPatient, userId, createPatient, updatePatient, addMedicine, updateMedicine, deleteMedicine, getPatient, fetchPatients]);

  const handleDelete = useCallback(async () => {
    try {
      await deletePatient(userId, selectedPatient.id);
      showToast('Patient deleted successfully', 'success', 'Deleted');
      setCurrentView('list');
      clearSelectedPatient();
    } catch (err) {
      showToast(err.message || 'Failed to delete patient', 'error', 'Error');
    }
  }, [selectedPatient, userId, deletePatient, clearSelectedPatient]);

  const handleSendReminder = useCallback(async () => {
    try {
      await sendReminder(userId, selectedPatient.id);
      showToast('Reminder logged (mock channel — no message sent yet)', 'success', 'Reminder Sent');
    } catch (err) {
      showToast(err.message || 'Failed to send reminder', 'error', 'Error');
    }
  }, [userId, selectedPatient, sendReminder]);

  const handleConfirmPickup = useCallback(async (updates) => {
    try {
      setActionLoading(true);
      await confirmPickup(userId, selectedPatient.id, updates);
      await fetchPatients(userId);
      showToast('Pickup confirmed, cycle reset', 'success', 'Confirmed');
    } catch (err) {
      showToast(err.message || 'Failed to confirm pickup', 'error', 'Error');
    } finally {
      setActionLoading(false);
    }
  }, [userId, selectedPatient, confirmPickup, fetchPatients]);

  const handleRefresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    await fetchPatients(userId);
    setRefreshing(false);
  }, [userId, fetchPatients]);

  if (currentView === 'form') {
    return (
      <View style={{ flex: 1 }}>
        <PatientFormScreen
          patient={editingPatient}
          onBack={handleBack}
          onSave={handleSave}
          isLoading={isLoading}
        />
        <Toast visible={toast.visible} message={toast.message} type={toast.type} title={toast.title} onHide={hideToast} />
      </View>
    );
  }

  if (currentView === 'detail') {
    return (
      <View style={{ flex: 1 }}>
        <PatientDetailScreen
          patient={selectedPatient}
          onBack={handleBack}
          onEdit={handleEditPress}
          onDelete={handleDelete}
          onSendReminder={handleSendReminder}
          onConfirmPickup={handleConfirmPickup}
          loading={isLoading}
          actionLoading={actionLoading}
        />
        <Toast visible={toast.visible} message={toast.message} type={toast.type} title={toast.title} onHide={hideToast} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <PatientsListScreen
        patients={patients}
        onPatientPress={handlePatientPress}
        onAddPress={handleAddPress}
        onBack={handleBack}
        onRefresh={handleRefresh}
        loading={isLoading}
        refreshing={refreshing}
      />
      <Toast visible={toast.visible} message={toast.message} type={toast.type} title={toast.title} onHide={hideToast} />
    </View>
  );
}

/**
 * Patients Screen
 * Wraps content with PatientProvider
 */
export default function PatientsScreen() {
  return (
    <PatientProvider>
      <PatientsScreenContent />
    </PatientProvider>
  );
}
