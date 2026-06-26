/**
 * Expiry Action Window Controller
 * Surfaces only batches needing action, handles qty updates and archiving.
 *
 * Configurable thresholds (per tenant — stored in User or env defaults):
 *   ACTION_WINDOW_DAYS  = 90   (items expiring within this many days appear)
 *   RETURN_WINDOW_DAYS  = 90   (days before expiry during which return is allowed)
 */

const prisma = require('../models/prisma');

const ACTION_WINDOW_DAYS = parseInt(process.env.ACTION_WINDOW_DAYS || '90', 10);
const RETURN_WINDOW_DAYS = parseInt(process.env.RETURN_WINDOW_DAYS || '90', 10);

// ─── Date helpers ────────────────────────────────────────────────────────────

function parseExpiryDate(value) {
  if (!value) return null;
  const text = String(value).trim();

  // MM/YY or MM-YY
  let m = text.match(/^(\d{1,2})[\/-](\d{2,4})$/);
  if (m) {
    const month = Number(m[1]);
    const year = Number(m[2].length === 2 ? `20${m[2]}` : m[2]);
    if (month >= 1 && month <= 12) return new Date(year, month, 0); // last day of month
  }

  // DD/MM/YYYY or DD-MM-YYYY
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

// ─── GET /api/expiry/user/:userId/window ─────────────────────────────────────
/**
 * Returns all active BillItems whose expiry falls within the action window.
 * Computes value-at-risk and return-eligible summaries.
 */
exports.getExpiryWindow = async (req, res) => {
  try {
    const { userId } = req.params;
    const windowDays = parseInt(req.query.windowDays || ACTION_WINDOW_DAYS, 10);
    const returnDays = parseInt(req.query.returnDays || RETURN_WINDOW_DAYS, 10);

    // Fetch all active bill items with bill + distributor info
    const items = await prisma.billItem.findMany({
      where: {
        bill: { userId },
        expiryStatus: 'active',
        expiryDate: { not: null },
      },
      include: {
        bill: {
          select: {
            id: true,
            pharmacyName: true,
            invoiceDate: true,
            distributor: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const windowCutoff = new Date(today);
    windowCutoff.setDate(windowCutoff.getDate() + windowDays);

    const result = [];
    const toMarkEntered = [];

    for (const item of items) {
      const expiry = parseExpiryDate(item.expiryDate);
      if (!expiry) continue;

      const days = daysUntil(expiry);

      // Auto-archive items that have passed expiry with no action
      if (days < 0 && item.expiryStatus === 'active') {
        toMarkEntered.push(
          prisma.billItem.update({
            where: { id: item.id },
            data: {
              expiryStatus: 'archived',
              archiveReason: 'expired',
              archivedAt: new Date(),
            },
          })
        );
        continue;
      }

      // Only surface items inside the action window
      if (expiry > windowCutoff) continue;

      // Determine return eligibility: return window opens now if expiry - today <= returnDays
      const returnOpenDate = new Date(expiry);
      returnOpenDate.setDate(returnOpenDate.getDate() - returnDays);
      const returnEligible = today >= returnOpenDate;

      // Mark firstEnteredWindowAt if not already set
      if (!item.firstEnteredWindowAt) {
        toMarkEntered.push(
          prisma.billItem.update({
            where: { id: item.id },
            data: { firstEnteredWindowAt: new Date() },
          })
        );
      }

      const remainingQty = item.remainingQty ?? item.quantity ?? 0;
      // Cost: use rate from bill item; itemTotal / quantity as fallback
      const unitCost =
        item.rate > 0
          ? item.rate
          : item.itemTotal > 0 && item.quantity > 0
          ? item.itemTotal / item.quantity
          : 0;
      const valueAtRisk = remainingQty * unitCost;
      const returnValue = returnEligible ? remainingQty * unitCost : 0;

      result.push({
        id: item.id,
        billId: item.billId,
        name: item.name,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        expiryDateParsed: expiry.toISOString(),
        daysUntilExpiry: days,
        quantity: item.quantity,
        remainingQty,
        unitCost,
        valueAtRisk,
        returnEligible,
        returnOpenDate: returnOpenDate.toISOString(),
        returnValue,
        distributor: item.bill?.distributor?.name || item.bill?.pharmacyName || null,
        firstEnteredWindowAt: item.firstEnteredWindowAt,
      });
    }

    // Fire-and-forget side effects
    if (toMarkEntered.length > 0) {
      Promise.all(toMarkEntered).catch((e) =>
        console.warn('[ExpiryController] Side-effect update failed:', e.message)
      );
    }

    // Sort: expired first, then by days ascending
    result.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    // Summary
    const totalValueAtRisk = result.reduce((s, i) => s + i.valueAtRisk, 0);
    const totalReturnable = result.reduce((s, i) => s + i.returnValue, 0);
    const newThisReview = result.filter((i) => {
      if (!i.firstEnteredWindowAt) return true;
      const enteredMs = new Date(i.firstEnteredWindowAt).getTime();
      const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
      return enteredMs >= thirtyDaysAgo;
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
/**
 * Update remaining quantity or archive a batch with a reason.
 * Body: { remainingQty?, action: 'update_qty'|'sold'|'returned'|'writeoff' }
 */
exports.applyExpiryAction = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { action, remainingQty } = req.body;

    const item = await prisma.billItem.findUnique({ where: { id: itemId } });
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });

    let updateData = {};

    if (action === 'update_qty') {
      const qty = parseFloat(remainingQty);
      if (isNaN(qty) || qty < 0)
        return res.status(400).json({ success: false, error: 'Invalid quantity' });

      if (qty === 0) {
        // Auto-archive as sold/finished
        updateData = {
          remainingQty: 0,
          expiryStatus: 'archived',
          archiveReason: 'sold',
          archivedAt: new Date(),
        };
      } else {
        updateData = { remainingQty: qty };
      }
    } else if (['sold', 'returned', 'writeoff'].includes(action)) {
      updateData = {
        expiryStatus: 'archived',
        archiveReason: action,
        archivedAt: new Date(),
        ...(remainingQty !== undefined ? { remainingQty: parseFloat(remainingQty) || 0 } : {}),
      };
    } else {
      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    const updated = await prisma.billItem.update({
      where: { id: itemId },
      data: updateData,
    });

    res.json({ success: true, item: updated });
  } catch (err) {
    console.error('[ExpiryController] applyExpiryAction error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /api/expiry/user/:userId/archive ─────────────────────────────────────
/**
 * Archived items — never deleted, always queryable.
 */
exports.getArchive = async (req, res) => {
  try {
    const { userId } = req.params;
    const items = await prisma.billItem.findMany({
      where: { bill: { userId }, expiryStatus: 'archived' },
      include: {
        bill: { select: { pharmacyName: true, distributor: { select: { name: true } } } },
      },
      orderBy: { archivedAt: 'desc' },
      take: 100,
    });
    res.json({ success: true, items });
  } catch (err) {
    console.error('[ExpiryController] getArchive error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};
