import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Minus, Archive, ArchiveRestore } from 'lucide-react';
import toast from 'react-hot-toast';
import { batchApi } from '../services/api';
import { round3, formatQuantity, formatBatchExpiry } from '../utils/sales';

/**
 * Stock is the sum of a product's batches, so stock is corrected per batch: set the
 * count of a batch, add a batch, or archive one (never delete — a batch that was sold
 * from must stay traceable). Counts are in the product's base unit.
 */
export default function ManageStockModal({ userId, product, onClose, onChanged }) {
  const [batches, setBatches] = useState([]);
  const [info, setInfo] = useState(product);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [counts, setCounts] = useState({});
  const [adding, setAdding] = useState({ batchNumber: '', expiryDate: '', quantityBase: '' });

  const load = useCallback(async () => {
    try {
      const res = await batchApi.getProductBatches(userId, product.id, true);
      setBatches(res.batches || []);
      if (res.product) setInfo((p) => ({ ...p, ...res.product }));
      setCounts(Object.fromEntries((res.batches || []).map((b) => [b.id, String(b.quantityBase ?? 0)])));
    } catch (err) {
      toast.error(err.message || 'Failed to load batches');
    } finally {
      setLoading(false);
    }
  }, [userId, product.id]);

  useEffect(() => { load(); }, [load]);

  const step = (b, delta) => setCounts((c) => ({ ...c, [b.id]: String(Math.max(0, round3((parseFloat(c[b.id]) || 0) + delta))) }));

  const saveCount = async (b) => {
    const quantityBase = parseFloat(counts[b.id]);
    if (Number.isNaN(quantityBase) || quantityBase < 0) { toast.error('Enter a count of zero or more'); return; }
    setBusy(b.id);
    try {
      await batchApi.upsertBatch(userId, product.id, { batchNumber: b.batchNumber, quantityBase });
      toast.success(`Batch ${b.batchNumber} updated`);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message || 'Failed to update batch');
    } finally {
      setBusy(null);
    }
  };

  const toggleArchive = async (b) => {
    setBusy(b.id);
    try {
      await batchApi.archiveBatch(userId, b.id, !b.isArchived);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message || 'Failed to update batch');
    } finally {
      setBusy(null);
    }
  };

  const addBatch = async () => {
    const quantityBase = parseFloat(adding.quantityBase);
    if (!adding.batchNumber.trim()) { toast.error('Batch number is required'); return; }
    if (Number.isNaN(quantityBase) || quantityBase < 0) { toast.error('Enter the quantity'); return; }
    if (batches.some((b) => b.batchNumber.trim().toLowerCase() === adding.batchNumber.trim().toLowerCase())) {
      toast.error('That batch already exists — change its count above');
      return;
    }
    setBusy('new');
    try {
      await batchApi.upsertBatch(userId, product.id, {
        batchNumber: adding.batchNumber.trim(),
        expiryDate: adding.expiryDate.trim() || undefined,
        quantityBase,
      });
      setAdding({ batchNumber: '', expiryDate: '', quantityBase: '' });
      toast.success('Batch added');
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message || 'Failed to add batch');
    } finally {
      setBusy(null);
    }
  };

  const unit = info.baseUnit || 'unit';
  const total = batches.filter((b) => !b.isArchived).reduce((s, b) => s + (b.quantityBase || 0), 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Manage Stock — {info.name}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {loading ? <div className="loading-spinner"><div className="spinner" /></div> : (
            <>
              <p style={{ marginBottom: 12, color: '#4b5563' }}>
                Current stock: <strong>{formatQuantity(total, info)}</strong>. Counts below are in {unit}s.
              </p>
              {batches.length === 0 && <p style={{ color: '#6b7280', marginBottom: 12 }}>No batches on record for this product.</p>}
              {batches.map((b) => {
                const changed = parseFloat(counts[b.id]) !== (b.quantityBase ?? 0);
                return (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f1f5f9', opacity: b.isArchived ? 0.55 : 1, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 150 }}>
                      <strong style={{ fontFamily: 'monospace' }}>{b.batchNumber}</strong>
                      {b.isArchived && <span className="badge badge-warning" style={{ marginLeft: 6 }}>Archived</span>}
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{formatBatchExpiry(b.expiryDate)}</div>
                    </div>
                    {!b.isArchived && (
                      <>
                        <button className="btn btn-secondary btn-icon btn-sm" aria-label="Decrease" onClick={() => step(b, -1)}><Minus size={14} /></button>
                        <input className="form-input" type="number" min="0" step="any" style={{ width: 84, textAlign: 'center' }} value={counts[b.id] ?? ''}
                          aria-label={`Count for batch ${b.batchNumber}`} onChange={(e) => setCounts((c) => ({ ...c, [b.id]: e.target.value }))} />
                        <button className="btn btn-secondary btn-icon btn-sm" aria-label="Increase" onClick={() => step(b, 1)}><Plus size={14} /></button>
                        <button className="btn btn-primary btn-sm" disabled={!changed || busy === b.id} onClick={() => saveCount(b)}>Save</button>
                      </>
                    )}
                    <button className="btn btn-ghost btn-icon btn-sm" disabled={busy === b.id} title={b.isArchived ? 'Restore batch' : 'Archive batch'}
                      aria-label={b.isArchived ? 'Restore batch' : 'Archive batch'} onClick={() => toggleArchive(b)}>
                      {b.isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} style={{ color: '#b45309' }} />}
                    </button>
                  </div>
                );
              })}

              <div style={{ marginTop: 16 }}>
                <div className="form-label">Add a batch</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input className="form-input" style={{ flex: 1, minWidth: 130 }} placeholder="Batch number" value={adding.batchNumber} onChange={(e) => setAdding((a) => ({ ...a, batchNumber: e.target.value }))} />
                  <input className="form-input" style={{ width: 110 }} placeholder="Expiry MM/YY" value={adding.expiryDate} onChange={(e) => setAdding((a) => ({ ...a, expiryDate: e.target.value }))} />
                  <input className="form-input" style={{ width: 100 }} type="number" min="0" step="any" placeholder={`Qty (${unit})`} value={adding.quantityBase} onChange={(e) => setAdding((a) => ({ ...a, quantityBase: e.target.value }))} />
                  <button className="btn btn-secondary" disabled={busy === 'new'} onClick={addBatch}><Plus size={14} /> Add</button>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}
