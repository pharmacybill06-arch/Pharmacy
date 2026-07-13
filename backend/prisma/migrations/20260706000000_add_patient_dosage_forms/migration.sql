-- Add dosage form support to patient medicines
ALTER TABLE "PatientMedicine" ADD COLUMN IF NOT EXISTS "dosageForm" TEXT NOT NULL DEFAULT 'tablet';
ALTER TABLE "PatientMedicine" ADD COLUMN IF NOT EXISTS "dosageDetails" JSONB;
