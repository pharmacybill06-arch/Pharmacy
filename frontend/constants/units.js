/**
 * Dual-unit capture (Marg-style Unit 1 / Unit 2) — pharmacy units only, exactly these 15.
 * No trade units (kg, dozen, ton, etc.). Mirrors backend/src/utils/unitInference.js.
 */

export const PACK_LABELS = ['strip', 'bottle', 'vial', 'tube', 'box', 'sachet', 'kit', 'pack'];
export const BASE_UNITS = ['tablet', 'capsule', 'ml', 'gm', 'respule', 'ampoule', 'piece'];

export function capitalize(word) {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1);
}
