import { Alert, Linking } from 'react-native';

/**
 * Normalize a phone number to E.164-ish digits for tel:/wa.me links.
 * Assumes India (+91) when a bare 10-digit local number is given.
 */
function normalizePhone(phone) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}

export async function callPatient(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    Alert.alert('No phone number', 'This patient has no phone number on file.');
    return;
  }
  // Note: intentionally NOT gating on Linking.canOpenURL() here — on Android 11+,
  // canOpenURL() requires a <queries> manifest declaration to return true even
  // for the always-handled tel: scheme, so it false-negatives. openURL() itself
  // works fine; we just catch the (rare) real failure instead.
  try {
    await Linking.openURL(`tel:${normalized}`);
  } catch (error) {
    Alert.alert('Unable to place call', 'No dialer app is available on this device.');
  }
}

export async function messagePatientOnWhatsApp(phone, message) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    Alert.alert('No phone number', 'This patient has no phone number on file.');
    return;
  }
  const url = `https://wa.me/${normalized}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
  try {
    await Linking.openURL(url);
  } catch (error) {
    Alert.alert('WhatsApp not available', 'WhatsApp does not appear to be installed on this device.');
  }
}

export function buildRefillReminderMessage(patient, shopName) {
  const name = patient?.name || 'there';
  const medicineNames = (patient?.medicines || []).map((m) => m.name).filter(Boolean).join(', ');
  const pharmacy = shopName || 'your pharmacy';
  const medicinePart = medicineNames ? ` (${medicineNames})` : '';
  return `Hi ${name}, this is a reminder from ${pharmacy} that your medicine${medicinePart} is running low. Please visit us to refill soon.`;
}
