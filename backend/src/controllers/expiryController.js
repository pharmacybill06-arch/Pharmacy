/**
 * Expiry Action Window Controller
 * Uses $queryRaw / $executeRaw for the new expiry-action columns so this
 * works even before `prisma generate` has been re-run with the updated schema.
 *
 * Configurable thresholds (env defaults, per-tenant support ready):
 *   ACTION_WINDOW_DAYS  = 90
 *   RETURN_WINDOW_DAYS  = 90
 */

const prisma = require('../models/prisma');

const ACTION_WINDOW_DAYS = parseInt(process.env.ACTION_WINDOW_DAYS || '90', 10);
const RETURN_WINDOW_DAYS = parseInt(process.env.RETURN_WINDOW_DAYS || '90', 10);

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseExpiryDate(value) {
  if (!value) return null;
  const text = String(value).trim();

  let m = text.match(/^(\d{1,2})[\/-](\d{2,4})$/);
  if (m) {
    const month = Number(m[1]);
    const year = Number(m[2].length === 2 ? `20${m[2]}` : m[2]);
    if (month >= 1 && month <= 12) return new Date(year, month, 0);
  }

  m = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m) {
    const first = Number(m[1]);
    const second = Number(m[2]);
    const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    const day = first > 12 ? first : second;
    const month = first > 12 ? second : first;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31)
      return new Date(year, month - 1, day);
  }

  const d = new Date(text);
  return isNaN(d.getTime()) ? null : d;
}

function daysUntil(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

// ─── Ensure columns exist (idempotent) ───────────────────────────────────────
// Called once at startup; safe to run multiple times.
async function ensureColumns() {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "BillItem"
        ADD COLUMN IF NOT EXISTS "remainingQty"          DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS "expiryStatus"          TEXT NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS "archiveReason"         TEXT,
        ADD COLUMN IF NOT EXISTS "archivedAt"            TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "firstEnteredWindowAt"  TIMESTAMP(3)
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "BillItem_expiryStatus_idx"
        ON "BillItem"("expiryStatus")
    `);

    console.log('[ExpiryController] Columns ensured');
  } catch (err) {
    // Non-fatal — columns may already exist or DB may not support IF NOT EXISTS
    console.warn('[ExpiryController] ensureColumns warning:', err.message);
  }
}

// Run once when the module is first loaded
ensureColumns();

// ─── GET /api/expiry/user/:userId/window ─────────────────────────────────────

exports.getExpiryWindow = async (req, res) => {
  try {
    const { userId } = req.params;
    const windowDays = parseInt(req.query.windowDays || ACTION_WINDOW_DAYS, 10);
    const returnDays = parseInt(req.query.returnDays || RETURN_WINDOW_DAYS, 10);

    // Raw query to avoid stale Prisma client issues with new columns
    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        bi.id,
        bi."billId",
        bi.name,
        bi."batchNumber",
        bi."expiryDate",
        bi.quantity,
        bi.rate,
        bi."itemTotal",
        bi."remainingQty",
        bi."expiryStatus",
        bi."firstEnteredWindowAt",
        b."pharmacyName",
        b."invoiceDate",
        d.name AS "distributorName"
      FROM "BillItem" bi
      JOIN "Bill" b ON b.id = bi."billId"
      LEFT JOIN "Distributor" d ON d.id = b."distributorId"
      WHERE b."userId" = $1
        AND bi."expiryDate" IS NOT NULL
        AND (bi."expiryStatus" = 'active' OR bi."expiryStatus" IS NULL)
    `, userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const windowCutoff = new Date(today);
    windowCutoff.setDate(windowCutoff.getDate() + windowDays);

    const result = [];
    const autoArchive = [];
    const markEntered = [];

    for (const row of rows) {
      const expiry = parseExpiryDate(row.expiryDate);
      if (!expiry) continue;

      const days = daysUntil(expiry);

      // Auto-archive passed-expiry items with no action
      if (days < 0) {
        autoArchive.push(
          prisma.$executeRawUnsafe(`
            UPDATE "BillItem"
            SET "expiryStatus" = 'archived',
                "archiveReason" = 'expired',
                "archivedAt"    = NOW(),
                "updatedAt"     = NOW()
            WHERE id = $1
          `, row.id)
        );
        continue;
      }

      // Skip if outside action window
      if (expiry > windowCutoff) continue;

      // Return window: opens when (expiry - today) <= returnDays
      const returnOpenDate = new Date(expiry);
      returnOpenDate.setDate(returnOpenDate.getDate() - returnDays);
      const returnEligible = today >= returnOpenDate;

      // Mark firstEnteredWindowAt if not set
      if (!row.firstEnteredWindowAt) {
        markEntered.push(
          prisma.$executeRawUnsafe(`
            UPDATE "BillItem"
            SET "firstEnteredWindowAt" = NOW(), "updatedAt" = NOW()
            WHERE id = $1
          `, row.id)
        );
      }

      const remainingQty = row.remainingQty != null ? Number(row.remainingQty) : null;
      const qty = remainingQty != null ? remainingQty : Number(row.quantity || 0);
      const unitCost =
        Number(row.rate) > 0
          ? Number(row.rate)
          : Number(row.itemTotal) > 0 && Number(row.quantity) > 0
          ? Number(row.itemTotal) / Number(row.quantity)
          : 0;
      const valueAtRisk = qty * unitCost;
      const returnValue = returnEligible ? qty * unitCost : 0;

      result.push({
        id: row.id,
        billId: row.billId,
        name: row.name,
        batchNumber: row.batchNumber,
        expiryDate: row.expiryDate,
        expiryDateParsed: expiry.toISOString(),
        daysUntilExpiry: days,
        quantity: Number(row.quantity || 0),
        remainingQty,
        unitCost: Math.round(unitCost * 100) / 100,
        valueAtRisk: Math.round(valueAtRisk * 100) / 100,
        returnEligible,
        returnOpenDate: returnOpenDate.toISOString(),
        returnValue: Math.round(returnValue * 100) / 100,
        distributor: row.distributorName || row.pharmacyName || null,
        firstEnteredWindowAt: row.firstEnteredWindowAt,
      });
    }

    // Fire-and-forget side effects
    if (autoArchive.length > 0) Promise.all(autoArchive).catch(() => {});
    if (markEntered.length > 0) Promise.all(markEntered).catch(() => {});

    result.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    const totalValueAtRisk = result.reduce((s, i) => s + i.valueAtRisk, 0);
    const totalReturnable = result.reduce((s, i) => s + i.returnValue, 0);
    const newThisReview = result.filter((i) => {
      if (!i.firstEnteredWindowAt) return true;
      return Date.now() - new Date(i.firstEnteredWindowAt).getTime() <= 30 * 86_400_000;
    }).length;

    res.json({
      success: true,
      items: result,
      summary: {
        totalItems: result.length,
        newThisReview,
        totalValueAtRisk: Math.round(totalValueAtRisk * 100) / 100,
        totalReturnable: Math.round(totalReturnable * 100) / 100,
        windowDays,
        returnDays,
      },
    });
  } catch (err) {
    console.error('[ExpiryController] getExpiryWindow error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── PATCH /api/expiry/items/:itemId/action ───────────────────────────────────

exports.applyExpiryAction = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { action, remainingQty } = req.body;

    // Verify item exists via standard Prisma (uses known fields only)
    const item = await prisma.billItem.findUnique({
      where: { id: itemId },
      select: { id: true, quantity: true },
    });
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });

    if (action === 'update_qty') {
      const qty = parseFloat(remainingQty);
      if (isNaN(qty) || qty < 0)
        return res.status(400).json({ success: false, error: 'Invalid quantity' });

      if (qty === 0) {
        await prisma.$executeRawUnsafe(`
          UPDATE "BillItem"
          SET "remainingQty" = 0,
              "expiryStatus" = 'archived',
              "archiveReason" = 'sold',
              "archivedAt"    = NOW(),
              "updatedAt"     = NOW()
          WHERE id = $1
        `, itemId);
      } else {
        await prisma.$executeRawUnsafe(`
          UPDATE "BillItem"
          SET "remainingQty" = $2,
              "updatedAt"    = NOW()
          WHERE id = $1
        `, itemId, qty);
      }
    } else if (['sold', 'returned', 'writeoff'].includes(action)) {
      const rqty = remainingQty !== undefined ? parseFloat(remainingQty) : null;
      if (rqty !== null && !isNaN(rqty)) {
        await prisma.$executeRawUnsafe(`
          UPDATE "BillItem"
          SET "expiryStatus"  = 'archived',
              "archiveReason" = $2,
              "archivedAt"    = NOW(),
              "remainingQty"  = $3,
              "updatedAt"     = NOW()
          WHERE id = $1
        `, itemId, action, rqty);
      } else {
        await prisma.$executeRawUnsafe(`
          UPDATE "BillItem"
          SET "expiryStatus"  = 'archived',
              "archiveReason" = $2,
              "archivedAt"    = NOW(),
              "updatedAt"     = NOW()
          WHERE id = $1
        `, itemId, action);
      }
    } else {
      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[ExpiryController] applyExpiryAction error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /api/expiry/user/:userId/archive ─────────────────────────────────────

exports.getArchive = async (req, res) => {
  try {
    const { userId } = req.params;
    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        bi.id,
        bi.name,
        bi."batchNumber",
        bi."expiryDate",
        bi.quantity,
        bi."remainingQty",
        bi."expiryStatus",
        bi."archiveReason",
        bi."archivedAt",
        d.name AS "distributorName",
        b."pharmacyName"
      FROM "BillItem" bi
      JOIN "Bill" b ON b.id = bi."billId"
      LEFT JOIN "Distributor" d ON d.id = b."distributorId"
      WHERE b."userId" = $1
        AND bi."expiryStatus" = 'archived'
      ORDER BY bi."archivedAt" DESC NULLS LAST
      LIMIT 100
    `, userId);

    res.json({ success: true, items: rows });
  } catch (err) {
    console.error('[ExpiryController] getArchive error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};
