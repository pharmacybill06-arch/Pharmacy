const { parseOcrWithGemini } = require('../utils/geminiService');

/**
 * Parse OCR text using Gemini AI
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
      confidence: 0.95
    });
  } catch (error) {
    console.error('[AIController] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to parse OCR text'
    });
  }
};
