const vision = require('@google-cloud/vision');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Initialize Google Vision client
const client = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || null
});

// 🖼️ 1️⃣ Image Preprocessing with Sharp
// Critical: Enhance without destroying content (no threshold!)
// Strategy: Upscale → Denoise → High contrast → Sharpen
async function preprocessImage(imagePath) {
  try {
    const fileName = path.parse(imagePath).name;
    const preprocessedPath = imagePath.replace(
      path.extname(imagePath),
      '_preprocessed.png'
    );

    console.log(`[IMG_PREPROCESSING] Processing: ${fileName}`);

    // IMPORTANT: High-quality preprocessing WITHOUT destructive threshold
    // For low-quality bill images, we need to:
    // 1. Upscale to preserve detail
    // 2. Enhance contrast (brings out text)
    // 3. Sharpen edges (makes text crisp)
    // 4. NOT apply threshold (kills text in shadows)
    
    await sharp(imagePath)
      .resize(3000, 3000, {
        fit: 'inside',
        withoutEnlargement: false,
        kernel: 'lanczos3' // High-quality upscaling
      })
      .modulate({
        brightness: 1.1, // Slightly brighten dark text
        saturation: 0 // Grayscale
      })
      .normalize() // Stretch histogram to full range
      .sharpen({
        sigma: 1.5 // Moderate sharpening (not over-sharpened)
      })
      // Apply median filter-like effect via convolve for noise reduction
      // (removes speckles without removing text)
      .median(2)
      .png()
      .toFile(preprocessedPath);

    console.log(`[IMG_PREPROCESSING] ✓ Preprocessed image saved: ${preprocessedPath}`);
    return preprocessedPath;
  } catch (error) {
    console.error(`[IMG_PREPROCESSING] ✗ Error: ${error.message}`);
    // Return original path if preprocessing fails
    return imagePath;
  }
}

// 2️⃣ Extract text from bill image using Google Vision API
exports.extractBillText = async (imagePath) => {
  let preprocessedPath = null;
  try {
    // Step 1: Preprocess the image
    preprocessedPath = await preprocessImage(imagePath);

    console.log(`[OCR_EXTRACT] Starting Google Vision OCR on: ${path.basename(preprocessedPath)}`);

    // Step 2: Read image file
    const imageData = fs.readFileSync(preprocessedPath);
    const base64Image = imageData.toString('base64');

    // Step 3: Call Google Vision API for text detection
    console.log(`[OCR_EXTRACT] Calling Google Vision API...`);
    
    const request = {
      image: {
        content: base64Image,
      },
      features: [
        {
          type: 'DOCUMENT_TEXT_DETECTION', // Best for receipts/bills
        },
        {
          type: 'TEXT_DETECTION', // Also get regular text detection
        }
      ],
    };

    const [result] = await client.batchAnnotateImages({ requests: [request] });
    const annotations = result.responses[0];

    if (!annotations || !annotations.fullTextAnnotation) {
      throw new Error('No text detected by Google Vision API');
    }

    // Extract text with confidence
    const fullTextAnnotation = annotations.fullTextAnnotation;
    const text = fullTextAnnotation.text;
    
    if (!text || text.trim().length === 0) {
      throw new Error('Extracted text is empty');
    }

    // Calculate confidence from individual text annotations
    let totalConfidence = 0;
    let textCount = 0;
    
    if (annotations.textAnnotations && annotations.textAnnotations.length > 1) {
      // Skip first annotation (it's the full text)
      for (let i = 1; i < annotations.textAnnotations.length; i++) {
        const annotation = annotations.textAnnotations[i];
        if (annotation.confidence) {
          totalConfidence += annotation.confidence;
          textCount++;
        }
      }
    }
    
    const avgConfidence = textCount > 0 ? totalConfidence / textCount : 0.85;

    console.log(`[OCR_EXTRACT] ✓ Google Vision complete | Confidence: ${(avgConfidence * 100).toFixed(1)}% | Text: ${text.length} chars`);

    // Store confidence for later use
    text.confidence = avgConfidence;
    
    return text;
  } catch (error) {
    console.error(`[OCR_EXTRACT] ✗ Google Vision Error: ${error.message}`);
    throw error;
  } finally {
    // Cleanup preprocessed image
    if (preprocessedPath && preprocessedPath !== imagePath) {
      try {
        if (fs.existsSync(preprocessedPath)) {
          fs.unlinkSync(preprocessedPath);
          console.log(`[IMG_PREPROCESSING] Cleaned up preprocessed image`);
        }
      } catch (err) {
        console.warn(`[IMG_PREPROCESSING] Cleanup failed: ${err.message}`);
      }
    }
  }
};

// 3️⃣ Prepare OCR draft (NO parsing - user will edit and confirm)
exports.extractOCRDraft = (text, rawData = {}) => {
  console.log(`[OCR_DRAFT] Preparing draft from ${text.length} characters`);
  
  // Split into lines for editing
  const lines = text.split(/\n|\r\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map((line, idx) => ({
      lineNumber: idx + 1,
      content: line,
      length: line.length
    }));

  const ocrDraft = {
    rawText: text,
    lines: lines,
    metadata: {
      totalLines: lines.length,
      totalCharacters: text.length,
      extractedAt: new Date().toISOString(),
      confidence: text.confidence || rawData.confidence || 0.90,
      ocrEngine: 'google-vision',
      status: 'draft'
    }
  };

  console.log(`[OCR_DRAFT] ✓ Draft ready: ${lines.length} lines`);
  return ocrDraft;
};

// 🔴 DEPRECATED: Parse extracted text (kept for backward compatibility)
// This is NO LONGER used in the new workflow
exports.parseBillData = (text) => {
  console.log(`[PARSE_DATA] ⚠️ DEPRECATED - Use extractOCRDraft instead`);
  
  const classifiedLines = classifyLines(text);
  
  return {
    pharmacyName: extractPharmacyName(text),
    billNumber: extractBillNumber(text),
    billDate: extractBillDate(text),
    totalAmount: extractTotalAmount(text),
    items: extractItems(text, classifiedLines),
    ocrMetadata: {
      totalLines: classifiedLines.length,
      classifiedLines: classifiedLines,
      extractedAt: new Date().toISOString(),
      confidence: 'medium',
    }
  };
};

// 4️⃣ Classify lines for better item extraction and logging
function classifyLines(text) {
  const lines = text.split(/\n|\r\n/).filter(line => line.trim().length > 0);
  const classifiedLines = [];

  console.log(`[CLASSIFY_LINES] Processing ${lines.length} text lines`);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    let classification = 'unknown';

    // Classify each line
    if (/(?:pharmacy|chemist|medical|health|store)/i.test(trimmed)) {
      classification = 'pharmacy_name';
    } else if (/(?:bill|invoice|receipt|ref)\s*#?\s*[:\s]*[A-Z0-9\-\/]+/i.test(trimmed)) {
      classification = 'bill_number';
    } else if (/(?:date|dated)\s*[:\s]*\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/i.test(trimmed)) {
      classification = 'bill_date';
    } else if (/(?:total|amount|grand\s+total|subtotal|net|payable)\s*[:\s]*(?:₹|rs)?/i.test(trimmed)) {
      classification = 'total_amount';
    } else if (/₹|rs\.|rupees/i.test(trimmed) && /\d+\.?\d*/.test(trimmed)) {
      classification = 'price_line';
    } else if (/\d+(?:\.\d+)?\s*(?:x|×)\s*\d+(?:\.\d+)?/i.test(trimmed)) {
      classification = 'item_line';
    } else if (/^[A-Za-z0-9\s\-\.]+\s+\d+(?:\.\d+)?\s+\d+/.test(trimmed)) {
      classification = 'item_detail';
    }

    classifiedLines.push({
      lineNum: index + 1,
      content: trimmed,
      classification,
      length: trimmed.length
    });

    // Log classified important lines
    if (classification !== 'unknown') {
      console.log(`[CLASSIFY_LINES] Line ${index + 1}: [${classification.toUpperCase()}] ${trimmed.substring(0, 60)}`);
    }
  });

  console.log(`[CLASSIFY_LINES] ✓ Classification complete. Classified ${classifiedLines.filter(l => l.classification !== 'unknown').length} lines`);
  return classifiedLines;
}

// Extract pharmacy name with logging
function extractPharmacyName(text) {
  const patterns = [
    /(?:pharmacy|chemist|medical|health|store)[\s:]*([a-zA-Z\s&\.]+)/gi,
    /^([a-zA-Z\s&\.]+?)[\n\r]/m,
  ];

  for (let pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim().substring(0, 100);
      console.log(`[EXTRACT_PHARMACY] Found: "${name}"`);
      return name;
    }
  }
  console.log(`[EXTRACT_PHARMACY] Not found`);
  return null;
}

// Extract bill/invoice number with logging
function extractBillNumber(text) {
  const patterns = [
    /(?:bill|invoice|receipt)\s*#?\s*[:\s]*([A-Z0-9\-\/]+)/gi,
    /(?:ref|reference)[\s:]*([A-Z0-9\-]+)/gi,
  ];

  for (let pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const billNum = match[1].trim();
      console.log(`[EXTRACT_BILL_NUMBER] Found: ${billNum}`);
      return billNum;
    }
  }
  console.log(`[EXTRACT_BILL_NUMBER] Not found`);
  return null;
}

// Extract total amount with logging
function extractTotalAmount(text) {
  const patterns = [
    /(?:total|amount|grand\s+total)[\s:]*(?:₹|rs|rs\.|rupees)?\s*([0-9]+\.?[0-9]*)/gi,
    /(?:rs|₹)\s*([0-9]+\.?[0-9]*)/gi,
  ];

  for (let pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const amount = parseFloat(match[1]);
      console.log(`[EXTRACT_TOTAL_AMOUNT] Found: ₹${amount}`);
      return amount;
    }
  }
  console.log(`[EXTRACT_TOTAL_AMOUNT] Not found`);
  return null;
}

// Extract bill date with logging
function extractBillDate(text) {
  const patterns = [
    /(?:date|dated)[\s:]*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/gi,
    /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/g,
  ];

  for (let pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[0]) {
      try {
        const dateObj = new Date(match[0]);
        console.log(`[EXTRACT_BILL_DATE] Found: ${dateObj.toISOString()}`);
        return dateObj;
      } catch (e) {
        continue;
      }
    }
  }
  console.log(`[EXTRACT_BILL_DATE] Not found`);
  return null;
}

// 5️⃣ Extract items with stop parsing logic
function extractItems(text, classifiedLines = []) {
  const items = [];
  console.log(`[EXTRACT_ITEMS] Starting item extraction`);
  
  // 5️⃣ Identify where to STOP parsing (optimize performance)
  const stopPatterns = [
    /(?:total|amount|grand\s+total|payable|subtotal|tax|discount|delivery)/i,
    /(?:thank\s+you|thank\s+u|thanks|payment\s+method|terms|conditions)/i,
    /(?:sign|signature|authorized|manager|cashier|counter)/i,
  ];

  const lines = text.split(/\n|\r\n/);
  let stoppedAt = -1;
  let itemCount = 0;
  const maxItems = 50; // Limit to prevent excessive parsing

  console.log(`[EXTRACT_ITEMS] Scanning ${lines.length} lines for items`);

  for (let i = 0; i < lines.length && itemCount < maxItems; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 5️⃣ Check if we should STOP parsing further
    const shouldStop = stopPatterns.some(pattern => pattern.test(line));
    if (shouldStop && items.length > 0) {
      stoppedAt = i;
      console.log(`[EXTRACT_ITEMS] 🛑 Stopping at line ${i}: "${line.substring(0, 50)}..."`);
      break;
    }

    // Pattern for item: Medicine Name | Qty | Price
    const itemPattern = /^([a-zA-Z0-9\s\-\.&]+?)\s+(\d+(?:\.\d+)?)\s+(?:x|×|\*)?\s*([0-9\.]+)/i;
    const match = line.match(itemPattern);

    if (match) {
      const item = {
        itemName: match[1].trim(),
        quantity: parseFloat(match[2]),
        unitPrice: parseFloat(match[3]),
        totalPrice: parseFloat(match[2]) * parseFloat(match[3]),
        lineNumber: i + 1,
        confidence: 'high'
      };
      items.push(item);
      itemCount++;
      console.log(`[EXTRACT_ITEMS] ✓ Item ${itemCount}: "${item.itemName}" x${item.quantity} @ ₹${item.unitPrice}`);
    }
  }

  console.log(`[EXTRACT_ITEMS] ✓ Extraction complete. Found ${itemCount} items${stoppedAt > -1 ? ` (stopped at line ${stoppedAt})` : ''}`);
  return items;
}

module.exports = {
  extractBillText: exports.extractBillText,
  extractOCRDraft: exports.extractOCRDraft,
  parseBillData: exports.parseBillData,
};
