import React, { createContext, useContext, useState, useCallback } from 'react';
import { patientApi } from '@/services/api';

/**
 * Patient Context
 * Manages refill-reminder patient state and provides CRUD + sync operations
 */
const PatientContext = createContext(null);

export function PatientProvider({ children }) {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch all patients for a user, sorted by soonest run-out
   */
  const fetchPatients = useCallback(async (userId) => {
    if (!userId) return [];

    try {
      setIsLoading(true);
      setError(null);
      const response = await patientApi.getPatients(userId);
      setPatients(response.patients || []);
      return response.patients;
    } catch (err) {
      console.error('Error fetching patients:', err);
      setError(err.message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get single patient with sync recommendation
   */
  const getPatient = useCallback(async (userId, patientId) => {
    try {
      setIsLoading(true);
      const response = await patientApi.getPatientById(userId, patientId);
      setSelectedPatient(response.patient);
      return response.patient;
    } catch (err) {
      console.error('Error fetching patient:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Create a new patient (optionally with initial medicines)
   */
  const createPatient = useCallback(async (userId, data) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await patientApi.createPatient(userId, data);
      setPatients((prev) => [...prev, response.patient]);
      return response.patient;
    } catch (err) {
      console.error('Error creating patient:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Update patient name/phone/notes
   */
  const updatePatient = useCallback(async (userId, patientId, data) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await patientApi.updatePatient(userId, patientId, data);
      setPatients((prev) =>
        prev.map((p) => (p.id === patientId ? { ...p, ...response.patient } : p))
      );
      if (selectedPatient?.id === patientId) {
        setSelectedPatient((prev) => ({ ...prev, ...response.patient }));
      }
      return response.patient;
    } catch (err) {
      console.error('Error updating patient:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [selectedPatient]);

  /**
   * Delete a patient (soft delete)
   */
  const deletePatient = useCallback(async (userId, patientId) => {
    try {
      setIsLoading(true);
      setError(null);
      await patientApi.deletePatient(userId, patientId);
      setPatients((prev) => prev.filter((p) => p.id !== patientId));
      if (selectedPatient?.id === patientId) {
        setSelectedPatient(null);
      }
    } catch (err) {
      console.error('Error deleting patient:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [selectedPatient]);

  /**
   * Add a medicine to a patient, then refresh the patient's detail
   */
  const addMedicine = useCallback(async (userId, patientId, data) => {
    try {
      setIsLoading(true);
      setError(null);
      await patientApi.addMedicine(userId, patientId, data);
      return await getPatient(userId, patientId);
    } catch (err) {
      console.error('Error adding medicine:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [getPatient]);

  /**
   * Update a patient's medicine, then refresh the patient's detail
   */
  const updateMedicine = useCallback(async (userId, patientId, medicineId, data) => {
    try {
      setIsLoading(true);
      setError(null);
      await patientApi.updateMedicine(userId, patientId, medicineId, data);
      return await getPatient(userId, patientId);
    } catch (err) {
      console.error('Error updating medicine:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [getPatient]);

  /**
   * Remove a medicine from a patient, then refresh the patient's detail
   */
  const deleteMedicine = useCallback(async (userId, patientId, medicineId) => {
    try {
      setIsLoading(true);
      setError(null);
      await patientApi.deleteMedicine(userId, patientId, medicineId);
      return await getPatient(userId, patientId);
    } catch (err) {
      console.error('Error deleting medicine:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [getPatient]);

  /**
   * Confirm pickup — resets the cycle from the actual pickup date
   */
  const confirmPickup = useCallback(async (userId, patientId, medicines) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await patientApi.confirmPickup(userId, patientId, medicines);
      setSelectedPatient(response.patient);
      return response.patient;
    } catch (err) {
      console.error('Error confirming pickup:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Send a refill reminder (mock channel in v1)
   */
  const sendReminder = useCallback(async (userId, patientId) => {
    try {
      setError(null);
      await patientApi.sendReminder(userId, patientId);
    } catch (err) {
      console.error('Error sending reminder:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  /**
   * Clear selected patient
   */
  const clearSelectedPatient = useCallback(() => {
    setSelectedPatient(null);
  }, []);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = {
    // State
    patients,
    selectedPatient,
    isLoading,
    error,

    // Actions
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
    setSelectedPatient,
  };

  return (
    <PatientContext.Provider value={value}>
      {children}
    </PatientContext.Provider>
  );
}

/**
 * Hook to use patient context
 */
export function usePatients() {
  const context = useContext(PatientContext);
  if (!context) {
    throw new Error('usePatients must be used within a PatientProvider');
  }
  return context;
}

export default PatientContext;
