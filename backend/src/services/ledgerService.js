const prisma = require('../models/prisma');
const {
  planFifo,
  sortTargets,
  targetKey,
  isAfterPaymentDate,
} = require('./allocationEngine');
const { istDayKey, IST_OFFSET_MS } = require('../utils/istDate');
const clock = require('../utils/clock');
const { validatePaymentDate, isPostDatedCheque, billDetailIssues } = require('../utils/dateRules');

/**
 * Ledger Service
 * Distributor Payments (Khata) — per-distributor debit/credit ledger.
 *
 * Core identity:
 *   distributor.outstanding = openingBalance + SUM(bill.grandTotal) - SUM(payment.amount, non-archived)
 *   bill.paidAmount = SUM(allocations for that bill)
 *   bill.balance = grandTotal - paidAmount
 *
 * The opening balance is treated as a virtual first "bill" so it can be settled
 * explicitly via PaymentAllocation rows with allocationType='opening_balance'.
 */

const VALID_MODES = ['upi', 'cash', 'cheque', 'neft_rtgs', 'credit_note'];

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function assertDistributorOwnedByUser(userId, distributorId) {
  const distributor = await prisma.distributor.findFirst({
    where: { id: distributorId, userId },
  });
  if (!distributor) {
    throw new Error('Distributor not found or does not belong to user');
  }
  return distributor;
}

/**
 * Sum of a distributor's opening balance already settled by past (non-archived) payments.
 */
async function getOpeningBalanceSettled(distributorId) {
  const paid = await prisma.paymentAllocation.aggregate({
    where: {
      allocationType: 'opening_balance',
      payment: { distributorId, isArchived: false },
    },
    _sum: { allocatedAmount: true },
  });
  return paid._sum.allocatedAmount || 0;
}

/**
 * Compute paidAmount/balance/status for a list of bills, given their allocations.
 * Bills are expected to already include `allocations` (non-archived payments only).
 */
function computeBillStatus(bill, today = clock.now()) {
  const grandTotal = bill.grandTotal || 0;
  const paidAmount = round2((bill.allocations || []).reduce((sum, a) => sum + a.allocatedAmount, 0));
  const balance = round2(grandTotal - paidAmount);

  let status;
  if (balance <= 0.005) {
    status = 'paid';
  } else if (paidAmount > 0.005) {
    status = 'partial';
  } else {
    status = 'unpaid';
  }

  // Compare IST calendar days: a bill due today is not overdue until tomorrow (IST).
  const isOverdue = balance > 0.005 && bill.dueDate && istDayKey(bill.dueDate) < istDayKey(today);
  if (isOverdue) status = 'overdue';

  return { ...bill, paidAmount, balance, status, isOverdue: !!isOverdue };
}

/**
 * Screen A — Distributor Payments List
 * All distributors for a user with outstanding/overdue totals and last payment date.
 */
async function getLedgerSummary(userId) {
  const distributors = await prisma.distributor.findMany({
    where: { userId, isActive: true },
  });

  const today = clock.now();

  const rows = await Promise.all(
    distributors.map(async (dist) => {
      const [billTotal, paymentTotal, bills, lastPayment] = await Promise.all([
        prisma.bill.aggregate({
          where: { distributorId: dist.id, billType: 'purchase' },
          _sum: { grandTotal: true },
        }),
        prisma.payment.aggregate({
          where: { distributorId: dist.id, isArchived: false },
          _sum: { amount: true },
        }),
        prisma.bill.findMany({
          where: { distributorId: dist.id, billType: 'purchase' },
          select: {
            id: true,
            grandTotal: true,
            dueDate: true,
            allocations: {
              where: { payment: { isArchived: false } },
              select: { allocatedAmount: true },
            },
          },
        }),
        prisma.payment.findFirst({
          where: { distributorId: dist.id, isArchived: false },
          orderBy: { paymentDate: 'desc' },
          select: { paymentDate: true },
        }),
      ]);

      const outstanding = round2(
        dist.openingBalance + (billTotal._sum.grandTotal || 0) - (paymentTotal._sum.amount || 0)
      );

      const overdue = round2(
        bills.reduce((sum, bill) => {
          const { balance, status } = computeBillStatus(bill, today);
          return status === 'overdue' ? sum + balance : sum;
        }, 0)
      );

      return {
        id: dist.id,
        name: dist.name,
        phone: dist.phone,
        outstanding,
        overdue,
        lastPaymentDate: lastPayment?.paymentDate || null,
      };
    })
  );

  rows.sort((a, b) => b.outstanding - a.outstanding);

  const totals = rows.reduce(
    (acc, r) => ({
      totalOutstanding: round2(acc.totalOutstanding + r.outstanding),
      totalOverdue: round2(acc.totalOverdue + r.overdue),
    }),
    { totalOutstanding: 0, totalOverdue: 0 }
  );

  return { distributors: rows, ...totals };
}

/**
 * Screen B — Distributor Ledger Detail
 * Bills (with paid/balance/status), Payments (with allocations), and the
 * chronological reconciliation statement (Ledger tab).
 */
async function getDistributorLedger(distributorId) {
  const distributor = await prisma.distributor.findUnique({ where: { id: distributorId } });
  if (!distributor) throw new Error('Distributor not found');

  const today = clock.now();

  const [bills, payments] = await Promise.all([
    prisma.bill.findMany({
      where: { distributorId, billType: 'purchase' },
      include: {
        allocations: {
          where: { payment: { isArchived: false } },
          include: { payment: { select: { id: true, paymentDate: true, paymentMethod: true } } },
        },
      },
      orderBy: [{ invoiceDate: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.payment.findMany({
      where: { distributorId },
      include: {
        allocations: {
          include: { bill: { select: { id: true, invoiceNumber: true, invoiceDate: true } } },
        },
      },
      orderBy: { paymentDate: 'asc' },
    }),
  ]);

  const billsWithStatus = bills.map((b) => {
    const withStatus = computeBillStatus(b, today);
    const detailIssues = billDetailIssues(b);
    return { ...withStatus, detailIssues, needsDetails: b.status === 'needs_details' || detailIssues.length > 0 };
  });

  const openingBalanceSettled = round2(await getOpeningBalanceSettled(distributorId));
  const openingBalanceRemaining = round2(distributor.openingBalance - openingBalanceSettled);

  const totalBilled = round2(billsWithStatus.reduce((s, b) => s + (b.grandTotal || 0), 0));
  const totalPaid = round2(
    payments.filter((p) => !p.isArchived).reduce((s, p) => s + p.amount, 0)
  );
  const outstanding = round2(distributor.openingBalance + totalBilled - totalPaid);
  const overdue = round2(
    billsWithStatus.reduce((s, b) => (b.status === 'overdue' ? s + b.balance : s), 0)
  );

  // Ledger tab: chronological statement, oldest first, with running balance
  const ledgerRows = [];
  let running = 0;

  if (distributor.openingBalance) {
    running = round2(running + distributor.openingBalance);
    ledgerRows.push({
      date: distributor.createdAt,
      particulars: 'Opening balance',
      debit: distributor.openingBalance,
      credit: 0,
      runningBalance: running,
    });
  }

  for (const bill of billsWithStatus) {
    running = round2(running + (bill.grandTotal || 0));
    ledgerRows.push({
      date: bill.invoiceDate || bill.createdAt,
      particulars: `Invoice ${bill.invoiceNumber || bill.id.slice(-6)}`,
      debit: bill.grandTotal || 0,
      credit: 0,
      runningBalance: running,
      billId: bill.id,
    });
  }

  for (const payment of payments) {
    if (payment.isArchived) continue;
    running = round2(running - payment.amount);
    const mode = payment.paymentMethod || 'payment';
    const refSuffix = payment.referenceNumber ? ` — ref ${payment.referenceNumber}` : '';
    ledgerRows.push({
      date: payment.paymentDate || payment.createdAt,
      particulars: `${mode.toUpperCase()} payment${refSuffix}`,
      debit: 0,
      credit: payment.amount,
      runningBalance: running,
      paymentId: payment.id,
    });
  }

  ledgerRows.sort((a, b) => new Date(a.date) - new Date(b.date));
  // Re-derive running balance after sort (dates may interleave across bills/payments)
  running = 0;
  for (const row of ledgerRows) {
    running = round2(running + row.debit - row.credit);
    row.runningBalance = running;
  }

  const onAccountAvailable = await getOnAccountBalance(distributorId);

  return {
    distributor: {
      ...distributor,
      outstanding,
      overdue,
      openingBalanceRemaining,
      onAccountAvailable,
    },
    bills: billsWithStatus,
    payments: payments.map(decoratePayment),
    ledgerRows,
  };
}

function fail(status, code, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

const BILL_ALLOCATION_TYPES = ['bill', 'opening_balance'];

/**
 * Flow C, step 5 — the allocation list: opening balance (if any remains) first,
 * then open bills oldest-first, each with its remaining balance and invoice date.
 *
 * opts.paymentDate — marks bills dated after it (`afterPaymentDate`), for the
 *   "ye bill payment ke baad ka hai" note in Customize.
 * opts.paymentId — Edit Payment: this payment's own allocations are added back to each
 *   target's remaining balance, and bills this payment already settled in full stay in
 *   the list (pre-ticked via `currentAllocated`). Without this, a bill fully paid by the
 *   payment being edited vanished from the list and its allocation was dropped on save.
 */
async function getAllocationTargets(distributorId, opts = {}) {
  const { paymentDate = null, paymentId = null } = opts;
  const distributor = await prisma.distributor.findUnique({ where: { id: distributorId } });
  if (!distributor) throw new Error('Distributor not found');

  const [openingAllocs, bills] = await Promise.all([
    prisma.paymentAllocation.findMany({
      where: { allocationType: 'opening_balance', payment: { distributorId, isArchived: false } },
      select: { paymentId: true, allocatedAmount: true },
    }),
    prisma.bill.findMany({
      where: { distributorId, billType: 'purchase', status: { not: 'draft' } },
      include: {
        allocations: {
          where: { payment: { isArchived: false } },
          select: { allocatedAmount: true, paymentId: true },
        },
      },
      orderBy: [{ invoiceDate: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  const targets = [];

  const openingSettledByOthers = openingAllocs
    .filter((a) => a.paymentId !== paymentId)
    .reduce((s, a) => s + a.allocatedAmount, 0);
  const openingCurrent = round2(
    openingAllocs.filter((a) => paymentId && a.paymentId === paymentId).reduce((s, a) => s + a.allocatedAmount, 0)
  );
  const openingRemaining = round2(distributor.openingBalance - openingSettledByOthers);
  if (openingRemaining > 0.005 || openingCurrent > 0.005) {
    targets.push({
      allocationType: 'opening_balance',
      billId: null,
      label: 'Opening balance',
      invoiceDate: null,
      remaining: openingRemaining,
      currentAllocated: openingCurrent,
      isComplete: true,
      afterPaymentDate: false,
    });
  }

  for (const bill of bills) {
    const others = bill.allocations.filter((a) => a.paymentId !== paymentId);
    const current = round2(
      bill.allocations.filter((a) => paymentId && a.paymentId === paymentId).reduce((s, a) => s + a.allocatedAmount, 0)
    );
    const { balance } = computeBillStatus({ ...bill, allocations: others });
    if (balance <= 0.005 && current <= 0.005) continue;

    const issues = billDetailIssues(bill);
    targets.push({
      allocationType: 'bill',
      billId: bill.id,
      label: bill.invoiceNumber || `Invoice (${bill.id.slice(-6)})`,
      invoiceNumber: bill.invoiceNumber,
      invoiceDate: bill.invoiceDate,
      dueDate: bill.dueDate,
      createdAt: bill.createdAt,
      grandTotal: bill.grandTotal,
      remaining: balance,
      currentAllocated: current,
      isComplete: bill.status !== 'needs_details' && issues.length === 0,
      needsDetails: bill.status === 'needs_details' || issues.length > 0,
      afterPaymentDate: paymentDate ? isAfterPaymentDate(bill.invoiceDate, paymentDate) : false,
    });
  }

  return sortTargets(targets);
}

function targetsMap(targets) {
  return new Map(targets.map((t) => [targetKey(t), t]));
}

/**
 * The preview the Record/Edit Payment screens show. Same targets + same planFifo the
 * save uses, so preview and save cannot disagree.
 * For Edit (paymentId), `currentAllocations` is what the payment holds right now —
 * the screen opens with that, not with a fresh FIFO plan.
 */
async function previewAllocation(distributorId, { amount, paymentDate, paymentId } = {}) {
  const effectiveDate = paymentDate ? new Date(paymentDate) : clock.now();
  const targets = await getAllocationTargets(distributorId, { paymentDate: effectiveDate, paymentId });
  const amountNum = parseFloat(amount) || 0;
  const fifo = planFifo(amountNum, effectiveDate, targets);

  let currentAllocations = null;
  if (paymentId) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { allocations: { include: { bill: { select: { id: true, invoiceNumber: true, invoiceDate: true } } } } },
    });
    if (payment) {
      currentAllocations = payment.allocations.map((a) => ({
        allocationType: a.allocationType,
        billId: a.billId,
        label:
          a.allocationType === 'opening_balance' ? 'Opening balance'
            : a.allocationType === 'on_account' ? 'On account'
              : a.bill?.invoiceNumber || `Invoice (${(a.billId || '').slice(-6)})`,
        invoiceDate: a.bill?.invoiceDate || null,
        allocatedAmount: a.allocatedAmount,
        afterPaymentDate: a.bill ? isAfterPaymentDate(a.bill.invoiceDate, effectiveDate) : false,
      }));
    }
  }

  return {
    paymentDate: effectiveDate,
    amount: amountNum,
    targets,
    plan: fifo.plan.map((p) => ({ ...p, afterPaymentDate: false })),
    allocations: fifo.allocations,
    onAccount: fifo.onAccount,
    currentAllocations,
  };
}

/**
 * Validate a caller-supplied (Customize) allocation plan against payment amount +
 * target capacity. Bills dated after the payment ARE allowed here — that is how a
 * user adjusts an advance. Only auto-allocation is restricted to earlier bills.
 */
function validateAllocations(amount, allocations, targetsByKey) {
  const sum = round2(allocations.reduce((s, a) => s + a.allocatedAmount, 0));
  if (sum > round2(amount) + 0.005) {
    throw new Error('Allocated amount cannot exceed payment amount');
  }

  for (const a of allocations) {
    if (!(a.allocatedAmount > 0)) {
      throw new Error('Allocation amounts must be positive');
    }
    if (a.allocationType === 'on_account') continue;
    const key = a.allocationType === 'opening_balance' ? 'opening_balance' : a.billId;
    const target = targetsByKey.get(key);
    if (!target) {
      throw new Error('Cannot allocate to a bill that is already paid or does not belong to this distributor');
    }
    if (a.allocatedAmount > target.remaining + 0.005) {
      throw new Error(`Allocation of ${a.allocatedAmount} exceeds remaining balance of ${target.remaining} for ${target.label}`);
    }
  }
}

function normalizeAllocations(allocations) {
  return allocations.map((a) => ({
    allocationType: a.allocationType || (a.billId ? 'bill' : 'on_account'),
    billId: a.allocationType === 'bill' || (!a.allocationType && a.billId) ? a.billId : null,
    allocatedAmount: round2(parseFloat(a.allocatedAmount)),
  }));
}

function paymentInclude() {
  return {
    distributor: { select: { id: true, name: true, phone: true } },
    allocations: { include: { bill: { select: { id: true, invoiceNumber: true, invoiceDate: true } } } },
  };
}

function decoratePayment(payment) {
  if (!payment) return payment;
  return { ...payment, isPostDated: isPostDatedCheque(payment) };
}

/**
 * Flow C — Record Payment.
 * data: { amount, paymentDate, mode, referenceNumber, attachmentPath, attachmentSource, notes,
 *         allocations?: [{ allocationType, billId, allocatedAmount }], force?: boolean }
 * allocations omitted -> FIFO (planFifo, identical to the preview).
 * allocations [] -> "Adjust later": nothing allocated.
 */
async function recordPayment(userId, distributorId, data) {
  const {
    amount,
    paymentDate,
    mode,
    referenceNumber,
    attachmentPath,
    attachmentSource,
    notes,
    allocations,
    force,
    // From a scanned UPI screenshot (paymentScreenshotService)
    transactionId,
    payeeName,
    payeeUpiId,
    paymentApp,
  } = data;

  if (!amount || amount <= 0) {
    throw new Error('Payment amount is required and must be positive');
  }
  if (mode && !VALID_MODES.includes(mode)) {
    throw new Error(`Invalid payment mode. Must be one of: ${VALID_MODES.join(', ')}`);
  }

  await assertDistributorOwnedByUser(userId, distributorId);

  const effectiveDate = paymentDate ? new Date(paymentDate) : clock.now();
  if (isNaN(effectiveDate.getTime())) throw new Error('Invalid payment date');
  const effectiveMode = mode || 'cash';

  const dateCheck = validatePaymentDate(effectiveMode, effectiveDate);
  if (dateCheck.error) {
    throw fail(400, dateCheck.error.code, dateCheck.error.message, { field: 'paymentDate' });
  }

  // A UPI transaction id is unique per user (schema constraint) — the same screenshot
  // shared twice is a hard duplicate. If the earlier one was archived, offer to bring
  // it back instead of a dead-end "already recorded".
  const txnId = transactionId ? String(transactionId).replace(/\s+/g, '') : null;
  if (txnId) {
    const sameTxn = await prisma.payment.findFirst({
      where: { userId, transactionId: txnId },
      select: { id: true, isArchived: true, amount: true, paymentDate: true, distributor: { select: { name: true } } },
    });
    if (sameTxn?.isArchived) {
      throw fail(409, 'ARCHIVED_DUPLICATE_TRANSACTION', 'Ye payment archive me hai, wapas laayein?', {
        existingPaymentId: sameTxn.id,
        existingPayment: sameTxn,
      });
    }
    if (sameTxn) {
      throw fail(
        409,
        'DUPLICATE_TRANSACTION',
        `This transaction (${txnId}) is already recorded${sameTxn.distributor ? ` for ${sameTxn.distributor.name}` : ''}`,
        { existingPaymentId: sameTxn.id }
      );
    }
  }

  // Duplicate guard: warn, don't block
  let duplicateWarning = false;
  if (!force) {
    const dayKey = istDayKey(effectiveDate);
    const dayStart = new Date(new Date(`${dayKey}T00:00:00.000Z`).getTime() - IST_OFFSET_MS);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1);
    const existing = await prisma.payment.findFirst({
      where: {
        distributorId,
        amount: parseFloat(amount),
        isArchived: false,
        paymentDate: { gte: dayStart, lte: dayEnd },
      },
    });
    duplicateWarning = !!existing;
  }

  const targets = await getAllocationTargets(distributorId, { paymentDate: effectiveDate });

  let plan;
  if (allocations === undefined || allocations === null) {
    plan = planFifo(amount, effectiveDate, targets).allocations;
  } else if (Array.isArray(allocations) && allocations.length === 0) {
    plan = []; // "Adjust later"
  } else {
    plan = normalizeAllocations(allocations);
    validateAllocations(amount, plan, targetsMap(targets));
  }

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        userId,
        distributorId,
        amount: parseFloat(amount),
        paymentMethod: effectiveMode,
        paymentDate: effectiveDate,
        paymentStatus: 'success',
        referenceNumber: referenceNumber?.trim() || txnId || null,
        screenshotPath: attachmentPath || null,
        attachmentSource: attachmentSource || null,
        notes: notes?.trim() || null,
        transactionId: txnId,
        payeeName: payeeName?.trim() || null,
        payeeUpiId: payeeUpiId?.trim().toLowerCase() || null,
        paymentApp: paymentApp || null,
      },
    });

    if (plan.length > 0) {
      await tx.paymentAllocation.createMany({
        data: plan.map((a) => ({
          paymentId: created.id,
          billId: a.billId || null,
          allocationType: a.allocationType,
          allocatedAmount: round2(a.allocatedAmount),
        })),
      });
    }

    return tx.payment.findUnique({ where: { id: created.id }, include: paymentInclude() });
  });

  return { payment: decoratePayment(payment), duplicateWarning };
}

/**
 * Edit a payment.
 * allocations omitted -> the payment keeps exactly the allocation it has now (the
 *   Edit screen opens showing that allocation, so "save without changes" changes nothing).
 * allocations [...]   -> replaces the allocation; this payment's own bills are valid
 *   targets even if they are fully paid by it.
 */
async function updatePayment(paymentId, data) {
  const existing = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { allocations: true },
  });
  if (!existing) throw new Error('Payment not found');

  const { amount, paymentDate, mode, referenceNumber, attachmentPath, attachmentSource, notes, allocations } = data;

  const newAmount = amount !== undefined ? parseFloat(amount) : existing.amount;
  if (!(newAmount > 0)) throw new Error('Payment amount is required and must be positive');
  if (mode !== undefined && !VALID_MODES.includes(mode)) {
    throw new Error(`Invalid payment mode. Must be one of: ${VALID_MODES.join(', ')}`);
  }
  const newDate = paymentDate !== undefined && paymentDate !== null ? new Date(paymentDate) : existing.paymentDate;
  if (newDate && isNaN(new Date(newDate).getTime())) throw new Error('Invalid payment date');
  const newMode = mode !== undefined ? mode : existing.paymentMethod;

  // Only re-check the date rule when the date or mode is actually being changed, so an
  // old record is never locked out of a notes edit.
  if (paymentDate !== undefined || mode !== undefined) {
    const dateCheck = validatePaymentDate(newMode, newDate);
    if (dateCheck.error) {
      throw fail(400, dateCheck.error.code, dateCheck.error.message, { field: 'paymentDate' });
    }
  }

  const billAllocated = round2(
    existing.allocations
      .filter((a) => BILL_ALLOCATION_TYPES.includes(a.allocationType))
      .reduce((s, a) => s + a.allocatedAmount, 0)
  );

  if (newAmount < billAllocated - 0.005 && (allocations === undefined || allocations === null)) {
    throw new Error('New amount is less than the allocated total. Provide an updated allocation plan.');
  }

  let plan = null;
  if (Array.isArray(allocations)) {
    plan = normalizeAllocations(allocations);
    if (plan.length > 0) {
      const targets = await getAllocationTargets(existing.distributorId, { paymentDate: newDate, paymentId });
      validateAllocations(newAmount, plan, targetsMap(targets));
    }
  }

  const payment = await prisma.$transaction(async (tx) => {
    const updateData = {};
    if (amount !== undefined) updateData.amount = newAmount;
    if (paymentDate !== undefined) updateData.paymentDate = newDate;
    if (mode !== undefined) updateData.paymentMethod = mode;
    if (referenceNumber !== undefined) updateData.referenceNumber = referenceNumber?.trim() || null;
    if (attachmentPath !== undefined) updateData.screenshotPath = attachmentPath || null;
    if (attachmentSource !== undefined) updateData.attachmentSource = attachmentSource || null;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;

    await tx.payment.update({ where: { id: paymentId }, data: updateData });

    if (plan) {
      await tx.paymentAllocation.deleteMany({ where: { paymentId } });
      if (plan.length > 0) {
        await tx.paymentAllocation.createMany({
          data: plan.map((a) => ({
            paymentId,
            billId: a.billId || null,
            allocationType: a.allocationType,
            allocatedAmount: round2(a.allocatedAmount),
          })),
        });
      }
    } else if (amount !== undefined && Math.abs(newAmount - existing.amount) > 0.005) {
      // Amount changed but allocation kept: keep the on-account row equal to what is left.
      const onAccountRows = existing.allocations.filter((a) => a.allocationType === 'on_account');
      if (onAccountRows.length > 0) {
        await tx.paymentAllocation.deleteMany({ where: { paymentId, allocationType: 'on_account' } });
        const left = round2(newAmount - billAllocated);
        if (left > 0.005) {
          await tx.paymentAllocation.create({
            data: { paymentId, billId: null, allocationType: 'on_account', allocatedAmount: left },
          });
        }
      }
    }

    return tx.payment.findUnique({ where: { id: paymentId }, include: paymentInclude() });
  });

  return decoratePayment(payment);
}

/**
 * Archive a payment (business rule: archive, never hard-delete).
 * Allocations are cleared so the freed amount goes back to bill balances immediately.
 */
async function archivePayment(paymentId) {
  return prisma.$transaction(async (tx) => {
    await tx.paymentAllocation.deleteMany({ where: { paymentId } });
    return tx.payment.update({
      where: { id: paymentId },
      data: { isArchived: true, archivedAt: new Date() },
    });
  });
}

/**
 * Restore an archived payment. Its allocations were cleared on archive, so it is
 * re-allocated with the same FIFO rule a new payment gets (bills dated on/before the
 * payment, rest on account). The user can change it from Edit Payment.
 */
async function unarchivePayment(paymentId) {
  const existing = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!existing) throw new Error('Payment not found');
  if (!existing.isArchived) return decoratePayment(existing);

  const targets = existing.distributorId
    ? await getAllocationTargets(existing.distributorId, { paymentDate: existing.paymentDate })
    : [];
  const plan = existing.distributorId ? planFifo(existing.amount, existing.paymentDate, targets).allocations : [];

  const payment = await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: paymentId }, data: { isArchived: false, archivedAt: null } });
    await tx.paymentAllocation.deleteMany({ where: { paymentId } });
    if (plan.length > 0) {
      await tx.paymentAllocation.createMany({
        data: plan.map((a) => ({ paymentId, billId: a.billId, allocationType: a.allocationType, allocatedAmount: a.allocatedAmount })),
      });
    }
    return tx.payment.findUnique({ where: { id: paymentId }, include: paymentInclude() });
  });
  return decoratePayment(payment);
}

// ============================================================================
// ON-ACCOUNT (advance) MONEY
// ============================================================================

/**
 * Money paid to a distributor that is not sitting on any bill or the opening balance:
 * explicit "on account" remainders plus "Adjust later" payments. Oldest payment first.
 */
async function getOnAccountSources(distributorId) {
  const payments = await prisma.payment.findMany({
    where: { distributorId, isArchived: false },
    include: { allocations: true },
    orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }],
  });
  return payments
    .map((p) => {
      const used = p.allocations
        .filter((a) => BILL_ALLOCATION_TYPES.includes(a.allocationType))
        .reduce((s, a) => s + a.allocatedAmount, 0);
      return { payment: p, available: round2(p.amount - used) };
    })
    .filter((s) => s.available > 0.005);
}

async function getOnAccountBalance(distributorId) {
  const sources = await getOnAccountSources(distributorId);
  return round2(sources.reduce((s, x) => s + x.available, 0));
}

async function getBillBalance(billId) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: {
      distributor: { select: { id: true, name: true } },
      allocations: { where: { payment: { isArchived: false } }, select: { allocatedAmount: true } },
    },
  });
  if (!bill) return null;
  return computeBillStatus(bill);
}

/**
 * Called after a bill is saved or its missing details are filled in. Never moves money:
 * it only tells the app to ASK "₹X advance pada hai, is bill me adjust karein?".
 * Returns null when there is nothing to ask.
 */
async function buildOnAccountPrompt(billId) {
  const bill = await getBillBalance(billId);
  if (!bill || bill.billType !== 'purchase' || !bill.distributorId) return null;
  if (bill.status === 'needs_details' || bill.status === 'draft') return null;
  if (bill.balance <= 0.005) return null;

  const available = await getOnAccountBalance(bill.distributorId);
  if (available <= 0.005) return null;

  const adjustable = round2(Math.min(available, bill.balance));
  return {
    billId: bill.id,
    invoiceNumber: bill.invoiceNumber,
    invoiceDate: bill.invoiceDate,
    distributorId: bill.distributorId,
    distributorName: bill.distributor?.name || null,
    onAccountAvailable: available,
    billBalance: bill.balance,
    adjustableAmount: adjustable,
    message: `₹${available.toLocaleString('en-IN', { maximumFractionDigits: 2 })} advance pada hai, is bill me adjust karein?`,
  };
}

/**
 * The user said "Haan" — move on-account money (oldest payment first) onto this bill.
 * Each payment's "on account" row shrinks by what was moved.
 */
async function applyOnAccountToBill(billId, { amount } = {}) {
  const bill = await getBillBalance(billId);
  if (!bill) throw new Error('Bill not found');
  if (!bill.distributorId) throw new Error('Bill has no distributor');
  if (bill.balance <= 0.005) throw fail(400, 'BILL_ALREADY_PAID', 'Bill is already paid');

  const sources = await getOnAccountSources(bill.distributorId);
  const totalAvailable = round2(sources.reduce((s, x) => s + x.available, 0));
  if (totalAvailable <= 0.005) throw fail(400, 'NO_ON_ACCOUNT', 'No on-account money for this distributor');

  let want = round2(Math.min(bill.balance, totalAvailable, amount !== undefined ? parseFloat(amount) : Infinity));
  if (!(want > 0)) throw new Error('Amount must be positive');

  const moves = [];
  for (const s of sources) {
    if (want <= 0.005) break;
    const take = round2(Math.min(want, s.available));
    moves.push({ payment: s.payment, take });
    want = round2(want - take);
  }

  await prisma.$transaction(async (tx) => {
    for (const { payment, take } of moves) {
      const existingRow = payment.allocations.find((a) => a.allocationType === 'bill' && a.billId === billId);
      if (existingRow) {
        await tx.paymentAllocation.update({
          where: { id: existingRow.id },
          data: { allocatedAmount: round2(existingRow.allocatedAmount + take) },
        });
      } else {
        await tx.paymentAllocation.create({
          data: { paymentId: payment.id, billId, allocationType: 'bill', allocatedAmount: take },
        });
      }

      // Shrink the explicit on-account rows by what moved (oldest row first).
      let toRemove = take;
      for (const row of payment.allocations.filter((a) => a.allocationType === 'on_account')) {
        if (toRemove <= 0.005) break;
        const cut = round2(Math.min(row.allocatedAmount, toRemove));
        const left = round2(row.allocatedAmount - cut);
        if (left <= 0.005) await tx.paymentAllocation.delete({ where: { id: row.id } });
        else await tx.paymentAllocation.update({ where: { id: row.id }, data: { allocatedAmount: left } });
        toRemove = round2(toRemove - cut);
      }
    }
  });

  const applied = round2(moves.reduce((s, m) => s + m.take, 0));
  return { applied, bill: await getBillBalance(billId), onAccountRemaining: await getOnAccountBalance(bill.distributorId) };
}

/**
 * Section 6 — READ-ONLY report. Every allocation where the bill's invoice date is after
 * the payment's date (IST days). Some are legitimate advance adjustments, so this only
 * lists them; it changes nothing.
 */
async function getLateBillAllocationsReport({ userId } = {}) {
  const rows = await prisma.paymentAllocation.findMany({
    where: {
      allocationType: 'bill',
      billId: { not: null },
      payment: { isArchived: false, ...(userId ? { userId } : {}) },
    },
    include: {
      payment: {
        select: {
          id: true, userId: true, amount: true, paymentDate: true, paymentMethod: true, referenceNumber: true,
          distributor: { select: { id: true, name: true } },
        },
      },
      bill: { select: { id: true, invoiceNumber: true, invoiceDate: true, grandTotal: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return rows
    .filter((r) => r.bill && isAfterPaymentDate(r.bill.invoiceDate, r.payment.paymentDate))
    .map((r) => ({
      allocationId: r.id,
      userId: r.payment.userId,
      distributorId: r.payment.distributor?.id || null,
      distributorName: r.payment.distributor?.name || null,
      paymentId: r.payment.id,
      paymentDate: istDayKey(r.payment.paymentDate),
      paymentMethod: r.payment.paymentMethod,
      paymentAmount: r.payment.amount,
      paymentReference: r.payment.referenceNumber,
      billId: r.bill.id,
      invoiceNumber: r.bill.invoiceNumber,
      invoiceDate: istDayKey(r.bill.invoiceDate),
      billTotal: r.bill.grandTotal,
      allocatedAmount: r.allocatedAmount,
      allocatedAt: r.createdAt,
    }))
    .sort((a, b) =>
      (a.distributorName || '').localeCompare(b.distributorName || '') || (a.paymentDate < b.paymentDate ? -1 : 1)
    );
}

async function getArchivedPayments(userId) {
  return prisma.payment.findMany({
    where: { userId, isArchived: true },
    include: { distributor: { select: { id: true, name: true } } },
    orderBy: { archivedAt: 'desc' },
  });
}

/**
 * Editable opening balance, with an audit note (business rule: editable with audit note).
 */
async function updateOpeningBalance(distributorId, { openingBalance, note }) {
  if (openingBalance === undefined || isNaN(openingBalance) || openingBalance < 0) {
    throw new Error('openingBalance must be a non-negative number');
  }

  return prisma.distributor.update({
    where: { id: distributorId },
    data: {
      openingBalance: parseFloat(openingBalance),
      openingBalanceNote: note?.trim() || null,
      openingBalanceUpdatedAt: new Date(),
    },
  });
}

/**
 * Home screen alert: total overdue across all distributors, and the distributor count.
 */
async function getOverdueAlert(userId) {
  const { distributors, totalOverdue } = await getLedgerSummary(userId);
  const distributorsWithOverdue = distributors.filter((d) => d.overdue > 0.005).length;
  return { totalOverdue, distributorsWithOverdue };
}

module.exports = {
  VALID_MODES,
  getLedgerSummary,
  getDistributorLedger,
  getAllocationTargets,
  previewAllocation,
  recordPayment,
  updatePayment,
  archivePayment,
  unarchivePayment,
  getArchivedPayments,
  updateOpeningBalance,
  getOverdueAlert,
  getOnAccountBalance,
  buildOnAccountPrompt,
  applyOnAccountToBill,
  getLateBillAllocationsReport,
};
