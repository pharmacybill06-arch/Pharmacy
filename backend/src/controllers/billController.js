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

function normalizeExpiryItem(item = {}, index = 0) {
  return {
    serialNumber: item.sn || item.serialNumber ? parseInt(item.sn || item.serialNumber) : index + 1,
    name: item.name || item.itemName || '',
    batchNumber: item.batchNumber || item.batch || null,
    expiryDate: item.expiryDate || item.exp || null,
    quantity: item.quantity ? parseFloat(item.quantity) : 0,
    rate: 0,
    itemTotal: 0,
    confidence: item.confidence || 1.0
  };
}

// Save bill - accept already-reviewed parsed data from the mobile app.
exports.uploadBill = async (req, res) => {
  try {
    const { userId } = req.params;
    const { parsedData, ocrText, imageUri, ocrEngine } = req.body;

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
        
        // ========== ADDITIONAL INFO ==========
        remarks: parsedData?.remarks || null,
        
        // ========== OCR & PROCESSING ==========
        rawOcrText: ocrText || null,
        ocrEngine: ocrEngine || 'vision-ai',
        aiParser: 'gemini-ai',
        processedAt: new Date(),
        status: 'completed',
        
        // Create items if they exist
        items: parsedData?.items ? {
          create: parsedData.items.map(normalizeExpiryItem)
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

    // Get all bills for the user with normalized fields (exclude drafts)
    const bills = await prisma.bill.findMany({
      where: { userId, status: { not: 'draft' } },
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
            batchNumber: true,
            expiryDate: true,
            quantity: true,
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
      data: { billId, ...normalizeExpiryItem(itemData) }
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

// ========== DRAFT ENDPOINTS ==========

// Save bill as draft (no product sync, no distributor creation)
exports.saveDraft = async (req, res) => {
  try {
    const { userId } = req.params;
    const { parsedData, ocrText, imageUri, ocrEngine } = req.body;

    // Auto-create user if doesn't exist
    let user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      console.log(`[SAVE_DRAFT] Creating temporary user: ${userId}`);
      user = await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@temp.local`,
          name: 'Temporary User',
          phone: '+0000000000'
        }
      });
    }

    console.log(`[SAVE_DRAFT] Saving draft for user: ${userId}`);

    const bill = await prisma.bill.create({
      data: {
        userId,
        fileName: parsedData?.invoiceNumber || 'draft',
        filePath: imageUri || '/temp/draft',
        fileSize: 0,
        mimeType: 'image/jpeg',
        status: 'draft',

        // Pharmacy details
        pharmacyName: parsedData?.pharmacyName || null,
        shopAddress: parsedData?.shopAddress || null,
        phoneNumbers: parsedData?.phoneNumbers ? JSON.stringify(parsedData.phoneNumbers) : null,

        // Invoice identification
        invoiceNumber: parsedData?.invoiceNumber || null,
        invoiceDate: parsedData?.invoiceDate ? parseDateString(parsedData.invoiceDate) : null,

        // Customer details
        customerName: parsedData?.customerName || null,
        customerPhone: parsedData?.customerPhone || null,
        customerAddress: parsedData?.customerAddress || null,
        doctorName: parsedData?.doctorName || null,

        // Additional info
        remarks: parsedData?.remarks || null,

        // OCR data
        rawOcrText: ocrText || null,
        ocrEngine: ocrEngine || 'vision-ai',
        aiParser: 'gemini-ai',

        // Items
        items: parsedData?.items ? {
          create: parsedData.items.map(normalizeExpiryItem)
        } : undefined
      },
      include: { items: true }
    });

    console.log(`[SAVE_DRAFT] ✓ Draft saved: ${bill.id}`);

    res.status(201).json({
      message: 'Draft saved successfully',
      bill: {
        id: bill.id,
        fileName: bill.fileName,
        status: bill.status,
        createdAt: bill.createdAt
      }
    });
  } catch (error) {
    console.error('Error saving draft:', error.message);
    res.status(500).json({ error: 'Failed to save draft' });
  }
};

// Get all drafts for a user
exports.getUserDrafts = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const drafts = await prisma.bill.findMany({
      where: { userId, status: 'draft' },
      include: {
        distributor: {
          select: { id: true, name: true, phone: true, gstin: true, address: true, dlNumber: true }
        },
        items: {
          select: {
            id: true, serialNumber: true, name: true,
            batchNumber: true, expiryDate: true,
            quantity: true, confidence: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      message: 'Drafts fetched successfully',
      total: drafts.length,
      drafts
    });
  } catch (error) {
    console.error('Error fetching drafts:', error.message);
    res.status(500).json({ error: 'Failed to fetch drafts' });
  }
};

// Convert a draft to a completed bill (with distributor & product sync)
exports.convertDraft = async (req, res) => {
  try {
    const { billId } = req.params;
    const { parsedData } = req.body;

    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: { items: true }
    });

    if (!bill) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    if (bill.status !== 'draft') {
      return res.status(400).json({ error: 'Bill is not a draft' });
    }

    // Find or create distributor
    let distributorId = null;
    const distName = parsedData?.pharmacyName || bill.pharmacyName;
    if (distName) {
      try {
        const distributorData = {
          name: parsedData?.distributor?.name || distName,
          gstin: parsedData?.distributor?.gstin || parsedData?.gstin || null,
          phone: parsedData?.distributor?.phone || null,
          address: parsedData?.distributor?.address || parsedData?.shopAddress || bill.shopAddress || null,
          dlNumber: parsedData?.distributor?.dlNumber || null
        };
        const distributor = await distributorService.findOrCreateDistributor(bill.userId, distributorData);
        if (distributor) distributorId = distributor.id;
      } catch (distError) {
        console.error('[CONVERT_DRAFT] Distributor error (non-fatal):', distError.message);
      }
    }

    // If parsedData has updated items, delete old items and create new ones
    if (parsedData?.items && parsedData.items.length > 0) {
      // Delete existing items
      await prisma.billItem.deleteMany({ where: { billId } });

      // Create new items
      await prisma.billItem.createMany({
        data: parsedData.items.map((item, index) => ({
          billId,
          ...normalizeExpiryItem(item, index)
        }))
      });
    }

    // Update the bill to completed
    const updatedBill = await prisma.bill.update({
      where: { id: billId },
      data: {
        status: 'completed',
        distributorId,
        processedAt: new Date(),
        // Update fields from parsedData if provided
        ...(parsedData?.pharmacyName && { pharmacyName: parsedData.pharmacyName }),
        ...(parsedData?.shopAddress && { shopAddress: parsedData.shopAddress }),
        ...(parsedData?.invoiceNumber && { invoiceNumber: parsedData.invoiceNumber }),
        ...(parsedData?.invoiceDate && { invoiceDate: parseDateString(parsedData.invoiceDate) }),
      },
      include: { items: true }
    });

    // Sync products from bill items
    if (updatedBill.items && updatedBill.items.length > 0) {
      try {
        const syncResult = await productService.syncProductsFromBillItems(bill.userId, updatedBill.items);
        console.log(`[CONVERT_DRAFT] ✓ Product sync: ${syncResult.created} created, ${syncResult.updated} updated`);
      } catch (syncError) {
        console.error('[CONVERT_DRAFT] Product sync warning:', syncError.message);
      }
    }

    console.log(`[CONVERT_DRAFT] ✓ Draft ${billId} converted to bill`);

    res.json({
      message: 'Draft converted to bill successfully',
      bill: updatedBill
    });
  } catch (error) {
    console.error('Error converting draft:', error.message);
    res.status(500).json({ error: 'Failed to convert draft' });
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
