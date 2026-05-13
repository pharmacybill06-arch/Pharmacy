/**
 * OCR Service using OCR.space API
 * Free tier: 25,000 requests/month, very accurate with printed text
 * Supports Indian pharmacy bills with table detection
 */

const https = require('https');
const API_URL = 'https://api.ocr.space/parse/image';
const MAX_OCR_LOG_CHARS = Number(process.env.OCR_LOG_MAX_CHARS || 12000);

/**
 * Make a POST request using Node.js https module (more reliable than fetch for large payloads)
 */
function postFormData(url, formBody, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = formBody;

    const req = https.request({
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: { raw: data } });
        }
      });
    });

    req.on('error', (e) => reject(new Error(`Network error: ${e.message} (${e.code || 'unknown'})`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out after ' + (timeoutMs/1000) + 's')); });
    req.write(postData);
    req.end();
  });
}

/**
 * Estimate base64 byte size
 */
function estimateBase64Bytes(base64Str) {
  return Math.ceil(base64Str.length * 3 / 4);
}

function truncateForLog(value, maxChars = MAX_OCR_LOG_CHARS) {
  const text = String(value || '');
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`;
}

function logOcrExtraction({ engine, text, confidence, words = [] }) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  console.log(`[OCRService] ${engine} extracted data summary: ${text.length} chars, ${lines.length} lines, ${words.length} words, confidence: ${confidence || 0}`);
  console.log(`[OCRService] ${engine} extracted text:\n${truncateForLog(text)}`);

  if (words.length > 0) {
    console.log(`[OCRService] ${engine} word sample: ${JSON.stringify(words.slice(0, 30))}`);
  }
}

/**
 * Extract text from image using OCR.space API
 * @param {Buffer|string} imageData - Image buffer or base64 string
 * @param {string} mimeType - Image MIME type
 * @returns {Promise<{text: string, confidence: number}>}
 */
async function extractTextFromImage(imageData, mimeType = 'image/jpeg') {
  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) {
    throw new Error('OCR.space is not configured. Set OCR_SPACE_API_KEY or use the Vision AI parser.');
  }

  // Convert buffer to base64 if needed
  let base64Data;
  if (Buffer.isBuffer(imageData)) {
    base64Data = imageData.toString('base64');
  } else {
    base64Data = imageData;
  }

  const imageSizeKB = Math.round(estimateBase64Bytes(base64Data) / 1024);
  console.log(`[OCRService] Image size: ~${imageSizeKB}KB`);

  if (imageSizeKB > 1024) {
    console.warn('[OCRService] ⚠ Image exceeds 1MB — may timeout on free tier. Consider compressing.');
  }

  const dataUri = `data:${mimeType};base64,${base64Data}`;

  console.log('[OCRService] Sending image to OCR.space API (Engine 2)...');

  try {
    const formData = new URLSearchParams();
    formData.append('base64Image', dataUri);
    formData.append('apikey', apiKey);
    formData.append('language', 'eng');
    formData.append('isTable', 'true');
    formData.append('OCREngine', '2');
    formData.append('scale', 'true');
    formData.append('detectOrientation', 'true');
    formData.append('filetype', mimeType.includes('png') ? 'PNG' : 'JPG');

    const { status, data: result } = await postFormData(API_URL, formData.toString(), 60000);

    if (status !== 200) {
      throw new Error(`OCR.space API error: ${status} ${JSON.stringify(result)}`);
    }

    if (result.IsErroredOnProcessing) {
      const errorMsg = result.ErrorMessage?.join(', ') || 'Unknown OCR error';
      throw new Error(`OCR processing error: ${errorMsg}`);
    }

    if (!result.ParsedResults || result.ParsedResults.length === 0) {
      throw new Error('No text extracted from image');
    }

    const parsedResult = result.ParsedResults[0];
    const text = parsedResult.ParsedText || '';
    const confidence = parsedResult.TextOverlay?.confidence || 0;

    // Extract word-level data with coordinates
    let words = [];
    if (parsedResult.TextOverlay && Array.isArray(parsedResult.TextOverlay.Lines)) {
      for (const line of parsedResult.TextOverlay.Lines) {
        if (Array.isArray(line.Words)) {
          for (const word of line.Words) {
            words.push({
              WordText: word.WordText,
              Left: word.Left,
              Top: word.Top,
              Width: word.Width,
              Height: word.Height,
              Confidence: word.Confidence
            });
          }
        }
      }
    }

    if (!text || text.trim().length < 5) {
      throw new Error('OCR extracted very little text. Try a clearer image.');
    }

    console.log(`[OCRService] Extracted ${text.length} chars (confidence: ${confidence}, words: ${words.length})`);
    logOcrExtraction({ engine: 'OCR.space Engine 2', text: text.trim(), confidence, words });

    // If Engine 2 gave poor results, retry with Engine 1
    if (text.trim().length < 30) {
      console.log('[OCRService] Short text detected, retrying with Engine 1...');
      return extractTextEngine1(base64Data, mimeType, apiKey);
    }

    return { text: text.trim(), confidence, words };
  } catch (error) {
    // Provide clearer message for timeout errors
    let errorMsg = error.message;
    if (error.name === 'AbortError') {
      errorMsg = 'OCR request timed out after 60s. Try a smaller/compressed image.';
    } else if (errorMsg.includes('E101') || errorMsg.includes('Timed out')) {
      errorMsg = 'OCR.space timed out processing the image. The image may be too large for the free tier. Try compressing or cropping it.';
    }

    console.error('[OCRService] ✗ OCR failed:', errorMsg);

    // Fallback to Engine 1 on error
    if (!error.message.includes('Engine 1')) {
      try {
        console.log('[OCRService] Retrying with Engine 1...');
        return await extractTextEngine1(base64Data, mimeType, apiKey);
      } catch (e) {
        // Both engines failed
      }
    }

    throw new Error(`OCR failed: ${error.message}`);
  }
}

/**
 * Fallback: OCR with Engine 1 (better for some document types)
 */
async function extractTextEngine1(base64Data, mimeType, apiKey) {
  const dataUri = `data:${mimeType};base64,${base64Data}`;

  const formData = new URLSearchParams();
  formData.append('base64Image', dataUri);
  formData.append('apikey', apiKey);
  formData.append('language', 'eng');
  formData.append('isTable', 'true');
  formData.append('OCREngine', '1');
  formData.append('scale', 'true');
  formData.append('filetype', mimeType.includes('png') ? 'PNG' : 'JPG');

  console.log('[OCRService] Sending image to OCR.space API (Engine 1)...');
  const { status, data: result } = await postFormData(API_URL, formData.toString(), 60000);

  if (result.IsErroredOnProcessing) {
    throw new Error(`OCR Engine 1 error: ${result.ErrorMessage?.join(', ')}`);
  }

  const text = result.ParsedResults?.[0]?.ParsedText || '';
  if (!text || text.trim().length < 5) {
    throw new Error('OCR Engine 1 also extracted very little text');
  }

  console.log(`[OCRService] Engine 1 extracted ${text.length} chars`);
  logOcrExtraction({ engine: 'OCR.space Engine 1', text: text.trim(), confidence: 0, words: [] });
  return { text: text.trim(), confidence: 0 };
}

module.exports = { extractTextFromImage };
