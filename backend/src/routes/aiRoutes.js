const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const upload = require('../config/multer');

/**
 * POST /api/ai/parse-ocr
 * Parse OCR text using AI (text-only, fallback)
 */
router.post('/parse-ocr', aiController.parseOcr);

/**
 * POST /api/ai/parse-image
 * Parse bill image using Vision AI (more accurate)
 * Accepts: multipart file upload (field: 'image') or JSON { imageBase64, mimeType, ocrText }
 */
router.post('/parse-image', upload.single('image'), aiController.parseImage);

/**
 * POST /api/ai/ocr
 * High-accuracy OCR using OCR.space API
 * Accepts: multipart file upload (field: 'image')
 * Optional: parseWithAI=true to also parse OCR text with AI
 */
router.post('/ocr', upload.single('image'), aiController.ocrImage);

/**
 * POST /api/ai/medicine-details
 * Get medicine salt and manufacturer via AI
 */
router.post('/medicine-details', aiController.getMedicineDetails);

module.exports = router;
