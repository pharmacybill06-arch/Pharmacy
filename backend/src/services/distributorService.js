const prisma = require('../models/prisma');

/**
 * Distributor Service
 * Handles CRUD operations and smart lookup for distributors
 */

/**
 * Normalize distributor name for matching
 */
function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

/**
 * Find distributor by GSTIN (primary lookup)
 */
async function findByGstin(userId, gstin) {
  if (!gstin) return null;
  
  return prisma.distributor.findFirst({
    where: {
      userId,
      gstin: gstin.trim().toUpperCase(),
      isActive: true
    }
  });
}

/**
 * Find distributor by name and optional phone (fallback lookup)
 */
async function findByNameAndPhone(userId, name, phone = null) {
  if (!name) return null;
  
  const normalizedName = normalizeName(name);
  
  // Get all active distributors for user
  const distributors = await prisma.distributor.findMany({
    where: {
      userId,
      isActive: true
    }
  });
  
  // Find match by normalized name
  const match = distributors.find(d => {
    const dNormalizedName = normalizeName(d.name);
    
    // Exact name match
    if (dNormalizedName === normalizedName) return true;
    
    // Name contains or is contained
    if (dNormalizedName.includes(normalizedName) || normalizedName.includes(dNormalizedName)) {
      // If phone provided, verify it matches
      if (phone && d.phone) {
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        const dCleanPhone = d.phone.replace(/[^0-9]/g, '');
        return cleanPhone === dCleanPhone || cleanPhone.endsWith(dCleanPhone) || dCleanPhone.endsWith(cleanPhone);
      }
      return true;
    }
    
    return false;
  });
  
  return match || null;
}

/**
 * Smart find or create distributor
 * Used when saving bills from OCR
 * 
 * Search priority:
 * 1. GSTIN (exact match)
 * 2. Name + Phone (fuzzy match)
 * 3. Name only (fuzzy match)
 * 4. Create new if not found
 */
async function findOrCreateDistributor(userId, distributorData) {
  const { name, gstin, phone, address, dlNumber, email } = distributorData;
  
  if (!name) return null;
  
  // 1. Try GSTIN first (most reliable)
  if (gstin) {
    const byGstin = await findByGstin(userId, gstin);
    if (byGstin) {
      console.log(`[Distributor] Found by GSTIN: ${byGstin.name}`);
      return byGstin;
    }
  }
  
  // 2. Try name + phone
  if (phone) {
    const byNamePhone = await findByNameAndPhone(userId, name, phone);
    if (byNamePhone) {
      console.log(`[Distributor] Found by name+phone: ${byNamePhone.name}`);
      return byNamePhone;
    }
  }
  
  // 3. Try name only
  const byName = await findByNameAndPhone(userId, name);
  if (byName) {
    console.log(`[Distributor] Found by name: ${byName.name}`);
    return byName;
  }
  
  // 4. Create new distributor
  console.log(`[Distributor] Creating new: ${name}`);
  const newDistributor = await prisma.distributor.create({
    data: {
      userId,
      name: name.trim(),
      gstin: gstin?.trim().toUpperCase() || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      dlNumber: dlNumber?.trim() || null,
      email: email?.trim() || null
    }
  });
  
  return newDistributor;
}

/**
 * Get all distributors for a user
 */
async function getDistributors(userId, options = {}) {
  const { search, includeInactive = false, sortBy = 'name', sortOrder = 'asc' } = options;
  
  const where = { userId };
  
  if (!includeInactive) {
    where.isActive = true;
  }
  
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { gstin: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } }
    ];
  }
  
  const distributors = await prisma.distributor.findMany({
    where,
    include: {
      _count: {
        select: { bills: true }
      }
    },
    orderBy: { [sortBy]: sortOrder }
  });
  
  // Calculate totals for each distributor
  const distributorsWithStats = await Promise.all(
    distributors.map(async (dist) => {
      const billStats = await prisma.bill.aggregate({
        where: { distributorId: dist.id },
        _sum: { grandTotal: true },
        _count: true
      });
      
      const lastBill = await prisma.bill.findFirst({
        where: { distributorId: dist.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, invoiceDate: true }
      });
      
      // Count unique products from this distributor
      const uniqueProducts = await prisma.billItem.findMany({
        where: {
          bill: { distributorId: dist.id }
        },
        distinct: ['name'],
        select: { name: true }
      });
      
      return {
        ...dist,
        totalBills: billStats._count || 0,
        totalAmount: billStats._sum.grandTotal || 0,
        totalProducts: uniqueProducts.length || 0,
        lastTransaction: lastBill?.invoiceDate || lastBill?.createdAt || null
      };
    })
  );
  
  return distributorsWithStats;
}

/**
 * Get distributor by ID
 */
async function getDistributorById(distributorId) {
  const distributor = await prisma.distributor.findUnique({
    where: { id: distributorId },
    include: {
      _count: {
        select: { bills: true }
      }
    }
  });
  
  if (!distributor) return null;
  
  // Get stats
  const billStats = await prisma.bill.aggregate({
    where: { distributorId },
    _sum: { grandTotal: true },
    _count: true
  });
  
  // Count unique products from this distributor
  const uniqueProducts = await prisma.billItem.findMany({
    where: {
      bill: { distributorId }
    },
    distinct: ['name'],
    select: { name: true }
  });
  
  return {
    ...distributor,
    totalBills: billStats._count || 0,
    totalAmount: billStats._sum.grandTotal || 0,
    totalProducts: uniqueProducts.length || 0
  };
}

/**
 * Get bills for a distributor
 */
async function getDistributorBills(distributorId, options = {}) {
  const { page = 1, limit = 20 } = options;
  
  const bills = await prisma.bill.findMany({
    where: { distributorId },
    include: {
      items: {
        select: {
          id: true,
          name: true,
          quantity: true,
          rate: true,
          itemTotal: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit
  });
  
  const total = await prisma.bill.count({
    where: { distributorId }
  });
  
  return {
    bills,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

/**
 * Create a new distributor
 */
async function createDistributor(userId, data) {
  const { name, gstin, phone, address, dlNumber, email, notes } = data;
  
  if (!name?.trim()) {
    throw new Error('Distributor name is required');
  }
  
  // Check for duplicates
  if (gstin) {
    const existing = await findByGstin(userId, gstin);
    if (existing) {
      throw new Error(`Distributor with GSTIN ${gstin} already exists: ${existing.name}`);
    }
  }
  
  return prisma.distributor.create({
    data: {
      userId,
      name: name.trim(),
      gstin: gstin?.trim().toUpperCase() || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      dlNumber: dlNumber?.trim() || null,
      email: email?.trim() || null,
      notes: notes?.trim() || null
    }
  });
}

/**
 * Update distributor
 */
async function updateDistributor(distributorId, data) {
  const { name, gstin, phone, address, dlNumber, email, notes, isActive } = data;
  
  const updateData = {};
  
  if (name !== undefined) updateData.name = name.trim();
  if (gstin !== undefined) updateData.gstin = gstin?.trim().toUpperCase() || null;
  if (phone !== undefined) updateData.phone = phone?.trim() || null;
  if (address !== undefined) updateData.address = address?.trim() || null;
  if (dlNumber !== undefined) updateData.dlNumber = dlNumber?.trim() || null;
  if (email !== undefined) updateData.email = email?.trim() || null;
  if (notes !== undefined) updateData.notes = notes?.trim() || null;
  if (isActive !== undefined) updateData.isActive = isActive;
  
  return prisma.distributor.update({
    where: { id: distributorId },
    data: updateData
  });
}

/**
 * Delete distributor (soft delete)
 */
async function deleteDistributor(distributorId) {
  return prisma.distributor.update({
    where: { id: distributorId },
    data: { isActive: false }
  });
}

/**
 * Migrate existing pharmacyName values to Distributor records
 * One-time migration utility
 */
async function migratePharmacyNames(userId) {
  console.log(`[Migration] Starting pharmacyName → Distributor migration for user: ${userId}`);
  
  // Get all bills with pharmacyName but no distributorId
  const billsToMigrate = await prisma.bill.findMany({
    where: {
      userId,
      pharmacyName: { not: null },
      distributorId: null
    },
    select: {
      id: true,
      pharmacyName: true,
      shopAddress: true,
      phoneNumbers: true
    }
  });
  
  console.log(`[Migration] Found ${billsToMigrate.length} bills to migrate`);
  
  let created = 0;
  let linked = 0;
  
  for (const bill of billsToMigrate) {
    try {
      // Parse phone numbers if JSON
      let phone = null;
      if (bill.phoneNumbers) {
        try {
          const phones = JSON.parse(bill.phoneNumbers);
          phone = Array.isArray(phones) ? phones[0] : bill.phoneNumbers;
        } catch {
          phone = bill.phoneNumbers;
        }
      }
      
      // Find or create distributor
      const distributor = await findOrCreateDistributor(userId, {
        name: bill.pharmacyName,
        phone,
        address: bill.shopAddress
      });
      
      if (distributor) {
        // Check if newly created
        const isNew = distributor.createdAt > new Date(Date.now() - 1000);
        if (isNew) created++;
        
        // Link bill to distributor
        await prisma.bill.update({
          where: { id: bill.id },
          data: { distributorId: distributor.id }
        });
        linked++;
      }
    } catch (err) {
      console.error(`[Migration] Error migrating bill ${bill.id}:`, err.message);
    }
  }
  
  console.log(`[Migration] Complete: ${created} distributors created, ${linked} bills linked`);
  
  return { created, linked, total: billsToMigrate.length };
}

module.exports = {
  findOrCreateDistributor,
  getDistributors,
  getDistributorById,
  getDistributorBills,
  createDistributor,
  updateDistributor,
  deleteDistributor,
  migratePharmacyNames
};
