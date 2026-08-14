/**
 * Dual-unit (Marg-style Unit 1 / Unit 2) auto-suggestion.
 *
 * Given a product/pack string like "TAB 20*10" or "SYP 100ML", suggests:
 *   - packLabel (Unit 1, the pack): strip, bottle, vial, tube, box, sachet, kit, pack
 *   - baseUnit  (Unit 2, the base): tablet, capsule, ml, gm, respule, ampoule, piece
 *   - packSize  (conversion): 1 packLabel = packSize baseUnit
 *
 * This is a SUGGESTION only — the pharmacist always confirms/edits it at bill-confirm
 * time (or on the product form). Never silently trusted as ground truth; when nothing
 * can be confidently inferred, fields are left null rather than guessed.
 *
 * Pharmacy units only — exactly these 15, no trade units (kg, dozen, ton, etc.).
 */

const PACK_LABELS = ['strip', 'bottle', 'vial', 'tube', 'box', 'sachet', 'kit', 'pack'];
const BASE_UNITS = ['tablet', 'capsule', 'ml', 'gm', 'respule', 'ampoule', 'piece'];

// Dosage-form keyword -> default {packLabel, baseUnit}. Checked in order; first match wins.
const DOSAGE_FORM_RULES = [
  { pattern: /\bCAP(SULE)?S?\b/i, packLabel: 'strip', baseUnit: 'capsule' },
  { pattern: /\bTAB(LET)?S?\b/i, packLabel: 'strip', baseUnit: 'tablet' },
  { pattern: /\b(SYP|SYRUP|SUSP(ENSION)?|SOL(UTION)?)\b/i, packLabel: 'bottle', baseUnit: 'ml' },
  { pattern: /\bDROPS?\b/i, packLabel: 'bottle', baseUnit: 'ml' },
  { pattern: /\bRESPULE?S?\b/i, packLabel: 'box', baseUnit: 'respule' },
  { pattern: /\bAMP(OULE|S)?\b/i, packLabel: 'box', baseUnit: 'ampoule' },
  { pattern: /\b(INJ(ECTION)?|VIAL)\b/i, packLabel: 'vial', baseUnit: 'ml' },
  { pattern: /\b(OINT(MENT)?|GEL|CREAM|LOTION)\b/i, packLabel: 'tube', baseUnit: 'gm' },
  { pattern: /\bSACHET(S)?\b/i, packLabel: 'sachet', baseUnit: 'gm' },
  { pattern: /\bPOWDER\b/i, packLabel: 'sachet', baseUnit: 'gm' },
  { pattern: /\bKIT\b/i, packLabel: 'kit', baseUnit: 'piece' },
];

function inferDosageForm(text) {
  for (const rule of DOSAGE_FORM_RULES) {
    if (rule.pattern.test(text)) return { packLabel: rule.packLabel, baseUnit: rule.baseUnit };
  }
  return { packLabel: null, baseUnit: null };
}

/**
 * Extract the conversion number (packSize) from a pack string.
 * Priority order, most explicit first:
 *   1. "N*M" / "NxM" (e.g. "20*10") -> M is base-units-per-pack (per-strip tablet count)
 *   2. "N ML" -> N, and forces baseUnit=ml if not already more specific (vial/ml stays)
 *   3. "N GM" / "N G" -> N, forces baseUnit=gm
 *   4. "(N Tab)" / "N Tab(s)" / "N Cap(s)" -> N
 */
function extractPackSize(text, inferredBaseUnit) {
  const starMatch = text.match(/(\d+)\s*[*xX]\s*(\d+)/);
  if (starMatch) {
    return { packSize: parseInt(starMatch[2], 10), baseUnitOverride: null };
  }

  const mlMatch = text.match(/(\d+(?:\.\d+)?)\s*ML\b/i);
  if (mlMatch) {
    return { packSize: Math.round(parseFloat(mlMatch[1])), baseUnitOverride: 'ml' };
  }

  const gmMatch = text.match(/(\d+(?:\.\d+)?)\s*G(?:M|MS)?\b/i);
  if (gmMatch && !/\bML\b/i.test(text)) {
    return { packSize: Math.round(parseFloat(gmMatch[1])), baseUnitOverride: 'gm' };
  }

  // Parenthesized pack count, e.g. "(10 Tab)", is a much stronger signal than a bare
  // "75 Cap" — the latter is often a dose strength (75mg, written without the "mg"),
  // not a pack count, so it's only trusted when there's no parenthesized alternative.
  const parenCountMatch = text.match(/\(\s*(\d+)\s*(?:tab(?:let)?s?|cap(?:sule)?s?)\s*\)/i);
  if (parenCountMatch) {
    return { packSize: parseInt(parenCountMatch[1], 10), baseUnitOverride: null };
  }

  const bareCountMatch = text.match(/(\d+)\s*(?:tab(?:let)?s?|cap(?:sule)?s?)\b/i);
  if (bareCountMatch) {
    return { packSize: parseInt(bareCountMatch[1], 10), baseUnitOverride: null };
  }

  return { packSize: null, baseUnitOverride: null };
}

/**
 * @param {string} text - product name and/or pack string, e.g. "TAB 20*10" or "SYP 100ML"
 * @returns {{ packLabel: string|null, baseUnit: string|null, packSize: number|null }}
 */
function inferPackUnits(text) {
  const input = String(text || '').toUpperCase();
  if (!input.trim()) return { packLabel: null, baseUnit: null, packSize: null };

  const { packLabel, baseUnit } = inferDosageForm(input);
  const { packSize, baseUnitOverride } = extractPackSize(input, baseUnit);

  const finalBaseUnit = baseUnitOverride || baseUnit;
  // If the base unit came from an explicit ML/GM match but no dosage-form keyword hit,
  // default the pack label to the most common container for that base unit.
  const finalPackLabel =
    packLabel || (finalBaseUnit === 'ml' ? 'bottle' : finalBaseUnit === 'gm' ? 'tube' : null);

  return {
    packLabel: PACK_LABELS.includes(finalPackLabel) ? finalPackLabel : null,
    baseUnit: BASE_UNITS.includes(finalBaseUnit) ? finalBaseUnit : null,
    packSize: packSize && packSize > 0 ? packSize : null,
  };
}

module.exports = { inferPackUnits, PACK_LABELS, BASE_UNITS };
