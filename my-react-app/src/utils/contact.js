/**
 * Phone helpers for patient contact links. Web counterpart of mobile utils/contactActions —
 * same normalisation and reminder text, but returns hrefs instead of calling Linking.
 */

/** Assumes India (+91) when a bare 10-digit local number is given. */
export function normalizePhone(phone) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}

export function telHref(phone) {
  const n = normalizePhone(phone);
  return n ? `tel:+${n}` : null;
}

export function whatsAppHref(phone, message) {
  const n = normalizePhone(phone);
  return n ? `https://wa.me/${n}${message ? `?text=${encodeURIComponent(message)}` : ''}` : null;
}

export function buildRefillReminderMessage(patient, shopName) {
  const name = patient?.name || 'there';
  const medicineNames = (patient?.medicines || []).map((m) => m.name).filter(Boolean).join(', ');
  const pharmacy = shopName || 'your pharmacy';
  const medicinePart = medicineNames ? ` (${medicineNames})` : '';
  return `Hi ${name}, this is a reminder from ${pharmacy} that your medicine${medicinePart} is running low. Please visit us to refill soon.`;
}

/** Days-left -> color/label, mirrors the mobile patient screens. */
export function runOutStatus(daysLeft, { short = false } = {}) {
  if (daysLeft === null || daysLeft === undefined) return { color: '#64748B', label: short ? 'Unknown' : 'No medicines' };
  if (daysLeft < 0) return { color: '#DC2626', label: `${Math.abs(daysLeft)}d overdue` };
  if (daysLeft === 0) return { color: '#DC2626', label: 'Runs out today' };
  return { color: daysLeft <= 7 ? '#D97706' : '#059669', label: short ? `${daysLeft}d left` : `Runs out in ${daysLeft}d` };
}
