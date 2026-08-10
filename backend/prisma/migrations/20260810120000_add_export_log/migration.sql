-- Data Export to Excel/CSV — Phase 1
-- Export files are generated on demand and streamed to the user; nothing is stored
-- server-side, so ExportLog is the only record that an export happened.

CREATE TABLE IF NOT EXISTS "ExportLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exportType" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'xlsx',
    "filters" JSONB,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "fileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExportLog_userId_createdAt_idx" ON "ExportLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ExportLog_exportType_idx" ON "ExportLog"("exportType");

DO $$ BEGIN
    ALTER TABLE "ExportLog" ADD CONSTRAINT "ExportLog_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
