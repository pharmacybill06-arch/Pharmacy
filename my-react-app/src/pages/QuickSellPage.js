import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { productApi, batchApi, salesApi } from '../services/api';
import { ArrowLeft, Search, Plus, Minus, X, Trash2, GitBranch, AlertCircle, ShieldCheck, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatINR } from '../utils/money';
import { SCHEDULE_LABEL, isScheduled, round3, formatQuantity, formatBatchExpiry } from '../utils/sales';

function ScheduleBadge({ product }) {
  return isScheduled(product) ? <span className="badge badge-danger" style={{ marginLeft: 6 }}>{SCHEDULE_LABEL[product.scheduleFlag]}</span> : null;
}

const warnBox = { display: 'flex', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: 13, margin: '8px 0' };

// ============================================================
// Item builder — product, batch (FEFO pre-selected, never hidden), qty, price
// ============================================================
function ItemBuilder({ userId, product, onAdd, onCancel }) {
  const [batchData, setBatchData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [overridden, setOverridden] = useState(false);
  const [useBaseUnits, setUseBaseUnits] = useState(false);
  const [qtyInput, setQtyInput] = useState('1');
  const [price, setPrice] = useState('');
  const [split, setSplit] = useState(null);

  const packSize = product.packSize || 1;
  const hasPacks = packSize > 1;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await batchApi.getProductBatches(userId, product.id).catch((err) => { toast.error(err.message); return null; });
      if (cancelled) return;
      setBatchData(res);
      const batches = res?.batches || [];
      setSelectedBatch(batches.find((b) => b.quantityBase > 0) || batches[0] || null);
      const mrp = res?.product?.mrp || product.defaultMrp;
      if (mrp) setPrice(String(mrp));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, product.id, product.defaultMrp]);

  const quantityBase = useMemo(() => {
    const n = parseFloat(qtyInput);
    if (Number.isNaN(n)) return 0;
    return round3(useBaseUnits || !hasPacks ? n : n * packSize);
  }, [qtyInput, useBaseUnits, hasPacks, packSize]);

  // Ask the server how this quantity will actually be drawn, so the split shown is what gets saved
  useEffect(() => {
    let cancelled = false;
    if (!selectedBatch || quantityBase <= 0) { setSplit(null); return undefined; }
    const t = setTimeout(async () => {
      const preview = await salesApi.previewAllocation(product.id, quantityBase, overridden ? selectedBatch.id : null).catch(() => null);
      if (!cancelled) setSplit(preview);
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [product.id, quantityBase, selectedBatch, overridden]);

  const step = (delta) => setQtyInput(String(Math.max(0, round3((parseFloat(qtyInput) || 0) + delta))));

  const info = batchData?.product || product;
  const batches = batchData?.batches || [];

  const add = () => {
    if (!selectedBatch || quantityBase <= 0) return;
    const pricePerBase = price === '' ? null : parseFloat(price);
    const allocations = split?.allocations?.length
      ? split.allocations
      : [{ productBatchId: selectedBatch.id, batchNumber: selectedBatch.batchNumber, quantityBase }];
    onAdd({
      product: info,
      // One cart line per batch drawn from, so the sale keeps exact batch traceability
      lines: allocations.map((a) => ({ productId: product.id, productBatchId: a.productBatchId, batchNumber: a.batchNumber, quantityBase: a.quantityBase, pricePerBase })),
    });
  };

  if (loading) return <div className="card"><div className="loading-spinner"><div className="spinner" /></div></div>;

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center' }}>{info.name}<ScheduleBadge product={info} /></h3>
          <div style={{ fontSize: 13, color: '#6b7280' }}>In stock: {info.stockLabel || formatQuantity(info.totalStock || 0, info)}</div>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={onCancel} aria-label="Cancel item"><X size={18} /></button>
      </div>
      <div className="card-body">
        {batches.length === 0 ? (
          <div style={warnBox}><AlertCircle size={16} /> No batches on record. Add a batch or confirm a purchase bill before selling this item.</div>
        ) : (
          <>
            <label className="form-label">Batch <span style={{ fontWeight: 400, color: '#6b7280' }}>— sorted by expiry, earliest first (FEFO)</span></label>
            <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflowY: 'auto', marginBottom: 16 }}>
              {batches.map((b, i) => {
                const sel = b.id === selectedBatch?.id;
                return (
                  <button key={b.id} type="button" onClick={() => { setSelectedBatch(b); setOverridden(true); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
                      border: `1px solid ${sel ? '#4f46e5' : '#e5e7eb'}`, background: sel ? '#eef2ff' : '#fff' }}>
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontFamily: 'monospace' }}>{b.batchNumber}</strong>
                      {i === 0 && <span className="badge badge-primary" style={{ marginLeft: 6 }}>FEFO</span>}
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{formatBatchExpiry(b.expiryDate)} · {formatQuantity(b.quantityBase, info)} left</div>
                    </div>
                    {b.isEmpty && <span style={{ fontSize: 11, color: '#9ca3af' }}>empty</span>}
                    {sel && <Check size={18} style={{ color: '#4f46e5' }} />}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="form-label" style={{ margin: 0 }}>Quantity</label>
              {hasPacks && (
                <div className="tabs" style={{ margin: 0 }}>
                  <button type="button" className={`tab ${!useBaseUnits ? 'active' : ''}`} onClick={() => setUseBaseUnits(false)}>{info.packLabel || 'pack'}</button>
                  <button type="button" className={`tab ${useBaseUnits ? 'active' : ''}`} onClick={() => setUseBaseUnits(true)}>{info.baseUnit || 'unit'}</button>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <button type="button" className="btn btn-secondary btn-icon" onClick={() => step(-1)} aria-label="Decrease"><Minus size={16} /></button>
              <input className="form-input" type="number" min="0" step="any" style={{ width: 90, textAlign: 'center' }} value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
              <button type="button" className="btn btn-secondary btn-icon" onClick={() => step(1)} aria-label="Increase"><Plus size={16} /></button>
              <span style={{ color: '#4b5563' }}>= {formatQuantity(quantityBase, info)}</span>
            </div>

            {split?.allocations?.length > 1 && (
              <div style={{ ...warnBox, background: '#eef2ff', color: '#3730a3' }}>
                <GitBranch size={16} />
                {split.allocations.map((a) => `${formatQuantity(a.quantityBase, info)} from ${a.batchNumber}`).join(' + ')}
              </div>
            )}
            {split?.warnings?.length > 0 && <div style={warnBox}><AlertCircle size={16} /> {split.warnings[0]}</div>}

            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">Price per {info.baseUnit || 'unit'} (optional)</label>
              <input className="form-input" type="number" min="0" step="0.01" placeholder="Leave blank to record without a price" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>

            <button className="btn btn-primary" style={{ width: '100%' }} disabled={quantityBase <= 0 || !selectedBatch} onClick={add}>
              Add {formatQuantity(quantityBase, info)}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Quick Sell — web counterpart of mobile QuickSellScreen. Search → pick → Add → Save.
 * Any H1/NRX item forces the prescription flow: patient + doctor required, billed immediately.
 */
export default function QuickSellPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(null);
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const searchRef = useRef(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || !user?.id) { setResults([]); setSearching(false); return undefined; }
    const mine = ++seq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await productApi.searchProducts(user.id, q, 8);
        if (mine === seq.current) setResults(res.products || []);
      } catch {
        if (mine === seq.current) setResults([]);
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, user?.id]);

  const scheduled = cart.filter((e) => isScheduled(e.product));
  const needsRx = scheduled.length > 0;
  const canSave = cart.length > 0 && (!needsRx || (customerName.trim() && doctorName.trim()));

  const total = useMemo(() => {
    let sum = 0;
    let anyPriced = false;
    cart.forEach((e) => e.lines.forEach((l) => {
      if (l.pricePerBase != null && !Number.isNaN(l.pricePerBase)) { anyPriced = true; sum += l.quantityBase * l.pricePerBase; }
    }));
    return anyPriced ? round3(sum) : null;
  }, [cart]);

  const addItem = useCallback((entry) => {
    setCart((c) => [...c, entry]);
    setActive(null);
    setTimeout(() => searchRef.current?.focus(), 50);
  }, []);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await salesApi.createSale(user.id, {
        items: cart.flatMap((e) => e.lines),
        customerName: customerName.trim() || null,
        doctorName: doctorName.trim() || null,
        customerPhone: customerPhone.trim() || null,
        totalAmount: total,
      });
      const first = res.sale?.items?.[0];
      const summary = first ? `${first.quantityLabel} ${first.productName}` : `${res.sale?.itemCount || cart.length} items`;
      if (res.warnings?.length) toast(`Sale recorded · stock mismatch: ${res.warnings[0]}`, { icon: '⚠️', duration: 6000 });
      else if (res.sale?.status === 'billed') toast.success(`Sale recorded and billed · ${summary}`);
      else toast.success(`Sale recorded · ${summary}`);
      setCart([]); setCustomerName(''); setDoctorName(''); setCustomerPhone('');
      setTimeout(() => searchRef.current?.focus(), 50);
    } catch (err) {
      toast.error(err.message || 'Failed to record sale');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigate('/sales')} aria-label="Back to sales"><ArrowLeft size={20} /></button>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Quick Sell</h2>
        <Link to="/sales" style={{ marginLeft: 'auto', fontSize: 14 }}>View today's register →</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)', gap: 20, alignItems: 'start' }} className="quick-sell-grid">
        <div>
          {active ? (
            <ItemBuilder userId={user.id} product={active} onAdd={addItem} onCancel={() => setActive(null)} />
          ) : (
            <div className="card">
              <div className="card-body">
                <div className="search-bar">
                  <Search size={16} />
                  <input ref={searchRef} className="form-input" autoFocus placeholder="Search medicine…" value={query} onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { setActive(results[0]); setQuery(''); } }} />
                </div>
                {searching && <div style={{ padding: 12, color: '#6b7280', fontSize: 13 }}>Searching…</div>}
                <div style={{ marginTop: 8 }}>
                  {results.map((p) => (
                    <button key={p.id} type="button" onClick={() => { setActive(p); setQuery(''); }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', border: 'none', borderBottom: '1px solid #f1f5f9', background: 'none', textAlign: 'left', cursor: 'pointer' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{p.name}<ScheduleBadge product={p} /></div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{formatQuantity(p.stock || 0, p)} in stock{p.manufacturer ? ` · ${p.manufacturer}` : ''}</div>
                      </div>
                      <Plus size={20} style={{ color: '#4f46e5' }} />
                    </button>
                  ))}
                  {query.trim().length >= 2 && !searching && results.length === 0 && (
                    <div style={{ padding: 12, color: '#6b7280', fontSize: 14 }}>No medicines match “{query}”.</div>
                  )}
                  {query.trim().length < 2 && (
                    <div style={{ padding: 12, color: '#9ca3af', fontSize: 13 }}>Type at least 2 letters. Press Enter to pick the first match.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="card" style={{ position: 'sticky', top: 16 }}>
          <div className="card-header"><h3>This Sale</h3></div>
          <div className="card-body">
            {cart.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: 14 }}>No items yet.</p>
            ) : cart.map((e, idx) => (
              <div key={`${e.product.id}-${idx}`} style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{e.product.name}<ScheduleBadge product={e.product} /></div>
                  {e.lines.map((l, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#6b7280' }}>
                      {formatQuantity(l.quantityBase, e.product)} · Batch {l.batchNumber}
                      {l.pricePerBase != null && ` · ${formatINR(l.quantityBase * l.pricePerBase)}`}
                    </div>
                  ))}
                </div>
                <button className="btn btn-ghost btn-icon btn-sm" aria-label="Remove item" onClick={() => setCart((c) => c.filter((_, i) => i !== idx))}>
                  <Trash2 size={14} style={{ color: '#dc2626' }} />
                </button>
              </div>
            ))}

            {needsRx && (
              <div style={{ marginTop: 12 }}>
                <div style={{ ...warnBox, background: '#fef2f2', color: '#991b1b' }}>
                  <ShieldCheck size={16} />
                  Schedule {[...new Set(scheduled.map((e) => SCHEDULE_LABEL[e.product.scheduleFlag]))].join('/')} item in this sale — patient and doctor are required, and a bill is created immediately.
                </div>
                <div className="form-group"><label className="form-label">Patient name *</label>
                  <input className="form-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Full name" /></div>
                <div className="form-group"><label className="form-label">Doctor name *</label>
                  <input className="form-input" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} placeholder="Prescribing doctor" /></div>
                <div className="form-group"><label className="form-label">Patient phone (optional)</label>
                  <input className="form-input" type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} /></div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{cart.length} item{cart.length === 1 ? '' : 's'}</div>
                <strong style={{ fontSize: 18 }}>{total != null ? formatINR(total) : 'No price entered'}</strong>
              </div>
              <button className="btn btn-primary" disabled={!canSave || saving} onClick={save}>
                {saving ? 'Saving…' : needsRx ? 'Save & Bill' : 'Save Sale'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
