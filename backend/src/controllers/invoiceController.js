const prisma = require('../models/prisma');

/**
 * Invoice Controller (Customer Invoices)
 * Handles HTTP requests for customer sales invoices
 * Features: Stock deduction, transaction safety, validation
 */

// ============================================
// CREATE INVOICE (Sale Bill)
// ============================================

/**
 * Create a customer invoice with stock deduction
 * POST /invoices
 * 
 * Request body:
 * {
 *   customerName: string
 *   customerPhone: string
 *   customerAddress?: string
 *   invoiceDate: ISO date string
 *   paymentType: "cash" | "credit"
 *   subtotal: number
 *   cgst?: number
 *   sgst?: number
 *   totalGst?: number
 *   discountAmount?: number
 *   roundOff?: number
 *   grandTotal: number
 *   amountPaid?: number
 *   remarks?: string
 *   items: [
 *     {
 *       productId: string
 *       quantity: number
 *       mrp?: number
 *       rate: number
 *       discount?: number
 *       gstPercent?: number
 *       itemTotal: number
 *     }
 *   ]
 * }
 */
exports.createInvoice = async (req, res) => {
  const { userId } = req.params;
  const invoiceData = req.body;

  try {
    console.log('[INVOICE] Creating invoice for user:', userId);
    console.log('[INVOICE] Items count:', invoiceData.items?.length);

    // ========== VALIDATION ==========
    if (!invoiceData.items || !Array.isArray(invoiceData.items) || invoiceData.items.length === 0) {
      return res.status(400).json({ error: 'Invoice must contain at least one item' });
    }

    if (!invoiceData.customerName || invoiceData.customerName.trim().length === 0) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    if (!invoiceData.grandTotal || invoiceData.grandTotal <= 0) {
      return res.status(400).json({ error: 'Grand total must be greater than 0' });
    }

    // ========== VALIDATE ITEMS ==========
    for (let i = 0; i < invoiceData.items.length; i++) {
      const item = invoiceData.items[i];
      
      if (!item.productId) {
        return res.status(400).json({ 
          error: `Item ${i + 1}: Product ID is required` 
        });
      }

      if (!item.quantity || item.quantity <= 0) {
        return res.status(400).json({ 
          error: `Item ${i + 1}: Quantity must be greater than 0` 
        });
      }

      if (!item.rate || item.rate <= 0) {
        return res.status(400).json({ 
          error: `Item ${i + 1}: Rate must be greater than 0` 
        });
      }
    }

    // ========== DATABASE TRANSACTION ==========
    // Start transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Check if user exists
      const user = await tx.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // ========== VALIDATE STOCK FOR ALL ITEMS ==========
      for (let i = 0; i < invoiceData.items.length; i++) {
        const item = invoiceData.items[i];
        
        const product = await tx.product.findUnique({
          where: { id: item.productId }
        });

        if (!product) {
          throw new Error(`Item ${i + 1}: Product not found`);
        }

        if (product.userId !== userId) {
          throw new Error(`Item ${i + 1}: Unauthorized access to product`);
        }

        // Check stock availability
        if (product.stock < item.quantity) {
          throw new Error(
            `Item ${i + 1} (${product.name}): Insufficient stock. ` +
            `Available: ${product.stock}, Requested: ${item.quantity}`
          );
        }
      }

      // ========== CREATE BILL (WITH billType = "sale") ==========
      const bill = await tx.bill.create({
        data: {
          userId,
          fileName: `invoice_${Date.now()}`,
          filePath: '/invoices',
          fileSize: 0,
          mimeType: 'application/json',
          billType: 'sale', // This is a customer invoice (sale)
          
          // Customer details
          customerName: invoiceData.customerName,
          customerPhone: invoiceData.customerPhone,
          customerAddress: invoiceData.customerAddress,
          
          // Invoice details
          invoiceDate: new Date(invoiceData.invoiceDate),
          paymentType: invoiceData.paymentType,
          
          // Financial totals
          subtotal: invoiceData.subtotal,
          cgst: invoiceData.cgst,
          sgst: invoiceData.sgst,
          totalGst: invoiceData.totalGst,
          discountAmount: invoiceData.discountAmount,
          roundOff: invoiceData.roundOff,
          grandTotal: invoiceData.grandTotal,
          amountPaid: invoiceData.amountPaid,
          balanceAmount: (invoiceData.grandTotal || 0) - (invoiceData.amountPaid || 0),
          
          // Additional info
          remarks: invoiceData.remarks,
          status: 'completed'
        }
      });

      console.log('[INVOICE] ✓ Bill created:', bill.id);

      // ========== CREATE BILL ITEMS AND DEDUCT STOCK ==========
      const billItems = [];
      
      for (let i = 0; i < invoiceData.items.length; i++) {
        const itemData = invoiceData.items[i];
        
        // Get product (we already validated it exists and has sufficient stock)
        const product = await tx.product.findUnique({
          where: { id: itemData.productId }
        });

        // Create bill item
        const billItem = await tx.billItem.create({
          data: {
            billId: bill.id,
            productId: itemData.productId,
            name: product.name,
            manufacturer: product.manufacturer,
            hsnCode: product.hsnCode,
            quantity: itemData.quantity,
            unit: product.unit || 'units',
            mrp: itemData.mrp || product.mrp,
            rate: itemData.rate,
            gstPercent: itemData.gstPercent || product.gstPercent,
            discount: itemData.discount,
            itemTotal: itemData.itemTotal,
            isProductMatched: true
          }
        });

        billItems.push(billItem);

        // ========== DEDUCT STOCK ==========
        const updatedProduct = await tx.product.update({
          where: { id: itemData.productId },
          data: {
            stock: {
              decrement: itemData.quantity // Reduce stock by quantity
            },
            lastUsedAt: new Date(),
            usageCount: {
              increment: 1
            }
          }
        });

        console.log(
          `[INVOICE] ✓ Stock deducted for ${product.name}: ` +
          `${product.stock} → ${updatedProduct.stock}`
        );
      }

      return {
        bill,
        items: billItems
      };
    });

    console.log('[INVOICE] ✓ Invoice created successfully:', result.bill.id);

    res.status(201).json({
      message: 'Invoice created successfully',
      invoice: {
        id: result.bill.id,
        invoiceDate: result.bill.invoiceDate,
        customerName: result.bill.customerName,
        grandTotal: result.bill.grandTotal,
        itemsCount: result.items.length
      },
      items: result.items
    });

  } catch (error) {
    console.error('[INVOICE] Create error:', error.message);

    // Check if error is a validation error from our checks
    if (error.message.includes('Insufficient stock') ||
        error.message.includes('Product not found') ||
        error.message.includes('Unauthorized access') ||
        error.message.includes('required')) {
      return res.status(400).json({ error: error.message });
    }

    if (error.message === 'User not found') {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(500).json({ error: 'Failed to create invoice' });
  }
};

// ============================================
// GET INVOICES (LIST)
// ============================================

/**
 * Get all invoices for a user (paginated)
 * GET /invoices
 */
exports.getInvoices = async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      page = 1, 
      limit = 20,
      customerName = '',
      startDate,
      endDate
    } = req.query;

    console.log(`[INVOICE] Fetching invoices for user: ${userId}`);

    // Build filter
    const where = {
      userId,
      billType: 'sale'
    };

    if (customerName && customerName.trim().length > 0) {
      where.customerName = {
        contains: customerName,
        mode: 'insensitive'
      };
    }

    if (startDate || endDate) {
      where.invoiceDate = {};
      if (startDate) where.invoiceDate.gte = new Date(startDate);
      if (endDate) where.invoiceDate.lte = new Date(endDate);
    }

    // Get total count
    const total = await prisma.bill.count({ where });

    // Get paginated results
    const invoices = await prisma.bill.findMany({
      where,
      include: {
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: {
        invoiceDate: 'desc'
      },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit)
    });

    res.json({
      message: 'Invoices fetched successfully',
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      invoices
    });

  } catch (error) {
    console.error('[INVOICE] Get list error:', error.message);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
};

// ============================================
// GET SINGLE INVOICE
// ============================================

/**
 * Get a single invoice by ID
 * GET /invoices/:invoiceId
 */
exports.getInvoiceById = async (req, res) => {
  try {
    const { userId, invoiceId } = req.params;

    const invoice = await prisma.bill.findFirst({
      where: {
        id: invoiceId,
        userId,
        billType: 'sale'
      },
      include: {
        items: {
          include: {
            product: true
          }
        }
      }
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({
      message: 'Invoice fetched successfully',
      invoice
    });

  } catch (error) {
    console.error('[INVOICE] Get by ID error:', error.message);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
};

// ============================================
// UPDATE INVOICE
// ============================================

/**
 * Update an invoice (only if not in final state)
 * Note: Stock updates are not allowed after creation for data integrity
 * PUT /invoices/:invoiceId
 */
exports.updateInvoice = async (req, res) => {
  try {
    const { userId, invoiceId } = req.params;
    const updateData = req.body;

    // Find invoice first
    const existingInvoice = await prisma.bill.findFirst({
      where: {
        id: invoiceId,
        userId,
        billType: 'sale'
      }
    });

    if (!existingInvoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Only allow updating certain fields (not items or stock)
    const allowedFields = [
      'paymentType',
      'amountPaid',
      'balanceAmount',
      'remarks'
    ];

    const safeUpdateData = {};
    for (const key of allowedFields) {
      if (updateData[key] !== undefined) {
        safeUpdateData[key] = updateData[key];
      }
    }

    const updatedInvoice = await prisma.bill.update({
      where: { id: invoiceId },
      data: safeUpdateData,
      include: {
        items: {
          include: {
            product: true
          }
        }
      }
    });

    console.log('[INVOICE] ✓ Invoice updated:', invoiceId);

    res.json({
      message: 'Invoice updated successfully',
      invoice: updatedInvoice
    });

  } catch (error) {
    console.error('[INVOICE] Update error:', error.message);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
};

// ============================================
// DELETE INVOICE (REVERSAL)
// ============================================

/**
 * Delete/reverse an invoice (refund stock)
 * DELETE /invoices/:invoiceId
 */
exports.deleteInvoice = async (req, res) => {
  const { userId, invoiceId } = req.params;

  try {
    console.log('[INVOICE] Deleting invoice:', invoiceId);

    const result = await prisma.$transaction(async (tx) => {
      // Get invoice with items
      const invoice = await tx.bill.findFirst({
        where: {
          id: invoiceId,
          userId,
          billType: 'sale'
        },
        include: {
          items: true
        }
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // ========== REFUND STOCK FOR ALL ITEMS ==========
      for (const item of invoice.items) {
        if (item.productId) {
          const updatedProduct = await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: {
                increment: item.quantity // Return stock
              }
            }
          });

          console.log(
            `[INVOICE] ✓ Stock refunded for item ${item.id}: ` +
            `+${item.quantity}`
          );
        }
      }

      // Delete invoice and items (cascade)
      const deletedInvoice = await tx.bill.delete({
        where: { id: invoiceId },
        include: {
          items: true
        }
      });

      return deletedInvoice;
    });

    console.log('[INVOICE] ✓ Invoice deleted and stock refunded:', invoiceId);

    res.json({
      message: 'Invoice deleted and stock refunded successfully',
      invoice: result
    });

  } catch (error) {
    console.error('[INVOICE] Delete error:', error.message);

    if (error.message === 'Invoice not found') {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.status(500).json({ error: 'Failed to delete invoice' });
  }
};

// ============================================
// GET INVOICE STATISTICS
// ============================================

/**
 * Get invoice statistics for user
 * GET /invoices/stats
 */
exports.getInvoiceStats = async (req, res) => {
  try {
    const { userId } = req.params;
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const invoices = await prisma.bill.findMany({
      where: {
        userId,
        billType: 'sale',
        invoiceDate: {
          gte: startDate
        }
      }
    });

    const stats = {
      totalInvoices: invoices.length,
      totalRevenue: invoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0),
      avgInvoiceValue: invoices.length > 0 
        ? invoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0) / invoices.length 
        : 0,
      totalDiscount: invoices.reduce((sum, inv) => sum + (inv.discountAmount || 0), 0),
      totalTax: invoices.reduce((sum, inv) => sum + (inv.totalGst || 0), 0),
      period: `Last ${days} days`
    };

    res.json({
      message: 'Invoice statistics fetched successfully',
      stats
    });

  } catch (error) {
    console.error('[INVOICE] Stats error:', error.message);
    res.status(500).json({ error: 'Failed to fetch invoice statistics' });
  }
};
