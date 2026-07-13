const prisma = require('../models/prisma');
const { normalizeProductName } = require('./productService');
const {
  normalizeDosageForm,
  toNumber,
  getDefaultDosageDetails,
  getDailyUsageQuantity,
  getPackQuantity,
  getDosageSummary,
  getQuantityLabel,
} = require('../utils/dosageForms');

/**
 * Patient Service
 * Handles refill reminders / medication sync business logic
 */

const LOW_STOCK_WINDOW_DAYS = 7; // flag low stock when run-out falls within this many days

// ============================================
// CALCULATION HELPERS
// ============================================

/**
 * Days of supply for a medicine = (strips x tablets per strip) / tablets per day
 */
function daysOfSupply(medicine) {
  const packQuantity = getPackQuantity(medicine);
  const dailyUsage = getDailyUsageQuantity(medicine);
  if (!dailyUsage) return 0;
  return packQuantity / dailyUsage;
}

function runOutDate(medicine) {
  const date = new Date(medicine.lastFillDate);
  date.setDate(date.getDate() + Math.round(daysOfSupply(medicine)));
  return date;
}

function daysUntil(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Annotate a medicine with computed days-of-supply / run-out date / days left
 */
function annotateMedicine(medicine) {
  const supply = daysOfSupply(medicine);
  const runOut = runOutDate(medicine);
  return {
    ...medicine,
    dosageForm: normalizeDosageForm(medicine.dosageForm),
    daysOfSupply: Math.round(supply * 10) / 10,
    runOutDate: runOut,
    daysLeft: daysUntil(runOut),
    dosageSummary: getDosageSummary(medicine),
    quantityLabel: getQuantityLabel(medicine.dosageForm),
  };
}

/**
 * Medication sync recommendation: align all medicines to the latest run-out date
 * by short-filling the earlier-finishing ones.
 */
function computeSyncRecommendation(annotatedMedicines) {
  const active = annotatedMedicines.filter((m) => m.isActive);
  if (active.length < 2) return { targetDate: null, items: [] };

  const targetDate = active.reduce(
    (latest, m) => (m.runOutDate > latest ? m.runOutDate : latest),
    active[0].runOutDate
  );

  const items = active
    .map((m) => {
      const gapDays = daysUntil(targetDate) - m.daysLeft;
      if (gapDays <= 0) return null;

      const dailyUsage = getDailyUsageQuantity(m);
      const extraAmount = Math.ceil(gapDays * dailyUsage);
      const form = normalizeDosageForm(m.dosageForm);

      return {
        medicineId: m.id,
        name: m.name,
        dosageForm: form,
        currentRunOutDate: m.runOutDate,
        gapDays,
        extraAmount,
        quantityLabel: getQuantityLabel(form),
        extraTablets: form === 'tablet' ? extraAmount : undefined,
        extraStrips: form === 'tablet' && m.tabletsPerStrip > 0 ? Math.floor(extraAmount / m.tabletsPerStrip) : undefined,
        looseTablets: form === 'tablet' && m.tabletsPerStrip > 0 ? extraAmount - Math.floor(extraAmount / m.tabletsPerStrip) * m.tabletsPerStrip : undefined,
      };
    })
    .filter(Boolean);

  return { targetDate, items };
}

/**
 * Flag medicines that run out soon but aren't in the pharmacy's recorded stock
 */
async function annotateLowStock(userId, annotatedMedicines) {
  const products = await prisma.product.findMany({
    where: { userId, isActive: true },
    select: { nameNormalized: true, stock: true },
  });
  const stockByName = new Map(products.map((p) => [p.nameNormalized, p.stock]));

  return annotatedMedicines.map((m) => {
    if (!m.isActive || m.daysLeft > LOW_STOCK_WINDOW_DAYS) {
      return { ...m, lowStock: false };
    }
    const stock = stockByName.get(normalizeProductName(m.name));
    const lowStock = stock === undefined || stock <= 0;
    return { ...m, lowStock };
  });
}

// ============================================
// PATIENT CRUD
// ============================================

async function createPatient(userId, data) {
  const { name, phone, notes, medicines = [] } = data;

  return prisma.patient.create({
    data: {
      userId,
      name,
      phone,
      notes: notes || null,
      medicines: {
        create: medicines.map((m) => ({
          dosageForm: normalizeDosageForm(m.dosageForm),
          name: m.name,
          stripsDispensed: normalizeDosageForm(m.dosageForm) === 'tablet' ? toNumber(m.stripsDispensed) : 0,
          tabletsPerStrip: normalizeDosageForm(m.dosageForm) === 'tablet' ? toNumber(m.tabletsPerStrip) : 0,
          dosePerDay: toNumber(m.dosePerDay),
          dosageDetails: getDefaultDosageDetails(m.dosageForm, m),
          lastFillDate: m.lastFillDate ? new Date(m.lastFillDate) : new Date(),
        })),
      },
    },
    include: { medicines: true },
  });
}

/**
 * List patients for a user, each annotated with soonest run-out date, sorted soonest-first
 */
async function getPatients(userId) {
  const patients = await prisma.patient.findMany({
    where: { userId, isActive: true },
    include: { medicines: { where: { isActive: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const allMedicines = patients.flatMap((p) => p.medicines);
  const lowStockMap = await annotateLowStock(
    userId,
    allMedicines.map(annotateMedicine)
  );
  let cursor = 0;

  const annotated = patients.map((p) => {
    const medicines = p.medicines.map(() => lowStockMap[cursor++]);
    const soonest = medicines.reduce(
      (min, m) => (min === null || m.daysLeft < min ? m.daysLeft : min),
      null
    );
    const anyLowStock = medicines.some((m) => m.lowStock);
    return { ...p, medicines, daysLeft: soonest, lowStock: anyLowStock };
  });

  annotated.sort((a, b) => {
    if (a.daysLeft === null) return 1;
    if (b.daysLeft === null) return -1;
    return a.daysLeft - b.daysLeft;
  });

  return annotated;
}

async function getPatientById(userId, patientId) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, userId, isActive: true },
    include: { medicines: { where: { isActive: true } } },
  });
  if (!patient) return null;

  const annotatedMedicines = await annotateLowStock(
    userId,
    patient.medicines.map(annotateMedicine)
  );
  const sync = computeSyncRecommendation(annotatedMedicines);

  return { ...patient, medicines: annotatedMedicines, sync };
}

async function updatePatient(userId, patientId, data) {
  const { name, phone, notes } = data;
  const result = await prisma.patient.updateMany({
    where: { id: patientId, userId },
    data: {
      ...(name !== undefined && { name }),
      ...(phone !== undefined && { phone }),
      ...(notes !== undefined && { notes }),
    },
  });
  if (result.count === 0) return null;
  return prisma.patient.findUnique({ where: { id: patientId } });
}

async function deletePatient(userId, patientId) {
  const result = await prisma.patient.updateMany({
    where: { id: patientId, userId },
    data: { isActive: false },
  });
  return result.count > 0;
}

// ============================================
// MEDICINE CRUD
// ============================================

async function addMedicine(userId, patientId, data) {
  const patient = await prisma.patient.findFirst({ where: { id: patientId, userId } });
  if (!patient) return null;

  const dosageForm = normalizeDosageForm(data.dosageForm);
  return prisma.patientMedicine.create({
    data: {
      patientId,
      name: data.name,
      dosageForm,
      stripsDispensed: dosageForm === 'tablet' ? toNumber(data.stripsDispensed) : 0,
      tabletsPerStrip: dosageForm === 'tablet' ? toNumber(data.tabletsPerStrip) : 0,
      dosePerDay: toNumber(data.dosePerDay),
      dosageDetails: getDefaultDosageDetails(dosageForm, data),
      lastFillDate: data.lastFillDate ? new Date(data.lastFillDate) : new Date(),
    },
  });
}

async function updateMedicine(userId, patientId, medicineId, data) {
  const patient = await prisma.patient.findFirst({ where: { id: patientId, userId } });
  if (!patient) return null;

  const hasDosageForm = data.dosageForm !== undefined;
  const dosageForm = hasDosageForm ? normalizeDosageForm(data.dosageForm) : null;
  const result = await prisma.patientMedicine.updateMany({
    where: { id: medicineId, patientId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(hasDosageForm && { dosageForm }),
      ...(data.dosePerDay !== undefined && { dosePerDay: toNumber(data.dosePerDay) }),
      ...(data.dosageDetails !== undefined && { dosageDetails: data.dosageDetails }),
      ...(hasDosageForm && dosageForm !== 'tablet' && { stripsDispensed: 0, tabletsPerStrip: 0 }),
      ...((!hasDosageForm || dosageForm === 'tablet') && data.stripsDispensed !== undefined && { stripsDispensed: toNumber(data.stripsDispensed) }),
      ...((!hasDosageForm || dosageForm === 'tablet') && data.tabletsPerStrip !== undefined && { tabletsPerStrip: toNumber(data.tabletsPerStrip) }),
    },
  });
  if (result.count === 0) return null;
  return prisma.patientMedicine.findUnique({ where: { id: medicineId } });
}

async function deleteMedicine(userId, patientId, medicineId) {
  const patient = await prisma.patient.findFirst({ where: { id: patientId, userId } });
  if (!patient) return false;

  const result = await prisma.patientMedicine.updateMany({
    where: { id: medicineId, patientId },
    data: { isActive: false },
  });
  return result.count > 0;
}

// ============================================
// CONFIRM PICKUP — resets the cycle from the actual pickup date
// ============================================

async function confirmPickup(userId, patientId, medicineUpdates = []) {
  const patient = await prisma.patient.findFirst({ where: { id: patientId, userId } });
  if (!patient) return null;

  const now = new Date();
  for (const update of medicineUpdates) {
    const dosageForm = normalizeDosageForm(update.dosageForm);
    await prisma.patientMedicine.updateMany({
      where: { id: update.medicineId, patientId },
      data: {
        lastFillDate: now,
        ...(update.dosageForm !== undefined && { dosageForm }),
        ...(update.dosePerDay !== undefined && { dosePerDay: toNumber(update.dosePerDay) }),
        ...(update.dosageDetails !== undefined && { dosageDetails: update.dosageDetails }),
        ...(dosageForm !== 'tablet' && { stripsDispensed: 0, tabletsPerStrip: 0 }),
        ...(dosageForm === 'tablet' && update.stripsDispensed !== undefined && { stripsDispensed: toNumber(update.stripsDispensed) }),
        ...(dosageForm === 'tablet' && update.tabletsPerStrip !== undefined && { tabletsPerStrip: toNumber(update.tabletsPerStrip) }),
      },
    });
  }

  return getPatientById(userId, patientId);
}

// ============================================
// REMINDER (mock channel — logs only, v1)
// ============================================

async function sendReminder(userId, patientId) {
  const patient = await prisma.patient.findFirst({ where: { id: patientId, userId } });
  if (!patient) return null;

  return prisma.reminderLog.create({
    data: { patientId, channel: 'manual' },
  });
}

module.exports = {
  daysOfSupply,
  runOutDate,
  computeSyncRecommendation,
  createPatient,
  getPatients,
  getPatientById,
  updatePatient,
  deletePatient,
  addMedicine,
  updateMedicine,
  deleteMedicine,
  confirmPickup,
  sendReminder,
};
