import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { invoiceApi, productApi } from '../services/api';
import { ArrowLeft, Save, Plus, Trash2, Search, Loader } from 'lucide-react';
import toast from 'react-hot-toast';

const emptyItem = {
  productId: '', name: '', quantity: 1, unit: 'pcs',
  mrp: '', rate: '', gstPercent: '', discount: '', itemTotal: '',
};

export default function CreateInvoicePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [invoiceData, setInvoiceData] = useState({
    customerName: '', customerPhone: '', customerAddress: '',
    paymentType: 'cash', invoiceDate: new Date().toISOString().split('T')[0],
  });

  const [items, setItems] = useState([{ ...emptyItem }]);
  const [saving, setSaving] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');

  const updateField = (field, value) => setInvoiceData(prev => ({ ...prev, [field]: value }));

  const searchProducts = useCallback(async (query, index) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      setActiveSearchIndex(-1);
      return;
    }
    try {
      const res = await productApi.searchProducts(user.id, query, 8, true);
      setSearchResults(res.products || []);
      setActiveSearchIndex(index);
    } catch {
      setSearchResults([]);
    }
  }, [user?.id]);

  const selectProduct = (index, product) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      return {
        ...item,
        productId: product.id,
        name: product.name,
        mrp: product.defaultMrp || '',
        rate: product.sellingRate || product.defaultMrp || '',
        gstPercent: product.gstPercent || '',
        unit: product.unit || 'pcs',
      };
    }));
    setSearchResults([]);
    setActiveSearchIndex(-1);
    setSearchQuery('');
  };

  const updateItem = (index, field, value) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      if (['quantity', 'rate', 'discount', 'gstPercent'].includes(field)) {
        const qty = parseFloat(updated.quantity) || 0;
        const rate = parseFloat(updated.rate) || 0;
        const disc = parseFloat(updated.discount) || 0;
        const gst = parseFloat(updated.gstPercent) || 0;
        const base = qty * rate;
        const afterDisc = base - (base * disc / 100);
        const withGst = afterDisc + (afterDisc * gst / 100);
        updated.itemTotal = withGst.toFixed(2);
      }
      return updated;
    }));
  };

  const addItem = () => setItems(prev => [...prev, { ...emptyItem }]);

  const removeItem = (index) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const rate = parseFloat(item.rate) || 0;
      const disc = parseFloat(item.discount) || 0;
      const base = qty * rate;
      return sum + (base - (base * disc / 100));
    }, 0);

    const gstTotal = items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const rate = parseFloat(item.rate) || 0;
      const disc = parseFloat(item.discount) || 0;
      const gst = parseFloat(item.gstPercent) || 0;
      const base = qty * rate;
      const afterDisc = base - (base * disc / 100);
      return sum + (afterDisc * gst / 100);
    }, 0);

    return {
      subtotal: subtotal.toFixed(2),
      cgst: (gstTotal / 2).toFixed(2),
      sgst: (gstTotal / 2).toFixed(2),
      grandTotal: (subtotal + gstTotal).toFixed(2),
    };
  };

  const handleSave = async () => {
    const validItems = items.filter(i => i.name.trim());
    if (validItems.length === 0) {
      toast.error('Add at least one item');
      return;
    }
    setSaving(true);
    try {
      const totals = calculateTotals();
      await invoiceApi.createInvoice(user.id, {
        ...invoiceData,
        ...totals,
        items: validItems,
        billType: 'sale',
      });
      toast.success('Invoice created successfully!');
      navigate('/invoices');
    } catch (err) {
      toast.error(err.message || 'Failed to create invoice');
    } finally {
      setSaving(false);
    }
  };

  const totals = calculateTotals();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-icon" onClick={() => navigate('/invoices')}>
            <ArrowLeft size={18} />
          </button>
          <h2 style={{ fontSize: 24, fontWeight: 700 }}>Create Invoice</h2>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader size={16} className="spinner" /> : <Save size={16} />}
          Save Invoice
        </button>
      </div>

      {/* Customer Info */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><h3>Customer Details</h3></div>
        <div className="card-body">
          <div className="form-row-3">
            <div className="form-group">
              <label className="form-label">Customer Name</label>
              <input className="form-input" value={invoiceData.customerName} onChange={e => updateField('customerName', e.target.value)} placeholder="Customer name" />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" value={invoiceData.customerPhone} onChange={e => updateField('customerPhone', e.target.value)} placeholder="Phone number" />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Type</label>
              <select className="form-input" value={invoiceData.paymentType} onChange={e => updateField('paymentType', e.target.value)}>
                <option value="cash">Cash</option>
                <option value="credit">Credit</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Address</label>
            <input className="form-input" value={invoiceData.customerAddress} onChange={e => updateField('customerAddress', e.target.value)} placeholder="Customer address (optional)" />
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3>Invoice Items ({items.length})</h3>
          <button className="btn btn-secondary btn-sm" onClick={addItem}><Plus size={14} /> Add Item</button>
        </div>
        <div className="table-container">
          <table className="bill-items-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Qty</th>
                <th>MRP</th>
                <th>Rate</th>
                <th>GST %</th>
                <th>Disc %</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td style={{ position: 'relative', minWidth: 200 }}>
                    <input
                      className="form-input"
                      value={item.name || searchQuery}
                      onChange={e => {
                        const val = e.target.value;
                        if (!item.productId) setSearchQuery(val);
                        updateItem(index, 'name', val);
                        searchProducts(val, index);
                      }}
                      onFocus={() => { if (item.name && !item.productId) searchProducts(item.name, index); }}
                      placeholder="Search product..."
                    />
                    {activeSearchIndex === index && searchResults.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0,
                        background: 'white', border: '1px solid #e5e7eb',
                        borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        zIndex: 10, maxHeight: 200, overflowY: 'auto',
                      }}>
                        {searchResults.map(p => (
                          <button
                            key={p.id}
                            onClick={() => selectProduct(index, p)}
                            style={{
                              display: 'block', width: '100%', padding: '8px 12px',
                              textAlign: 'left', border: 'none', background: 'none',
                              cursor: 'pointer', fontSize: 13,
                            }}
                            onMouseOver={e => e.currentTarget.style.background = '#f3f4f6'}
                            onMouseOut={e => e.currentTarget.style.background = 'none'}
                          >
                            <div style={{ fontWeight: 500 }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: '#6b7280' }}>
                              Stock: {p.stock ?? '-'} | MRP: ₹{p.defaultMrp || 0} | Rate: ₹{p.sellingRate || 0}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td><input className="form-input" type="number" value={item.quantity} onChange={e => updateItem(index, 'quantity', e.target.value)} style={{ width: 60 }} /></td>
                  <td><input className="form-input" type="number" value={item.mrp} onChange={e => updateItem(index, 'mrp', e.target.value)} style={{ width: 75 }} /></td>
                  <td><input className="form-input" type="number" value={item.rate} onChange={e => updateItem(index, 'rate', e.target.value)} style={{ width: 75 }} /></td>
                  <td><input className="form-input" type="number" value={item.gstPercent} onChange={e => updateItem(index, 'gstPercent', e.target.value)} style={{ width: 55 }} /></td>
                  <td><input className="form-input" type="number" value={item.discount} onChange={e => updateItem(index, 'discount', e.target.value)} style={{ width: 55 }} /></td>
                  <td style={{ fontWeight: 600 }}>₹{item.itemTotal || '0.00'}</td>
                  <td>
                    <button className="btn btn-ghost btn-icon" onClick={() => removeItem(index)}>
                      <Trash2 size={14} style={{ color: '#dc2626' }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      <div className="card">
        <div className="card-header"><h3>Invoice Summary</h3></div>
        <div className="card-body">
          <div className="bill-summary" style={{ maxWidth: 350, marginLeft: 'auto' }}>
            <div className="bill-summary-row"><span>Subtotal</span><span>₹{totals.subtotal}</span></div>
            <div className="bill-summary-row"><span>CGST</span><span>₹{totals.cgst}</span></div>
            <div className="bill-summary-row"><span>SGST</span><span>₹{totals.sgst}</span></div>
            <div className="bill-summary-row total"><span>Grand Total</span><span>₹{totals.grandTotal}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
