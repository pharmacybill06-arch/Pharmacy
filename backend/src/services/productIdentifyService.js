/**
 * Identify a mystery product with AI — for catalog entries that
 * productService.syncProductsFromBillItems auto-created straight from a distributor
 * invoice's OCR text.
 *
 * When OCR misreads a medicine name, nothing in the catalog matches its nameNormalized,
 * so a brand-new product is created (e.g. "DURENGE 500 MG TAB" with batch LAW2006 for a
 * drug the pharmacy has stocked for years under its correct name). Product.nameNormalized
 * only catches case/whitespace variants, and productMergeService.suggestMergeCandidates
 * only catches substring overlap — neither catches a misread character.
 *
 * This asks the AI what the product most likely IS, given the purchase context the bill
 * already carries (manufacturer, HSN, MRP, pack, distributor) plus the pharmacy's own
 * catalog. It only ever SUGGESTS: the pharmacist then merges it into an existing product
 * (productMergeService.mergeProducts) or confirms it as a genuinely new medicine. Nothing
 * is auto-merged and nothing is renamed without confirmation.
 */

const prisma = require('../models/prisma');
const { normalizeProductName, calculateSimilarity } = require('./productService');
const { generateStructuredJson } = require('../utils/aiService');

// How many catalog entries get sent to the model. The prompt has to stay small enough to
// stay accurate and cheap, so a cheap local pre-filter picks the plausible ones first.
const DEFAULT_CANDIDATE_LIMIT = 40;

// ============================================
// PURCHASE CONTEXT
// ============================================

function formatExpiry(date) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function distinct(values) {
  return [...new Set(values.filter((v) => v !== null && v !== undefined && String(v).trim() !== ''))];
}

/**
 * Everything the purchase trail knows about this product. The bill is the only real
 * evidence of what the physical medicine was — the catalog row is just OCR output.
 */
async function gatherPurchaseContext(productId) {
  const [batches, billItems] = await Promise.all([
    prisma.productBatch.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        batchNumber: true,
        expiryDate: true,
        quantityBase: true,
        mrp: true,
        purchaseRate: true,
        isArchived: true,
      },
    }),
    prisma.billItem.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        name: true,
        manufacturer: true,
        hsnCode: true,
        batchNumber: true,
        expiryDate: true,
        quantity: true,
        unit: true,
        packLabel: true,
        baseUnit: true,
        packSize: true,
        mrp: true,
        rate: true,
        bill: {
          select: {
            invoiceNumber: true,
            invoiceDate: true,
            distributor: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  return {
    batches: batches.map((b) => ({
      batchNumber: b.batchNumber,
      expiry: formatExpiry(b.expiryDate),
      quantityBase: b.quantityBase,
      mrp: b.mrp,
      purchaseRate: b.purchaseRate,
      isArchived: b.isArchived,
    })),
    // The name EXACTLY as printed/OCR'd on each invoice line — often more informative
    // than the catalog name, and differences between lines are themselves a signal.
    printedNames: distinct(billItems.map((i) => i.name)),
    manufacturers: distinct(billItems.map((i) => i.manufacturer)),
    hsnCodes: distinct(billItems.map((i) => i.hsnCode)),
    distributors: distinct(billItems.map((i) => i.bill?.distributor?.name)),
    invoices: billItems
      .filter((i) => i.bill?.invoiceNumber)
      .slice(0, 5)
      .map((i) => ({ invoiceNumber: i.bill.invoiceNumber, invoiceDate: i.bill.invoiceDate })),
    packs: distinct(
      billItems.map((i) =>
        i.packLabel && i.baseUnit && i.packSize ? `1 ${i.packLabel} = ${i.packSize} ${i.baseUnit}` : i.unit
      )
    ),
    mrps: distinct(billItems.map((i) => i.mrp)),
    rates: distinct(billItems.map((i) => i.rate)),
    billItemCount: billItems.length,
  };
}

// ============================================
// CANDIDATE SHORTLIST
// ============================================

/**
 * Leading alphabetic run of a name — "durenge500mgtab" -> "durenge". Brand names are what
 * OCR mangles, and the leading letters usually survive at least partially intact.
 */
function leadingAlpha(normalized) {
  const match = String(normalized || '').match(/^[a-z]+/);
  return match ? match[0] : '';
}

/**
 * Cheap local pre-filter, run before the AI sees anything. Scores each catalog entry on
 * name similarity plus hard purchase-context signals (same manufacturer/HSN/salt is
 * strong evidence of the same drug even when the OCR'd names look nothing alike).
 * Deliberately generous — this only decides what the model gets to consider, and the
 * model does the actual judging.
 */
function shortlistCandidates(product, context, catalog, limit = DEFAULT_CANDIDATE_LIMIT) {
  const targetNorm = product.nameNormalized || normalizeProductName(product.name);
  const targetLead = leadingAlpha(targetNorm);
  const contextManufacturers = new Set(context.manufacturers.map((m) => m.toLowerCase()));
  const contextHsn = new Set(context.hsnCodes.map((h) => String(h).trim()));
  const productSalt = product.salt?.trim().toLowerCase();

  const scored = catalog.map((candidate) => {
    const candidateNorm = candidate.nameNormalized || normalizeProductName(candidate.name);
    let score = calculateSimilarity(targetNorm, candidateNorm);
    const signals = [];

    const candidateLead = leadingAlpha(candidateNorm);
    if (targetLead && candidateLead) {
      const leadSimilarity = calculateSimilarity(targetLead, candidateLead);
      if (leadSimilarity >= 0.6) {
        score += 0.2 * leadSimilarity;
        signals.push('similar brand prefix');
      }
    }

    if (candidate.manufacturer && contextManufacturers.has(candidate.manufacturer.trim().toLowerCase())) {
      score += 0.25;
      signals.push('same manufacturer');
    }
    if (candidate.hsnCode && contextHsn.has(String(candidate.hsnCode).trim())) {
      score += 0.15;
      signals.push('same HSN code');
    }
    if (productSalt && candidate.salt && candidate.salt.trim().toLowerCase() === productSalt) {
      score += 0.2;
      signals.push('same salt');
    }

    return { candidate, score, signals };
  });

  return scored
    .filter((entry) => entry.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ============================================
// PROMPT
// ============================================

function buildPrompt(product, context, shortlist) {
  const catalogLines = shortlist.map((entry, idx) => {
    const c = entry.candidate;
    const bits = [
      `${idx + 1}. productId: "${c.id}"`,
      `name: "${c.name}"`,
      c.salt ? `salt: "${c.salt}"` : null,
      c.manufacturer ? `manufacturer: "${c.manufacturer}"` : null,
      c.hsnCode ? `hsn: "${c.hsnCode}"` : null,
      `pack: 1 ${c.packLabel} = ${c.packSize} ${c.baseUnit}`,
      `stock: ${c.stock}`,
      `timesPurchased: ${c.usageCount}`,
      entry.signals.length ? `localSignals: ${entry.signals.join(', ')}` : null,
    ].filter(Boolean);
    return bits.join(' | ');
  });

  return `You are a pharmacist's assistant with deep knowledge of Indian pharmaceutical brands, salts, manufacturers and packaging conventions.

A pharmacy management app auto-created a catalog product from OCR text read off a distributor's purchase invoice. OCR frequently misreads dense medicine names (0/O, 1/I/l, 5/S, 6/G, 8/B, rn/m, cl/d), so this catalog entry may be a GARBLED version of a medicine the pharmacy already stocks under its correct name — or it may be a genuinely new medicine the pharmacy simply had not bought before.

Your job is to decide which, and say what the medicine most likely really is.

=== THE PRODUCT IN QUESTION ===
Catalog name (as auto-created from OCR): "${product.name}"
${product.salt ? `Salt on record: ${product.salt}\n` : ''}${product.manufacturer ? `Manufacturer on record: ${product.manufacturer}\n` : ''}${product.hsnCode ? `HSN on record: ${product.hsnCode}\n` : ''}Pack definition: 1 ${product.packLabel} = ${product.packSize} ${product.baseUnit}
Current stock: ${product.stock}
Times seen on bills: ${product.usageCount}

=== PURCHASE EVIDENCE FROM THE ACTUAL INVOICES ===
Name(s) as printed on invoice lines: ${context.printedNames.length ? context.printedNames.map((n) => `"${n}"`).join(', ') : 'none recorded'}
Manufacturer(s) on invoice: ${context.manufacturers.join(', ') || 'none recorded'}
HSN code(s) on invoice: ${context.hsnCodes.join(', ') || 'none recorded'}
Distributor(s) it was bought from: ${context.distributors.join(', ') || 'none recorded'}
Pack/unit as billed: ${context.packs.join(', ') || 'none recorded'}
MRP(s): ${context.mrps.join(', ') || 'none recorded'}
Purchase rate(s): ${context.rates.join(', ') || 'none recorded'}
Batches recorded: ${context.batches.length ? context.batches.map((b) => `${b.batchNumber} (exp ${b.expiry || 'unknown'}, qty ${b.quantityBase}${b.mrp ? `, MRP ${b.mrp}` : ''})`).join('; ') : 'none'}

=== THE PHARMACY'S EXISTING CATALOG (candidates it could actually be) ===
${catalogLines.length ? catalogLines.join('\n') : '(no similar products in the catalog)'}

=== HOW TO DECIDE ===
1. First ask: is "${product.name}" a real, recognisable Indian medicine brand name as written? If yes, that pushes toward it being genuinely new. If it looks like a near-miss of a real brand (a plausible OCR corruption of one), that pushes toward a match.
2. Then compare against the catalog list above. A strong match usually shows SEVERAL of: near-identical brand letters, same strength/dosage number, same dosage form (tab/cap/syrup/inj), same manufacturer, same HSN, similar MRP, same pack definition.
3. Manufacturer and HSN agreement is strong evidence even when the OCR'd names look quite different. Two entries with different manufacturers are rarely the same product.
4. A shared strength alone ("500 mg") is WEAK evidence — hundreds of unrelated drugs share it. Never match on strength or dosage form alone.
5. Be honest about uncertainty. A wrong merge silently corrupts stock and purchase history for two different medicines, which is far worse than leaving a duplicate for the pharmacist to look at again. If nothing in the catalog is convincing, say so.
6. You may ONLY return productId values that appear verbatim in the catalog list above. Never invent one.

Return ONLY valid JSON (no markdown, no commentary) in exactly this shape:
{
  "verdict": "match" | "new" | "unsure",
  "matches": [
    { "productId": "<id copied verbatim from the list above>", "confidence": <0.0-1.0>, "reason": "<one sentence citing the specific evidence>" }
  ],
  "likelyRealName": "<the correctly-spelled medicine name you believe this actually is, or null>",
  "salt": "<salt composition if you are confident, else null>",
  "manufacturer": "<manufacturer if you are confident, else null>",
  "isRecognisedBrand": <true if "${product.name}" reads as a real Indian medicine brand as written, else false>,
  "reasoning": "<2-3 sentences explaining your decision in plain language a pharmacist can check>"
}

Rules for the fields:
- "match": you are confident it is one of the catalog products. Put it first in "matches" with confidence >= 0.7.
- "unsure": there are plausible candidates but the evidence does not settle it. List them in "matches" with their honest confidences (each < 0.7).
- "new": it is a genuinely different medicine. "matches" must be an empty array.
- "likelyRealName" is the corrected spelling of THIS product (useful even when verdict is "new" — OCR may have garbled the name of a real new medicine). Null if you cannot tell.
- Order "matches" strongest first, at most 3 entries.`;
}

// ============================================
// RESPONSE VALIDATION
// ============================================

function clampConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Never trust the model's ids or verdict blindly: drop any productId it invented, then
 * re-derive the verdict from what actually survived so the UI can't offer a merge into
 * a product that does not exist.
 */
function validateAiResponse(raw, shortlist) {
  const candidateById = new Map(shortlist.map((entry) => [entry.candidate.id, entry.candidate]));

  const rawMatches = Array.isArray(raw?.matches) ? raw.matches : [];
  const matches = rawMatches
    .map((m) => {
      const candidate = candidateById.get(m?.productId);
      if (!candidate) {
        console.warn(`[PRODUCT IDENTIFY] Dropping hallucinated productId from AI response: ${m?.productId}`);
        return null;
      }
      return {
        productId: candidate.id,
        name: candidate.name,
        salt: candidate.salt,
        manufacturer: candidate.manufacturer,
        stock: candidate.stock,
        packLabel: candidate.packLabel,
        baseUnit: candidate.baseUnit,
        packSize: candidate.packSize,
        confidence: clampConfidence(m.confidence),
        reason: typeof m.reason === 'string' ? m.reason : '',
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  let verdict = ['match', 'new', 'unsure'].includes(raw?.verdict) ? raw.verdict : 'unsure';
  // A "match" verdict with nothing left after id validation is not a match.
  if (verdict === 'match' && (matches.length === 0 || matches[0].confidence < 0.7)) {
    verdict = matches.length > 0 ? 'unsure' : 'new';
  }
  if (verdict === 'new' && matches.length > 0 && matches[0].confidence >= 0.7) {
    verdict = 'match';
  }

  return {
    verdict,
    matches,
    likelyRealName: typeof raw?.likelyRealName === 'string' && raw.likelyRealName.trim() ? raw.likelyRealName.trim() : null,
    salt: typeof raw?.salt === 'string' && raw.salt.trim() ? raw.salt.trim() : null,
    manufacturer: typeof raw?.manufacturer === 'string' && raw.manufacturer.trim() ? raw.manufacturer.trim() : null,
    isRecognisedBrand: raw?.isRecognisedBrand === true,
    reasoning: typeof raw?.reasoning === 'string' ? raw.reasoning : '',
  };
}

// ============================================
// MAIN ENTRY POINT
// ============================================

/**
 * @param {string} userId
 * @param {string} productId - The product to identify
 * @param {Object} options
 * @param {number} options.candidateLimit - How many catalog entries the AI may consider
 * @returns {Promise<Object>} Suggestion payload — never mutates anything
 */
async function identifyProduct(userId, productId, { candidateLimit = DEFAULT_CANDIDATE_LIMIT } = {}) {
  const product = await prisma.product.findFirst({ where: { id: productId, userId } });
  if (!product) {
    throw new Error('Product not found');
  }

  const [context, catalog] = await Promise.all([
    gatherPurchaseContext(productId),
    prisma.product.findMany({
      where: { userId, isActive: true, NOT: { id: productId } },
      select: {
        id: true,
        name: true,
        nameNormalized: true,
        salt: true,
        manufacturer: true,
        hsnCode: true,
        packLabel: true,
        baseUnit: true,
        packSize: true,
        stock: true,
        usageCount: true,
      },
    }),
  ]);

  const shortlist = shortlistCandidates(product, context, catalog, candidateLimit);
  console.log(
    `[PRODUCT IDENTIFY] "${product.name}" — ${catalog.length} catalog entries, ` +
    `${shortlist.length} shortlisted for AI, ${context.billItemCount} bill lines of context`
  );

  const prompt = buildPrompt(product, context, shortlist);
  const { data, source } = await generateStructuredJson(prompt, { label: 'product identity', temperature: 0 });
  const ai = validateAiResponse(data, shortlist);

  // If the pharmacist accepts the corrected name, would renaming collide with an existing
  // product? Then the right action is a merge, not a rename — surface that up front rather
  // than letting productService.updateProduct fail with a bare "name already exists".
  let nameCollision = null;
  if (ai.likelyRealName) {
    const normalized = normalizeProductName(ai.likelyRealName);
    if (normalized && normalized !== product.nameNormalized) {
      const clash = await prisma.product.findFirst({
        where: { userId, nameNormalized: normalized, isActive: true, NOT: { id: productId } },
        select: { id: true, name: true, stock: true },
      });
      if (clash) nameCollision = clash;
    }
  }

  console.log(
    `[PRODUCT IDENTIFY] ${source} verdict=${ai.verdict} ` +
    `matches=${ai.matches.length}${ai.matches[0] ? ` top="${ai.matches[0].name}" @${ai.matches[0].confidence}` : ''}` +
    `${nameCollision ? ` nameCollision="${nameCollision.name}"` : ''}`
  );

  return {
    product: {
      id: product.id,
      name: product.name,
      salt: product.salt,
      manufacturer: product.manufacturer,
      hsnCode: product.hsnCode,
      stock: product.stock,
      usageCount: product.usageCount,
      packLabel: product.packLabel,
      baseUnit: product.baseUnit,
      packSize: product.packSize,
    },
    context,
    ai,
    nameCollision,
    candidatesConsidered: shortlist.length,
    source,
  };
}

module.exports = {
  identifyProduct,
  // exported for tests / reuse
  shortlistCandidates,
  validateAiResponse,
  gatherPurchaseContext,
};
