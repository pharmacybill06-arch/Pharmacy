/**
 * Email Bill Controller
 * Handles API endpoints for Zoho email invoice extraction
 */

const prisma = require('../models/prisma');
const emailInvoiceService = require('../services/emailInvoiceService');

/**
 * POST /api/email-bills/fetch
 * Trigger email fetch + processing from Zoho Mail
 */
exports.fetchAndProcess = async (req, res) => {
  try {
    const { userId, limit } = req.body;

    // Use provided userId or fall back to env default
    const targetUserId = userId || process.env.ZOHO_DEFAULT_USER_ID;

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required. Provide it in the request body or set ZOHO_DEFAULT_USER_ID in .env',
      });
    }

    // Check if Zoho is configured
    if (!process.env.ZOHO_ACCESS_TOKEN) {
      return res.status(400).json({
        success: false,
        error: 'Zoho Mail is not configured. Please set ZOHO_ACCESS_TOKEN in .env',
      });
    }

    // Verify user exists
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
 * List email processing history
 */
exports.getEmailLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
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
 * Get single email processing log detail
 */
exports.getEmailLogById = async (req, res) => {
  try {
    const { logId } = req.params;
    const log = await prisma.emailProcessingLog.findUnique({ where: { id: logId } });

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
 * Retry a failed email processing
 */
exports.retryEmail = async (req, res) => {
  try {
    const { logId } = req.params;
    const { userId } = req.body;
    const targetUserId = userId || process.env.ZOHO_DEFAULT_USER_ID;

    if (!targetUserId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const log = await prisma.emailProcessingLog.findUnique({ where: { id: logId } });
    if (!log) {
      return res.status(404).json({ success: false, error: 'Log not found' });
    }
    if (log.status !== 'failed') {
      return res.status(400).json({ success: false, error: 'Only failed emails can be retried' });
    }

    // Delete old log and re-process
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
