-- Add Expo push token storage to User, and medicine-level dedup tracking to ReminderLog
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "expoPushToken" TEXT;
ALTER TABLE "ReminderLog" ADD COLUMN IF NOT EXISTS "medicineId" TEXT;

CREATE INDEX IF NOT EXISTS "ReminderLog_medicineId_idx" ON "ReminderLog"("medicineId");
