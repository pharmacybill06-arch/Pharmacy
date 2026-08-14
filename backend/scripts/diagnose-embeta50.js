/**
 * Diagnostic (read-only): dump Product + ProductBatch rows for products whose
 * name matches "Embeta 50", byte-by-byte, to find case/whitespace-variant
 * duplicate batches and legacy-field vs ProductBatch mismatches.
 *
 * Usage: node scripts/diagnose-embeta50.js
 */

const prisma = require('../src/models/prisma');

function hexDump(str) {
  if (str === null || str === undefined) return '(null)';
  return Buffer.from(str, 'utf8').toString('hex');
}

async function main() {
  const products = await prisma.product.findMany({
    where: { name: { contains: 'Embeta 50', mode: 'insensitive' } },
    include: {
      batches: { orderBy: { createdAt: 'asc' } },
    },
  });

  console.log(`Found ${products.length} product row(s) matching "Embeta 50"\n`);

  for (const p of products) {
    console.log('='.repeat(80));
    console.log(`Product id=${p.id}`);
    console.log(`  name:            "${p.name}"  (hex: ${hexDump(p.name)})`);
    console.log(`  nameNormalized:  "${p.nameNormalized}"`);
    console.log(`  isActive:        ${p.isActive}`);
    console.log(`  LEGACY batchNumber: "${p.batchNumber}"  (hex: ${hexDump(p.batchNumber)})`);
    console.log(`  LEGACY expiryDate:  "${p.expiryDate}"`);
    console.log(`  LEGACY stock field: ${p.stock}`);
    console.log(`  quantity field:     ${p.quantity}`);
    console.log(`  packSize/baseUnit/packLabel: ${p.packSize} / ${p.baseUnit} / ${p.packLabel}`);
    console.log(`  createdAt: ${p.createdAt.toISOString()}  updatedAt: ${p.updatedAt.toISOString()}`);
    console.log(`  ProductBatch rows (${p.batches.length}):`);

    let sumBatchQty = 0;
    for (const b of p.batches) {
      sumBatchQty += b.quantityBase;
      console.log(`    - id=${b.id}`);
      console.log(`      batchNumber: "${b.batchNumber}"  (hex: ${hexDump(b.batchNumber)}, len=${b.batchNumber.length})`);
      console.log(`      expiryDate:  ${b.expiryDate ? b.expiryDate.toISOString() : '(null)'}`);
      console.log(`      quantityBase: ${b.quantityBase}`);
      console.log(`      isArchived: ${b.isArchived}`);
      console.log(`      sourceBillItemId: ${b.sourceBillItemId}`);
      console.log(`      createdAt: ${b.createdAt.toISOString()}`);
    }
    console.log(`  SUM(batches.quantityBase) = ${sumBatchQty}    vs   Product.stock = ${p.stock}`);

    // Pairwise compare batch numbers for case/whitespace-only differences
    for (let i = 0; i < p.batches.length; i++) {
      for (let j = i + 1; j < p.batches.length; j++) {
        const a = p.batches[i].batchNumber;
        const b = p.batches[j].batchNumber;
        const normA = a.trim().toLowerCase();
        const normB = b.trim().toLowerCase();
        if (a !== b && normA === normB) {
          console.log(`  !! DUPLICATE (case/whitespace variant): "${a}" (${p.batches[i].id}) vs "${b}" (${p.batches[j].id})`);
        }
      }
    }
  }

  if (products.length === 0) {
    console.log('No products matched. Trying a broader "Embeta" search...');
    const broader = await prisma.product.findMany({
      where: { name: { contains: 'Embeta', mode: 'insensitive' } },
      select: { id: true, name: true, nameNormalized: true },
    });
    console.log(broader);
  }
}

main()
  .catch((e) => {
    console.error('FAILED:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
