/**
 * UPI Payment Text Parser
 * Parses shared text from Google Pay, PhonePe, Paytm, and other UPI apps
 * to extract transaction details.
 *
 * Typical shared formats:
 *
 * Google Pay:
 *   "Paid ₹1,000.00 to BHALLA MEDICAL STORE
 *    UPI transaction ID: 123456789012
 *    Google Pay transaction ID: T2603111030123456789"
 *
 * PhonePe:
 *   "Payment of ₹1,000 to BHALLA MEDICAL STORE is successful!
 *    UPI Ref No.: 123456789012
 *    Date: 11 Mar 2026"
 *
 * Paytm:
 *   "You paid ₹1,000 to BHALLA MEDICAL via UPI
 *    Transaction ID: 123456789012"
 *
 * BHIM UPI:
 *   "Payment Successful
 *    ₹1,000 paid to BHALLA MEDICAL
 *    UPI Ref: 123456789012"
 */

/**
 * Detect which UPI app the shared text came from
 */
function detectPaymentApp(text) {
  const lower = text.toLowerCase();

  if (lower.includes('google pay') || lower.includes('gpay') || lower.includes('google transaction')) {
    return 'google_pay';
  }
  if (lower.includes('phonepe') || lower.includes('phone pe')) {
    return 'phonepe';
  }
  if (lower.includes('paytm')) {
    return 'paytm';
  }
  if (lower.includes('bhim') || lower.includes('bhim upi')) {
    return 'bhim';
  }
  if (lower.includes('amazon pay')) {
    return 'amazon_pay';
  }
  if (lower.includes('whatsapp')) {
    return 'whatsapp_pay';
  }
  if (lower.includes('cred')) {
    return 'cred';
  }
  if (lower.includes('mobikwik')) {
    return 'mobikwik';
  }

  return 'upi_unknown';
}

/**
 * Extract amount from text
 * Handles formats: ₹1,000.00, Rs.1000, Rs 1,000, INR 1000, ₹ 1000, etc.
 */
function extractAmount(text) {
  // Match patterns like ₹1,000.00, Rs. 1,000, Rs 1000, INR 1,000.00, ₹ 1,500
  const patterns = [
    /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:paid|payment|amount|received)\s*(?:of\s*)?(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:₹|rs\.?|inr)/i,
    /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:paid|to|from)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ''));
      if (amount > 0 && amount < 100000000) { // sanity check: up to 10 crore
        return amount;
      }
    }
  }

  return null;
}

/**
 * Extract transaction/UPI reference ID
 */
function extractTransactionId(text) {
  const patterns = [
    // UPI Transaction ID / Ref patterns
    /(?:upi\s*(?:transaction\s*)?(?:id|ref(?:erence)?)\s*(?:no\.?|number)?\s*[:.-]?\s*)([A-Za-z0-9]+)/i,
    /(?:transaction\s*id\s*[:.-]?\s*)([A-Za-z0-9]+)/i,
    /(?:upi\s*ref\s*(?:no\.?)?\s*[:.-]?\s*)(\d{10,})/i,
    /(?:txn\s*(?:id|no\.?)\s*[:.-]?\s*)([A-Za-z0-9]+)/i,
    /(?:utr\s*(?:no\.?)?\s*[:.-]?\s*)([A-Za-z0-9]+)/i,
    /(?:ref(?:erence)?\s*(?:no\.?|number|id)\s*[:.-]?\s*)([A-Za-z0-9]{8,})/i,
    /(?:order\s*id\s*[:.-]?\s*)([A-Za-z0-9]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1].length >= 6) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Extract UPI reference number (separate from transaction ID)
 */
function extractUpiRefNumber(text) {
  const patterns = [
    /(?:upi\s*ref\s*(?:no\.?)?\s*[:.-]?\s*)(\d{10,})/i,
    /(?:upi\s*reference\s*(?:no\.?|number)?\s*[:.-]?\s*)(\d+)/i,
    /(?:rrn\s*[:.-]?\s*)(\d{10,})/i, // Retrieval Reference Number
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }

  return null;
}

/**
 * Extract payee name (who was paid)
 */
function extractPayeeName(text) {
  const patterns = [
    // "Paid to BHALLA MEDICAL", "paid ₹xxx to BHALLA MEDICAL"
    /(?:paid\s*(?:₹|rs\.?|inr)?\s*[\d,]*\.?\d*\s*to\s+)(.+?)(?:\s*(?:via|on|is|$|\n|\.|\|))/i,
    // "Payment to BHALLA MEDICAL"
    /(?:payment\s*(?:of\s*(?:₹|rs\.?)\s*[\d,]*\.?\d*\s*)?\s*to\s+)(.+?)(?:\s*(?:via|is|was|on|$|\n|\.|\|))/i,
    // "to BHALLA MEDICAL STORE"
    /(?:\bto\s+)([A-Z][A-Z\s&.'-]{2,}?)(?:\s*(?:via|is|was|on|using|$|\n|upi|through))/i,
    // "Sent to BHALLA MEDICAL"
    /(?:sent\s*(?:₹|rs\.?|inr)?\s*[\d,]*\.?\d*\s*to\s+)(.+?)(?:\s*(?:via|on|$|\n|\.|\|))/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const name = match[1].trim();
      // Clean up common suffixes
      const cleaned = name
        .replace(/\s*(?:is\s*successful|completed|done|via|on)\s*$/i, '')
        .replace(/[.!]+$/, '')
        .trim();

      if (cleaned.length >= 2 && cleaned.length <= 100) {
        return cleaned;
      }
    }
  }

  return null;
}

/**
 * Extract UPI IDs (payer and payee)
 */
function extractUpiIds(text) {
  // UPI ID pattern: something@provider (e.g., merchant@upi, shop@ybl, etc.)
  const upiPattern = /([a-zA-Z0-9._-]+@[a-zA-Z0-9]+)/g;
  const matches = [...text.matchAll(upiPattern)];
  const upiIds = matches.map(m => m[1]);

  let payeeUpiId = null;
  let payerUpiId = null;

  if (upiIds.length >= 2) {
    // Usually the payee UPI is mentioned first in payment receipts
    payeeUpiId = upiIds[0];
    payerUpiId = upiIds[1];
  } else if (upiIds.length === 1) {
    // Check context around the UPI ID
    const lower = text.toLowerCase();
    const idx = lower.indexOf(upiIds[0].toLowerCase());
    const beforeText = lower.substring(Math.max(0, idx - 50), idx);

    if (beforeText.includes('to') || beforeText.includes('payee') || beforeText.includes('merchant')) {
      payeeUpiId = upiIds[0];
    } else if (beforeText.includes('from') || beforeText.includes('payer') || beforeText.includes('your')) {
      payerUpiId = upiIds[0];
    } else {
      payeeUpiId = upiIds[0]; // Default to payee
    }
  }

  return { payeeUpiId, payerUpiId };
}

/**
 * Extract payment date from text
 */
function extractPaymentDate(text) {
  const patterns = [
    // "Date: 11 Mar 2026", "Date: 11/03/2026"
    /(?:date|on|dated)\s*[:.-]?\s*(\d{1,2}[\s/-]\w{3,9}[\s/-]\d{2,4})/i,
    /(?:date|on|dated)\s*[:.-]?\s*(\d{1,2}[\s/-]\d{1,2}[\s/-]\d{2,4})/i,
    // "11 Mar 2026, 10:30 AM"
    /(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})/i,
    // "2026-03-11"
    /(\d{4}-\d{2}-\d{2})/,
    // "11/03/2026" or "11-03-2026"
    /(\d{1,2}[/-]\d{1,2}[/-]\d{4})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const dateStr = match[1].trim();
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }

        // Try DD/MM/YYYY format (common in India)
        const ddmmyyyy = dateStr.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
        if (ddmmyyyy) {
          const [, day, month, year] = ddmmyyyy;
          const d = new Date(year, month - 1, day);
          if (!isNaN(d.getTime())) return d.toISOString();
        }
      } catch (e) {
        // parsing failed, try next pattern
      }
    }
  }

  return null;
}

/**
 * Extract payment status
 */
function extractPaymentStatus(text) {
  const lower = text.toLowerCase();

  if (lower.includes('successful') || lower.includes('success') || lower.includes('completed') ||
      lower.includes('done') || lower.includes('paid') || lower.includes('received')) {
    return 'success';
  }
  if (lower.includes('failed') || lower.includes('failure') || lower.includes('declined') ||
      lower.includes('rejected')) {
    return 'failed';
  }
  if (lower.includes('pending') || lower.includes('processing') || lower.includes('initiated')) {
    return 'pending';
  }

  return 'success'; // Default to success since user is sharing a receipt
}

/**
 * Main parser: Extract all payment details from shared text
 * @param {string} text - Raw shared text from UPI app
 * @returns {Object} Parsed payment details
 */
export function parseUpiPaymentText(text) {
  if (!text || typeof text !== 'string') {
    return {
      success: false,
      error: 'No text provided',
      data: null,
    };
  }

  const cleanText = text.trim();
  if (cleanText.length < 10) {
    return {
      success: false,
      error: 'Text too short to parse',
      data: null,
    };
  }

  const amount = extractAmount(cleanText);
  const transactionId = extractTransactionId(cleanText);
  const upiRefNumber = extractUpiRefNumber(cleanText);
  const payeeName = extractPayeeName(cleanText);
  const { payeeUpiId, payerUpiId } = extractUpiIds(cleanText);
  const paymentApp = detectPaymentApp(cleanText);
  const paymentDate = extractPaymentDate(cleanText);
  const paymentStatus = extractPaymentStatus(cleanText);

  const data = {
    amount,
    transactionId: transactionId || upiRefNumber,
    upiRefNumber,
    payeeName,
    payeeUpiId,
    payerUpiId,
    paymentApp,
    paymentDate,
    paymentStatus,
    paymentMethod: 'upi',
    rawSharedText: cleanText,
  };

  // Determine parse quality
  const hasAmount = amount !== null;
  const hasId = !!(transactionId || upiRefNumber);
  const hasPayee = !!payeeName;

  return {
    success: hasAmount, // At minimum we need the amount
    confidence: (hasAmount ? 0.4 : 0) + (hasId ? 0.3 : 0) + (hasPayee ? 0.3 : 0),
    data,
    parsed: {
      hasAmount,
      hasTransactionId: hasId,
      hasPayeeName: hasPayee,
      hasDate: !!paymentDate,
    },
  };
}

/**
 * Get friendly name for payment app
 */
export function getPaymentAppName(appCode) {
  const names = {
    google_pay: 'Google Pay',
    phonepe: 'PhonePe',
    paytm: 'Paytm',
    bhim: 'BHIM UPI',
    amazon_pay: 'Amazon Pay',
    whatsapp_pay: 'WhatsApp Pay',
    cred: 'CRED',
    mobikwik: 'MobiKwik',
    upi_unknown: 'UPI',
  };
  return names[appCode] || appCode || 'UPI';
}

/**
 * Get payment app icon name (for MaterialIcons / Ionicons)
 */
export function getPaymentAppIcon(appCode) {
  const icons = {
    google_pay: 'account-balance-wallet',
    phonepe: 'phone-android',
    paytm: 'account-balance-wallet',
    bhim: 'account-balance',
    amazon_pay: 'shopping-cart',
    whatsapp_pay: 'chat',
    cred: 'credit-card',
    mobikwik: 'account-balance-wallet',
    upi_unknown: 'payment',
  };
  return icons[appCode] || 'payment';
}

/**
 * Format amount in Indian currency style
 */
export function formatPaymentAmount(amount) {
  if (!amount && amount !== 0) return '₹0';
  return `₹${parseFloat(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export default {
  parseUpiPaymentText,
  getPaymentAppName,
  getPaymentAppIcon,
  formatPaymentAmount,
};
