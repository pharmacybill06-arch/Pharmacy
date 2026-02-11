const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

/**
 * POST /api/ai/parse-ocr
 * Parse OCR text using AI (Gemini)
 */
router.post('/parse-ocr', aiController.parseOcr);

module.exports = router;
