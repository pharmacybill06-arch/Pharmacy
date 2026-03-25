/**
 * Email Bill Controller
 * Handles API endpoints for Zoho email invoice extraction
 * Now with smart email browsing and selective processing
 */

const prisma = require('../models/prisma');
const emailInvoiceService = require('../services/emailInvoiceService');
const {
  getUserEmailConnection,
  upsertUserEmailConnection,
  toConnectionSummary,
} = require('../services/emailConnectionService');

/**
 * GET /api/email-bills/inbox
 * List emails from Zoho inbox with smart bill detection
 */
exports.listInbox = async (req, res) => {
  try {
    const { userId, limit = 50, search } = req.query;
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    console.log(`[EmailBill] Listing inbox for user ${userId} (limit: ${limit}, search: ${search || 'none'})`);
    const emails = await emailInvoiceService.listInboxEmails(userId, parseInt(limit), search || null);

    res.json({
      success: true,
      data: emails,
      total: emails.length,
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('[EmailBill] Inbox listing error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list inbox emails',
    });
  }
};

/**
 * POST /api/email-bills/process-selected
 * Process user-selected emails (smart: handles attachments + body text)
 */
exports.processSelected = async (req, res) => {
  try {
    const { userId, emails } = req.body;

    const targetUserId = userId;
    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Please select at least one email to process',
      });
    }

    const validEmails = emails.filter(e => e.messageId && e.folderId);
    if (validEmails.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Selected emails are missing messageId or folderId',
      });
    }

    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: `User ${targetUserId} not found`,
      });
    }

    console.log(`[EmailBill] Processing ${validEmails.length} selected emails for user: ${targetUserId}`);
    const results = await emailInvoiceService.processSelectedEmails(targetUserId, validEmails);

    res.json({
      success: true,
      message: `Processed ${results.processed} emails, created ${results.billsCreated} bills`,
      data: results,
    });
  } catch (error) {
    console.error('[EmailBill] Process selected error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process selected emails',
    });
  }
};

/**
 * POST /api/email-bills/extract
 * Extract bill data from a single email WITHOUT saving to DB.
 * Returns the parsed data so the frontend can show it in the editable bill form.
 * Also checks for duplicates by invoice number.
 */
exports.extractFromEmail = async (req, res) => {
  try {
    const { userId, messageId, folderId } = req.body;

    if (!messageId || !folderId) {
      return res.status(400).json({
        success: false,
        error: 'messageId and folderId are required',
      });
    }

    const targetUserId = userId;
    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    console.log(`[EmailBill] Extracting data from email ${messageId} (extract only, no save)`);
    const result = await emailInvoiceService.extractFromEmail(targetUserId, messageId, folderId);

    // Check for duplicate bill by invoice number
    let duplicateBill = null;
    if (result.parsedData?.invoiceNumber && targetUserId) {
      try {
        const existing = await prisma.bill.findFirst({
          where: {
            userId: targetUserId,
            invoiceNumber: result.parsedData.invoiceNumber,
          },
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            pharmacyName: true,
            grandTotal: true,
            createdAt: true,
          },
        });
        if (existing) {
          duplicateBill = existing;
          console.log(`[EmailBill] ⚠ Duplicate found: Invoice ${existing.invoiceNumber} (Bill ID: ${existing.id})`);
        }
      } catch (dupErr) {
        console.warn('[EmailBill] Duplicate check warning:', dupErr.message);
      }
    }

    res.json({
      success: true,
      data: {
        parsedData: result.parsedData,
        ocrText: result.ocrText,
        source: result.source,
        subject: result.subject,
        sender: result.sender,
        duplicateBill,
      },
    });
  } catch (error) {
    console.error('[EmailBill] Extract error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to extract bill data from email',
    });
  }
};

/**
 * POST /api/email-bills/check-duplicate
 * Check if a bill with the given invoice number already exists
 */
exports.checkDuplicate = async (req, res) => {
  try {
    const { userId, invoiceNumber } = req.body;

    if (!invoiceNumber) {
      return res.json({ success: true, data: { isDuplicate: false } });
    }

    const targetUserId = userId;
    if (!targetUserId) {
      return res.json({ success: true, data: { isDuplicate: false } });
    }

    const existing = await prisma.bill.findFirst({
      where: {
        userId: targetUserId,
        invoiceNumber: invoiceNumber,
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        pharmacyName: true,
        grandTotal: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      data: {
        isDuplicate: !!existing,
        existingBill: existing || null,
      },
    });
  } catch (error) {
    console.error('[EmailBill] Duplicate check error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/email-bills/fetch
 * Legacy: Auto-fetch and process all emails (original behavior)
 */
exports.fetchAndProcess = async (req, res) => {
  try {
    const { userId, limit } = req.body;
    const targetUserId = userId;

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    let user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: `User ${targetUserId} not found`,
      });
    }

    console.log(`[EmailBill] Starting email fetch for user: ${targetUserId}`);
    const results = await emailInvoiceService.fetchAndProcessEmails(targetUserId, limit || 20);

    res.json({
      success: true,
      message: `Processed ${results.emailsProcessed} emails, created ${results.billsCreated} bills`,
      data: results,
    });
  } catch (error) {
    console.error('[EmailBill] Fetch error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch and process emails',
    });
  }
};

/**
 * GET /api/email-bills/logs
 */
exports.getEmailLogs = async (req, res) => {
  try {
    const { userId, page = 1, limit = 50, status } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { userId };
    if (status) where.status = status;

    const [logs, total] = await Promise.all([
      prisma.emailProcessingLog.findMany({
        where,
        orderBy: { processedAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.emailProcessingLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('[EmailBill] Logs error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch email logs',
    });
  }
};

/**
 * GET /api/email-bills/logs/:logId
 */
exports.getEmailLogById = async (req, res) => {
  try {
    const { logId } = req.params;
    const { userId } = req.query;
    const log = await prisma.emailProcessingLog.findFirst({
      where: {
        id: logId,
        ...(userId ? { userId } : {}),
      },
    });

    if (!log) {
      return res.status(404).json({ success: false, error: 'Log not found' });
    }

    res.json({ success: true, data: log });
  } catch (error) {
    console.error('[EmailBill] Log detail error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch log detail' });
  }
};

/**
 * POST /api/email-bills/retry/:logId
 */
exports.retryEmail = async (req, res) => {
  try {
    const { logId } = req.params;
    const { userId } = req.body;
    const targetUserId = userId;

    if (!targetUserId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const log = await prisma.emailProcessingLog.findFirst({
      where: { id: logId, userId: targetUserId },
    });
    if (!log) {
      return res.status(404).json({ success: false, error: 'Log not found' });
    }
    if (log.status !== 'failed') {
      return res.status(400).json({ success: false, error: 'Only failed emails can be retried' });
    }

    await prisma.emailProcessingLog.delete({ where: { id: logId } });
    const results = await emailInvoiceService.fetchAndProcessEmails(targetUserId, 50);

    res.json({
      success: true,
      message: 'Retry completed',
      data: results,
    });
  } catch (error) {
    console.error('[EmailBill] Retry error:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Retry failed' });
  }
};

exports.getConnection = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const connection = await getUserEmailConnection(userId, { allowEnvFallback: true });
    res.json({
      success: true,
      data: toConnectionSummary(connection),
    });
  } catch (error) {
    if (error.message === 'No active email inbox connection found for this user') {
      return res.json({
        success: true,
        data: null,
      });
    }

    res.status(404).json({
      success: false,
      error: error.message || 'Email connection not found',
    });
  }
};

exports.saveConnection = async (req, res) => {
  try {
    const {
      userId,
      provider,
      authType,
      emailAddress,
      displayName,
      password,
      imapHost,
      imapPort,
      imapSecure,
      mailbox,
      isActive,
    } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ success: false, error: `User ${userId} not found` });
    }

    if (!emailAddress || !password) {
      return res.status(400).json({
        success: false,
        error: 'emailAddress and password are required',
      });
    }

    const connection = await upsertUserEmailConnection(userId, {
      provider,
      authType,
      emailAddress,
      displayName,
      password,
      imapHost,
      imapPort,
      imapSecure,
      mailbox,
      folderId: mailbox,
      isActive,
    });

    res.json({
      success: true,
      message: 'Email connection saved',
      data: connection,
    });
  } catch (error) {
    console.error('[EmailBill] Save connection error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save email connection',
    });
  }
};

/**
 * GET /api/email-bills/cache-stats
 * Get cache statistics and performance metrics
 */
exports.getCacheStats = async (req, res) => {
  try {
    const { getCacheStats, cleanupExpiredCache } = require('../utils/cleanupCache');
    
    // Cleanup expired entries first
    await cleanupExpiredCache();
    
    // Get stats
    const stats = await getCacheStats();
    
    if (!stats) {
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve cache statistics',
      });
    }
    
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[EmailBill] Cache stats error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get cache statistics',
    });
  }
};

/**
 * POST /api/email-bills/cleanup-cache
 * Manually trigger cache cleanup
 */
exports.cleanupCache = async (req, res) => {
  try {
    const { cleanupExpiredCache, cleanupOldCache } = require('../utils/cleanupCache');
    
    const expiredCount = await cleanupExpiredCache();
    const oldCount = await cleanupOldCache(60);
    
    res.json({
      success: true,
      message: `Cleaned up ${expiredCount + oldCount} cache entries`,
      data: {
        expiredCount,
        oldCount,
        total: expiredCount + oldCount,
      },
    });
  } catch (error) {
    console.error('[EmailBill] Cache cleanup error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to cleanup cache',
    });
  }
};
