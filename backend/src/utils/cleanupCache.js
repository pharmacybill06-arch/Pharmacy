/**
 * Cleanup utility for BillDetectionCache
 * Removes expired cache entries to keep the database clean
 */

const prisma = require('../models/prisma');

/**
 * Delete expired cache entries
 */
async function cleanupExpiredCache() {
  try {
    const result = await prisma.billDetectionCache.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
    
    console.log(`[CacheCleanup] Deleted ${result.count} expired cache entries`);
    return result.count;
  } catch (err) {
    console.error('[CacheCleanup] Failed to cleanup cache:', err.message);
    return 0;
  }
}

/**
 * Delete old unused cache entries (not hit in 60 days)
 */
async function cleanupOldCache(daysOld = 60) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const result = await prisma.billDetectionCache.deleteMany({
      where: {
        lastHitAt: {
          lt: cutoffDate,
        },
      },
    });
    
    console.log(`[CacheCleanup] Deleted ${result.count} old cache entries (>${daysOld} days)`);
    return result.count;
  } catch (err) {
    console.error('[CacheCleanup] Failed to cleanup old cache:', err.message);
    return 0;
  }
}

/**
 * Get cache statistics
 */
async function getCacheStats() {
  try {
    const total = await prisma.billDetectionCache.count();
    const billCount = await prisma.billDetectionCache.count({
      where: { isBill: true },
    });
    const notBillCount = await prisma.billDetectionCache.count({
      where: { isBill: false },
    });
    
    const topHits = await prisma.billDetectionCache.findMany({
      orderBy: { hitCount: 'desc' },
      take: 5,
      select: {
        subject: true,
        hitCount: true,
        isBill: true,
        confidence: true,
      },
    });
    
    return {
      total,
      billCount,
      notBillCount,
      topHits,
    };
  } catch (err) {
    console.error('[CacheCleanup] Failed to get cache stats:', err.message);
    return null;
  }
}

module.exports = {
  cleanupExpiredCache,
  cleanupOldCache,
  getCacheStats,
};
