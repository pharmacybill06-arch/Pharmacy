/**
 * ============================================================================
 * PHARMACY BILL APP - EXPRESS SERVER
 * ============================================================================
 * 
 * Backend API server for parsing OCR text using Google Gemini API.
 * Provides /api/parse-ocr endpoint for the mobile app.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { parseInvoiceOCR } = require('./gemini-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Pharmacy Bill Parser API' });
});

/**
 * POST /api/parse-ocr
 * 
 * Parses OCR text using Google Gemini API
 * 
 * Request:
 * {
 *   "ocrText": "raw OCR text from bill image"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": { BillFormData structure },
 *   "confidence": {
 *     "overall": 0.85,
 *     "itemsNeedingReview": 2
 *   }
 * }
 */
app.post('/api/parse-ocr', async (req, res) => {
  try {
    const { ocrText } = req.body;

    if (!ocrText || typeof ocrText !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid ocrText field',
      });
    }

    if (ocrText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'OCR text is empty',
      });
    }

    // Parse using Gemini
    const parsedData = await parseInvoiceOCR(ocrText);

    // Calculate confidence metrics
    const itemsNeedingReview = parsedData.items.filter(
      (item) => item.needsReview === true
    ).length;
    
    const confidence = {
      overall: calculateConfidence(parsedData, itemsNeedingReview),
      itemsNeedingReview,
      totalItems: parsedData.items.length,
    };

    res.json({
      success: true,
      data: parsedData,
      confidence,
    });
  } catch (error) {
    console.error('Parse OCR error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to parse OCR text',
    });
  }
});

/**
 * Calculate overall confidence score
 * @param {Object} parsedData - Parsed bill data
 * @param {number} itemsNeedingReview - Count of items with needsReview flag
 * @returns {number} - Confidence score 0-1
 */
function calculateConfidence(parsedData, itemsNeedingReview) {
  let score = 1.0;

  // Penalty for missing header fields
  const headerFields = ['pharmacyName', 'invoiceNumber', 'invoiceDate'];
  const missingHeaders = headerFields.filter((field) => !parsedData[field]).length;
  score -= missingHeaders * 0.1;

  // Penalty for items needing review
  if (parsedData.items.length > 0) {
    const reviewRate = itemsNeedingReview / parsedData.items.length;
    score -= reviewRate * 0.2;
  }

  // Penalty for missing item details (quantity, rate)
  const itemsWithMissingDetails = parsedData.items.filter(
    (item) => !item.quantity || !item.rate
  ).length;
  if (parsedData.items.length > 0) {
    score -= (itemsWithMissingDetails / parsedData.items.length) * 0.15;
  }

  // Ensure score is between 0 and 1
  return Math.max(0, Math.min(1, score));
}

/**
 * Error handling middleware
 */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Pharmacy Bill Parser API running on http://localhost:${PORT}`);
  console.log(`Health check: GET http://localhost:${PORT}/health`);
  console.log(`Parse OCR: POST http://localhost:${PORT}/api/parse-ocr`);
});

module.exports = app;
