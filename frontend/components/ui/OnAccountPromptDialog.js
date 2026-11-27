import React, { useState } from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { ledgerApi } from '@/services/api';

/**
 * "₹X advance pada hai, is bill me adjust karein?"
 *
 * Shown after a bill is saved (or a "Needs details" bill is completed) when that
 * distributor has on-account money. Advance money is NEVER moved without this
 * question: Haan -> adjust, Na -> leave everything as it is.
 *
 * prompt: the server's onAccountPrompt ({ billId, message, adjustableAmount, ... }) or null
 * onDone({ applied, error }) — called after either answer
 */
export default function OnAccountPromptDialog({ prompt, onDone }) {
  const [busy, setBusy] = useState(false);
  if (!prompt) return null;

  const handleYes = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await ledgerApi.applyOnAccount(prompt.billId);
      onDone?.({ applied: res.applied || 0 });
    } catch (error) {
      onDone?.({ applied: 0, error });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      visible={!!prompt}
      title="Advance pada hai"
      message={`${prompt.message}${prompt.distributorName ? `\n${prompt.distributorName}` : ''}${
        prompt.adjustableAmount < prompt.onAccountAvailable
          ? `\nIs bill me ₹${Number(prompt.adjustableAmount).toLocaleString('en-IN')} lagega.`
          : ''
      }`}
      type="info"
      confirmText={busy ? 'Adjust ho raha hai…' : 'Haan, adjust karein'}
      cancelText="Na"
      onConfirm={handleYes}
      onCancel={() => onDone?.({ applied: 0 })}
    />
  );
}
