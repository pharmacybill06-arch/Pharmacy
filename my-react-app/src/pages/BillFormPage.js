import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { billApi, distributorApi } from '../services/api';
import { Save, Plus, Trash2, Loader } from 'lucide-react';
import toast from 'react-hot-toast';

const emptyItem = {
  name: '', manufacturer: '', batchNumber: '', expiryDate: '',
  hsnCode: '', quantity: 1, freeQuantity: 0, unit: 'pcs',
  mrp: '', rate: '', gstPercent: '', discount: '', itemTotal: '',
};

export default function BillFormPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const { parsedData, ocrText, imageFile } = location.state || {};

  const [billData, setBillData] = useState({
    invoiceNumber: '',
    invoiceDate: '',
    distributorId: '',
    pharmacyName: '',
    subtotal: '',
    cgst: '',
    sgst: '',
    grandTotal: '',
    paymentType: 'credit',
  });

  const [items, setItems] = useState([{ ...emptyItem }]);
  const [distributors, setDistributors] = useState([]);
  const [distributorSearch, setDistributorSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.id) {
      distributorApi.getDistributors(user.id).then(res => {
        setDistributors(res.distributors || []);
      }).catch(() => {});
    }
  }, [user?.id]);

  // Helper: convert value to string for form fields, preserving 0 as '0'
  const toStr = (val) => (val != null && val !== '' && val !== undefined) ? String(val) : '';

  // Pre-fill from parsed data
  useEffect(() => {
    if (parsedData) {
      console.log('[BillForm] Received parsedData:', JSON.stringify(parsedData, null, 2));
      setBillData(prev => ({
        ...prev,
        invoiceNumber: toStr(parsedData.invoiceNumber || parsedData.invoice_number),
        invoiceDate: toStr(parsedData.invoiceDate || parsedData.invoice_date),
        pharmacyName: toStr(parsedData.pharmacyName || parsedData.pharmacy_name || parsedData.distributorName),
        subtotal: toStr(parsedData.subtotal),
        cgst: toStr(parsedData.cgst),
        sgst: toStr(parsedData.sgst),
        grandTotal: toStr(parsedData.grandTotal ?? parsedData.grand_total ?? parsedData.total),
        paymentType: parsedData.paymentType || 'credit',
      }));

      const parsedItems = parsedData.items || parsedData.lineItems || [];
      console.log('[BillForm] Parsed items count:', parsedItems.length);
      if (parsedItems.length > 0) {
        setItems(parsedItems.map(item => ({
          name: toStr(item.name || item.item_name || item.productName),
          manufacturer: toStr(item.manufacturer),
          batchNumber: toStr(item.batchNumber || item.batch_number || item.batch),
          expiryDate: toStr(item.expiryDate || item.expiry_date || item.expiry),
          hsnCode: toStr(item.hsnCode || item.hsn_code || item.hsn),
          quantity: item.quantity ?? item.qty ?? 1,
          freeQuantity: item.freeQuantity ?? item.free_quantity ?? item.free ?? 0,
          unit: item.unit || 'pcs',
          mrp: toStr(item.mrp),
          rate: toStr(item.rate || item.price),
          gstPercent: toStr(item.gstPercent ?? item.gst_percent ?? item.gst),
          discount: toStr(item.discount),
          itemTotal: toStr(item.itemTotal ?? item.item_total ?? item.amount ?? item.total),
        })));
      }
    }
  }, [parsedData]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateBillField = (field, value) => {
    setBillData(prev => ({ ...prev, [field]: value }));
  };

  const updateItem = (index, field, value) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      // Auto-calc item total (pre-tax: qty × rate × (1 - disc%))
      if (['quantity', 'rate', 'discount', 'gstPercent'].includes(field)) {
        const qty = parseFloat(updated.quantity) || 0;
        const rate = parseFloat(updated.rate) || 0;
        const disc = parseFloat(updated.discount) || 0;
        const base = qty * rate;
        const afterDisc = base - (base * disc / 100);
        updated.itemTotal = afterDisc.toFixed(2);
      }
      return updated;
    }));
  };

  const addItem = () => setItems(prev => [...prev, { ...emptyItem }]);

  const removeItem = (index) => {
    if (items.length === 1) {
      toast.error('Bill must have at least one item');
      return;
    }
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // Real-time totals — always computed fresh from items
  const calculateTotals = () => {
    let subtotal = 0;  // sum of (qty × rate × (1-disc%))
    let totalGst = 0;  // sum of per-item GST amounts

    items.forEach(item => {
      const qty = parseFloat(item.quantity) || 0;
      const rate = parseFloat(item.rate) || 0;
      const disc = parseFloat(item.discount) || 0;
      const gstPct = parseFloat(item.gstPercent) || 0;

      const base = qty * rate;
      const afterDisc = base - (base * disc / 100);
      subtotal += afterDisc;
      totalGst += afterDisc * gstPct / 100;
    });

    const cgst = totalGst / 2;
    const sgst = totalGst / 2;
    const grandTotal = subtotal + totalGst;
    // Aggregate GST %: totalGst / subtotal × 100
    const aggGstPct = subtotal > 0 ? (totalGst / subtotal) * 100 : 0;
    const cgstPct = aggGstPct / 2;
    const sgstPct = aggGstPct / 2;

    return {
      subtotal: subtotal.toFixed(2),
      cgst: cgst.toFixed(2),
      sgst: sgst.toFixed(2),
      totalGst: totalGst.toFixed(2),
      aggGstPct: aggGstPct % 1 === 0 ? aggGstPct.toFixed(0) : aggGstPct.toFixed(1),
      cgstPct: cgstPct % 1 === 0 ? cgstPct.toFixed(0) : cgstPct.toFixed(1),
      sgstPct: sgstPct % 1 === 0 ? sgstPct.toFixed(0) : sgstPct.toFixed(1),
      grandTotal: grandTotal.toFixed(2),
    };
  };

  const handleSave = async () => {
    if (!items[0]?.name) {
      toast.error('Please add at least one item');
      return;
    }
    setSaving(true);
    try {
      const totals = calculateTotals();
      const saveData = {
        ...billData,
        // Always use live-calculated values — never stale OCR prefill
        subtotal: parseFloat(totals.subtotal),
        cgst: parseFloat(billData.cgstOverride || totals.cgst),
        sgst: parseFloat(billData.sgstOverride || totals.sgst),
        totalGst: parseFloat(totals.totalGst),
        grandTotal: parseFloat(billData.grandTotalOverride || totals.grandTotal),
        items: items.filter(item => item.name.trim()),
        billType: 'purchase',
      };

      await billApi.saveBill(user.id, saveData, ocrText || '', '');
      toast.success('Bill saved successfully!');
      navigate('/bills');
    } catch (err) {
      toast.error(err.message || 'Failed to save bill');
    } finally {
      setSaving(false);
    }
  };

  const totals = calculateTotals();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700 }}>Bill Form</h2>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Review and edit parsed bill data</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader size={16} className="spinner" /> : <Save size={16} />}
          Save Bill
        </button>
      </div>

      {/* Bill Metadata */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><h3>Bill Details</h3></div>
        <div className="card-body">
          <div className="form-row-3">
            <div className="form-group">
              <label className="form-label">Invoice Number</label>
              <input className="form-input" value={billData.invoiceNumber} onChange={e => updateBillField('invoiceNumber', e.target.value)} placeholder="INV-001" />
            </div>
            <div className="form-group">
              <label className="form-label">Invoice Date</label>
              <input className="form-input" type="date" value={billData.invoiceDate} onChange={e => updateBillField('invoiceDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Type</label>
              <select className="form-input" value={billData.paymentType} onChange={e => updateBillField('paymentType', e.target.value)}>
                <option value="credit">Credit</option>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Distributor</label>
              <select className="form-input" value={billData.distributorId} onChange={e => updateBillField('distributorId', e.target.value)}>
                <option value="">Select Distributor</option>
                {distributors.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Pharmacy / Distributor Name</label>
              <input className="form-input" value={billData.pharmacyName} onChange={e => updateBillField('pharmacyName', e.target.value)} placeholder="Distributor name" />
            </div>
          </div>
        </div>
      </div>

      {/* Bill Items */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3>Bill Items ({items.length})</h3>
          <button className="btn btn-secondary btn-sm" onClick={addItem}>
            <Plus size={14} /> Add Item
          </button>
        </div>
        <div className="table-container">
          <table className="bill-items-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Disc %</th>
                <th>GST %</th>
                <th style={{ color: '#1d4ed8' }}>GST ₹</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const qty = parseFloat(item.quantity) || 0;
                const rate = parseFloat(item.rate) || 0;
                const disc = parseFloat(item.discount) || 0;
                const gstPct = parseFloat(item.gstPercent) || 0;
                const base = qty * rate;
                const afterDisc = base - (base * disc / 100);
                const gstAmt = afterDisc * gstPct / 100;
                return (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td>
                    <input className="form-input" value={item.name} onChange={e => updateItem(index, 'name', e.target.value)} placeholder="Item name" style={{ minWidth: 150 }} />
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, paddingLeft: 2 }}>
                      {item.batchNumber && <span>Batch: {item.batchNumber} </span>}
                      {item.expiryDate && <span>Exp: {item.expiryDate}</span>}
                    </div>
                  </td>
                  <td><input className="form-input" value={item.batchNumber} onChange={e => updateItem(index, 'batchNumber', e.target.value)} placeholder="Batch" style={{ width: 80 }} /></td>
                  <td><input className="form-input" value={item.expiryDate} onChange={e => updateItem(index, 'expiryDate', e.target.value)} placeholder="MM/YY" style={{ width: 80 }} /></td>
                  <td><input className="form-input" type="number" min="0" value={item.quantity} onChange={e => updateItem(index, 'quantity', e.target.value)} style={{ width: 60 }} /></td>
                  <td><input className="form-input" type="number" min="0" value={item.rate} onChange={e => updateItem(index, 'rate', e.target.value)} placeholder="0.00" style={{ width: 80 }} /></td>
                  <td><input className="form-input" type="number" min="0" max="100" value={item.discount} onChange={e => updateItem(index, 'discount', e.target.value)} placeholder="0" style={{ width: 55 }} /></td>
                  <td>
                    <input className="form-input" type="number" min="0" max="100" value={item.gstPercent} onChange={e => updateItem(index, 'gstPercent', e.target.value)} placeholder="0" style={{ width: 55 }} />
                  </td>
                  <td style={{ color: '#1d4ed8', fontWeight: 600, minWidth: 60 }}>
                    {gstAmt > 0 ? `₹${gstAmt.toFixed(2)}` : '—'}
                  </td>
                  <td style={{ fontWeight: 600 }}>₹{item.itemTotal || '0.00'}</td>
                  <td>
                    <button className="btn btn-ghost btn-icon" onClick={() => removeItem(index)}>
                      <Trash2 size={14} style={{ color: '#dc2626' }} />
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals */}
      <div className="card">
        <div className="card-header">
          <h3>Bill Summary</h3>
          <span style={{ fontSize: 12, color: '#64748B' }}>Auto-calculated from items above</span>
        </div>
        <div className="card-body">
          <div className="bill-summary" style={{ maxWidth: 460, marginLeft: 'auto' }}>

            {/* Subtotal row */}
            <div className="bill-summary-row">
              <span style={{ color: '#374151' }}>Subtotal (before tax)</span>
              <span style={{ fontWeight: 600 }}>₹{totals.subtotal}</span>
            </div>

            {/* CGST row: % + ₹ */}
            <div className="bill-summary-row" style={{ alignItems: 'center' }}>
              <span style={{ color: '#4b5563' }}>
                CGST
                {parseFloat(totals.cgstPct) > 0 && (
                  <span style={{
                    marginLeft: 6, fontSize: 11, fontWeight: 700,
                    background: '#DBEAFE', color: '#1d4ed8',
                    borderRadius: 999, padding: '1px 7px',
                  }}>{totals.cgstPct}%</span>
                )}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>₹</span>
                <input
                  className="form-input"
                  style={{ width: 90, textAlign: 'right' }}
                  value={billData.cgstOverride !== undefined ? billData.cgstOverride : totals.cgst}
                  onChange={e => updateBillField('cgstOverride', e.target.value)}
                  title="Edit to override calculated CGST"
                />
              </div>
            </div>

            {/* SGST row: % + ₹ */}
            <div className="bill-summary-row" style={{ alignItems: 'center' }}>
              <span style={{ color: '#4b5563' }}>
                SGST
                {parseFloat(totals.sgstPct) > 0 && (
                  <span style={{
                    marginLeft: 6, fontSize: 11, fontWeight: 700,
                    background: '#DBEAFE', color: '#1d4ed8',
                    borderRadius: 999, padding: '1px 7px',
                  }}>{totals.sgstPct}%</span>
                )}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>₹</span>
                <input
                  className="form-input"
                  style={{ width: 90, textAlign: 'right' }}
                  value={billData.sgstOverride !== undefined ? billData.sgstOverride : totals.sgst}
                  onChange={e => updateBillField('sgstOverride', e.target.value)}
                  title="Edit to override calculated SGST"
                />
              </div>
            </div>

            {/* Total GST summary line */}
            {parseFloat(totals.totalGst) > 0 && (
              <div className="bill-summary-row" style={{ background: '#EFF6FF', borderRadius: 6, padding: '6px 10px', margin: '2px 0' }}>
                <span style={{ fontWeight: 700, color: '#1d4ed8' }}>
                  Total GST
                  {parseFloat(totals.aggGstPct) > 0 && (
                    <span style={{
                      marginLeft: 6, fontSize: 12, fontWeight: 700,
                      background: '#1d4ed8', color: 'white',
                      borderRadius: 999, padding: '1px 8px',
                    }}>{totals.aggGstPct}%</span>
                  )}
                </span>
                <span style={{ fontWeight: 700, color: '#1d4ed8' }}>₹{totals.totalGst}</span>
              </div>
            )}

            {/* Grand Total */}
            <div className="bill-summary-row total" style={{ alignItems: 'center' }}>
              <span>Grand Total</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>₹</span>
                <input
                  className="form-input"
                  style={{ width: 110, textAlign: 'right', fontWeight: 700, fontSize: 15 }}
                  value={billData.grandTotalOverride !== undefined ? billData.grandTotalOverride : totals.grandTotal}
                  onChange={e => updateBillField('grandTotalOverride', e.target.value)}
                  title="Edit to override calculated Grand Total"
                />
              </div>
            </div>

            {/* Live calculation indicator */}
            <div style={{ textAlign: 'right', fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              ⟳ Updates live as you edit items above
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
