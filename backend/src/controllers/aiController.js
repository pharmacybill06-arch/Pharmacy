
const { parseOcrWithGemini, parseImageWithVision } = require('../utils/geminiService');
const { extractTextFromImage } = require('../utils/ocrService');
const {
  normalizeEasyOcr,
  normalizeVision,
  normalizeOcrSpace,
  mergeTokens,
  sortTokens,
  groupTokensByRows,
  detectHeaders,
  assignTokensToColumns
} = require('../utils/ocrNormalizer');
const fs = require('fs');

/**
 * Parse OCR text using AI (text-only fallback)
 */
exports.parseOcr = async (req, res) => {
  try {
    const { ocrText } = req.body;

    if (!ocrText) {
      return res.status(400).json({
        success: false,
        error: 'OCR text is required'
      });
    }

    console.log('[AIController] Parsing OCR text...');
    const parsedData = await parseOcrWithGemini(ocrText);

    res.json({
      success: true,
      data: parsedData,
      confidence: 0.85
    });
  } catch (error) {
    console.error('[AIController] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to parse OCR text'
    });
  }
};

/**
 * Parse bill image using Vision AI (more accurate)
 * Accepts multipart file upload OR base64 image in JSON body
 */
exports.parseImage = async (req, res) => {
  try {
    let base64Image, mimeType, ocrTextHint;

    if (req.file) {
      // Multipart upload
      const filePath = req.file.path;
      const fileBuffer = fs.readFileSync(filePath);
      base64Image = fileBuffer.toString('base64');
      mimeType = req.file.mimetype;
      ocrTextHint = req.body.ocrText || '';
      // Clean up uploaded file
      try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
    } else if (req.body.imageBase64) {
      // Base64 in JSON body
      base64Image = req.body.imageBase64;
      mimeType = req.body.mimeType || 'image/jpeg';
      ocrTextHint = req.body.ocrText || '';
    } else {
      return res.status(400).json({
        success: false,
        error: 'Image file or base64 image data is required'
      });
    }

    console.log(`[AIController] Parsing bill image with vision AI (${mimeType}, ${Math.round(base64Image.length / 1024)}KB base64)...`);

    // Compress image for better accuracy and faster processing
    try {
      const sharp = require('sharp');
      const imgBuffer = Buffer.from(base64Image, 'base64');
      const originalSize = imgBuffer.length;
      const compressed = await sharp(imgBuffer)
        .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      base64Image = compressed.toString('base64');
      mimeType = 'image/jpeg';
      console.log(`[AIController] Vision image compressed: ${Math.round(originalSize/1024)}KB → ${Math.round(compressed.length/1024)}KB`);
    } catch (compressErr) {
      console.warn('[AIController] Image compression failed, using original:', compressErr.message);
    }

    // Call vision API and get raw annotation output (simulate for now)
    // TODO: Replace with actual vision API output if available
    const parsedData = await parseImageWithVision(base64Image, mimeType, ocrTextHint);

    // If you have raw Google Vision output, normalize it here
    // Example: const visionTokens = normalizeVision(visionAnnotations);
    // For now, just return parsedData as before

    res.json({
      success: true,
      data: parsedData,
      // tokens: visionTokens, // Uncomment if you have raw tokens
      confidence: 0.95,
      method: 'vision'
    });
  } catch (error) {
    console.error('[AIController] Vision parse error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to parse bill image'
    });
  }
};

/**
 * OCR an image using OCR.space (high-accuracy cloud OCR)
 * Then optionally parse with AI
 */
exports.ocrImage = async (req, res) => {
  try {
    let imageBuffer, mimeType;

    if (req.file) {
      const filePath = req.file.path;
      imageBuffer = fs.readFileSync(filePath);
      mimeType = req.file.mimetype;
      try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
    } else if (req.body.imageBase64) {
      imageBuffer = req.body.imageBase64; // already base64
      mimeType = req.body.mimeType || 'image/jpeg';
    } else {
      return res.status(400).json({
        success: false,
        error: 'Image file or base64 data is required'
      });
    }

    // Compress image if it's a Buffer (file upload) to avoid OCR.space timeout
    if (Buffer.isBuffer(imageBuffer)) {
      try {
        const sharp = require('sharp');
        const originalSize = imageBuffer.length;
        imageBuffer = await sharp(imageBuffer)
          .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        mimeType = 'image/jpeg';
        console.log(`[AIController] Compressed image: ${Math.round(originalSize/1024)}KB → ${Math.round(imageBuffer.length/1024)}KB`);
      } catch (compressErr) {
        console.warn('[AIController] Image compression failed, using original:', compressErr.message);
      }
    }

    console.log('[AIController] Running OCR.space on image...');
    const ocrResult = await extractTextFromImage(imageBuffer, mimeType);

    // If OCR.space returns words with coordinates, normalize them
    let tokens = [];
    if (ocrResult.words) {
      tokens = normalizeOcrSpace(ocrResult.words);
    }

    // If parseWithAI flag is set, also parse the OCR text with AI
    const shouldParse = req.body.parseWithAI === 'true' || req.body.parseWithAI === true;
    if (shouldParse && ocrResult.text.length > 10) {
      console.log('[AIController] OCR done, now parsing with AI...');
      const parsedData = await parseOcrWithGemini(ocrResult.text);
      return res.json({
        success: true,
        ocrText: ocrResult.text,
        data: parsedData,
        tokens,
        confidence: ocrResult.confidence,
        method: 'ocr+ai'
      });
    }

    res.json({
      success: true,
      ocrText: ocrResult.text,
      tokens,
      confidence: ocrResult.confidence,
      method: 'ocr'
    });
  } catch (error) {
    console.error('[AIController] OCR error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'OCR failed'
    });
  }
};

/**
 * Get medicine details (salt and manufacturer) via AI
 */
exports.getMedicineDetails = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, error: 'Medicine name is required' });
    }

    const { fetchMedicineDetails } = require('../utils/geminiService');
    const details = await fetchMedicineDetails(name);

    res.json({ success: true, data: details });
  } catch (error) {
    console.error('[AIController] getMedicineDetails error:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch details' });
  }
};
