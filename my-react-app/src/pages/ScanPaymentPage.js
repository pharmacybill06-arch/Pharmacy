import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ledgerApi, distributorApi } from '../services/api';
import { ArrowLeft, ScanLine, Upload, AlertCircle, Copy, AlertTriangle, Sparkles, Search, ArrowRight, Check } from 'lucide-react';
import { formatDDMMYYYY } from '../utils/dateFormat';
import { formatINR } from '../utils/money';

const APP_LABEL = {
  phonepe: 'PhonePe', google_pay: 'Google Pay', paytm: 'Paytm', bhim: 'BHIM', amazon_pay: 'Amazon Pay',
  cred: 'CRED', whatsapp: 'WhatsApp Pay', bank: 'Bank app', other: 'UPI',
};

const banner = (bg, border, color) => ({
  display: 'flex', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: 10,
  background: bg, border: `1px solid ${border}`, color, fontSize: 14, marginBottom: 12,
});

function Field({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: '1px solid #f1f5f9' }}>
      <div style={{ width: 130, color: '#6b7280', fontSize: 13 }}>{label}</div>
      <div style={{ flex: 1, fontWeight: value ? 600 : 400, color: value ? '#111827' : '#b45309', fontStyle: value ? 'normal' : 'italic', wordBreak: 'break-all' }}>
        {value || 'Not found — enter on next step'}
      </div>
    </div>
  );
}

/**
 * Scan a UPI payment screenshot (PhonePe / Google Pay / Paytm…) into a ledger payment.
 * Web counterpart of mobile ScanPaymentScreen: choose, drop or paste the screenshot,
 * review what was read, confirm the distributor, then continue to the pre-filled
 * payment form. The last scan lives in history state so Back from the form restores it.
 */
export default function ScanPaymentPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const restored = location.state?.scan || null;

  const [distributors, setDistributors] = useState([]);
  const [preview, setPreview] = useState(restored?.preview || null);
  const [status, setStatus] = useState(restored ? 'done' : 'idle'); // idle | scanning | done | error
  const [result, setResult] = useState(restored?.result || null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(restored?.selected || null);
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState(false);
  const seq = useRef(0);
  const fileInput = useRef(null);

  useEffect(() => {
    if (!user?.id) return;
    distributorApi.getDistributors(user.id).then((r) => setDistributors(r.distributors || [])).catch(() => {});
  }, [user?.id]);

  const scan = useCallback(async (file) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setError('Choose a PNG, JPG or WebP screenshot.');
      setStatus('error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('That image is over 5 MB. Use the original screenshot rather than a photo of the screen.');
      setStatus('error');
      return;
    }
    const mine = ++seq.current;
    // Data URL (not an object URL) so the preview survives in history state
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    setPreview(dataUrl);
    setStatus('scanning');
    setResult(null);
    setError(null);
    setSelected(null);
    try {
      const res = await ledgerApi.scanScreenshot(user.id, file);
      if (mine !== seq.current) return;
      setResult(res);
      setSelected(res.match?.distributor || null);
      setStatus('done');
    } catch (err) {
      if (mine !== seq.current) return;
      setError(err.message || 'Could not read the screenshot.');
      setStatus('error');
    }
  }, [user?.id]);

  // Ctrl+V a screenshot straight from the clipboard (e.g. copied from WhatsApp Web)
  useEffect(() => {
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (item) { e.preventDefault(); scan(item.getAsFile()); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [scan]);

  const x = useMemo(() => result?.extracted || {}, [result]);
  const duplicate = result?.duplicate;
  const failed = x.status === 'failed';
  const pending = x.status === 'pending';
  const candidates = (result?.match?.candidates || []).filter((c) => c.id !== selected?.id);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? distributors.filter((d) => d.name.toLowerCase().includes(q)) : distributors).slice(0, 40);
  }, [distributors, query]);

  const goToForm = (distributor, prefill) => {
    // Remember this scan on the current history entry so Back restores it
    navigate('/ledger/scan', { replace: true, state: { scan: { preview, result, selected: distributor } } });
    navigate(`/ledger/${distributor.id}/pay`, { state: { prefill } });
  };

  const proceed = () => {
    const note = [
      x.receiverName && `Paid to ${x.receiverName}${x.receiverUpiId ? ` (${x.receiverUpiId})` : ''}`,
      x.app && `via ${APP_LABEL[x.app] || x.app}`,
      x.note && `"${x.note}"`,
    ].filter(Boolean).join(' ');
    goToForm(selected, {
      amount: x.amount,
      paymentDate: x.paymentDate,
      referenceNumber: x.transactionId || '',
      notes: note,
      extra: {
        transactionId: x.transactionId || null,
        payeeName: x.receiverName || null,
        payeeUpiId: x.receiverUpiId || null,
        paymentApp: x.app || null,
      },
    });
  };

  const showPicker = status === 'done' && !duplicate && !failed;

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigate('/ledger')} aria-label="Back"><ArrowLeft size={20} /></button>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700 }}>Scan UPI Screenshot</h2>
          <p style={{ color: '#6b7280', fontSize: 14 }}>PhonePe, Google Pay, Paytm or bank app receipt → payment in the distributor ledger</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)', gap: 20, alignItems: 'start' }} className="quick-sell-grid">
        <div
          className="card"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); scan(e.dataTransfer.files?.[0]); }}
          style={{ padding: 16, borderStyle: 'dashed', borderWidth: 2, borderColor: dragging ? '#4f46e5' : '#e5e7eb', background: dragging ? '#eef2ff' : undefined }}
        >
          {preview ? (
            <div style={{ position: 'relative' }}>
              <img src={preview} alt="Payment screenshot" style={{ width: '100%', maxHeight: 520, objectFit: 'contain', borderRadius: 8, background: '#0f172a' }} />
              {status === 'scanning' && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.55)', color: '#fff', display: 'grid', placeItems: 'center', borderRadius: 8 }}>
                  <div style={{ textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto 8px' }} />Reading screenshot…</div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 12px', color: '#6b7280' }}>
              <ScanLine size={40} style={{ color: '#4f46e5', marginBottom: 12 }} />
              <div style={{ fontWeight: 600, color: '#111827', marginBottom: 4 }}>Drop the screenshot here</div>
              <div style={{ fontSize: 13 }}>or press <kbd>Ctrl</kbd>+<kbd>V</kbd> to paste it</div>
            </div>
          )}
          <button className="btn btn-secondary" style={{ width: '100%', marginTop: 12 }} disabled={status === 'scanning'} onClick={() => fileInput.current?.click()}>
            <Upload size={16} /> {preview ? 'Scan another screenshot' : 'Choose screenshot'}
          </button>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
            onChange={(e) => { scan(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        <div>
          {status === 'idle' && (
            <div className="card"><div className="card-body" style={{ color: '#4b5563', fontSize: 14, lineHeight: 1.6 }}>
              We read the <strong>amount</strong>, <strong>date</strong>, <strong>transaction ID</strong> and <strong>who you paid</strong>,
              match it to your distributor, and fill in the payment for you. Nothing is saved until you confirm.
              The same screenshot can never be recorded twice.
            </div></div>
          )}

          {status === 'error' && (
            <div className="card"><div className="card-body">
              <div style={banner('#fef2f2', '#fecaca', '#991b1b')}><AlertCircle size={18} /> {error}</div>
              <p style={{ fontSize: 14, color: '#4b5563', marginBottom: 8 }}>Or pick the distributor and enter the payment manually.</p>
              <select className="form-input" defaultValue="" onChange={(e) => {
                const d = distributors.find((y) => y.id === e.target.value);
                if (d) goToForm(d, null);
              }}>
                <option value="" disabled>Choose distributor…</option>
                {distributors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div></div>
          )}

          {status === 'done' && (
            <>
              {duplicate && (
                <div style={banner('#fef2f2', '#fecaca', '#991b1b')}>
                  <Copy size={18} />
                  <span>Already recorded{duplicate.distributor ? ` for ${duplicate.distributor.name}` : ''} — {formatINR(duplicate.amount)} on {formatDDMMYYYY(duplicate.paymentDate)}{duplicate.isArchived ? ' (archived)' : ''}. It will not be added twice.</span>
                </div>
              )}
              {(failed || pending) && (
                <div style={failed ? banner('#fef2f2', '#fecaca', '#991b1b') : banner('#fffbeb', '#fde68a', '#92400e')}>
                  <AlertTriangle size={18} />
                  {failed ? 'This payment shows as FAILED in the screenshot, so it cannot be added.'
                    : 'This payment shows as PENDING. Record it only once the money has gone through.'}
                </div>
              )}

              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 30, fontWeight: 800 }}>{x.amount ? formatINR(x.amount) : '₹ —'}</div>
                    {x.app && <span className="badge badge-primary">{APP_LABEL[x.app] || x.app}</span>}
                  </div>
                  <Field label="Paid to" value={[x.receiverName, x.receiverUpiId].filter(Boolean).join(' · ')} />
                  <Field label="Date" value={x.paymentDate ? `${formatDDMMYYYY(x.paymentDate)}${x.time ? ` · ${x.time}` : ''}` : null} />
                  <Field label="Transaction ID" value={x.transactionId} />
                </div>
              </div>

              {showPicker && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-header"><h3>Distributor</h3></div>
                  <div className="card-body">
                    {selected ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <Check size={18} style={{ color: '#4f46e5' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600 }}>{selected.name}</div>
                          {selected.id === result?.match?.distributor?.id && result?.match?.reason && (
                            <div style={{ fontSize: 12, color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}><Sparkles size={12} /> {result.match.reason}</div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize: 14, color: '#4b5563', marginBottom: 10 }}>
                        {x.receiverName ? `No distributor clearly matches “${x.receiverName}”. ` : ''}Who was this payment for?
                      </p>
                    )}
                    {!selected && candidates.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                        {candidates.map((c) => <button key={c.id} type="button" className="btn btn-secondary btn-sm" onClick={() => setSelected(c)}>{c.name}</button>)}
                      </div>
                    )}
                    <div className="search-bar" style={{ marginBottom: 8 }}>
                      <Search size={16} />
                      <input className="form-input" placeholder={selected ? 'Change distributor…' : 'Search distributors…'} value={query} onChange={(e) => setQuery(e.target.value)} />
                    </div>
                    {(query || !selected) && (
                      <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                        {shown.map((d) => (
                          <button key={d.id} type="button" onClick={() => { setSelected(d); setQuery(''); }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', borderBottom: '1px solid #f1f5f9', background: selected?.id === d.id ? '#eef2ff' : '#fff', cursor: 'pointer' }}>
                            {d.name}
                          </button>
                        ))}
                        {shown.length === 0 && <div style={{ padding: 12, color: '#6b7280' }}>No distributors found</div>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {showPicker && (
                <button className="btn btn-primary" style={{ width: '100%' }} disabled={!selected} onClick={proceed}>
                  Continue to payment <ArrowRight size={16} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
