import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ledgerApi } from '../services/api';
import { ArrowLeft, Check, Archive, Paperclip, X, ScanLine } from 'lucide-react';
import toast from 'react-hot-toast';
import { ddmmyyyyToIso, isoToDdmmyyyy, formatDDMMYYYYOr } from '../utils/dateFormat';
import {
  formatINR, round2, PAYMENT_MODES, REFERENCE_LABEL, allocationKey,
} from '../utils/money';
import { checkPaymentDate, todayIstDDMMYYYY, DATE_MESSAGES } from '../utils/dateRules';

const todayDDMMYYYY = todayIstDDMMYYYY;

/**
 * Record a payment to a distributor, or edit one already recorded.
 *
 * Web counterpart of mobile RecordPaymentScreen — same fields, same three allocation
 * modes, same FIFO preview — so a payment made on either client looks the same. Routes:
 *   /ledger/:distributorId/pay                      record
 *   /ledger/:distributorId/payments/:paymentId      edit (or archive)
 */
export default function PaymentFormPage() {
  const { distributorId, paymentId } = useParams();
  const isEditing = !!paymentId;
  const navigate = useNavigate();
  const { user } = useAuth();
  // Draft from a scanned UPI screenshot (ScanPaymentPage), passed as router state
  const location = useLocation();
  const prefill = !isEditing ? location.state?.prefill || null : null;

  const [distributor, setDistributor] = useState(null);
  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [amount, setAmount] = useState(prefill?.amount ? String(prefill.amount) : '');
  const [dateStr, setDateStr] = useState((prefill?.paymentDate && isoToDdmmyyyy(prefill.paymentDate)) || todayDDMMYYYY());
  const [mode, setMode] = useState(prefill ? 'upi' : 'cash');
  const [reference, setReference] = useState(prefill?.referenceNumber || '');
  const [notes, setNotes] = useState(prefill?.notes || '');
  const [file, setFile] = useState(null);

  // 'current' = Edit default: the allocation the payment has now (save keeps it)
  // 'auto'    = FIFO from the server preview, 'manual' = user splits it, 'later' = on account
  const [allocationMode, setAllocationMode] = useState(isEditing ? 'current' : 'auto');
  const [manual, setManual] = useState({});

  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const led = await ledgerApi.getDistributorLedger(distributorId);
        setDistributor(led.distributor);
        if (isEditing) {
          const p = (led.payments || []).find((x) => x.id === paymentId);
          if (!p) throw new Error('Payment not found');
          setExisting(p);
          setAmount(String(p.amount ?? ''));
          setDateStr(isoToDdmmyyyy(p.paymentDate) || todayDDMMYYYY());
          setMode(p.paymentMethod || 'cash');
          setReference(p.referenceNumber || '');
          setNotes(p.notes || '');
        }
      } catch (err) {
        toast.error(err.message || 'Failed to load');
        navigate(`/ledger/${distributorId}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [distributorId, paymentId, isEditing, navigate]);

  const amountNum = parseFloat(amount) || 0;
  const isoDate = ddmmyyyyToIso(dateStr);
  const dateCheck = checkPaymentDate(mode, isoDate);

  // Server preview: the SAME FIFO the save runs (no local copy of the rule)
  const [preview, setPreview] = useState(null);
  const [previewKey, setPreviewKey] = useState(null);
  const wantedKey = `${amountNum}|${isoDate || ''}|${paymentId || ''}`;
  const seq = useRef(0);
  useEffect(() => {
    if (loading || !isoDate) return undefined;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await ledgerApi.previewAllocation(distributorId, { amount: amountNum, paymentDate: isoDate, paymentId });
        if (my !== seq.current) return;
        setPreview(res);
        setPreviewKey(wantedKey);
      } catch (err) {
        if (my === seq.current) setFormError(err.message || 'Allocation preview load nahi hua');
      }
    }, 300);
    return () => clearTimeout(t);
  }, [loading, distributorId, amountNum, isoDate, paymentId, wantedKey]);

  const previewFresh = !!preview && previewKey === wantedKey;
  const targets = useMemo(() => preview?.targets || [], [preview]);
  const autoPlan = useMemo(() => ({ plan: preview?.plan || [], onAccount: preview?.onAccount || 0 }), [preview]);
  const currentAllocations = useMemo(() => preview?.currentAllocations || [], [preview]);
  const currentBillTotal = round2(currentAllocations.filter((a) => a.allocationType !== 'on_account').reduce((s2, a) => s2 + a.allocatedAmount, 0));
  const manualTotal = useMemo(
    () => round2(Object.values(manual).reduce((s2, v) => s2 + (parseFloat(v) || 0), 0)),
    [manual]
  );

  const enterManual = useCallback(() => {
    // Edit: start from what the payment holds now (its own bills ticked, even fully paid
    // ones). New: start from the FIFO preview.
    if (allocationMode === 'current' || (isEditing && allocationMode !== 'auto')) {
      setManual(Object.fromEntries(targets.filter((t) => t.currentAllocated > 0.005).map((t) => [allocationKey(t), String(t.currentAllocated)])));
    } else {
      setManual(Object.fromEntries(autoPlan.plan.map((p) => [allocationKey(p), String(p.allocatedAmount)])));
    }
    setAllocationMode('manual');
  }, [allocationMode, isEditing, targets, autoPlan.plan]);

  const validate = () => {
    if (amountNum <= 0) { setFieldErrors({ amount: 'Enter an amount greater than zero.' }); setFormError(null); return false; }
    if (!ddmmyyyyToIso(dateStr)) { setFieldErrors({ date: 'Enter the date as DD-MM-YYYY.' }); setFormError(null); return false; }
    if (dateCheck.error) { setFieldErrors({ date: dateCheck.error }); setFormError(null); return false; }
    if (allocationMode === 'current' && currentBillTotal > amountNum + 0.01) {
      setFieldErrors({}); setFormError('Naya amount lagi hui allocation se kam hai. Choose bills se theek karein.'); return false;
    }
    if (allocationMode === 'auto' && !previewFresh) {
      setFieldErrors({}); setFormError('Allocation preview load ho raha hai, ek second ruk kar save karein.'); return false;
    }
    if (allocationMode === 'manual') {
      if (manualTotal > amountNum + 0.01) {
        setFieldErrors({}); setFormError('The amounts you allocated add up to more than the payment amount.'); return false;
      }
      const over = targets.find((t) => (parseFloat(manual[allocationKey(t)]) || 0) > t.remaining + 0.01);
      if (over) {
        setFieldErrors({}); setFormError(`More than the ${formatINR(over.remaining)} due is allocated to ${over.label}.`); return false;
      }
    }
    setFieldErrors({}); setFormError(null);
    return true;
  };

  const save = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      // A scanned screenshot is already uploaded; a newly chosen file replaces it
      let attachmentPath = !file && prefill?.attachmentPath ? prefill.attachmentPath : undefined;
      if (file) {
        try {
          const up = await ledgerApi.uploadAttachment(user.id, file, file.type);
          attachmentPath = up.attachmentPath || up.path || up.filePath;
        } catch {
          setFormError('Could not upload the attachment. You can save without it and add it later.');
          setSaving(false);
          return;
        }
      }

      let allocations;
      if (allocationMode === 'auto' && isEditing) allocations = preview?.allocations || [];
      else if (allocationMode === 'later') allocations = [];
      else if (allocationMode === 'manual') {
        allocations = Object.entries(manual)
          .map(([key, v]) => {
            const amt = parseFloat(v) || 0;
            if (amt <= 0) return null;
            return key === 'opening_balance'
              ? { allocationType: 'opening_balance', billId: null, allocatedAmount: amt }
              : { allocationType: 'bill', billId: key, allocatedAmount: amt };
          })
          .filter(Boolean);
      }
      // New + 'auto': undefined -> the server runs the same plan the preview showed.
      // Edit + 'current': undefined -> the allocation stays exactly as it is.

      const data = {
        amount: amountNum,
        paymentDate: ddmmyyyyToIso(dateStr),
        mode,
        referenceNumber: reference.trim() || null,
        notes: notes.trim() || null,
        ...(attachmentPath ? { attachmentPath, attachmentSource: 'upload' } : {}),
        allocations,
        ...(prefill?.extra || {}),
      };

      if (isEditing) {
        await ledgerApi.updatePayment(paymentId, data);
        toast.success('Payment updated');
      } else {
        await ledgerApi.recordPayment(user.id, distributorId, data);
        toast.success('Payment recorded');
      }
      navigate(`/ledger/${distributorId}`);
    } catch (err) {
      // Same transaction is sitting in the archive: offer to restore it
      if (err.code === 'ARCHIVED_DUPLICATE_TRANSACTION' && err.details?.existingPaymentId) {
        if (window.confirm('Ye payment archive me hai, wapas laayein?')) {
          try {
            await ledgerApi.unarchivePayment(err.details.existingPaymentId);
            toast.success('Payment wapas aa gayi');
            navigate(`/ledger/${distributorId}`);
            return;
          } catch (restoreErr) {
            setFormError(restoreErr.message || 'Restore nahi ho payi');
            return;
          }
        }
        setFormError(err.message);
        return;
      }
      setFormError(err.message || 'Failed to save payment');
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    // Destructive: keep a real confirm, as mobile does.
    if (!window.confirm(`Archive this ${formatINR(existing.amount)} payment? It will be removed from the ledger. Archived payments can be restored.`)) return;
    setSaving(true);
    try {
      await ledgerApi.archivePayment(paymentId);
      toast.success('Payment archived');
      navigate(`/ledger/${distributorId}`);
    } catch (err) {
      setFormError(err.message || 'Failed to archive payment');
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <form onSubmit={save} style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => (prefill ? navigate(-1) : navigate(`/ledger/${distributorId}`))} aria-label="Back"><ArrowLeft size={18} /></button>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700 }}>{isEditing ? 'Edit Payment' : 'Record Payment'}</h2>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Paying {distributor?.name}</p>
        </div>
      </div>

      {prefill && (
        <div className="card" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', marginBottom: 16 }}>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#065f46', fontSize: 14 }}>
            <ScanLine size={16} /> Filled from your payment screenshot — check the details and save.
          </div>
        </div>
      )}

      {formError && (
        <div className="card" style={{ background: '#fef2f2', borderColor: '#fecaca', marginBottom: 16 }}>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#b91c1c', fontWeight: 600, fontSize: 14 }}>
            <span style={{ flex: 1 }}>{formError}</span>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setFormError(null)} aria-label="Dismiss"><X size={14} /></button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Amount (₹)</label>
              <input className={`form-input ${fieldErrors.amount ? 'form-input-error' : ''}`} type="number" min="0" step="0.01"
                value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus={!isEditing} />
              {fieldErrors.amount && <div className="form-error">{fieldErrors.amount}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Payment Date</label>
              <input className={`form-input ${fieldErrors.date ? 'form-input-error' : ''}`} value={dateStr}
                onChange={(e) => setDateStr(e.target.value)} placeholder="DD-MM-YYYY" />
              {dateCheck.isPostDated && (
                <div style={{ display: 'inline-block', marginTop: 6, fontSize: 12, fontWeight: 700, color: '#6d28d9', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 999, padding: '2px 10px' }}>
                  {DATE_MESSAGES.postDatedCheque}
                </div>
              )}
              {(fieldErrors.date || dateCheck.error) && <div className="form-error">{fieldErrors.date || dateCheck.error}</div>}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Mode</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PAYMENT_MODES.map((m) => (
                <button key={m.key} type="button" onClick={() => setMode(m.key)}
                  className={`btn btn-sm ${mode === m.key ? 'btn-primary' : 'btn-secondary'}`}>{m.label}</button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{REFERENCE_LABEL[mode] || 'Reference'}</label>
              <input className="form-input" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Receipt / Screenshot (optional)</label>
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                <Paperclip size={14} /> {file ? file.name : existing?.screenshotPath || prefill?.attachmentPath ? 'Replace attachment' : 'Attach file'}
                <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
                  onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes (optional)</label>
            <textarea className="form-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h3>Settle Against</h3></div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {isEditing && (
              <button type="button" className={`btn btn-sm ${allocationMode === 'current' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setAllocationMode('current')}>Current allocation</button>
            )}
            <button type="button" className={`btn btn-sm ${allocationMode === 'auto' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setAllocationMode('auto')}>{isEditing ? 'FIFO se dobara' : 'Oldest bills first'}</button>
            <button type="button" className={`btn btn-sm ${allocationMode === 'manual' ? 'btn-primary' : 'btn-secondary'}`} onClick={enterManual}>Choose bills</button>
            <button type="button" className={`btn btn-sm ${allocationMode === 'later' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setAllocationMode('later')}>Adjust later</button>
          </div>

          {allocationMode === 'later' && (
            <p style={{ fontSize: 14, color: '#6b7280' }}>Recorded on account — it reduces the outstanding total but isn't tied to specific bills yet.</p>
          )}

          {allocationMode !== 'later' && !preview && (
            <p style={{ fontSize: 14, color: '#6b7280' }}>Allocation load ho rahi hai…</p>
          )}

          {allocationMode === 'current' && preview && (
            currentAllocations.length === 0 ? (
              <p style={{ fontSize: 14, color: '#6b7280' }}>Ye payment abhi kisi bill pe nahi lagi.</p>
            ) : (
              <div className="table-container">
                <table>
                  <thead><tr><th>Bill</th><th>Bill date</th><th style={{ textAlign: 'right' }}>This payment</th></tr></thead>
                  <tbody>
                    {currentAllocations.map((a, i) => (
                      <tr key={`${a.allocationType}-${a.billId || i}`}>
                        <td style={{ fontWeight: 500 }}>
                          {a.label}
                          {a.afterPaymentDate && <div style={{ fontSize: 12, color: '#b45309', fontWeight: 600 }}>Ye bill payment ke baad ka hai</div>}
                        </td>
                        <td>{formatDDMMYYYYOr(a.invoiceDate, '—')}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatINR(a.allocatedAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {allocationMode === 'auto' && preview && (
            autoPlan.plan.length === 0 ? (
              <p style={{ fontSize: 14, color: '#6b7280' }}>Payment date tak koi khula bill nahi — poora amount on account rahega.</p>
            ) : (
              <div className="table-container">
                <table>
                  <thead><tr><th>Bill</th><th>Bill date</th><th style={{ textAlign: 'right' }}>This payment</th></tr></thead>
                  <tbody>
                    {autoPlan.plan.map((p) => (
                      <tr key={allocationKey(p)}>
                        <td style={{ fontWeight: 500 }}>{p.label}</td>
                        <td>{formatDDMMYYYYOr(p.invoiceDate, '—')}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatINR(p.allocatedAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {allocationMode === 'manual' && preview && targets.length === 0 && (
            <p style={{ fontSize: 14, color: '#6b7280' }}>Nothing is due to this distributor right now, so this will be recorded on account.</p>
          )}

          {allocationMode === 'manual' && targets.length > 0 && (
            <div className="table-container">
              <table>
                <thead>
                  <tr><th>Bill</th><th>Bill date</th><th>Due</th><th style={{ textAlign: 'right' }}>Balance</th><th style={{ textAlign: 'right' }}>This payment</th></tr>
                </thead>
                <tbody>
                  {targets.map((t) => {
                    const key = allocationKey(t);
                    return (
                      <tr key={key}>
                        <td style={{ fontWeight: 500 }}>
                          {t.label}
                          {t.afterPaymentDate && <div style={{ fontSize: 12, color: '#b45309', fontWeight: 600 }}>Ye bill payment ke baad ka hai</div>}
                          {t.needsDetails && <div style={{ fontSize: 12, color: '#b45309' }}>Is bill me details baaki hain</div>}
                        </td>
                        <td>{formatDDMMYYYYOr(t.invoiceDate, '—')}</td>
                        <td>{formatDDMMYYYYOr(t.dueDate, '—')}</td>
                        <td style={{ textAlign: 'right' }}>{formatINR(t.remaining)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <input className="form-input" type="number" min="0" step="0.01" style={{ width: 120, textAlign: 'right', marginLeft: 'auto' }}
                            value={manual[key] ?? ''} placeholder="0"
                            onChange={(e) => setManual((m) => ({ ...m, [key]: e.target.value }))} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {allocationMode === 'auto' && autoPlan.onAccount > 0 && (
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 12 }}>{formatINR(autoPlan.onAccount)} on account rahega — payment ke baad wale bills pe apne aap nahi lagega.</p>
          )}
          {allocationMode === 'manual' && (
            <p style={{ fontSize: 13, marginTop: 12, color: manualTotal > amountNum + 0.01 ? '#b91c1c' : '#6b7280' }}>
              Allocated {formatINR(manualTotal)} of {formatINR(amountNum)}
              {amountNum - manualTotal > 0.01 && ` · ${formatINR(amountNum - manualTotal)} on account`}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {isEditing && (
            <button type="button" className="btn btn-ghost" style={{ color: '#b91c1c' }} onClick={archive} disabled={saving}>
              <Archive size={16} /> Archive payment
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" className="btn btn-secondary" onClick={() => (prefill ? navigate(-1) : navigate(`/ledger/${distributorId}`))}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}><Check size={16} /> {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Save Payment'}</button>
        </div>
      </div>
    </form>
  );
}
