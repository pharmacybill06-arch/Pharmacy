const exportService = require('../services/exportService');
const prisma = require('../models/prisma');

/**
 * Export Controller
 * Generates Excel/CSV files on demand and streams them back. Nothing is stored
 * server-side; the app hands the file straight to the native share sheet.
 */

function handleServiceError(res, error, fallback) {
  console.error(fallback, error.message);

  // "0 matching records" is a normal outcome, not a failure — the app shows a
  // message instead of handing the user an empty file.
  if (error.isNoData) {
    return res.status(404).json({ error: error.message, code: 'NO_DATA' });
  }
  if (error.isRowLimit) {
    return res.status(413).json({ error: error.message, code: 'ROW_LIMIT' });
  }
  if (error.message.includes('not found')) {
    return res.status(404).json({ error: error.message });
  }
  if (error.message.includes('Invalid') || error.message.includes('required')) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(500).json({ error: fallback });
}

// POST /api/exports/user/:userId/preview — row count before generating
exports.previewExport = async (req, res) => {
  try {
    const { userId } = req.params;
    const { type, filters = {} } = req.body;
    const result = await exportService.previewExport(userId, type, filters);
    res.json({ message: 'Export preview generated successfully', ...result });
  } catch (error) {
    handleServiceError(res, error, 'Failed to preview export');
  }
};

// POST /api/exports/user/:userId — generate and stream the file
exports.generateExport = async (req, res) => {
  try {
    const { userId } = req.params;
    const { type, filters = {}, format = 'xlsx' } = req.body;

    const { buffer, fileName, mimeType, rowCount } = await exportService.generateExport(
      userId,
      type,
      filters,
      format
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    // Surfaced as headers so the client can report them without parsing the body
    res.setHeader('X-Export-Row-Count', String(rowCount));
    res.setHeader('X-Export-File-Name', fileName);
    // Lets the mobile client read the two headers above on a cross-origin fetch
    res.setHeader('Access-Control-Expose-Headers', 'X-Export-Row-Count, X-Export-File-Name, Content-Disposition');

    res.send(buffer);
  } catch (error) {
    handleServiceError(res, error, 'Failed to generate export');
  }
};

// GET /api/exports/user/:userId/history — recent exports (audit trail)
exports.getExportHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const logs = await prisma.exportLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({ message: 'Export history fetched successfully', total: logs.length, logs });
  } catch (error) {
    handleServiceError(res, error, 'Failed to fetch export history');
  }
};
