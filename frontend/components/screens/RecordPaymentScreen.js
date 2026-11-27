import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import AppBar from '@/components/ui/AppBar';
import Card from '@/components/ui/Card';
import PrimaryButton from '@/components/ui/PrimaryButton';
import DateField from '@/components/ui/DateField';
import { ddmmyyyyToIso, isoToDdmmyyyy, formatDDMMYYYY } from '@/utils/dateFormat';
import { checkPaymentDate, todayIstDDMMYYYY, DATE_MESSAGES } from '@/utils/dateRules';
import { ledgerApi } from '@/services/api';

const MODES = [
  { key: 'upi', label: 'UPI', icon: 'phone-portrait-outline' },
  { key: 'cash', label: 'Cash', icon: 'cash-outline' },
  { key: 'cheque', label: 'Cheque', icon: 'document-text-outline' },
  { key: 'neft_rtgs', label: 'NEFT/RTGS', icon: 'swap-horizontal-outline' },
  { key: 'credit_note', label: 'Credit Note', icon: 'receipt-outline' },
];

const REFERENCE_LABEL = {
  upi: 'UPI Reference / UTR No.',
  neft_rtgs: 'UTR Number',
  cheque: 'Cheque Number',
  credit_note: 'Credit Note No.',
  cash: 'Reference (optional)',
};

function formatAmount(amount) {
  const n = parseFloat(amount) || 0;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// FIFO is NOT computed here any more. The server's allocation-preview runs the exact
// rule the save runs (bills dated on/before the payment, oldest first, rest on account),
// so the preview and the saved allocation cannot drift apart.

function targetKey(target) {
  return target.allocationType === 'opening_balance' ? 'opening_balance' : target.billId;
}

/**
 * Flow C — Record Payment
 */
export default function RecordPaymentScreen({
  distributor,
  userId,
  allocationTargets = [], // deprecated: the screen loads the server preview itself
  onBack,
  onSave,
  onUploadAttachment, // (userId, uri, mimeType) => Promise<attachmentPath>
  isLoading = false,
  // Pass a payment to edit it in place instead of recording a new one. Tapping a
  // payment used to open an Alert that could only show the amount and archive it;
  // the same form that created it is a far better place to correct it.
  existingPayment = null,
  onArchive,
  // Values read from a UPI screenshot (ScanPaymentScreen): { amount, paymentDate (ISO),
  // referenceNumber, notes, attachmentPath (already uploaded), previewUri, extra }.
  // `extra` (transactionId, payeeName, payeeUpiId, paymentApp) is sent along on save.
  prefill = null,
}) {
  const isEditing = !!existingPayment;
  const seed = existingPayment ? null : prefill;

  const [amount, setAmount] = useState(
    existingPayment ? String(existingPayment.amount ?? '') : seed?.amount ? String(seed.amount) : ''
  );
  const [dateStr, setDateStr] = useState(
    existingPayment?.paymentDate ? isoToDdmmyyyy(existingPayment.paymentDate)
      : seed?.paymentDate ? isoToDdmmyyyy(seed.paymentDate) : todayIstDDMMYYYY()
  );
  const [mode, setMode] = useState(existingPayment?.paymentMethod || (seed ? 'upi' : 'cash'));
  const [referenceNumber, setReferenceNumber] = useState(existingPayment?.referenceNumber || seed?.referenceNumber || '');
  const [notes, setNotes] = useState(existingPayment?.notes || seed?.notes || '');
  // { uri, mimeType, source, uploadedPath? } — uploadedPath means it is already on the server
  const [attachment, setAttachment] = useState(
    seed?.attachmentPath
      ? { uri: seed.previewUri, mimeType: 'image/jpeg', source: 'share', uploadedPath: seed.attachmentPath }
      : null
  );
  const [uploading, setUploading] = useState(false);

  // Validation and failure messages live in the form, not in a blocking Alert the user
  // has to dismiss before they can fix anything.
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);

  // allocationMode:
  //   'current' — Edit only, the default: the allocation this payment has right now.
  //               Saving without touching it changes nothing.
  //   'auto'    — FIFO from the server preview (default for a new payment)
  //   'manual'  — Customize: tick bills, including ones dated after the payment
  //   'later'   — skip allocation entirely
  const [allocationMode, setAllocationMode] = useState(isEditing ? 'current' : 'auto');
  const [manualSelections, setManualSelections] = useState({}); // key -> amount string

  const amountNum = parseFloat(amount) || 0;
  const isoDate = ddmmyyyyToIso(dateStr);
  const dateCheck = checkPaymentDate(mode, isoDate);

  // ---- Server preview (single source of the FIFO rule) ----
  const [preview, setPreview] = useState(null);
  const [previewKey, setPreviewKey] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const wantedKey = `${amountNum}|${isoDate || ''}|${existingPayment?.id || ''}`;
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!distributor?.id || !isoDate) return undefined;
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await ledgerApi.previewAllocation(distributor.id, {
          amount: amountNum,
          paymentDate: isoDate,
          paymentId: existingPayment?.id,
        });
        if (seq !== requestSeq.current) return;
        setPreview(res);
        setPreviewKey(wantedKey);
        setPreviewError(null);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setPreviewError(err.message || 'Allocation preview load nahi hua');
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [distributor?.id, amountNum, isoDate, existingPayment?.id, wantedKey]);

  const previewFresh = !!preview && previewKey === wantedKey;
  const targets = useMemo(() => preview?.targets || [], [preview]);
  const autoPlan = useMemo(() => ({ plan: preview?.plan || [], onAccount: preview?.onAccount || 0 }), [preview]);
  const currentAllocations = useMemo(() => preview?.currentAllocations || [], [preview]);
  const currentBillTotal = round2(
    currentAllocations.filter((a) => a.allocationType !== 'on_account').reduce((s, a) => s + a.allocatedAmount, 0)
  );

  // Customize: new payment seeds from the FIFO preview; Edit seeds from what the
  // payment holds now, so its own bills (even fully paid ones) start ticked.
  const enterManualMode = useCallback(() => {
    const next = {};
    if (allocationMode === 'current') {
      for (const t of targets) {
        if (t.currentAllocated > 0.005) next[targetKey(t)] = String(t.currentAllocated);
      }
    } else {
      for (const item of autoPlan.plan) next[targetKey(item)] = String(item.allocatedAmount);
    }
    setManualSelections(next);
    setAllocationMode('manual');
  }, [allocationMode, targets, autoPlan.plan]);

  const manualTotal = useMemo(() => {
    return Object.values(manualSelections).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  }, [manualSelections]);

  const toggleManualTarget = useCallback((target, checked) => {
    const key = targetKey(target);
    setManualSelections((prev) => {
      const next = { ...prev };
      if (checked) {
        const remainingCapacity = Math.max(0, amountNum - manualTotal);
        next[key] = String(round2(Math.min(target.remaining, remainingCapacity || target.remaining)));
      } else {
        delete next[key];
      }
      return next;
    });
  }, [amountNum, manualTotal]);

  const updateManualAmount = useCallback((target, value) => {
    const key = targetKey(target);
    setManualSelections((prev) => ({ ...prev, [key]: value }));
  }, []);

  const requestAttachment = useCallback(async (source) => {
    try {
      let result;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setFormError('Camera access is off. Allow it in settings to photograph the receipt.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          setFormError('Photo library access is off. Allow it in settings to attach a screenshot.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({ quality: 0.9 });
      }

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      setAttachment({ uri: manipulated.uri, mimeType: 'image/jpeg', source });
    } catch (err) {
      console.error('Attachment capture failed:', err);
      setFormError('Could not capture the attachment. Please try again.');
    }
  }, []);

  const removeAttachment = useCallback(() => setAttachment(null), []);

  const validate = useCallback(() => {
    if (!amountNum || amountNum <= 0) {
      setFieldErrors({ amount: 'Enter an amount greater than zero.' });
      setFormError(null);
      return false;
    }
    if (!ddmmyyyyToIso(dateStr)) {
      setFieldErrors({ dateStr: 'Enter the date as DD-MM-YYYY.' });
      setFormError(null);
      return false;
    }
    if (dateCheck.error) {
      setFieldErrors({ dateStr: dateCheck.error });
      setFormError(null);
      return false;
    }
    if (allocationMode === 'manual' && manualTotal > amountNum + 0.01) {
      setFieldErrors({});
      setFormError('The amounts you allocated add up to more than the payment amount.');
      return false;
    }
    if (allocationMode === 'current' && currentBillTotal > amountNum + 0.01) {
      setFieldErrors({});
      setFormError('Naya amount lagi hui allocation se kam hai. Customize karke bills theek karein.');
      return false;
    }
    if ((allocationMode === 'auto') && !previewFresh) {
      setFieldErrors({});
      setFormError('Allocation preview abhi load ho raha hai, ek second ruk kar save karein.');
      return false;
    }
    setFieldErrors({});
    setFormError(null);
    return true;
  }, [amountNum, dateStr, dateCheck, allocationMode, manualTotal, currentBillTotal, previewFresh]);

  const handleSave = useCallback(async () => {
    if (!validate()) return;

    let attachmentPath = attachment?.uploadedPath || null;
    if (attachment && !attachment.uploadedPath) {
      try {
        setUploading(true);
        attachmentPath = await onUploadAttachment(userId, attachment.uri, attachment.mimeType);
      } catch {
        setUploading(false);
        setFormError('Could not upload the attachment. You can save without it and add it later.');
        return;
      }
      setUploading(false);
    }

    let allocations;
    if (allocationMode === 'auto' && isEditing) {
      // Edit + "FIFO se dobara": send exactly the plan the preview showed
      allocations = preview?.allocations || [];
    } else if (allocationMode === 'later') {
      allocations = [];
    } else if (allocationMode === 'manual') {
      allocations = Object.entries(manualSelections)
        .map(([key, value]) => {
          const amt = parseFloat(value) || 0;
          if (amt <= 0) return null;
          if (key === 'opening_balance') return { allocationType: 'opening_balance', billId: null, allocatedAmount: amt };
          return { allocationType: 'bill', billId: key, allocatedAmount: amt };
        })
        .filter(Boolean);
    }
    // New payment + 'auto' -> undefined: the server runs the same planFifo the preview showed.
    // Edit + 'current' -> undefined: the payment keeps exactly the allocation it has.

    onSave?.({
      amount: amountNum,
      paymentDate: ddmmyyyyToIso(dateStr),
      mode,
      referenceNumber: referenceNumber.trim() || null,
      attachmentPath,
      attachmentSource: attachment?.source || null,
      notes: notes.trim() || null,
      allocations,
      ...(seed?.extra || {}),
    });
  }, [validate, attachment, onUploadAttachment, userId, allocationMode, manualSelections, onSave, amountNum, dateStr, mode, referenceNumber, notes, seed, isEditing, preview]);

  const busy = isLoading || uploading;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <AppBar title={isEditing ? 'Edit Payment' : 'Record Payment'} onBack={onBack} />

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {distributor && (
              <View style={styles.distributorBanner}>
                <ThemedText style={styles.distributorBannerLabel}>Paying</ThemedText>
                <ThemedText style={styles.distributorBannerName}>{distributor.name}</ThemedText>
              </View>
            )}

            {seed && (
              <View style={styles.scannedBanner}>
                <Ionicons name="scan-outline" size={18} color="#047857" />
                <ThemedText style={styles.scannedBannerText}>
                  Filled from your payment screenshot — check the details and save.
                </ThemedText>
              </View>
            )}

            {/* Non-blocking error banner — replaces the Alerts this screen used to throw */}
            {formError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={18} color="#B91C1C" />
                <ThemedText style={styles.errorBannerText}>{formError}</ThemedText>
                <Pressable onPress={() => setFormError(null)} hitSlop={8}>
                  <Ionicons name="close" size={16} color="#B91C1C" />
                </Pressable>
              </View>
            )}

            {/* Amount */}
            <Card style={styles.card}>
              <ThemedText style={styles.label}>Amount</ThemedText>
              <View style={styles.amountRow}>
                <ThemedText style={styles.amountPrefix}>₹</ThemedText>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0"
                  placeholderTextColor="#CBD5E1"
                  keyboardType="decimal-pad"
                />
              </View>
              {fieldErrors.amount && <ThemedText style={styles.fieldError}>{fieldErrors.amount}</ThemedText>}
            </Card>

            {/* Date */}
            <Card style={styles.card}>
              <DateField label="Payment Date" value={dateStr} onChange={setDateStr} required />
              {dateCheck.isPostDated && (
                <View style={styles.postDatedBadge}>
                  <Ionicons name="calendar-outline" size={13} color="#7C3AED" />
                  <ThemedText style={styles.postDatedText}>{DATE_MESSAGES.postDatedCheque}</ThemedText>
                </View>
              )}
              {(fieldErrors.dateStr || dateCheck.error) && (
                <ThemedText style={styles.fieldError}>{fieldErrors.dateStr || dateCheck.error}</ThemedText>
              )}
            </Card>

            {/* Mode */}
            <Card style={styles.card}>
              <ThemedText style={styles.label}>Mode</ThemedText>
              <View style={styles.modeGrid}>
                {MODES.map((m) => (
                  <Pressable
                    key={m.key}
                    style={[styles.modeChip, mode === m.key && styles.modeChipActive]}
                    onPress={() => setMode(m.key)}
                  >
                    <Ionicons name={m.icon} size={16} color={mode === m.key ? '#FFFFFF' : '#4F46E5'} />
                    <ThemedText style={[styles.modeChipText, mode === m.key && styles.modeChipTextActive]}>
                      {m.label}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>

              <View style={{ marginTop: 12 }}>
                <ThemedText style={styles.label}>{REFERENCE_LABEL[mode]}</ThemedText>
                <TextInput
                  style={styles.textInput}
                  value={referenceNumber}
                  onChangeText={setReferenceNumber}
                  placeholder={mode === 'credit_note' ? 'e.g., CN-1042' : 'Optional'}
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </Card>

            {/* Attachment */}
            <Card style={styles.card}>
              <ThemedText style={styles.label}>Attachment</ThemedText>

              {attachment ? (
                <View style={styles.attachmentPreviewRow}>
                  <Image source={{ uri: attachment.uri }} style={styles.attachmentPreview} />
                  <Pressable onPress={removeAttachment} style={styles.attachmentRemove}>
                    <Ionicons name="close-circle" size={22} color="#DC2626" />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.attachmentButtons}>
                  {(mode === 'upi' || mode === 'neft_rtgs') && (
                    <Pressable style={styles.attachmentButton} onPress={() => requestAttachment('gallery')}>
                      <Ionicons name="image-outline" size={18} color="#4F46E5" />
                      <ThemedText style={styles.attachmentButtonText}>Attach Screenshot</ThemedText>
                    </Pressable>
                  )}
                  {(mode === 'cash' || mode === 'cheque') && (
                    <Pressable style={styles.attachmentButton} onPress={() => requestAttachment('camera')}>
                      <Ionicons name="camera-outline" size={18} color="#4F46E5" />
                      <ThemedText style={styles.attachmentButtonText}>Photograph Receipt</ThemedText>
                    </Pressable>
                  )}
                  {mode === 'credit_note' && (
                    <>
                      <Pressable style={styles.attachmentButton} onPress={() => requestAttachment('camera')}>
                        <Ionicons name="camera-outline" size={18} color="#4F46E5" />
                        <ThemedText style={styles.attachmentButtonText}>Take Photo</ThemedText>
                      </Pressable>
                      <Pressable style={styles.attachmentButton} onPress={() => requestAttachment('gallery')}>
                        <Ionicons name="image-outline" size={18} color="#4F46E5" />
                        <ThemedText style={styles.attachmentButtonText}>From Gallery</ThemedText>
                      </Pressable>
                    </>
                  )}
                </View>
              )}
            </Card>

            {/* Allocation */}
            <Card style={styles.card}>
              <View style={styles.allocationHeader}>
                <ThemedText style={styles.label}>Allocate to Bills</ThemedText>
                {allocationMode !== 'later' && (
                  <Pressable onPress={() => setAllocationMode('later')}>
                    <ThemedText style={styles.linkText}>Adjust later</ThemedText>
                  </Pressable>
                )}
              </View>

              {previewError && <ThemedText style={styles.fieldError}>{previewError}</ThemedText>}

              {allocationMode === 'later' ? (
                <View style={styles.laterNotice}>
                  <Ionicons name="time-outline" size={16} color="#D97706" />
                  <ThemedText style={styles.laterNoticeText}>
                    This payment will reduce the outstanding balance without settling specific bills. Allocate it later from the payment detail screen.
                  </ThemedText>
                  <Pressable onPress={() => setAllocationMode(isEditing ? 'current' : 'auto')}>
                    <ThemedText style={styles.linkText}>Undo</ThemedText>
                  </Pressable>
                </View>
              ) : !preview ? (
                <ThemedText style={styles.noTargetsText}>Allocation load ho rahi hai…</ThemedText>
              ) : allocationMode === 'current' ? (
                <>
                  <View style={styles.autoNotice}>
                    <ThemedText style={styles.autoNoticeText}>Abhi lagi hui allocation</ThemedText>
                    <View style={{ flexDirection: 'row', gap: 14 }}>
                      <Pressable onPress={() => setAllocationMode('auto')}>
                        <ThemedText style={styles.linkText}>FIFO se dobara</ThemedText>
                      </Pressable>
                      <Pressable onPress={enterManualMode}>
                        <ThemedText style={styles.linkText}>Customize</ThemedText>
                      </Pressable>
                    </View>
                  </View>
                  {currentAllocations.length === 0 ? (
                    <ThemedText style={styles.noTargetsText}>Ye payment abhi kisi bill pe nahi lagi.</ThemedText>
                  ) : (
                    currentAllocations.map((a, i) => (
                      <View key={`${a.allocationType}-${a.billId || i}`} style={styles.allocationRow}>
                        <View style={styles.allocationLabelBlock}>
                          <ThemedText style={styles.allocationLabel}>{a.label}</ThemedText>
                          {a.invoiceDate ? (
                            <ThemedText style={styles.allocationRemaining}>Bill date {formatDDMMYYYY(a.invoiceDate)}</ThemedText>
                          ) : null}
                          {a.afterPaymentDate && (
                            <ThemedText style={styles.afterDateNote}>Ye bill payment ke baad ka hai</ThemedText>
                          )}
                        </View>
                        <ThemedText style={styles.allocationAutoAmount}>{formatAmount(a.allocatedAmount)}</ThemedText>
                      </View>
                    ))
                  )}
                </>
              ) : allocationMode === 'auto' ? (
                <>
                  <View style={styles.autoNotice}>
                    <ThemedText style={styles.autoNoticeText}>
                      FIFO: payment date tak ke bills, sabse purana pehle
                    </ThemedText>
                    <View style={{ flexDirection: 'row', gap: 14 }}>
                      {isEditing && (
                        <Pressable onPress={() => setAllocationMode('current')}>
                          <ThemedText style={styles.linkText}>Undo</ThemedText>
                        </Pressable>
                      )}
                      <Pressable onPress={enterManualMode}>
                        <ThemedText style={styles.linkText}>Customize</ThemedText>
                      </Pressable>
                    </View>
                  </View>
                  {autoPlan.plan.length === 0 && (
                    <ThemedText style={styles.noTargetsText}>
                      Payment date tak koi khula bill nahi — poora amount on account rahega.
                    </ThemedText>
                  )}
                  {autoPlan.plan.map((item) => (
                    <View key={targetKey(item)} style={styles.allocationRow}>
                      <View style={styles.allocationLabelBlock}>
                        <ThemedText style={styles.allocationLabel}>{item.label}</ThemedText>
                        {item.invoiceDate ? (
                          <ThemedText style={styles.allocationRemaining}>Bill date {formatDDMMYYYY(item.invoiceDate)}</ThemedText>
                        ) : null}
                      </View>
                      <ThemedText style={styles.allocationAutoAmount}>{formatAmount(item.allocatedAmount)}</ThemedText>
                    </View>
                  ))}
                  {autoPlan.onAccount > 0 && (
                    <View style={styles.onAccountNotice}>
                      <ThemedText style={styles.onAccountText}>
                        {formatAmount(autoPlan.onAccount)} on account rahega (payment ke baad wale bills pe apne aap nahi lagega)
                      </ThemedText>
                    </View>
                  )}
                </>
              ) : targets.length === 0 ? (
                <ThemedText style={styles.noTargetsText}>
                  No open bills or opening balance to settle — this payment will be recorded as an advance.
                </ThemedText>
              ) : (
                <>
                  {targets.map((target) => {
                    const key = targetKey(target);
                    const checked = manualSelections[key] !== undefined;
                    const value = manualSelections[key] ?? '';
                    return (
                      <View key={key} style={styles.allocationRow}>
                        <Pressable onPress={() => toggleManualTarget(target, !checked)} style={styles.checkbox}>
                          <Ionicons
                            name={checked ? 'checkbox' : 'square-outline'}
                            size={20}
                            color={checked ? '#4F46E5' : '#CBD5E1'}
                          />
                        </Pressable>
                        <View style={styles.allocationLabelBlock}>
                          <ThemedText style={styles.allocationLabel}>{target.label}</ThemedText>
                          <ThemedText style={styles.allocationRemaining}>
                            {target.invoiceDate ? `Bill date ${formatDDMMYYYY(target.invoiceDate)} · ` : ''}Balance {formatAmount(target.remaining)}
                          </ThemedText>
                          {target.afterPaymentDate && (
                            <ThemedText style={styles.afterDateNote}>Ye bill payment ke baad ka hai</ThemedText>
                          )}
                          {target.needsDetails && (
                            <ThemedText style={styles.afterDateNote}>Is bill me details baaki hain</ThemedText>
                          )}
                        </View>
                        {checked ? (
                          <TextInput
                            style={styles.allocationInput}
                            value={value}
                            onChangeText={(v) => updateManualAmount(target, v)}
                            keyboardType="decimal-pad"
                            placeholder="0"
                          />
                        ) : null}
                      </View>
                    );
                  })}
                  <ThemedText style={styles.manualTotalText}>
                    Allocated {formatAmount(manualTotal)} of {formatAmount(amountNum)}
                    {amountNum - manualTotal > 0.005 ? ` · ${formatAmount(amountNum - manualTotal)} on account` : ''}
                  </ThemedText>
                </>
              )}
            </Card>

            {/* Notes */}
            <Card style={styles.card}>
              <ThemedText style={styles.label}>Notes (optional)</ThemedText>
              <TextInput
                style={[styles.textInput, styles.textInputMultiline]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add any notes..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
              />
            </Card>
          </ScrollView>

          <View style={styles.buttonContainer}>
            <PrimaryButton
              title={isEditing ? 'Save Changes' : 'Save Payment'}
              icon="checkmark"
              onPress={handleSave}
              loading={busy}
              disabled={busy}
            />
            {isEditing && onArchive && (
              <Pressable
                style={styles.archiveButton}
                onPress={() => onArchive(existingPayment)}
                disabled={busy}
              >
                <Ionicons name="archive-outline" size={16} color="#B91C1C" />
                <ThemedText style={styles.archiveButtonText}>Archive this payment</ThemedText>
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  scannedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ECFDF5',
    borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#A7F3D0',
  },
  scannedBannerText: { flex: 1, fontSize: 13, color: '#065F46' },
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  errorBannerText: { flex: 1, color: '#B91C1C', fontSize: 13, fontWeight: '600' },
  fieldError: { color: '#B91C1C', fontSize: 12, fontWeight: '600', marginTop: 6 },
  archiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 8,
  },
  archiveButtonText: { color: '#B91C1C', fontSize: 14, fontWeight: '700' },
  safeArea: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },

  distributorBanner: {
    backgroundColor: '#EEF2FF', borderRadius: 14, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: '#C7D2FE',
  },
  distributorBannerLabel: { fontSize: 11, color: '#4F46E5', textTransform: 'uppercase', letterSpacing: 0.4 },
  distributorBannerName: { fontSize: 16, fontWeight: '700', color: '#312E81', marginTop: 2 },

  card: { padding: 16, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },

  amountRow: { flexDirection: 'row', alignItems: 'center' },
  amountPrefix: { fontSize: 28, fontWeight: '700', color: '#0F172A', marginRight: 6 },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '700', color: '#0F172A', paddingVertical: 4 },

  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#C7D2FE', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9,
  },
  modeChipActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  modeChipText: { fontSize: 12, fontWeight: '600', color: '#4F46E5' },
  modeChipTextActive: { color: '#FFFFFF' },

  textInput: {
    backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#0F172A', fontWeight: '500',
  },
  textInputMultiline: { minHeight: 70, textAlignVertical: 'top' },

  attachmentButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  attachmentButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  attachmentButtonText: { fontSize: 13, fontWeight: '600', color: '#4F46E5' },
  attachmentPreviewRow: { flexDirection: 'row', alignItems: 'center' },
  attachmentPreview: { width: 72, height: 72, borderRadius: 12, backgroundColor: '#F1F5F9' },
  attachmentRemove: { marginLeft: 12 },

  allocationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  linkText: { fontSize: 12, fontWeight: '700', color: '#4F46E5' },
  laterNotice: { backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#FDE68A', gap: 6 },
  laterNoticeText: { fontSize: 12, color: '#92400E', lineHeight: 17 },
  noTargetsText: { fontSize: 12, color: '#94A3B8' },
  autoNotice: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  autoNoticeText: { fontSize: 11, color: '#94A3B8', fontStyle: 'italic' },

  allocationRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  checkbox: { marginRight: 10 },
  allocationLabelBlock: { flex: 1 },
  allocationLabel: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  allocationRemaining: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  allocationAutoAmount: { fontSize: 13, fontWeight: '700', color: '#059669' },
  allocationInput: {
    width: 90, backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: '#0F172A', textAlign: 'right', fontWeight: '600',
  },
  onAccountNotice: { marginTop: 8, backgroundColor: '#EEF2FF', borderRadius: 10, padding: 10 },
  onAccountText: { fontSize: 11, color: '#4F46E5', fontWeight: '600' },
  afterDateNote: { fontSize: 11, color: '#B45309', fontWeight: '600', marginTop: 2 },
  postDatedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8,
    backgroundColor: '#F5F3FF', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#DDD6FE',
  },
  postDatedText: { fontSize: 12, color: '#6D28D9', fontWeight: '700' },
  manualTotalText: { fontSize: 12, color: '#64748B', marginTop: 10, textAlign: 'right', fontWeight: '600' },

  buttonContainer: { padding: 16, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
});
