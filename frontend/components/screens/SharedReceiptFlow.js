import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import ScanPaymentScreen from '@/components/screens/ScanPaymentScreen';
import RecordPaymentScreen from '@/components/screens/RecordPaymentScreen';
import Toast from '@/components/ui/Toast';
import { ledgerApi, distributorApi } from '@/services/api';

/**
 * Scan → confirm → save for a UPI receipt screenshot shared into the app.
 *
 * Shown by the root layout in a full-screen Modal rather than by navigating to the
 * ledger: in a development build, sharing into the app re-creates the React root and
 * the router is briefly bound to the torn-down one, so any navigation from a share
 * fails. A modal needs no navigator, so this works in whichever root is alive.
 * Talks to the API directly; it does not depend on a screen's context providers.
 */
export default function SharedReceiptFlow({ userId, imageUri, mimeType, onClose, onSaved }) {
  const [step, setStep] = useState('scan'); // scan | record
  const [distributors, setDistributors] = useState([]);
  const [distributor, setDistributor] = useState(null);
  const [targets, setTargets] = useState([]);
  const [prefill, setPrefill] = useState(null);
  const [cache, setCache] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info', title: '' });

  const showToast = (message, type = 'info', title = '') => setToast({ visible: true, message, type, title });

  useEffect(() => {
    if (!userId) return;
    distributorApi.getDistributors(userId)
      .then((res) => setDistributors(res.distributors || []))
      .catch(() => setDistributors([]));
  }, [userId]);

  const handleContinue = useCallback(async (selected, draft) => {
    try {
      const res = await ledgerApi.getAllocationTargets(selected.id);
      setTargets(res.targets || []);
    } catch {
      setTargets([]); // still recordable; it just goes on account
    }
    setDistributor(selected);
    setPrefill(draft);
    setStep('record');
  }, []);

  const handleUpload = useCallback(async (uid, uri, type) => {
    const res = await ledgerApi.uploadAttachment(uid, uri, type);
    return res.attachmentPath;
  }, []);

  const handleSave = useCallback(async (data) => {
    setSaving(true);
    try {
      const res = await ledgerApi.recordPayment(userId, distributor.id, data);
      onSaved?.({ distributor, payment: res.payment, duplicateWarning: res.duplicateWarning });
    } catch (err) {
      showToast(
        err.message || 'Failed to record payment',
        'error',
        err.message?.includes('already recorded') ? 'Duplicate payment' : 'Error'
      );
    } finally {
      setSaving(false);
    }
  }, [userId, distributor, onSaved]);

  return (
    <View style={styles.container}>
      {step === 'scan' ? (
        <ScanPaymentScreen
          userId={userId}
          imageUri={imageUri}
          mimeType={mimeType}
          distributors={distributors}
          onBack={onClose}
          onContinue={handleContinue}
          cached={cache}
          onScanned={setCache}
        />
      ) : (
        <RecordPaymentScreen
          distributor={distributor}
          userId={userId}
          allocationTargets={targets}
          prefill={prefill}
          onBack={() => setStep('scan')}
          onSave={handleSave}
          onUploadAttachment={handleUpload}
          isLoading={saving}
        />
      )}
      <Toast {...toast} onHide={() => setToast((t) => ({ ...t, visible: false }))} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
});
