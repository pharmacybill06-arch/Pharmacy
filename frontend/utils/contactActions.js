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
  const url = `tel:${normalized}`;
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    Alert.alert('Unable to place call', 'Calling is not supported on this device.');
    return;
  }
  Linking.openURL(url);
}

export async function messagePatientOnWhatsApp(phone, message) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    Alert.alert('No phone number', 'This patient has no phone number on file.');
    return;
  }
  const url = `https://wa.me/${normalized}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    Alert.alert('WhatsApp not available', 'WhatsApp does not appear to be installed on this device.');
    return;
  }
  Linking.openURL(url);
}

export function buildRefillReminderMessage(patient, shopName) {
  const name = patient?.name || 'there';
  const medicineNames = (patient?.medicines || []).map((m) => m.name).filter(Boolean).join(', ');
  const pharmacy = shopName || 'your pharmacy';
  const medicinePart = medicineNames ? ` (${medicineNames})` : '';
  return `Hi ${name}, this is a reminder from ${pharmacy} that your medicine${medicinePart} is running low. Please visit us to refill soon.`;
}
