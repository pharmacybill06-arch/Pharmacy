const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');

/**
 * Patient Routes (Refill Reminders / Medication Sync)
 * All routes are prefixed with /api/patients/:userId
 *
 * IMPORTANT: Routes with specific literal segments must be defined BEFORE
 * the generic /:userId/:patientId routes to avoid Express incorrectly
 * matching them as :patientId.
 */

// POST /patients/low-stock-alerts/run - Manually trigger the low-stock push-alert scan (testing)
router.post('/low-stock-alerts/run', patientController.runLowStockAlerts);

// ============================================
// MEDICINE SUB-ROUTES (must be before generic /:userId/:patientId)
// ============================================

// POST /patients/:userId/:patientId/medicines - Add medicine
router.post('/:userId/:patientId/medicines', patientController.addMedicine);

// PUT /patients/:userId/:patientId/medicines/:medicineId - Update medicine
router.put('/:userId/:patientId/medicines/:medicineId', patientController.updateMedicine);

// DELETE /patients/:userId/:patientId/medicines/:medicineId - Remove medicine
router.delete('/:userId/:patientId/medicines/:medicineId', patientController.deleteMedicine);

// POST /patients/:userId/:patientId/confirm-pickup - Reset cycle from actual pickup date
router.post('/:userId/:patientId/confirm-pickup', patientController.confirmPickup);

// POST /patients/:userId/:patientId/send-reminder - Send reminder (mock channel, v1)
router.post('/:userId/:patientId/send-reminder', patientController.sendReminder);

// ============================================
// DYNAMIC ROUTES (:patientId must be after specific sub-routes)
// ============================================

// GET /patients/:userId/:patientId - Get single patient with sync recommendation
router.get('/:userId/:patientId', patientController.getPatientById);

// PUT /patients/:userId/:patientId - Update patient
router.put('/:userId/:patientId', patientController.updatePatient);

// DELETE /patients/:userId/:patientId - Delete patient (soft delete)
router.delete('/:userId/:patientId', patientController.deletePatient);

// ============================================
// GENERIC CRUD OPERATIONS (must be last)
// ============================================

// POST /patients/:userId - Create new patient
router.post('/:userId', patientController.createPatient);

// GET /patients/:userId - Get all patients, sorted by soonest run-out
router.get('/:userId', patientController.getPatients);

module.exports = router;
