const fs = require('fs');
const path = require('path');
const prisma = require('../models/prisma');
const { extractUpiPaymentFromImage } = require('../utils/openaiService');

/**
 * UPI payment screenshot → ledger payment draft.
 *
 * The shop owner pays a distributor in PhonePe / Google Pay / Paytm and shares the
 * receipt screenshot into the app. We read amount, date, transaction id and receiver,
 * guess which distributor it was paid to, and flag a screenshot that was already
 * recorded. Nothing is written to the ledger here — the client shows a pre-filled
 * payment form and the pharmacist confirms it (ledgerService.recordPayment).
 */

const APPS = ['phonepe', 'google_pay', 'paytm', 'bhim', 'amazon_pay', 'cred', 'whatsapp', 'bank', 'other'];

const STOP_WORDS = new Set([
  'medical', 'medicals', 'agency', 'agencies', 'pharma', 'pharmaceutical', 'pharmaceuticals',
  'pharmacy', 'distributor', 'distributors', 'enterprises', 'enterprise', 'traders', 'trading',
  'company', 'co', 'pvt', 'private', 'ltd', 'limited', 'and', 'the', 'store', 'stores', 'm', 's',
]);

function cleanId(value) {
  if (!value) return null;
  const id = String(value).replace(/\s+/g, '').replace(/^(utr|upi(ref)?(no)?|ref(no)?)[:#-]?/i, '');
  return id.length >= 6 ? id : null;
}

function cleanAmount(value) {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[₹,\s]|rs\.?/gi, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Accept only a real calendar date that is not in the future (screens are receipts of the past). */
function cleanDate(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  // Allow one day of slack for timezone differences
  if (date.getTime() > Date.now() + 86_400_000) return null;
  if (y < 2016) return null; // UPI did not exist before 2016
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function tokens(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function squash(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** 0..1 similarity between a receiver name and a distributor name. */
function nameScore(receiver, distributor) {
  const a = squash(receiver);
  const b = squash(distributor);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = tokens(receiver);
  const tb = tokens(distributor);
  // Only generic words ("Medical Agencies") can't identify anyone
  if (!ta.length || !tb.length) return 0;
  // Truncated names ("BALAJI MEDICAL AGEN") — substring of the squashed name
  if (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a))) return 0.9;
  const shared = ta.filter((t) => tb.some((u) => u === t || (t.length >= 4 && u.length >= 4 && (u.startsWith(t) || t.startsWith(u)))));
  return shared.length / Math.max(ta.length, tb.length);
}

/**
 * Which distributor was this paid to? Strongest signal first:
 *   1. an earlier payment to the same UPI id (the app has learned it),
 *   2. an earlier payment with the same receiver name,
 *   3. fuzzy match of the receiver name against distributor names.
 */
async function matchDistributor(userId, receiverName, receiverUpiId) {
  const distributors = await prisma.distributor.findMany({
    where: { userId, isActive: true },
    select: { id: true, name: true },
  });
  const byId = new Map(distributors.map((d) => [d.id, d]));

  const learned = async (where, reason) => {
    const prior = await prisma.payment.findFirst({
      where: { userId, distributorId: { not: null }, isArchived: false, ...where },
      orderBy: { createdAt: 'desc' },
      select: { distributorId: true },
    });
    const d = prior && byId.get(prior.distributorId);
    return d ? { distributor: d, confidence: 'high', reason } : null;
  };

  if (receiverUpiId) {
    const hit = await learned({ payeeUpiId: { equals: receiverUpiId, mode: 'insensitive' } }, `Paid to ${receiverUpiId} before`);
    if (hit) return { ...hit, candidates: [] };
  }
  if (receiverName) {
    const hit = await learned({ payeeName: { equals: receiverName, mode: 'insensitive' } }, `Paid to "${receiverName}" before`);
    if (hit) return { ...hit, candidates: [] };
  }

  const ranked = distributors
    .map((d) => ({ distributor: d, score: nameScore(receiverName, d.name) }))
    .filter((r) => r.score >= 0.5)
    .sort((x, y) => y.score - x.score);

  if (!ranked.length) return { distributor: null, confidence: 'none', reason: null, candidates: [] };
  const [best, second] = ranked;
  // Two near-equal matches → let the pharmacist choose instead of guessing
  const clear = best.score >= 0.75 && (!second || best.score - second.score >= 0.2);
  return {
    distributor: clear ? best.distributor : null,
    confidence: clear ? (best.score >= 0.9 ? 'high' : 'medium') : 'low',
    reason: clear ? `Name matches "${best.distributor.name}"` : null,
    candidates: ranked.slice(0, 4).map((r) => r.distributor),
  };
}

/** A screenshot shared twice must not be recorded twice. */
async function findDuplicate(userId, ids) {
  const list = ids.filter(Boolean);
  if (!list.length) return null;
  const existing = await prisma.payment.findFirst({
    where: {
      userId,
      OR: [
        { transactionId: { in: list } },
        { referenceNumber: { in: list } },
        { upiRefNumber: { in: list } },
      ],
    },
    select: {
      id: true, amount: true, paymentDate: true, isArchived: true, distributorId: true,
      distributor: { select: { id: true, name: true } },
    },
  });
  return existing || null;
}

/**
 * @param {string} userId
 * @param {{ path: string, mimetype: string, filename: string }} file - multer file (already saved)
 */
async function scanScreenshot(userId, file) {
  const attachmentPath = `/uploads/payments/${file.filename}`;
  const base64 = fs.readFileSync(path.resolve(file.path)).toString('base64');

  const raw = await extractUpiPaymentFromImage(base64, file.mimetype || 'image/jpeg');

  if (raw?.isPaymentReceipt === false) {
    // Not a receipt — don't keep the upload around as an orphan attachment
    fs.promises.unlink(path.resolve(file.path)).catch(() => {});
    const err = new Error('This image does not look like a UPI payment receipt. Share the receipt screen from your UPI app.');
    err.code = 'NOT_A_RECEIPT';
    throw err;
  }

  const transactionId = cleanId(raw?.transactionId);
  const otherIds = (Array.isArray(raw?.otherReferenceIds) ? raw.otherReferenceIds : []).map(cleanId).filter(Boolean);
  const extracted = {
    amount: cleanAmount(raw?.amount),
    paymentDate: cleanDate(raw?.date),
    time: /^\d{1,2}:\d{2}$/.test(raw?.time || '') ? raw.time : null,
    transactionId,
    otherReferenceIds: otherIds.filter((id) => id !== transactionId),
    receiverName: raw?.receiverName?.trim() || null,
    receiverUpiId: raw?.receiverUpiId?.trim().toLowerCase() || null,
    receiverBank: raw?.receiverBank?.trim() || null,
    payerName: raw?.payerName?.trim() || null,
    app: APPS.includes(raw?.app) ? raw.app : null,
    status: ['success', 'pending', 'failed'].includes(raw?.status) ? raw.status : null,
    note: raw?.note?.trim() || null,
  };

  const [match, duplicate] = await Promise.all([
    matchDistributor(userId, extracted.receiverName, extracted.receiverUpiId),
    findDuplicate(userId, [transactionId, ...otherIds]),
  ]);

  const missing = ['amount', 'paymentDate', 'transactionId', 'receiverName'].filter((k) => !extracted[k]);

  return { attachmentPath, extracted, match, duplicate, missing };
}

module.exports = { scanScreenshot, matchDistributor, findDuplicate, nameScore };
