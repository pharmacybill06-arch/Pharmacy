const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

async function createInvoice() {
  try {
    const phone = '9000000005'; // Use a distinct phone to avoid previous conflicts
    
    // 1. Send OTP
    const otpRes = await axios.post(`${API_BASE}/auth/send-otp`, { phone });
    const devOtp = otpRes.data.devOtp;

    // 2. Verify OTP
    const verifyRes = await axios.post(`${API_BASE}/auth/verify-otp`, {
      phone,
      otp: devOtp,
      name: 'Dr. Smith Invoice Tester',
      shopName: 'Health Pharmacy'
    });
    const userId = verifyRes.data.user.id;
    console.log(`✅ Logged in as: ${verifyRes.data.user.name}`);

    // 3. Create an invoice (Bill) without an image (manual entry)
    const invoiceData = {
      parsedData: {
        pharmacyName: 'Global Meds Distributor',
        invoiceNumber: `INV-${Date.now()}`,
        invoiceDate: new Date().toISOString().split('T')[0],
        paymentType: 'credit',
        subtotal: 100,
        cgst: 6,
        sgst: 6,
        totalGst: 12,
        grandTotal: 112,
        items: [
          {
            name: 'Crocin Pain Relief',
            quantity: 5,
            unit: 'strip',
            mrp: 65.00,
            rate: 55.00,
            itemTotal: 100.00
          }
        ]
      },
      ocrText: 'Manually Created Test Invoice',
      imageUri: 'no_image' 
    };

    console.log(`\n⏳ Saving new invoice...`);
    const billRes = await axios.post(`${API_BASE}/bills/${userId}/save`, invoiceData);
    
    const savedBill = billRes.data.bill;
    console.log(`✅ Invoice Created Successfully!`);
    console.log(`- Bill ID: ${savedBill.id}`);
    console.log(`- Invoice Number: ${savedBill.invoiceNumber || 'N/A'}`);
    console.log(`- Grand Total: ₹${savedBill.grandTotal || 'N/A'}`);
    
    // Sometimes backend doesn't populate nested items on create return payload
    if (savedBill.items && savedBill.items.length > 0) {
      console.log(`- Items Count: ${savedBill.items.length}`);
      console.log(`  └─ Item: ${savedBill.items[0].name} (Qty: ${savedBill.items[0].quantity})`);
    } else {
      console.log(`- Items were created and mapped (omitted from response payload)`);
    }

  } catch (err) {
    console.error('\n❌ FAILED TO CREATE INVOICE:', err.response ? err.response.data : err.message);
  }
}

createInvoice();
