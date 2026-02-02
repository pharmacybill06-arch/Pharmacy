/**
 * ============================================================================
 * GEMINI INTEGRATION - TESTING & DEBUGGING UTILITIES
 * ============================================================================
 * 
 * Use these utilities to test and debug the Gemini integration
 * 
 */

const fs = require('fs');
const axios = require('axios');

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';

/**
 * Test 1: Health check
 */
async function testHealthCheck() {
  console.log('\n📋 TEST 1: Health Check');
  console.log('────────────────────────────────────────');

  try {
    const response = await axios.get(`${BACKEND_URL}/health`);
    console.log('✅ Backend is running');
    console.log(JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Backend health check failed');
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 2: Parse sample bill
 */
async function testParseSimpleBill() {
  console.log('\n📋 TEST 2: Parse Simple Bill');
  console.log('────────────────────────────────────────');

  const sampleOCR = `M/S GOOD HEALTH PHARMACY
Shop No. 15, Main Market
Delhi - 110001
Phone: 9876543210
GSTIN: 07AAFGU6315Q1Z5
DL No: DL-123-45

INVOICE NO: INV-2024-001
DATE: 09/01/2024

ITEM NAME          QTY  UNIT  MRP   RATE   DISCOUNT  GST%  AMOUNT
Aspirin 500mg      2    strips 100  45     5         5     85.5
Paracetamol 650mg  1    strip  80    35     0         5     36.75

SUBTOTAL          122.25
CGST (5%)         3.06
SGST (5%)         3.06
TOTAL             128.37
ROUNDED TO        128`;

  try {
    const response = await axios.post(`${BACKEND_URL}/api/parse-ocr`, {
      ocrText: sampleOCR,
    });

    if (response.data.success) {
      console.log('✅ Parsing successful');
      console.log('\nParsed Data:');
      console.log(JSON.stringify(response.data.data, null, 2));
      console.log('\nConfidence:');
      console.log(JSON.stringify(response.data.confidence, null, 2));
    } else {
      console.error('❌ Parsing failed:', response.data.error);
    }
    return response.data.success;
  } catch (error) {
    console.error('❌ API call failed');
    console.error(`   Error: ${error.message}`);
    if (error.response?.data) {
      console.error(`   Response: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

/**
 * Test 3: Parse complex bill with inconsistent columns
 */
async function testParseComplexBill() {
  console.log('\n📋 TEST 3: Parse Complex Bill (Inconsistent Format)');
  console.log('────────────────────────────────────────');

  const complexOCR = `ABC MEDICAL & PHARMA STORE
Registered Pharmacist: Dr. Ram Kumar
Address: Block C, Market Lane
Mumbai - 400051
Ph: 022-12345678, 9876543210
Email: abc@pharma.com
GSTIN: 27AABCL1234Q1Z1
DL No: MH-123456/2024

=====================================
PATIENT BILL
=====================================

Ref: RP-2024-789
Date: 08/01/2024
Time: 14:30

ITEM DETAILS:
─────────────────────────────────────────────────────────────
S.No  Name              Pack  Free  MRP    Price  Disc%  Tax%
─────────────────────────────────────────────────────────────
1     Augmentin 625mg   10    0     250    120    5      5
2     Cefixime 200mg    6     1     180    80     0      5  
3     Vitamin B12       15    0     300    150    10     0
4     Multivitamin      20    2     400    180    15     5
─────────────────────────────────────────────────────────────

Subtotal Amount    530
CGST (5%)          26.50
SGST (5%)          26.50
Total GST          53.00
Round Off          -0.50
─────────────────────────────────────────────────────────────
BILL TOTAL                    582.50
─────────────────────────────────────────────────────────────

Payment Type: CASH
Thank you!`;

  try {
    const response = await axios.post(`${BACKEND_URL}/api/parse-ocr`, {
      ocrText: complexOCR,
    });

    if (response.data.success) {
      console.log('✅ Complex bill parsing successful');
      const data = response.data.data;
      console.log(`   Pharmacy: ${data.pharmacyName}`);
      console.log(`   Invoice: ${data.invoiceNumber}`);
      console.log(`   Items: ${data.items.length}`);
      console.log(`   Total: ${data.grandTotal}`);
      console.log(`   Confidence: ${(response.data.confidence.overall * 100).toFixed(0)}%`);

      if (response.data.confidence.itemsNeedingReview > 0) {
        console.log(`   ⚠️ ${response.data.confidence.itemsNeedingReview} item(s) need review`);
      }
    } else {
      console.error('❌ Parsing failed:', response.data.error);
    }
    return response.data.success;
  } catch (error) {
    console.error('❌ API call failed');
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 4: Test error handling (empty OCR)
 */
async function testErrorHandling() {
  console.log('\n📋 TEST 4: Error Handling (Empty OCR)');
  console.log('────────────────────────────────────────');

  try {
    const response = await axios.post(`${BACKEND_URL}/api/parse-ocr`, {
      ocrText: '',
    });
    console.error('❌ Should have returned error');
    return false;
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('✅ Error handling works correctly');
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Error: ${error.response.data.error}`);
      return true;
    } else {
      console.error('❌ Unexpected error');
      console.error(`   Error: ${error.message}`);
      return false;
    }
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     GEMINI INTEGRATION - TEST SUITE                    ║');
  console.log('║     Backend: ' + BACKEND_URL.padEnd(40, ' ') + '║');
  console.log('╚════════════════════════════════════════════════════════╝');

  const results = [];

  // Check if backend is running
  const backendRunning = await testHealthCheck();
  if (!backendRunning) {
    console.error('\n⚠️  Backend is not running!');
    console.error('   Start the backend with: npm run server');
    return;
  }

  // Run tests
  results.push(await testParseSimpleBill());
  results.push(await testParseComplexBill());
  results.push(await testErrorHandling());

  // Summary
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     TEST SUMMARY                                       ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║ Tests Passed: ${results.filter((r) => r).length}/${results.length}`.padEnd(58, ' ') + '║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');

  process.exit(results.every((r) => r) ? 0 : 1);
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  testHealthCheck,
  testParseSimpleBill,
  testParseComplexBill,
  testErrorHandling,
  runAllTests,
};
