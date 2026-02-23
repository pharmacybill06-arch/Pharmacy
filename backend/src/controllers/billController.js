const prisma = require('../models/prisma');
const path = require('path');
const fs = require('fs');
const productService = require('../services/productService');
const distributorService = require('../services/distributorService');

// Helper function to parse date string
function parseDateString(dateStr) {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

// 1️⃣ Save bill - Accept already-parsed data from frontend
// Frontend handles: ML Kit OCR → Gemini/Groq parsing
// Backend just: Saves the data to database
exports.uploadBill = async (req, res) => {
  try {
    const { userId } = req.params;
    const { parsedData, ocrText, imageUri } = req.body;

    // Auto-create user if doesn't exist
    let user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      console.log(`[SAVE_BILL] Creating temporary user: ${userId}`);
      user = await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@temp.local`,
          name: 'Temporary User',
          phone: '+0000000000'
        }
      });
    }

    console.log(`[SAVE_BILL] Saving parsed bill data for user: ${userId}`);

    // ========== FIND OR CREATE DISTRIBUTOR ==========
    let distributorId = null;
    if (parsedData?.pharmacyName || parsedData?.distributor?.name) {
      try {
        const distributorData = {
          name: parsedData?.distributor?.name || parsedData?.pharmacyName,
          gstin: parsedData?.distributor?.gstin || parsedData?.gstin,
          phone: parsedData?.distributor?.phone || (parsedData?.phoneNumbers ? 
            (Array.isArray(parsedData.phoneNumbers) ? parsedData.phoneNumbers[0] : parsedData.phoneNumbers) : null),
          address: parsedData?.distributor?.address || parsedData?.shopAddress,
          dlNumber: parsedData?.distributor?.dlNumber || parsedData?.dlNumber
        };
        
        const distributor = await distributorService.findOrCreateDistributor(userId, distributorData);
        if (distributor) {
          distributorId = distributor.id;
          console.log(`[SAVE_BILL] Linked to distributor: ${distributor.name} (${distributor.id})`);
        }
      } catch (distError) {
        console.error('[SAVE_BILL] Distributor error (non-fatal):', distError.message);
      }
    }

    // Create bill record with normalized fields
    const bill = await prisma.bill.create({
      data: {
        userId,
        distributorId,  // Link to distributor
        fileName: parsedData?.invoiceNumber || 'bill.jpg',
        filePath: imageUri || '/temp/bill.jpg',
        fileSize: 0,
        mimeType: 'image/jpeg',
        
        // ========== PHARMACY DETAILS (LEGACY - for backward compatibility) ==========
        pharmacyName: parsedData?.pharmacyName || null,
        shopAddress: parsedData?.shopAddress || null,
        phoneNumbers: parsedData?.phoneNumbers ? JSON.stringify(parsedData.phoneNumbers) : null,
        
        // ========== INVOICE IDENTIFICATION ==========
        invoiceNumber: parsedData?.invoiceNumber || null,
        invoiceDate: parsedData?.invoiceDate ? parseDateString(parsedData.invoiceDate) : null,
        
        // ========== CUSTOMER DETAILS ==========
        customerName: parsedData?.customerName || null,
        customerPhone: parsedData?.customerPhone || null,
        customerAddress: parsedData?.customerAddress || null,
        doctorName: parsedData?.doctorName || null,
        
        // ========== FINANCIAL TOTALS ==========
        subtotal: parsedData?.subtotal ? parseFloat(parsedData.subtotal) : null,
        cgst: parsedData?.cgst ? parseFloat(parsedData.cgst) : null,
        sgst: parsedData?.sgst ? parseFloat(parsedData.sgst) : null,
        totalGst: parsedData?.totalGst ? parseFloat(parsedData.totalGst) : null,
        discountAmount: parsedData?.discountAmount ? parseFloat(parsedData.discountAmount) : null,
        roundOff: parsedData?.roundOff ? parseFloat(parsedData.roundOff) : null,
        grandTotal: parsedData?.grandTotal ? parseFloat(parsedData.grandTotal) : null,
        
        // ========== PAYMENT DETAILS ==========
        paymentType: parsedData?.paymentType || null,
        amountPaid: parsedData?.amountPaid ? parseFloat(parsedData.amountPaid) : null,
        balanceAmount: parsedData?.balanceAmount ? parseFloat(parsedData.balanceAmount) : null,
        
        // ========== ADDITIONAL INFO ==========
        remarks: parsedData?.remarks || null,
        
        // ========== OCR & PROCESSING ==========
        rawOcrText: ocrText || null,
        ocrEngine: 'ml-kit',
        aiParser: 'gemini-ai',
        processedAt: new Date(),
        status: 'completed',
        
        // Create items if they exist
        items: parsedData?.items ? {
          create: parsedData.items.map(item => ({
            // Item identification
            serialNumber: item.sn ? parseInt(item.sn) : null,
            name: item.name || '',
            manufacturer: item.manufacturer || null,
            
            // Batch & Expiry
            batchNumber: item.batchNumber || null,
            expiryDate: item.expiryDate || null,
            hsnCode: item.hsnCode || null,
            
            // Quantity
            quantity: item.quantity ? parseFloat(item.quantity) : 0,
            freeQuantity: item.freeQuantity ? parseFloat(item.freeQuantity) : null,
            unit: item.unit || 'units',
            
            // Pricing
            mrp: item.mrp ? parseFloat(item.mrp) : null,
            rate: item.rate ? parseFloat(item.rate) : 0,
            
            // Taxes
            gstPercent: item.gstPercent ? parseFloat(item.gstPercent) : null,
            cgstPercent: item.cgstPercent ? parseFloat(item.cgstPercent) : null,
            sgstPercent: item.sgstPercent ? parseFloat(item.sgstPercent) : null,
            
            // Discount
            discount: item.discount ? parseFloat(item.discount) : null,
            
            // Total
            itemTotal: item.itemTotal ? parseFloat(item.itemTotal) : 0,
            
            // Metadata
            confidence: item.confidence || 1.0
          }))
        } : undefined
      },
      include: {
        items: true
      }
    });

    console.log(`[SAVE_BILL] ✓ Bill saved: ${bill.id}`);

    // ========== AUTO-SYNC PRODUCTS FROM BILL ITEMS ==========
    // Automatically create/update products catalog from parsed items
    if (bill.items && bill.items.length > 0) {
      try {
        console.log(`[SAVE_BILL] Syncing ${bill.items.length} items to product catalog...`);
        const syncResult = await productService.syncProductsFromBillItems(userId, bill.items);
        console.log(`[SAVE_BILL] ✓ Product sync: ${syncResult.created} created, ${syncResult.updated} updated, ${syncResult.linked} linked`);
      } catch (syncError) {
        // Don't fail the bill save if product sync fails
        console.error('[SAVE_BILL] Product sync warning:', syncError.message);
      }
    }

    res.status(201).json({
      message: 'Bill saved successfully',
      bill: {
        id: bill.id,
        fileName: bill.fileName,
        status: bill.status,
        createdAt: bill.createdAt
      }
    });

  } catch (error) {
    console.error('Error saving bill:', error.message);
    res.status(500).json({ error: 'Failed to save bill' });
  }
};

// Get all bills for a user
exports.getUserBills = async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get all bills for the user with normalized fields
    const bills = await prisma.bill.findMany({
      where: { userId },
      include: {
        distributor: {
          select: {
            id: true,
            name: true,
            phone: true,
            gstin: true,
            address: true,
            dlNumber: true
          }
        },
        items: {
          select: {
            id: true,
            serialNumber: true,
            name: true,
            manufacturer: true,
            batchNumber: true,
            expiryDate: true,
            hsnCode: true,
            quantity: true,
            freeQuantity: true,
            unit: true,
            mrp: true,
            rate: true,
            gstPercent: true,
            cgstPercent: true,
            sgstPercent: true,
            discount: true,
            itemTotal: true,
            confidence: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      message: 'User bills fetched successfully',
      total: bills.length,
      bills
    });
  } catch (error) {
    console.error('Error fetching user bills:', error.message);
    res.status(500).json({ error: 'Failed to fetch user bills' });
  }
};

// Get single bill by ID
exports.getBillById = async (req, res) => {
  try {
    const { billId } = req.params;

    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        },
        distributor: {
          select: {
            id: true,
            name: true,
            phone: true,
            gstin: true,
            address: true,
            dlNumber: true
          }
        },
        items: true
      }
    });

    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    res.json({
      message: 'Bill fetched successfully',
      bill
    });
  } catch (error) {
    console.error('Error fetching bill:', error.message);
    res.status(500).json({ error: 'Failed to fetch bill' });
  }
};

// Update bill metadata
exports.updateBill = async (req, res) => {
  try {
    const { billId } = req.params;
    const updateData = req.body;

    // Check if bill exists
    const bill = await prisma.bill.findUnique({
      where: { id: billId }
    });

    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    // Build update object with all normalized fields
    const data = {};
    
    // Distributor relation
    if (updateData.distributorId !== undefined) data.distributorId = updateData.distributorId;
    
    // Pharmacy details (legacy)
    if (updateData.pharmacyName !== undefined) data.pharmacyName = updateData.pharmacyName;
    if (updateData.shopAddress !== undefined) data.shopAddress = updateData.shopAddress;
    if (updateData.phoneNumbers !== undefined) {
      data.phoneNumbers = Array.isArray(updateData.phoneNumbers) 
        ? JSON.stringify(updateData.phoneNumbers) 
        : updateData.phoneNumbers;
    }
    
    // Invoice identification
    if (updateData.invoiceNumber !== undefined) data.invoiceNumber = updateData.invoiceNumber;
    if (updateData.invoiceDate !== undefined) data.invoiceDate = parseDateString(updateData.invoiceDate);
    
    // Customer details
    if (updateData.customerName !== undefined) data.customerName = updateData.customerName;
    if (updateData.customerPhone !== undefined) data.customerPhone = updateData.customerPhone;
    if (updateData.customerAddress !== undefined) data.customerAddress = updateData.customerAddress;
    if (updateData.doctorName !== undefined) data.doctorName = updateData.doctorName;
    
    // Financial totals
    if (updateData.subtotal !== undefined) data.subtotal = parseFloat(updateData.subtotal);
    if (updateData.cgst !== undefined) data.cgst = parseFloat(updateData.cgst);
    if (updateData.sgst !== undefined) data.sgst = parseFloat(updateData.sgst);
    if (updateData.totalGst !== undefined) data.totalGst = parseFloat(updateData.totalGst);
    if (updateData.discountAmount !== undefined) data.discountAmount = parseFloat(updateData.discountAmount);
    if (updateData.roundOff !== undefined) data.roundOff = parseFloat(updateData.roundOff);
    if (updateData.grandTotal !== undefined) data.grandTotal = parseFloat(updateData.grandTotal);
    
    // Payment details
    if (updateData.paymentType !== undefined) data.paymentType = updateData.paymentType;
    if (updateData.amountPaid !== undefined) data.amountPaid = parseFloat(updateData.amountPaid);
    if (updateData.balanceAmount !== undefined) data.balanceAmount = parseFloat(updateData.balanceAmount);
    
    // Additional info
    if (updateData.remarks !== undefined) data.remarks = updateData.remarks;

    // Update bill
    const updatedBill = await prisma.bill.update({
      where: { id: billId },
      data,
      include: {
        items: true
      }
    });

    res.json({
      message: 'Bill updated successfully',
      bill: updatedBill
    });
  } catch (error) {
    console.error('Error updating bill:', error.message);
    res.status(500).json({ error: 'Failed to update bill' });
  }
};

// Delete bill (cascade delete bill items)
exports.deleteBill = async (req, res) => {
  try {
    const { billId } = req.params;

    // Check if bill exists
    const bill = await prisma.bill.findUnique({
      where: { id: billId }
    });

    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    // Delete associated file from uploads folder if it exists
    if (bill.filePath && bill.filePath.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '../../', bill.filePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Delete bill (bill items cascade delete)
    await prisma.bill.delete({
      where: { id: billId }
    });

    res.json({
      message: 'Bill deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting bill:', error.message);
    res.status(500).json({ error: 'Failed to delete bill' });
  }
};

// Add bill item to a bill
exports.addBillItem = async (req, res) => {
  try {
    const { billId } = req.params;
    const itemData = req.body;

    // Check if bill exists
    const bill = await prisma.bill.findUnique({
      where: { id: billId }
    });

    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    // Create bill item with normalized fields
    const billItem = await prisma.billItem.create({
      data: {
        billId,
        
        // Item identification
        serialNumber: itemData.serialNumber ? parseInt(itemData.serialNumber) : null,
        name: itemData.name || 'Unnamed Item',
        manufacturer: itemData.manufacturer || null,
        
        // Batch & Expiry
        batchNumber: itemData.batchNumber || null,
        expiryDate: itemData.expiryDate || null,
        hsnCode: itemData.hsnCode || null,
        
        // Quantity
        quantity: itemData.quantity ? parseFloat(itemData.quantity) : 0,
        freeQuantity: itemData.freeQuantity ? parseFloat(itemData.freeQuantity) : null,
        unit: itemData.unit || 'units',
        
        // Pricing
        mrp: itemData.mrp ? parseFloat(itemData.mrp) : null,
        rate: itemData.rate ? parseFloat(itemData.rate) : 0,
        
        // Taxes
        gstPercent: itemData.gstPercent ? parseFloat(itemData.gstPercent) : null,
        cgstPercent: itemData.cgstPercent ? parseFloat(itemData.cgstPercent) : null,
        sgstPercent: itemData.sgstPercent ? parseFloat(itemData.sgstPercent) : null,
        
        // Discount
        discount: itemData.discount ? parseFloat(itemData.discount) : null,
        
        // Total
        itemTotal: itemData.itemTotal ? parseFloat(itemData.itemTotal) : 0,
        
        // Metadata
        confidence: itemData.confidence || 1.0
      }
    });

    res.status(201).json({
      message: 'Bill item added successfully',
      billItem
    });
  } catch (error) {
    console.error('Error adding bill item:', error.message);
    res.status(500).json({ error: 'Failed to add bill item' });
  }
};

// Get bill items for a bill
exports.getBillItems = async (req, res) => {
  try {
    const { billId } = req.params;

    // Check if bill exists
    const bill = await prisma.bill.findUnique({
      where: { id: billId }
    });

    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    // Get bill items
    const items = await prisma.billItem.findMany({
      where: { billId },
      orderBy: { createdAt: 'asc' }
    });

    res.json({
      message: 'Bill items fetched successfully',
      total: items.length,
      items
    });
  } catch (error) {
    console.error('Error fetching bill items:', error.message);
    res.status(500).json({ error: 'Failed to fetch bill items' });
  }
};

// Delete bill item
exports.deleteBillItem = async (req, res) => {
  try {
    const { itemId } = req.params;

    // Check if item exists
    const item = await prisma.billItem.findUnique({
      where: { id: itemId }
    });

    if (!item) {
      return res.status(404).json({ error: 'Bill item not found' });
    }

    // Delete item
    await prisma.billItem.delete({
      where: { id: itemId }
    });

    res.json({
      message: 'Bill item deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting bill item:', error.message);
    res.status(500).json({ error: 'Failed to delete bill item' });
  }
};
