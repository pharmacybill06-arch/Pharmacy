import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ledgerApi } from '../services/api';
import { ArrowLeft, Check, Archive, Paperclip, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { ddmmyyyyToIso, isoToDdmmyyyy, formatDDMMYYYYOr } from '../utils/dateFormat';
import {
  formatINR, round2, PAYMENT_MODES, REFERENCE_LABEL, autoAllocateFifo, allocationKey,
} from '../utils/money';

function todayDDMMYYYY() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

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

  const [distributor, setDistributor] = useState(null);
  const [targets, setTargets] = useState([]);
  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [amount, setAmount] = useState('');
  const [dateStr, setDateStr] = useState(todayDDMMYYYY());
  const [mode, setMode] = useState('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);

  // 'auto' = FIFO (backend allocates), 'manual' = user splits it, 'later' = on account
  const [allocationMode, setAllocationMode] = useState('auto');
  const [manual, setManual] = useState({});

  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [led, tgt] = await Promise.all([
          ledgerApi.getDistributorLedger(distributorId),
          ledgerApi.getAllocationTargets(distributorId),
        ]);
        setDistributor(led.distributor);
        let t = tgt.targets || [];

        if (isEditing) {
          const p = (led.payments || []).find((x) => x.id === paymentId);
          if (!p) throw new Error('Payment not found');
          setExisting(p);
          setAmount(String(p.amount ?? ''));
          setDateStr(isoToDdmmyyyy(p.paymentDate) || todayDDMMYYYY());
          setMode(p.paymentMethod || 'cash');
          setReference(p.referenceNumber || '');
          setNotes(p.notes || '');
          // When editing, this payment's own allocations count as room on those bills,
          // the same adjustment the backend makes before validating a new plan.
          const own = new Map((p.allocations || []).map((a) => [
            a.allocationType === 'opening_balance' ? 'opening_balance' : a.billId, a.allocatedAmount,
          ]));
          t = t.map((x) => (own.has(allocationKey(x)) ? { ...x, remaining: round2(x.remaining + own.get(allocationKey(x))) } : x));
          for (const [key, amt] of own) {
            if (!t.some((x) => allocationKey(x) === key)) {
              const a = p.allocations.find((y) => (y.allocationType === 'opening_balance' ? 'opening_balance' : y.billId) === key);
              t.push({
                allocationType: a.allocationType, billId: a.billId, remaining: amt,
                label: a.allocationType === 'opening_balance' ? 'Opening balance' : a.bill?.invoiceNumber || 'Bill',
                invoiceDate: a.bill?.invoiceDate, dueDate: a.bill?.dueDate,
              });
            }
          }
          if ((p.allocations || []).length) {
            setAllocationMode('manual');
            setManual(Object.fromEntries([...own].map(([k, v]) => [k, String(v)])));
          }
        }
        setTargets(t);
      } catch (err) {
        toast.error(err.message || 'Failed to load');
        navigate(`/ledger/${distributorId}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [distributorId, paymentId, isEditing, navigate]);

  const amountNum = parseFloat(amount) || 0;
  const autoPlan = useMemo(() => autoAllocateFifo(amountNum, targets), [amountNum, targets]);
  const manualTotal = useMemo(
    () => round2(Object.values(manual).reduce((s, v) => s + (parseFloat(v) || 0), 0)),
    [manual]
  );

  const enterManual = useCallback(() => {
    // Seed manual mode with the FIFO plan so the user edits a sensible starting point.
    setManual(Object.fromEntries(autoPlan.plan.map((p) => [allocationKey(p), String(p.amount)])));
    setAllocationMode('manual');
  }, [autoPlan]);

  const validate = () => {
    if (amountNum <= 0) { setFieldErrors({ amount: 'Enter an amount greater than zero.' }); setFormError(null); return false; }
    if (!ddmmyyyyToIso(dateStr)) { setFieldErrors({ date: 'Enter the date as DD-MM-YYYY.' }); setFormError(null); return false; }
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
      let attachmentPath;
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
      if (allocationMode === 'later') allocations = [];
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
      // 'auto' leaves allocations undefined so the backend FIFO-allocates canonically.

      const data = {
        amount: amountNum,
        paymentDate: ddmmyyyyToIso(dateStr),
        mode,
        referenceNumber: reference.trim() || null,
        notes: notes.trim() || null,
        ...(attachmentPath ? { attachmentPath, attachmentSource: 'upload' } : {}),
        allocations,
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
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => navigate(`/ledger/${distributorId}`)} aria-label="Back"><ArrowLeft size={18} /></button>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700 }}>{isEditing ? 'Edit Payment' : 'Record Payment'}</h2>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Paying {distributor?.name}</p>
        </div>
      </div>

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
              {fieldErrors.date && <div className="form-error">{fieldErrors.date}</div>}
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
                <Paperclip size={14} /> {file ? file.name : existing?.screenshotPath ? 'Replace attachment' : 'Attach file'}
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
            <button type="button" className={`btn btn-sm ${allocationMode === 'auto' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setAllocationMode('auto')}>Oldest bills first</button>
            <button type="button" className={`btn btn-sm ${allocationMode === 'manual' ? 'btn-primary' : 'btn-secondary'}`} onClick={enterManual}>Choose bills</button>
            <button type="button" className={`btn btn-sm ${allocationMode === 'later' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setAllocationMode('later')}>Adjust later</button>
          </div>

          {allocationMode === 'later' && (
            <p style={{ fontSize: 14, color: '#6b7280' }}>Recorded on account — it reduces the outstanding total but isn't tied to specific bills yet.</p>
          )}

          {allocationMode !== 'later' && targets.length === 0 && (
            <p style={{ fontSize: 14, color: '#6b7280' }}>Nothing is due to this distributor right now, so this will be recorded on account.</p>
          )}

          {allocationMode !== 'later' && targets.length > 0 && (
            <div className="table-container">
              <table>
                <thead>
                  <tr><th>Bill</th><th>Due</th><th style={{ textAlign: 'right' }}>Balance</th><th style={{ textAlign: 'right' }}>This payment</th></tr>
                </thead>
                <tbody>
                  {targets.map((t) => {
                    const key = allocationKey(t);
                    const autoAmt = autoPlan.plan.find((p) => allocationKey(p) === key)?.amount || 0;
                    return (
                      <tr key={key}>
                        <td style={{ fontWeight: 500 }}>
                          {t.label}
                          {t.invoiceDate && <div style={{ fontSize: 12, color: '#6b7280' }}>{formatDDMMYYYYOr(t.invoiceDate, '')}</div>}
                        </td>
                        <td>{formatDDMMYYYYOr(t.dueDate, '—')}</td>
                        <td style={{ textAlign: 'right' }}>{formatINR(t.remaining)}</td>
                        <td style={{ textAlign: 'right' }}>
                          {allocationMode === 'auto' ? (
                            <span style={{ fontWeight: autoAmt ? 600 : 400, color: autoAmt ? undefined : '#9ca3af' }}>{autoAmt ? formatINR(autoAmt) : '—'}</span>
                          ) : (
                            <input className="form-input" type="number" min="0" step="0.01" style={{ width: 120, textAlign: 'right', marginLeft: 'auto' }}
                              value={manual[key] ?? ''} placeholder="0"
                              onChange={(e) => setManual((m) => ({ ...m, [key]: e.target.value }))} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {allocationMode === 'auto' && autoPlan.onAccount > 0 && (
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 12 }}>{formatINR(autoPlan.onAccount)} more than is due — kept on account.</p>
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
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/ledger/${distributorId}`)}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}><Check size={16} /> {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Save Payment'}</button>
        </div>
      </div>
    </form>
  );
}
