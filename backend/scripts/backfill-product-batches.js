/**
 * Backfill: Product.batchNumber/expiryDate/stock -> ProductBatch rows
 *
 * Part of the Quick Sell / batch-level stock migration
 * (20260810000000_add_product_batches_and_sales).
 *
 * For every Product that still carries the legacy single-batch fields, this creates
 * one ProductBatch row holding that product's whole stock. Expiry strings are parsed
 * with the SAME shared parser the rest of the app uses (utils/dateUtils.parseExpiryDate),
 * so "3/27" becomes 31-03-2027; unparseable values are left null and reported so the
 * user can review them.
 *
 * Batch numbers are copied VERBATIM — never cleaned, corrected or auto-filled.
 * Products with stock but no batch number get a clearly-marked placeholder batch so
 * their stock stays sellable and visible rather than silently vanishing.
 *
 * Safe to re-run: skips any product that already has batches.
 *
 * Usage:
 *   node scripts/backfill-product-batches.js           # apply
 *   node scripts/backfill-product-batches.js --dry-run # report only
 */

const prisma = require('../src/models/prisma');
const { parseExpiryToUtcDate } = require('../src/utils/dateUtils');

const DRY_RUN = process.argv.includes('--dry-run');

// Stock for a product whose legacy rows never carried a batch number still has to live
// somewhere sellable. A recognisable placeholder is better than dropping the quantity.
const PLACEHOLDER_BATCH = 'UNKNOWN-BATCH';

async function main() {
  console.log(`[backfill-batches] Starting${DRY_RUN ? ' (DRY RUN — no writes)' : ''}...`);

  const products = await prisma.product.findMany({
    include: { _count: { select: { batches: true } } },
  });

  const stats = {
    total: products.length,
    created: 0,
    skippedHasBatches: 0,
    skippedNothingToMigrate: 0,
    unparseableExpiry: [],
    placeholderBatch: [],
  };

  for (const product of products) {
    // Idempotent: never touch a product that already has batch-level stock
    if (product._count.batches > 0) {
      stats.skippedHasBatches++;
      continue;
    }

    const legacyBatch = (product.batchNumber || '').trim();
    const legacyStock = product.stock ?? 0;

    // Nothing worth carrying over: no batch identity AND no stock
    if (!legacyBatch && !legacyStock) {
      stats.skippedNothingToMigrate++;
      continue;
    }

    const batchNumber = legacyBatch || PLACEHOLDER_BATCH;
    if (!legacyBatch) {
      stats.placeholderBatch.push({ id: product.id, name: product.name, stock: legacyStock });
    }

    const expiryDate = parseExpiryToUtcDate(product.expiryDate);
    if (product.expiryDate && !expiryDate) {
      // Flagged for user review — left null rather than guessed at
      stats.unparseableExpiry.push({
        id: product.id,
        name: product.name,
        rawExpiry: product.expiryDate,
      });
    }

    if (!DRY_RUN) {
      await prisma.productBatch.create({
        data: {
          productId: product.id,
          batchNumber, // verbatim
          expiryDate,
          // Legacy Product.stock was already tracked in the product's own unit, which is
          // what base units now mean for it — carry it across 1:1 rather than rescaling.
          quantityBase: legacyStock,
          purchaseRate: product.purchaseRate ?? null,
          mrp: product.mrp ?? product.defaultMrp ?? null,
        },
      });
    }
    stats.created++;
  }

  console.log('\n[backfill-batches] ===== SUMMARY =====');
  console.log(`  Products scanned:              ${stats.total}`);
  console.log(`  Batches ${DRY_RUN ? 'to create' : 'created'}:${DRY_RUN ? '            ' : '              '}${stats.created}`);
  console.log(`  Skipped (already had batches): ${stats.skippedHasBatches}`);
  console.log(`  Skipped (no batch, no stock):  ${stats.skippedNothingToMigrate}`);

  if (stats.unparseableExpiry.length > 0) {
    console.log(`\n  ⚠ ${stats.unparseableExpiry.length} product(s) had an unparseable expiry — expiry left NULL, needs user review:`);
    for (const p of stats.unparseableExpiry) {
      console.log(`      - ${p.name} (${p.id}): "${p.rawExpiry}"`);
    }
  }

  if (stats.placeholderBatch.length > 0) {
    console.log(`\n  ⚠ ${stats.placeholderBatch.length} product(s) had stock but no batch number — filed under "${PLACEHOLDER_BATCH}", needs user review:`);
    for (const p of stats.placeholderBatch) {
      console.log(`      - ${p.name} (${p.id}): stock ${p.stock}`);
    }
  }

  console.log('\n[backfill-batches] Done.');
}

main()
  .catch((error) => {
    console.error('[backfill-batches] FAILED:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
