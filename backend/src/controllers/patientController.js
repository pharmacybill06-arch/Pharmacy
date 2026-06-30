const patientService = require('../services/patientService');

/**
 * Patient Controller
 * Handles HTTP requests for refill reminders / medication sync
 */

function validateMedicinePayload(m) {
  if (!m.name || !m.name.trim()) return 'Medicine name is required';
  if (!(parseFloat(m.stripsDispensed) > 0)) return 'stripsDispensed must be greater than 0';
  if (!(parseFloat(m.tabletsPerStrip) > 0)) return 'tabletsPerStrip must be greater than 0';
  if (!(parseFloat(m.dosePerDay) > 0)) return 'dosePerDay must be greater than 0';
  return null;
}

// ============================================
// CREATE PATIENT
// ============================================
exports.createPatient = async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, phone, medicines = [] } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Patient name is required' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'Patient phone is required' });
    }
    for (const m of medicines) {
      const error = validateMedicinePayload(m);
      if (error) return res.status(400).json({ error });
    }

    const patient = await patientService.createPatient(userId, req.body);
    res.status(201).json({ message: 'Patient created successfully', patient });
  } catch (error) {
    console.error('[PATIENT] Create error:', error.message);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'A patient with this phone number already exists' });
    }
    res.status(500).json({ error: 'Failed to create patient' });
  }
};

// ============================================
// GET PATIENTS (DASHBOARD LIST)
// ============================================
exports.getPatients = async (req, res) => {
  try {
    const { userId } = req.params;
    const patients = await patientService.getPatients(userId);
    res.json({ message: 'Patients fetched successfully', patients });
  } catch (error) {
    console.error('[PATIENT] Get patients error:', error.message);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
};

// ============================================
// GET PATIENT BY ID (DETAIL + SYNC RECOMMENDATION)
// ============================================
exports.getPatientById = async (req, res) => {
  try {
    const { userId, patientId } = req.params;
    const patient = await patientService.getPatientById(userId, patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    res.json({ message: 'Patient fetched successfully', patient });
  } catch (error) {
    console.error('[PATIENT] Get patient error:', error.message);
    res.status(500).json({ error: 'Failed to fetch patient' });
  }
};

// ============================================
// UPDATE PATIENT
// ============================================
exports.updatePatient = async (req, res) => {
  try {
    const { userId, patientId } = req.params;
    const patient = await patientService.updatePatient(userId, patientId, req.body);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    res.json({ message: 'Patient updated successfully', patient });
  } catch (error) {
    console.error('[PATIENT] Update error:', error.message);
    res.status(500).json({ error: 'Failed to update patient' });
  }
};

// ============================================
// DELETE PATIENT (SOFT DELETE)
// ============================================
exports.deletePatient = async (req, res) => {
  try {
    const { userId, patientId } = req.params;
    const deleted = await patientService.deletePatient(userId, patientId);
    if (!deleted) return res.status(404).json({ error: 'Patient not found' });
    res.json({ message: 'Patient deleted successfully' });
  } catch (error) {
    console.error('[PATIENT] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete patient' });
  }
};

// ============================================
// MEDICINE CRUD
// ============================================
exports.addMedicine = async (req, res) => {
  try {
    const { userId, patientId } = req.params;
    const error = validateMedicinePayload(req.body);
    if (error) return res.status(400).json({ error });

    const medicine = await patientService.addMedicine(userId, patientId, req.body);
    if (!medicine) return res.status(404).json({ error: 'Patient not found' });
    res.status(201).json({ message: 'Medicine added successfully', medicine });
  } catch (error) {
    console.error('[PATIENT] Add medicine error:', error.message);
    res.status(500).json({ error: 'Failed to add medicine' });
  }
};

exports.updateMedicine = async (req, res) => {
  try {
    const { userId, patientId, medicineId } = req.params;
    const medicine = await patientService.updateMedicine(userId, patientId, medicineId, req.body);
    if (!medicine) return res.status(404).json({ error: 'Medicine not found' });
    res.json({ message: 'Medicine updated successfully', medicine });
  } catch (error) {
    console.error('[PATIENT] Update medicine error:', error.message);
    res.status(500).json({ error: 'Failed to update medicine' });
  }
};

exports.deleteMedicine = async (req, res) => {
  try {
    const { userId, patientId, medicineId } = req.params;
    const deleted = await patientService.deleteMedicine(userId, patientId, medicineId);
    if (!deleted) return res.status(404).json({ error: 'Medicine not found' });
    res.json({ message: 'Medicine deleted successfully' });
  } catch (error) {
    console.error('[PATIENT] Delete medicine error:', error.message);
    res.status(500).json({ error: 'Failed to delete medicine' });
  }
};

// ============================================
// CONFIRM PICKUP
// ============================================
exports.confirmPickup = async (req, res) => {
  try {
    const { userId, patientId } = req.params;
    const { medicines = [] } = req.body;
    const patient = await patientService.confirmPickup(userId, patientId, medicines);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    res.json({ message: 'Pickup confirmed, cycle reset', patient });
  } catch (error) {
    console.error('[PATIENT] Confirm pickup error:', error.message);
    res.status(500).json({ error: 'Failed to confirm pickup' });
  }
};

// ============================================
// SEND REMINDER (mock channel, v1)
// ============================================
exports.sendReminder = async (req, res) => {
  try {
    const { userId, patientId } = req.params;
    const log = await patientService.sendReminder(userId, patientId);
    if (!log) return res.status(404).json({ error: 'Patient not found' });
    res.json({ message: 'Reminder sent (mock)', log });
  } catch (error) {
    console.error('[PATIENT] Send reminder error:', error.message);
    res.status(500).json({ error: 'Failed to send reminder' });
  }
};
