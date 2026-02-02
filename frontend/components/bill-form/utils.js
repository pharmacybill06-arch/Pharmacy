/**
 * Parse raw OCR text to form data format
 * This is a basic parser that extracts bill information from OCR text
 */
export function parseOcrTextToFormData(ocrText) {
  if (!ocrText || typeof ocrText !== 'string') {
    return getEmptyBillData();
  }

  const lines = ocrText.split('\n').map(line => line.trim()).filter(Boolean);
  
  // Initialize bill data
  const billData = {
    pharmacyDetails: {
      name: '',
      address: '',
      phone: '',
      gstin: '',
      drugLicense: '',
    },
    invoiceMetadata: {
      invoiceNumber: '',
      date: '',
      patientName: '',
      doctorName: '',
    },
    items: [],
    taxTotals: {
      subtotal: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      discount: 0,
      grandTotal: 0,
    },
    rawOcrText: ocrText,
  };

  // Extract pharmacy name (usually first non-empty line)
  if (lines.length > 0) {
    billData.pharmacyDetails.name = lines[0];
  }

  // Extract patterns from text
  for (const line of lines) {
    const upperLine = line.toUpperCase();
    
    // Invoice number patterns
    if (upperLine.includes('INVOICE') || upperLine.includes('BILL NO') || upperLine.includes('INV')) {
      const match = line.match(/[:#]?\s*([A-Z0-9/-]+)/i);
      if (match) {
        billData.invoiceMetadata.invoiceNumber = match[1].trim();
      }
    }
    
    // Date patterns
    if (upperLine.includes('DATE')) {
      const dateMatch = line.match(/(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/);
      if (dateMatch) {
        billData.invoiceMetadata.date = dateMatch[1];
      }
    }
    
    // GSTIN pattern
    if (upperLine.includes('GSTIN') || upperLine.includes('GST')) {
      const gstMatch = line.match(/\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}/i);
      if (gstMatch) {
        billData.pharmacyDetails.gstin = gstMatch[0];
      }
    }
    
    // Phone patterns
    const phoneMatch = line.match(/(\+91[\s-]?)?\d{10}|\d{3}[-\s]?\d{3}[-\s]?\d{4}/);
    if (phoneMatch && !billData.pharmacyDetails.phone) {
      billData.pharmacyDetails.phone = phoneMatch[0].replace(/[-\s]/g, '');
    }
    
    // Patient name
    if (upperLine.includes('PATIENT') || upperLine.includes('CUSTOMER')) {
      const nameMatch = line.match(/[:]\s*(.+)/);
      if (nameMatch) {
        billData.invoiceMetadata.patientName = nameMatch[1].trim();
      }
    }
    
    // Doctor name
    if (upperLine.includes('DOCTOR') || upperLine.includes('DR.') || upperLine.includes('PRESCRIBED')) {
      const drMatch = line.match(/(?:DR\.?|DOCTOR)\s*[:.]?\s*(.+)/i);
      if (drMatch) {
        billData.invoiceMetadata.doctorName = drMatch[1].trim();
      }
    }
    
    // Total amount
    if (upperLine.includes('TOTAL') || upperLine.includes('GRAND')) {
      const totalMatch = line.match(/[\d,]+\.?\d*/);
      if (totalMatch) {
        const amount = parseFloat(totalMatch[0].replace(',', ''));
        if (!isNaN(amount) && amount > billData.taxTotals.grandTotal) {
          billData.taxTotals.grandTotal = amount;
        }
      }
    }
    
    // CGST/SGST
    if (upperLine.includes('CGST')) {
      const taxMatch = line.match(/[\d,]+\.?\d*/);
      if (taxMatch) {
        billData.taxTotals.cgst = parseFloat(taxMatch[0].replace(',', '')) || 0;
      }
    }
    if (upperLine.includes('SGST')) {
      const taxMatch = line.match(/[\d,]+\.?\d*/);
      if (taxMatch) {
        billData.taxTotals.sgst = parseFloat(taxMatch[0].replace(',', '')) || 0;
      }
    }
    
    // Drug License
    if (upperLine.includes('DL') || upperLine.includes('DRUG LIC')) {
      const dlMatch = line.match(/[A-Z0-9/-]+/g);
      if (dlMatch && dlMatch.length > 0) {
        billData.pharmacyDetails.drugLicense = dlMatch[dlMatch.length - 1];
      }
    }
  }

  // Try to extract medicine items (lines with quantity and price patterns)
  const itemPattern = /^(.+?)\s+(\d+)\s+[\d.]+\s+([\d.]+)\s*$/;
  for (const line of lines) {
    const match = line.match(itemPattern);
    if (match) {
      billData.items.push({
        id: `item_${billData.items.length + 1}`,
        name: match[1].trim(),
        quantity: parseInt(match[2], 10),
        price: parseFloat(match[3]),
        batch: '',
        expiry: '',
        gst: 0,
      });
    }
  }

  // Calculate subtotal from items if we found any
  if (billData.items.length > 0) {
    billData.taxTotals.subtotal = billData.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
  }

  return billData;
}

/**
 * Get empty bill data structure
 */
export function getEmptyBillData() {
  return {
    pharmacyDetails: {
      name: '',
      address: '',
      phone: '',
      gstin: '',
      drugLicense: '',
    },
    invoiceMetadata: {
      invoiceNumber: '',
      date: '',
      patientName: '',
      doctorName: '',
    },
    items: [],
    taxTotals: {
      subtotal: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      discount: 0,
      grandTotal: 0,
    },
    rawOcrText: '',
  };
}

/**
 * Format currency for display
 */
export function formatCurrency(amount) {
  return `₹${(amount || 0).toFixed(2)}`;
}

/**
 * Validate bill data completeness
 */
export function validateBillData(billData) {
  const errors = [];
  
  if (!billData.pharmacyDetails?.name) {
    errors.push('Pharmacy name is required');
  }
  
  if (!billData.invoiceMetadata?.invoiceNumber) {
    errors.push('Invoice number is required');
  }
  
  if (!billData.invoiceMetadata?.date) {
    errors.push('Date is required');
  }
  
  if (!billData.items || billData.items.length === 0) {
    errors.push('At least one item is required');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}
