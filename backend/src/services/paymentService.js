const prisma = require('../models/prisma');

/**
 * Payment Service
 * Handles CRUD operations for UPI payment tracking
 */

/**
 * Create a new payment record
 */
async function createPayment(userId, paymentData) {
  const {
    distributorId,
    transactionId,
    upiRefNumber,
    amount,
    payeeName,
    payeeUpiId,
    payerName,
    payerUpiId,
    paymentApp,
    paymentMethod,
    paymentDate,
    paymentStatus,
    rawSharedText,
    screenshotPath,
    notes,
  } = paymentData;

  if (!amount || amount <= 0) {
    throw new Error('Payment amount is required and must be positive');
  }

  // Check for duplicate transaction ID
  if (transactionId) {
    const existing = await prisma.payment.findFirst({
      where: {
        userId,
        transactionId: transactionId.trim(),
      },
    });

    if (existing) {
      throw new Error(`Payment with transaction ID "${transactionId}" already exists`);
    }
  }

  // If distributorId is provided, verify it belongs to the user
  if (distributorId) {
    const distributor = await prisma.distributor.findFirst({
      where: {
        id: distributorId,
        userId,
        isActive: true,
      },
    });

    if (!distributor) {
      throw new Error('Distributor not found or does not belong to user');
    }
  }

  const payment = await prisma.payment.create({
    data: {
      userId,
      distributorId: distributorId || null,
      transactionId: transactionId?.trim() || null,
      upiRefNumber: upiRefNumber?.trim() || null,
      amount: parseFloat(amount),
      payeeName: payeeName?.trim() || null,
      payeeUpiId: payeeUpiId?.trim() || null,
      payerName: payerName?.trim() || null,
      payerUpiId: payerUpiId?.trim() || null,
      paymentApp: paymentApp?.trim() || null,
      paymentMethod: paymentMethod || 'upi',
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      paymentStatus: paymentStatus || 'success',
      rawSharedText: rawSharedText || null,
      screenshotPath: screenshotPath || null,
      notes: notes?.trim() || null,
    },
    include: {
      distributor: {
        select: {
          id: true,
          name: true,
          phone: true,
          gstin: true,
        },
      },
    },
  });

  return payment;
}

/**
 * Get all payments for a user
 */
async function getPayments(userId, options = {}) {
  const {
    distributorId,
    paymentApp,
    paymentStatus,
    startDate,
    endDate,
    sortBy = 'paymentDate',
    sortOrder = 'desc',
    page = 1,
    limit = 20,
  } = options;

  const where = { userId };

  if (distributorId) {
    where.distributorId = distributorId;
  }
  if (paymentApp) {
    where.paymentApp = paymentApp;
  }
  if (paymentStatus) {
    where.paymentStatus = paymentStatus;
  }
  if (startDate || endDate) {
    where.paymentDate = {};
    if (startDate) where.paymentDate.gte = new Date(startDate);
    if (endDate) where.paymentDate.lte = new Date(endDate);
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        distributor: {
          select: {
            id: true,
            name: true,
            phone: true,
            gstin: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip,
      take: parseInt(limit),
    }),
    prisma.payment.count({ where }),
  ]);

  return {
    payments,
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(total / parseInt(limit)),
  };
}

/**
 * Get a single payment by ID
 */
async function getPaymentById(paymentId) {
  return prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      distributor: {
        select: {
          id: true,
          name: true,
          phone: true,
          gstin: true,
          address: true,
        },
      },
    },
  });
}

/**
 * Get payments for a specific distributor
 */
async function getDistributorPayments(distributorId, options = {}) {
  const {
    page = 1,
    limit = 20,
  } = options;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [payments, total, stats] = await Promise.all([
    prisma.payment.findMany({
      where: { distributorId },
      orderBy: { paymentDate: 'desc' },
      skip,
      take: parseInt(limit),
    }),
    prisma.payment.count({ where: { distributorId } }),
    prisma.payment.aggregate({
      where: { distributorId, paymentStatus: 'success' },
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);

  return {
    payments,
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(total / parseInt(limit)),
    stats: {
      totalPaid: stats._sum.amount || 0,
      totalPayments: stats._count.id || 0,
    },
  };
}

/**
 * Get payment summary/stats for a user
 */
async function getPaymentStats(userId) {
  const [totalStats, byApp, byDistributor, recentPayments] = await Promise.all([
    // Overall stats
    prisma.payment.aggregate({
      where: { userId, paymentStatus: 'success' },
      _sum: { amount: true },
      _count: { id: true },
    }),

    // By payment app
    prisma.payment.groupBy({
      by: ['paymentApp'],
      where: { userId, paymentStatus: 'success' },
      _sum: { amount: true },
      _count: { id: true },
    }),

    // Top distributors by payment
    prisma.payment.groupBy({
      by: ['distributorId'],
      where: { userId, paymentStatus: 'success', distributorId: { not: null } },
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 10,
    }),

    // Recent payments
    prisma.payment.findMany({
      where: { userId },
      include: {
        distributor: {
          select: { id: true, name: true },
        },
      },
      orderBy: { paymentDate: 'desc' },
      take: 5,
    }),
  ]);

  // Resolve distributor names for top distributors
  let topDistributors = [];
  if (byDistributor.length > 0) {
    const distributorIds = byDistributor.map(d => d.distributorId).filter(Boolean);
    const distributors = await prisma.distributor.findMany({
      where: { id: { in: distributorIds } },
      select: { id: true, name: true },
    });
    const distributorMap = Object.fromEntries(distributors.map(d => [d.id, d.name]));

    topDistributors = byDistributor.map(d => ({
      distributorId: d.distributorId,
      distributorName: distributorMap[d.distributorId] || 'Unknown',
      totalPaid: d._sum.amount || 0,
      paymentCount: d._count.id || 0,
    }));
  }

  return {
    totalPaid: totalStats._sum.amount || 0,
    totalPayments: totalStats._count.id || 0,
    byApp: byApp.map(a => ({
      app: a.paymentApp || 'unknown',
      totalPaid: a._sum.amount || 0,
      count: a._count.id || 0,
    })),
    topDistributors,
    recentPayments,
  };
}

/**
 * Update a payment
 */
async function updatePayment(paymentId, updateData) {
  const { distributorId, notes, paymentStatus, paymentDate, amount } = updateData;

  const data = {};
  if (distributorId !== undefined) data.distributorId = distributorId || null;
  if (notes !== undefined) data.notes = notes;
  if (paymentStatus) data.paymentStatus = paymentStatus;
  if (paymentDate) data.paymentDate = new Date(paymentDate);
  if (amount) data.amount = parseFloat(amount);

  return prisma.payment.update({
    where: { id: paymentId },
    data,
    include: {
      distributor: {
        select: {
          id: true,
          name: true,
          phone: true,
          gstin: true,
        },
      },
    },
  });
}

/**
 * Delete a payment
 */
async function deletePayment(paymentId) {
  return prisma.payment.delete({
    where: { id: paymentId },
  });
}

/**
 * Try to auto-match a payee name with existing distributor
 */
async function matchDistributor(userId, payeeName) {
  if (!payeeName) return null;

  const normalizedPayee = payeeName.toLowerCase().replace(/[^a-z0-9]/g, '');

  const distributors = await prisma.distributor.findMany({
    where: { userId, isActive: true },
    select: { id: true, name: true, phone: true, gstin: true },
  });

  // Try exact match first
  let match = distributors.find(d => {
    const normalizedName = d.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalizedName === normalizedPayee;
  });

  if (match) return match;

  // Try partial match (contains)
  match = distributors.find(d => {
    const normalizedName = d.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalizedName.includes(normalizedPayee) || normalizedPayee.includes(normalizedName);
  });

  return match || null;
}

module.exports = {
  createPayment,
  getPayments,
  getPaymentById,
  getDistributorPayments,
  getPaymentStats,
  updatePayment,
  deletePayment,
  matchDistributor,
};
