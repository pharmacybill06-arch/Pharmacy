import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import AppBar from '@/components/ui/AppBar';
import Card from '@/components/ui/Card';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import { ledgerApi } from '@/services/api';
import { formatDDMMYYYY } from '@/utils/dateFormat';

const APP_LABEL = {
  phonepe: 'PhonePe',
  google_pay: 'Google Pay',
  paytm: 'Paytm',
  bhim: 'BHIM',
  amazon_pay: 'Amazon Pay',
  cred: 'CRED',
  whatsapp: 'WhatsApp Pay',
  bank: 'Bank app',
  other: 'UPI',
};

function formatAmount(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function Row({ icon, label, value, missing }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={16} color="#64748B" style={{ marginTop: 2 }} />
      <ThemedText style={styles.rowLabel}>{label}</ThemedText>
      <ThemedText style={[styles.rowValue, missing && styles.rowMissing]} numberOfLines={2} selectable>
        {value || 'Not found — enter on next step'}
      </ThemedText>
    </View>
  );
}

/**
 * Scan a UPI payment screenshot into a ledger payment.
 *
 * Reached two ways: sharing a PhonePe / Google Pay / Paytm receipt into the app
 * (imageUri is passed in), or "Scan UPI screenshot" on the ledger (pick from gallery).
 * Reads amount, date, transaction id and receiver, suggests the distributor, flags a
 * screenshot that was already recorded, then hands a pre-filled draft to
 * RecordPaymentScreen — nothing is saved until the pharmacist confirms there.
 */
export default function ScanPaymentScreen({
  userId,
  imageUri: initialUri = null,
  mimeType: initialMime = 'image/jpeg',
  distributors = [],
  onBack,
  onContinue, // (distributor, prefill) => void
  // Parent keeps the last scan so returning from the payment form doesn't re-read
  // (and re-upload) the same screenshot: { image, result, selected }
  cached = null,
  onScanned,
}) {
  const [image, setImage] = useState(cached?.image || (initialUri ? { uri: initialUri, mimeType: initialMime } : null));
  const [status, setStatus] = useState(cached ? 'done' : initialUri ? 'scanning' : 'idle'); // idle | scanning | done | error
  const [result, setResult] = useState(cached?.result || null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [selected, setSelected] = useState(cached?.selected || null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const scanSeq = useRef(0);

  const scan = useCallback(async (uri, mime) => {
    const seq = ++scanSeq.current;
    setStatus('scanning');
    setResult(null);
    setErrorMessage(null);
    setSelected(null);
    try {
      // Phone screenshots are ~1080px wide already; re-encode so PNGs stay under the 5 MB cap
      const prepared = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );
      const res = await ledgerApi.scanScreenshot(userId, prepared.uri, 'image/jpeg');
      if (seq !== scanSeq.current) return;
      const img = { uri: prepared.uri, mimeType: 'image/jpeg' };
      setImage(img);
      setResult(res);
      setSelected(res.match?.distributor || null);
      setStatus('done');
      onScanned?.({ image: img, result: res, selected: res.match?.distributor || null });
    } catch (err) {
      if (seq !== scanSeq.current) return;
      setErrorMessage(err.message || 'Could not read the screenshot.');
      setStatus('error');
    }
  }, [userId, onScanned]);

  useEffect(() => {
    if (initialUri && userId && !cached) scan(initialUri, initialMime);
    // Scan once per mounted screenshot; `cached` only matters on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUri, initialMime, userId, scan]);

  const pickScreenshot = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setErrorMessage('Photo library access is off. Allow it in settings to choose a screenshot.');
      setStatus('error');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ quality: 1, mediaTypes: ['images'] });
    if (picked.canceled || !picked.assets?.length) return;
    const asset = picked.assets[0];
    setImage({ uri: asset.uri, mimeType: asset.mimeType || 'image/jpeg' });
    scan(asset.uri, asset.mimeType || 'image/jpeg');
  }, [scan]);

  const x = useMemo(() => result?.extracted || {}, [result]);
  const duplicate = result?.duplicate;
  const candidates = (result?.match?.candidates || []).filter((c) => c.id !== selected?.id);

  const filteredDistributors = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? distributors.filter((d) => d.name.toLowerCase().includes(q)) : distributors;
  }, [distributors, query]);

  const handleContinue = useCallback(() => {
    if (!selected) return;
    onScanned?.({ image, result, selected });
    const noteParts = [];
    if (x.receiverName) noteParts.push(`Paid to ${x.receiverName}${x.receiverUpiId ? ` (${x.receiverUpiId})` : ''}`);
    if (x.app) noteParts.push(`via ${APP_LABEL[x.app] || x.app}`);
    if (x.note) noteParts.push(`"${x.note}"`);
    onContinue(selected, {
      amount: x.amount,
      paymentDate: x.paymentDate,
      referenceNumber: x.transactionId || '',
      notes: noteParts.join(' '),
      // The screenshot is only read, not stored, so the payment carries no attachment
      extra: {
        transactionId: x.transactionId || null,
        payeeName: x.receiverName || null,
        payeeUpiId: x.receiverUpiId || null,
        paymentApp: x.app || null,
      },
    });
  }, [selected, x, result, image, onContinue, onScanned]);

  // Manual path after a failed read: show the empty result so the user picks the
  // distributor and fills every field on the next step
  const continueManually = useCallback(() => {
    setResult({ extracted: {}, match: { distributor: null, candidates: [] }, duplicate: null, missing: [] });
    setSelected(null);
    setPickerOpen(true);
    setStatus('done');
  }, []);

  const failed = x.status === 'failed';
  const pending = x.status === 'pending';
  const canContinue = status === 'done' && !!selected && !duplicate && !failed;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppBar title="Scan UPI Screenshot" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {status === 'idle' && (
          <Card style={styles.card}>
            <View style={styles.introIcon}><Ionicons name="scan-outline" size={30} color="#4F46E5" /></View>
            <ThemedText style={styles.introTitle}>Add a payment from a screenshot</ThemedText>
            <ThemedText style={styles.introText}>
              Choose the payment receipt from PhonePe, Google Pay, Paytm or your bank app. We read the
              amount, date, transaction ID and who you paid, then fill in the payment for you.
            </ThemedText>
            <ThemedText style={styles.introHint}>
              Tip: you can also share the receipt straight from the UPI app into this app.
            </ThemedText>
            <PrimaryButton title="Choose Screenshot" icon="images-outline" onPress={pickScreenshot} />
          </Card>
        )}

        {image && (
          <View style={styles.previewWrap}>
            <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="contain" />
            {status === 'scanning' && (
              <View style={styles.scanningOverlay}>
                <ActivityIndicator color="#FFFFFF" />
                <ThemedText style={styles.scanningText}>Reading screenshot…</ThemedText>
              </View>
            )}
          </View>
        )}

        {status === 'error' && (
          <Card style={styles.card}>
            <View style={styles.bannerError}>
              <Ionicons name="alert-circle" size={18} color="#B91C1C" />
              <ThemedText style={styles.bannerErrorText}>{errorMessage}</ThemedText>
            </View>
            <View style={styles.buttonRow}>
              <View style={{ flex: 1 }}><SecondaryButton title="Choose Another" icon="images-outline" onPress={pickScreenshot} /></View>
              <View style={{ flex: 1 }}><PrimaryButton title="Enter Manually" onPress={continueManually} /></View>
            </View>
          </Card>
        )}

        {status === 'done' && (
          <>
            {duplicate && (
              <View style={styles.bannerError}>
                <Ionicons name="copy-outline" size={18} color="#B91C1C" />
                <ThemedText style={styles.bannerErrorText}>
                  Already recorded{duplicate.distributor ? ` for ${duplicate.distributor.name}` : ''}
                  {' '}— {formatAmount(duplicate.amount)} on {formatDDMMYYYY(duplicate.paymentDate)}
                  {duplicate.isArchived ? ' (archived)' : ''}. It will not be added twice.
                </ThemedText>
              </View>
            )}
            {(failed || pending) && (
              <View style={failed ? styles.bannerError : styles.bannerWarn}>
                <Ionicons name="warning-outline" size={18} color={failed ? '#B91C1C' : '#B45309'} />
                <ThemedText style={failed ? styles.bannerErrorText : styles.bannerWarnText}>
                  {failed
                    ? 'This payment shows as FAILED in the screenshot, so it was not added.'
                    : 'This payment shows as PENDING. Record it only once the money has gone through.'}
                </ThemedText>
              </View>
            )}

            <Card style={styles.card}>
              <View style={styles.amountRow}>
                <ThemedText style={styles.amountText}>{x.amount ? formatAmount(x.amount) : '₹ —'}</ThemedText>
                {x.app && (
                  <View style={styles.appPill}><ThemedText style={styles.appPillText}>{APP_LABEL[x.app] || x.app}</ThemedText></View>
                )}
              </View>
              <Row icon="person-outline" label="Paid to" value={x.receiverName ? `${x.receiverName}${x.receiverUpiId ? `\n${x.receiverUpiId}` : ''}` : x.receiverUpiId} missing={!x.receiverName && !x.receiverUpiId} />
              <Row icon="calendar-outline" label="Date" value={x.paymentDate ? `${formatDDMMYYYY(x.paymentDate)}${x.time ? ` · ${x.time}` : ''}` : null} missing={!x.paymentDate} />
              <Row icon="barcode-outline" label="Transaction ID" value={x.transactionId} missing={!x.transactionId} />
            </Card>

            {!duplicate && !failed && (
              <Card style={styles.card}>
                <ThemedText style={styles.sectionTitle}>Distributor</ThemedText>
                {selected ? (
                  <View style={styles.selectedRow}>
                    <View style={styles.avatar}><ThemedText style={styles.avatarText}>{selected.name.charAt(0).toUpperCase()}</ThemedText></View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.selectedName}>{selected.name}</ThemedText>
                      {selected.id === result?.match?.distributor?.id && result?.match?.reason && (
                        <ThemedText style={styles.matchReason}>
                          <Ionicons name="sparkles" size={11} color="#059669" /> {result.match.reason}
                        </ThemedText>
                      )}
                    </View>
                    <Pressable onPress={() => setPickerOpen((v) => !v)} hitSlop={8}>
                      <ThemedText style={styles.changeLink}>{pickerOpen ? 'Close' : 'Change'}</ThemedText>
                    </Pressable>
                  </View>
                ) : (
                  <ThemedText style={styles.helpText}>
                    {x.receiverName ? `No distributor matches "${x.receiverName}". ` : ''}Who was this payment for?
                  </ThemedText>
                )}

                {!selected && candidates.length > 0 && (
                  <View style={styles.chips}>
                    {candidates.map((c) => (
                      <Pressable key={c.id} style={styles.chip} onPress={() => setSelected(c)}>
                        <ThemedText style={styles.chipText}>{c.name}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                )}

                {(pickerOpen || !selected) && (
                  <View style={{ marginTop: 10 }}>
                    <View style={styles.searchBar}>
                      <Ionicons name="search" size={16} color="#94A3B8" />
                      <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search distributors…" placeholderTextColor="#94A3B8" />
                    </View>
                    {filteredDistributors.slice(0, 30).map((d) => (
                      <Pressable key={d.id} style={styles.pickRow} onPress={() => { setSelected(d); setPickerOpen(false); setQuery(''); }}>
                        <ThemedText style={styles.pickRowText} numberOfLines={1}>{d.name}</ThemedText>
                        {selected?.id === d.id && <Ionicons name="checkmark-circle" size={18} color="#4F46E5" />}
                      </Pressable>
                    ))}
                    {filteredDistributors.length === 0 && <ThemedText style={styles.helpText}>No distributors found</ThemedText>}
                  </View>
                )}
              </Card>
            )}

            <View style={styles.buttonRow}>
              <View style={{ flex: 1 }}><SecondaryButton title="Scan Another" icon="images-outline" onPress={pickScreenshot} /></View>
              {!duplicate && !failed && (
                <View style={{ flex: 1.3 }}><PrimaryButton title="Continue" icon="arrow-forward" onPress={handleContinue} disabled={!canContinue} /></View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 16, paddingBottom: 40, gap: 12 },
  card: { padding: 16 },
  introIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  introTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  introText: { fontSize: 14, color: '#475569', lineHeight: 20, marginBottom: 8 },
  introHint: { fontSize: 12, color: '#64748B', marginBottom: 16 },
  previewWrap: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#0F172A', height: 260 },
  preview: { width: '100%', height: '100%' },
  scanningOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', gap: 8 },
  scanningText: { color: '#FFFFFF', fontWeight: '600' },
  bannerError: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#FECACA' },
  bannerErrorText: { flex: 1, color: '#991B1B', fontSize: 13, lineHeight: 18 },
  bannerWarn: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#FDE68A' },
  bannerWarnText: { flex: 1, color: '#92400E', fontSize: 13, lineHeight: 18 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  amountText: { fontSize: 28, fontWeight: '800', color: '#0F172A' },
  appPill: { backgroundColor: '#EEF2FF', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  appPillText: { color: '#4338CA', fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  rowLabel: { width: 108, fontSize: 13, color: '#64748B' },
  rowValue: { flex: 1, fontSize: 14, color: '#0F172A', fontWeight: '600' },
  rowMissing: { color: '#B45309', fontWeight: '400', fontStyle: 'italic' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 10 },
  selectedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#4F46E5', fontWeight: '700' },
  selectedName: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  matchReason: { fontSize: 12, color: '#059669', marginTop: 2 },
  changeLink: { color: '#4F46E5', fontWeight: '600' },
  helpText: { fontSize: 13, color: '#64748B' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { borderWidth: 1, borderColor: '#C7D2FE', backgroundColor: '#EEF2FF', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: '#4338CA', fontSize: 13, fontWeight: '600' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 10, marginBottom: 6 },
  searchInput: { flex: 1, paddingVertical: 9, fontSize: 14, color: '#0F172A' },
  pickRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  pickRowText: { flex: 1, fontSize: 14, color: '#0F172A' },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
