import React, { useState, useEffect, useRef } from 'react';
import { X, ArrowLeftRight, Info } from 'lucide-react';
import { productApi, distributorApi } from '../services/api';
import { formatDDMMYYYY, isoToDdmmyyyy, ddmmyyyyToIso } from '../utils/dateFormat';

function Modal({ title, onClose, children, footer, width = 480 }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/** Fastest path for the most common real-world edit: one date, one save. */
export function QuickDateModal({ label, value, saving, onClose, onSave }) {
  const [local, setLocal] = useState(isoToDdmmyyyy(value) || '');
  const valid = !!ddmmyyyyToIso(local);
  return (
    <Modal title={`Fix ${label}`} onClose={onClose} width={360}
      footer={<button className="btn btn-primary" disabled={saving || !valid} onClick={() => onSave(ddmmyyyyToIso(local))}>{saving ? 'Saving…' : 'Save'}</button>}>
      <div className="form-group">
        <label className="form-label">{label}</label>
        <input className="form-input" autoFocus placeholder="DD-MM-YYYY" value={local} onChange={(e) => setLocal(e.target.value)} />
      </div>
    </Modal>
  );
}

/** Invoice number, dates, distributor (audit-logged) plus payment type and remarks. */
export function HeaderEditModal({ bill, userId, saving, onClose, onSave }) {
  const [invoiceNumber, setInvoiceNumber] = useState(bill.invoiceNumber || '');
  const [invoiceDate, setInvoiceDate] = useState(isoToDdmmyyyy(bill.invoiceDate) || '');
  const [dueDate, setDueDate] = useState(isoToDdmmyyyy(bill.dueDate) || '');
  const [distributorId, setDistributorId] = useState(bill.distributorId || bill.distributor?.id || '');
  const [paymentType, setPaymentType] = useState(bill.paymentType || 'credit');
  const [remarks, setRemarks] = useState(bill.remarks || '');
  const [distributors, setDistributors] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    distributorApi.getDistributors(userId).then((r) => setDistributors(r.distributors || [])).catch(() => {});
  }, [userId]);

  const submit = () => {
    if (invoiceDate && !ddmmyyyyToIso(invoiceDate)) { setError('Enter the invoice date as DD-MM-YYYY.'); return; }
    if (dueDate && !ddmmyyyyToIso(dueDate)) { setError('Enter the due date as DD-MM-YYYY.'); return; }
    onSave(
      { invoiceNumber, invoiceDate: ddmmyyyyToIso(invoiceDate), dueDate: ddmmyyyyToIso(dueDate), distributorId: distributorId || null },
      { paymentType, remarks: remarks.trim() || null },
    );
  };

  return (
    <Modal title="Edit Bill Details" onClose={onClose}
      footer={<button className="btn btn-primary" disabled={saving} onClick={submit}>{saving ? 'Saving…' : 'Save Changes'}</button>}>
      {error && <div className="form-error" style={{ marginBottom: 8 }}>{error}</div>}
      <div className="form-group"><label className="form-label">Invoice Number</label>
        <input className="form-input" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} /></div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Invoice Date</label>
          <input className="form-input" placeholder="DD-MM-YYYY" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Due Date</label>
          <input className="form-input" placeholder="DD-MM-YYYY" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
      </div>
      <div className="form-group"><label className="form-label">Distributor</label>
        <select className="form-input" value={distributorId} onChange={(e) => setDistributorId(e.target.value)}>
          <option value="">No distributor</option>
          {distributors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select></div>
      <div className="form-group"><label className="form-label">Payment Type</label>
        <select className="form-input" value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
          <option value="credit">Credit</option>
          <option value="cash">Cash</option>
        </select></div>
      <div className="form-group"><label className="form-label">Remarks</label>
        <textarea className="form-input" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
    </Modal>
  );
}

/**
 * Line edit. Picking a different product re-links the line; product, batch and quantity
 * edits are stock-aware on the server (moved onto the linked ProductBatch, warned on
 * negative stock) and audit-logged.
 */
export function ItemEditModal({ item, userId, saving, onClose, onSave }) {
  const [name, setName] = useState(item.itemName || item.name || '');
  const [productId, setProductId] = useState(item.productId || null);
  const [results, setResults] = useState([]);
  const [batchNumber, setBatchNumber] = useState(item.batchNumber || '');
  const [expiryDate, setExpiryDate] = useState(item.expiryDate || '');
  const [quantity, setQuantity] = useState(item.quantity?.toString() || '');
  const [mrp, setMrp] = useState(item.mrp?.toString() || '');
  const [rate, setRate] = useState(item.rate?.toString() || '');
  const seq = useRef(0);

  const searchProducts = (q) => {
    setName(q);
    const mine = ++seq.current;
    if (q.trim().length < 2) { setResults([]); return; }
    setTimeout(async () => {
      if (mine !== seq.current) return;
      const res = await productApi.searchProducts(userId, q.trim(), 6).catch(() => null);
      if (mine === seq.current) setResults(res?.products || []);
    }, 250);
  };

  const relinked = productId && productId !== item.productId;

  return (
    <Modal title={item.itemName || item.name} onClose={onClose} width={540}
      footer={<button className="btn btn-primary" disabled={saving}
        onClick={() => onSave({ name, ...(relinked && { productId }), batchNumber, expiryDate, quantity, mrp, rate })}>{saving ? 'Saving…' : 'Save Changes'}</button>}>
      <div className="form-group" style={{ position: 'relative' }}>
        <label className="form-label">Product</label>
        <input className="form-input" placeholder="Search to re-link this line to a product" value={name} onChange={(e) => searchProducts(e.target.value)} />
        {results.length > 0 && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginTop: 4, maxHeight: 180, overflowY: 'auto' }}>
            {results.map((p) => (
              <button key={p.id} type="button" onClick={() => { setName(p.name); setProductId(p.id); setResults([]); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', borderBottom: '1px solid #f1f5f9', background: '#fff', cursor: 'pointer' }}>
                {p.name}{p.manufacturer ? <span style={{ color: '#6b7280', fontSize: 12 }}> · {p.manufacturer}</span> : null}
              </button>
            ))}
          </div>
        )}
      </div>
      {relinked && (
        <div style={{ display: 'flex', gap: 8, padding: 10, borderRadius: 8, background: '#eef2ff', color: '#4338ca', fontSize: 13, marginBottom: 12 }}>
          <ArrowLeftRight size={14} style={{ flexShrink: 0, marginTop: 2 }} /> This will move this line's stock onto the newly picked product.
        </div>
      )}
      <div className="form-row">
        <div className="form-group"><label className="form-label">Batch Number</label>
          <input className="form-input" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Expiry (MM/YY)</label>
          <input className="form-input" placeholder="MM/YY" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></div>
      </div>
      <div className="form-row-3">
        <div className="form-group"><label className="form-label">Quantity</label>
          <input className="form-input" type="number" step="any" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">MRP</label>
          <input className="form-input" type="number" step="0.01" min="0" value={mrp} onChange={(e) => setMrp(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Rate</label>
          <input className="form-input" type="number" step="0.01" min="0" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
      </div>
      <div style={{ display: 'flex', gap: 8, color: '#64748b', fontSize: 13 }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} /> Batch, expiry and quantity corrections flow through to stock automatically.
      </div>
    </Modal>
  );
}

/** Before/after audit trail, newest first. */
export function HistoryModal({ history, onClose }) {
  return (
    <Modal title="Edit History" onClose={onClose} width={540}>
      {history.length === 0 && <p style={{ color: '#6b7280' }}>No edits recorded yet.</p>}
      {history.map((h) => (
        <div key={h.id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong style={{ fontSize: 14 }}>{h.billItem ? `${h.billItem.name} · ` : ''}{h.field}</strong>
            <span style={{ fontSize: 12, color: '#6b7280' }}>{formatDDMMYYYY(h.editedAt)}</span>
          </div>
          <div style={{ fontSize: 13, color: '#4b5563' }}>{h.oldValue || '(empty)'} → {h.newValue || '(empty)'}</div>
          {h.note && <div style={{ fontSize: 12, color: '#6b7280' }}>{h.note}</div>}
        </div>
      ))}
    </Modal>
  );
}
