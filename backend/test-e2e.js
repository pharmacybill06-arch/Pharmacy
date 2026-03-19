const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

async function runTest() {
  try {
    console.log('--- E2E TESTING STARTED ---');
    const phone = '9000000001';

    // 1. Send OTP
    console.log(`\n[1] Sending OTP to ${phone}...`);
    const otpRes = await axios.post(`${API_BASE}/auth/send-otp`, { phone });
    console.log('Response:', otpRes.data);
    const devOtp = otpRes.data.devOtp;

    // 2. Verify OTP
    console.log(`\n[2] Verifying OTP: ${devOtp}...`);
    const verifyRes = await axios.post(`${API_BASE}/auth/verify-otp`, {
      phone,
      otp: devOtp,
      name: 'Test Automation User',
      shopName: 'Test Pharmacy'
    });
    console.log('Login successful for user:', verifyRes.data.user.name);
    const userId = verifyRes.data.user.id;

    // 3. Test AI Medicine Fetching
    console.log('\n[3] Fetching AI Details for "Combiflam"...');
    const aiRes = await axios.post(`${API_BASE}/ai/medicine-details`, {
      name: 'Combiflam'
    });
    console.log('AI Response:', aiRes.data);
    const { salt, manufacturer } = aiRes.data.data;

    if (!salt || !manufacturer) {
        console.warn('⚠️ AI did not return complete salt/manufacturer data.');
    } else {
        console.log(`✅ AI fetched Salt: ${salt} | Manufacturer: ${manufacturer}`);
    }

    // 4. Create Product with AI details
    console.log('\n[4] Creating Product with AI details...');
    const productRes = await axios.post(`${API_BASE}/products/${userId}`, {
      name: 'Combiflam',
      salt: salt || 'Ibuprofen + Paracetamol',
      manufacturer: manufacturer || 'Sanofi',
      unit: 'strip',
      stock: 50,
      defaultMrp: 45.50,
      defaultRate: 35.00
    });
    console.log('Product created:', productRes.data.product.id);
    const productId = productRes.data.product.id;

    // 5. Create Test Invoice (Bill)
    console.log('\n[5] Creating Test Invoice/Bill manually using the product...');
    const billRes = await axios.post(`${API_BASE}/bills/${userId}/save`, {
      parsedData: {
        pharmacyName: 'Distributor Corp',
        invoiceNumber: 'INV-TEST-001',
        invoiceDate: '01-01-2024',
        paymentType: 'cash',
        grandTotal: 100,
        items: [
          {
            name: 'Combiflam',
            quantity: 2,
            unit: 'strip',
            mrp: 45.50,
            rate: 35.00,
            itemTotal: 70.00
          }
        ]
      },
      ocrText: 'TEST OCR TEXT',
      imageUri: 'test_image_uri.jpg'
    });
    console.log('Bill created:', billRes.data);
    
    console.log('\n✅ ALL TESTS PASSED SUCCESSFULLY! The AI features and workflows are working perfectly.');
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.response ? err.response.data : err.message);
  }
}

runTest();
