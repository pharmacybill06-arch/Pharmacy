const prisma = require('../models/prisma');

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
function computeBillStatus(bill, today = new Date()) {
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

  const isOverdue = balance > 0.005 && bill.dueDate && new Date(bill.dueDate) < today;
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

  const today = new Date();

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

  const today = new Date();

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
          include: { bill: { select: { id: true, invoiceNumber: true } } },
        },
      },
      orderBy: { paymentDate: 'asc' },
    }),
  ]);

  const billsWithStatus = bills.map((b) => computeBillStatus(b, today));

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

  return {
    distributor: {
      ...distributor,
      outstanding,
      overdue,
      openingBalanceRemaining,
    },
    bills: billsWithStatus,
    payments,
    ledgerRows,
  };
}

/**
 * Flow C, step 5 — the allocation list: opening balance (if any remains) first,
 * then unpaid/partial bills oldest-first, each with its remaining balance.
 */
async function getAllocationTargets(distributorId) {
  const distributor = await prisma.distributor.findUnique({ where: { id: distributorId } });
  if (!distributor) throw new Error('Distributor not found');

  const openingBalanceSettled = await getOpeningBalanceSettled(distributorId);
  const openingBalanceRemaining = round2(distributor.openingBalance - openingBalanceSettled);

  const bills = await prisma.bill.findMany({
    where: { distributorId, billType: 'purchase' },
    include: {
      allocations: {
        where: { payment: { isArchived: false } },
        select: { allocatedAmount: true },
      },
    },
    orderBy: [{ invoiceDate: 'asc' }, { createdAt: 'asc' }],
  });

  const targets = [];

  if (openingBalanceRemaining > 0.005) {
    targets.push({
      allocationType: 'opening_balance',
      billId: null,
      label: 'Opening balance',
      remaining: openingBalanceRemaining,
    });
  }

  for (const bill of bills) {
    const { balance, status } = computeBillStatus(bill);
    if (status === 'paid') continue;
    targets.push({
      allocationType: 'bill',
      billId: bill.id,
      label: bill.invoiceNumber || `Invoice (${bill.id.slice(-6)})`,
      invoiceDate: bill.invoiceDate,
      dueDate: bill.dueDate,
      remaining: balance,
    });
  }

  return targets;
}

/**
 * FIFO auto-allocation: opening balance first, then bills oldest-first,
 * until the payment amount is exhausted. Remainder -> on_account.
 */
function autoAllocateFifo(amount, targets) {
  let remaining = round2(amount);
  const allocations = [];

  for (const target of targets) {
    if (remaining <= 0.005) break;
    const take = round2(Math.min(remaining, target.remaining));
    if (take <= 0.005) continue;
    allocations.push({
      allocationType: target.allocationType,
      billId: target.billId,
      allocatedAmount: take,
    });
    remaining = round2(remaining - take);
  }

  if (remaining > 0.005) {
    allocations.push({ allocationType: 'on_account', billId: null, allocatedAmount: remaining });
  }

  return allocations;
}

/**
 * Validate a caller-supplied allocation plan against payment amount + target capacity.
 */
function validateAllocations(amount, allocations, targetsByKey) {
  const sum = round2(allocations.reduce((s, a) => s + a.allocatedAmount, 0));
  if (sum > round2(amount) + 0.005) {
    throw new Error('Allocated amount cannot exceed payment amount');
  }

  for (const a of allocations) {
    if (a.allocatedAmount <= 0) {
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

/**
 * Flow C — Record Payment.
 * data: { amount, paymentDate, mode, referenceNumber, attachmentPath, attachmentSource, notes,
 *         allocations?: [{ allocationType, billId, allocatedAmount }], autoAllocate?: boolean, force?: boolean }
 * If allocations is omitted and autoAllocate is not explicitly false, FIFO auto-allocation runs.
 * Passing an empty allocations array ("Adjust later") skips allocation entirely.
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
  } = data;

  if (!amount || amount <= 0) {
    throw new Error('Payment amount is required and must be positive');
  }
  if (mode && !VALID_MODES.includes(mode)) {
    throw new Error(`Invalid payment mode. Must be one of: ${VALID_MODES.join(', ')}`);
  }

  await assertDistributorOwnedByUser(userId, distributorId);

  const effectiveDate = paymentDate ? new Date(paymentDate) : new Date();

  // Duplicate guard: warn, don't block
  let duplicateWarning = false;
  if (!force) {
    const dayStart = new Date(effectiveDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(effectiveDate);
    dayEnd.setHours(23, 59, 59, 999);

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

  const targets = await getAllocationTargets(distributorId);
  const targetsByKey = new Map(
    targets.map((t) => [t.allocationType === 'opening_balance' ? 'opening_balance' : t.billId, t])
  );

  let plan;
  if (allocations === undefined) {
    plan = autoAllocateFifo(amount, targets);
  } else if (Array.isArray(allocations) && allocations.length === 0) {
    plan = []; // "Adjust later"
  } else {
    validateAllocations(amount, allocations, targetsByKey);
    plan = allocations;
  }

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        userId,
        distributorId,
        amount: parseFloat(amount),
        paymentMethod: mode || 'cash',
        paymentDate: effectiveDate,
        paymentStatus: 'success',
        referenceNumber: referenceNumber?.trim() || null,
        screenshotPath: attachmentPath || null,
        attachmentSource: attachmentSource || null,
        notes: notes?.trim() || null,
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

    return tx.payment.findUnique({
      where: { id: created.id },
      include: {
        distributor: { select: { id: true, name: true, phone: true } },
        allocations: { include: { bill: { select: { id: true, invoiceNumber: true } } } },
      },
    });
  });

  return { payment, duplicateWarning };
}

/**
 * Edit a payment. If reducing amount below its already-allocated total, callers
 * must pass a new `allocations` plan in the same request (re-allocation is forced).
 */
async function updatePayment(paymentId, data) {
  const existing = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { allocations: true },
  });
  if (!existing) throw new Error('Payment not found');

  const { amount, paymentDate, mode, referenceNumber, attachmentPath, attachmentSource, notes, allocations } = data;

  const newAmount = amount !== undefined ? parseFloat(amount) : existing.amount;
  const currentAllocatedTotal = round2(existing.allocations.reduce((s, a) => s + a.allocatedAmount, 0));

  if (newAmount < currentAllocatedTotal - 0.005 && allocations === undefined) {
    throw new Error('New amount is less than the allocated total. Provide an updated allocation plan.');
  }

  return prisma.$transaction(async (tx) => {
    const updateData = {};
    if (amount !== undefined) updateData.amount = newAmount;
    if (paymentDate !== undefined) updateData.paymentDate = new Date(paymentDate);
    if (mode !== undefined) {
      if (!VALID_MODES.includes(mode)) throw new Error(`Invalid payment mode. Must be one of: ${VALID_MODES.join(', ')}`);
      updateData.paymentMethod = mode;
    }
    if (referenceNumber !== undefined) updateData.referenceNumber = referenceNumber?.trim() || null;
    if (attachmentPath !== undefined) updateData.screenshotPath = attachmentPath || null;
    if (attachmentSource !== undefined) updateData.attachmentSource = attachmentSource || null;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;

    await tx.payment.update({ where: { id: paymentId }, data: updateData });

    if (allocations !== undefined) {
      const targets = await getAllocationTargets(existing.distributorId);
      // Allow re-allocating amounts this same payment already holds against its own bills
      const targetsByKey = new Map(
        targets.map((t) => [t.allocationType === 'opening_balance' ? 'opening_balance' : t.billId, t])
      );
      for (const oldAlloc of existing.allocations) {
        const key = oldAlloc.allocationType === 'opening_balance' ? 'opening_balance' : oldAlloc.billId;
        const target = targetsByKey.get(key);
        if (target) target.remaining = round2(target.remaining + oldAlloc.allocatedAmount);
      }

      if (allocations.length > 0) {
        validateAllocations(newAmount, allocations, targetsByKey);
      }

      await tx.paymentAllocation.deleteMany({ where: { paymentId } });
      if (allocations.length > 0) {
        await tx.paymentAllocation.createMany({
          data: allocations.map((a) => ({
            paymentId,
            billId: a.billId || null,
            allocationType: a.allocationType,
            allocatedAmount: round2(a.allocatedAmount),
          })),
        });
      }
    }

    return tx.payment.findUnique({
      where: { id: paymentId },
      include: {
        distributor: { select: { id: true, name: true, phone: true } },
        allocations: { include: { bill: { select: { id: true, invoiceNumber: true } } } },
      },
    });
  });
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

async function unarchivePayment(paymentId) {
  return prisma.payment.update({
    where: { id: paymentId },
    data: { isArchived: false, archivedAt: null },
  });
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
  recordPayment,
  updatePayment,
  archivePayment,
  unarchivePayment,
  getArchivedPayments,
  updateOpeningBalance,
  getOverdueAlert,
};
