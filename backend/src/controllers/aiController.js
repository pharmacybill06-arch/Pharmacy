
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
const Groq = require('groq-sdk');
const MAX_CONTROLLER_LOG_CHARS = Number(process.env.AI_CONTROLLER_LOG_MAX_CHARS || 12000);

function truncateForLog(value, maxChars = MAX_CONTROLLER_LOG_CHARS) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`;
}

function logOcrHint(source, text) {
  const cleanText = String(text || '').trim();
  if (!cleanText) {
    console.log(`[AIController] ${source} OCR extracted no usable text`);
    return;
  }

  const lineCount = cleanText.split(/\r?\n/).filter((line) => line.trim()).length;
  console.log(`[AIController] ${source} OCR extracted data: ${cleanText.length} chars, ${lineCount} lines`);
  console.log(`[AIController] ${source} OCR text:\n${truncateForLog(cleanText)}`);
}

function logAiResponse(method, parsedData) {
  console.log(`[AIController] ${method} AI filled data:\n${truncateForLog(parsedData)}`);
}

function logTerminalResponse(label, responseBody) {
  console.log(`\n========== ${label} RESPONSE ==========\n${truncateForLog(responseBody)}\n========== END ${label} RESPONSE ==========\n`);
}

async function extractTesseractHint(imageBuffer) {
  try {
    const { createWorker } = require('tesseract.js');
    const worker = await createWorker('eng');
    const { data } = await worker.recognize(imageBuffer);
    await worker.terminate();
    const text = data?.text?.trim() || '';
    if (text.length > 20) {
      console.log(`[AIController] Tesseract OCR hint extracted: ${text.length} chars`);
      logOcrHint('Tesseract', text);
      return text;
    }
  } catch (error) {
    console.warn('[AIController] Tesseract OCR hint failed:', error.message);
  }
  return '';
}

async function extractGoogleVisionHint(imageBuffer) {
  try {
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credentialsPath || !fs.existsSync(credentialsPath)) {
      return '';
    }

    const vision = require('@google-cloud/vision');
    const client = new vision.ImageAnnotatorClient({ keyFilename: credentialsPath });
    const [result] = await client.documentTextDetection({
      image: { content: imageBuffer.toString('base64') },
    });

    const text = result?.fullTextAnnotation?.text?.trim() || '';
    if (text.length > 20) {
      console.log(`[AIController] Google Vision OCR hint extracted: ${text.length} chars`);
      logOcrHint('Google Vision', text);
      return text;
    }
  } catch (error) {
    console.warn('[AIController] Google Vision OCR hint failed:', error.message);
  }
  return '';
}

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
    logOcrHint('Request body', ocrText);
    const parsedData = await parseOcrWithGemini(ocrText);
    logAiResponse('parse-ocr', parsedData);

    const responseBody = {
      success: true,
      data: parsedData,
      confidence: 0.85
    };
    logTerminalResponse('PARSE OCR', responseBody);
    res.json(responseBody);
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
    let base64Image, mimeType, ocrTextHint, sourceBuffer, ocrSourceBuffer;

    if (req.file) {
      // Multipart upload
      const filePath = req.file.path;
      const fileBuffer = fs.readFileSync(filePath);
      sourceBuffer = fileBuffer;
      ocrSourceBuffer = fileBuffer;
      base64Image = fileBuffer.toString('base64');
      mimeType = req.file.mimetype;
      ocrTextHint = req.body.ocrText || '';
      if (ocrTextHint) logOcrHint('Client-provided', ocrTextHint);
      // Clean up uploaded file
      try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
    } else if (req.body.imageBase64) {
      // Base64 in JSON body
      base64Image = req.body.imageBase64;
      sourceBuffer = Buffer.from(base64Image, 'base64');
      ocrSourceBuffer = sourceBuffer;
      mimeType = req.body.mimeType || 'image/jpeg';
      ocrTextHint = req.body.ocrText || '';
      if (ocrTextHint) logOcrHint('Client-provided', ocrTextHint);
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
      sourceBuffer = compressed;
      mimeType = 'image/jpeg';
      console.log(`[AIController] Vision image compressed: ${Math.round(originalSize/1024)}KB → ${Math.round(compressed.length/1024)}KB`);
    } catch (compressErr) {
      console.warn('[AIController] Image compression failed, using original:', compressErr.message);
    }

    if (!ocrTextHint || ocrTextHint.trim().length < 20) {
      const ocrBuffer = ocrSourceBuffer || sourceBuffer || Buffer.from(base64Image, 'base64');
      ocrTextHint = await extractGoogleVisionHint(ocrBuffer);
      if (!ocrTextHint || ocrTextHint.trim().length < 20) {
        ocrTextHint = await extractTesseractHint(ocrBuffer);
      }
    }

    if (ocrTextHint && ocrTextHint.trim().length > 50) {
      try {
        console.log('[AIController] Parsing Tesseract OCR text with AI...');
        const parsedData = await parseOcrWithGemini(ocrTextHint);
        if (parsedData?.items?.length > 0) {
          logAiResponse('tesseract+ai', parsedData);
          const responseBody = {
            success: true,
            data: parsedData,
            ocrText: ocrTextHint,
            confidence: 0.9,
            method: 'tesseract+ai'
          };
          logTerminalResponse('OCR + AI', responseBody);
          return res.json(responseBody);
        }
      } catch (ocrParseErr) {
        console.warn('[AIController] OCR text parse failed, falling back to Vision AI:', ocrParseErr.message);
      }
    }

    const parsedData = await parseImageWithVision(base64Image, mimeType, ocrTextHint);
    logAiResponse('vision', parsedData);

    // If you have raw Google Vision output, normalize it here
    // Example: const visionTokens = normalizeVision(visionAnnotations);
    // For now, just return parsedData as before

    const responseBody = {
      success: true,
      data: parsedData,
      ocrText: ocrTextHint,
      // tokens: visionTokens, // Uncomment if you have raw tokens
      confidence: 0.95,
      method: 'vision'
    };
    logTerminalResponse('VISION OCR + AI', responseBody);
    res.json(responseBody);
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
    logOcrHint('OCR.space', ocrResult.text);

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
      logAiResponse('ocr+ai', parsedData);
      const responseBody = {
        success: true,
        ocrText: ocrResult.text,
        data: parsedData,
        tokens,
        confidence: ocrResult.confidence,
        method: 'ocr+ai'
      };
      logTerminalResponse('OCR.SPACE + AI', responseBody);
      return res.json(responseBody);
    }

    const responseBody = {
      success: true,
      ocrText: ocrResult.text,
      tokens,
      confidence: ocrResult.confidence,
      method: 'ocr'
    };
    logTerminalResponse('OCR.SPACE', responseBody);
    res.json(responseBody);
  } catch (error) {
    console.error('[AIController] OCR error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'OCR failed'
    });
  }
};

/**
 * Get medicine details like salt and manufacturer from AI.
 * POST /api/ai/medicine-details
 * Body: { name }
 */
exports.getMedicineDetails = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        error: 'Medicine name is required',
      });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({
        success: false,
        error: 'AI service not configured',
      });
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const medicineName = String(name).trim();

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Return only valid JSON with medicine metadata.',
        },
        {
          role: 'user',
          content: `For the medicine "${medicineName}", return JSON in this exact shape:
{
  "salt": string|null,
  "manufacturer": string|null
}

If uncertain, use null values.`,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(text);

    res.json({
      success: true,
      data: {
        salt: parsed.salt || null,
        manufacturer: parsed.manufacturer || null,
      },
    });
  } catch (error) {
    console.error('[AIController] Medicine details error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch medicine details',
    });
  }
};
