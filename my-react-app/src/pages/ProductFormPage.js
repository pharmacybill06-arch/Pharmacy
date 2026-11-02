import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { productApi, aiApi } from '../services/api';
import { ArrowLeft, Save, Loader, Wand2, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import { PACK_LABELS, BASE_UNITS } from '../utils/units';
import { isoToDdmmyyyy } from '../utils/dateFormat';

export default function ProductFormPage() {
  const { user } = useAuth();
  const { productId } = useParams();
  const navigate = useNavigate();
  const isEditing = !!productId;

  const [form, setForm] = useState({
    name: '', salt: '', manufacturer: '', hsnCode: '', batchNumber: '',
    expiryDate: '', quantity: '1', purchaseDate: '', minStock: '',
    packLabel: 'strip', baseUnit: 'tablet', packSize: '1', scheduleFlag: 'none',
    defaultMrp: '', defaultRate: '', purchaseRate: '', sellingRate: '', ptr: '',
    gstPercent: '', notes: '',
  });
  const [batchSummary, setBatchSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingAI, setFetchingAI] = useState(false);

  useEffect(() => {
    if (isEditing && user?.id) {
      setLoading(true);
      productApi.getProductById(user.id, productId)
        .then(res => {
          const p = res.product || res;
          setForm({
            name: p.name || '',
            salt: p.salt || '',
            manufacturer: p.manufacturer || '',
            hsnCode: p.hsnCode || '',
            batchNumber: '',
            expiryDate: '',
            quantity: '',
            purchaseDate: p.purchaseDate || '',
            minStock: p.minStock ?? '',
            packLabel: p.packLabel || 'pack',
            baseUnit: p.baseUnit || 'unit',
            packSize: p.packSize ?? '1',
            scheduleFlag: p.scheduleFlag || 'none',
            defaultMrp: p.defaultMrp ?? '',
            defaultRate: p.defaultRate ?? '',
            purchaseRate: p.purchaseRate ?? '',
            sellingRate: p.sellingRate ?? '',
            ptr: p.ptr ?? '',
            gstPercent: p.gstPercent ?? '',
            notes: p.notes || '',
          });
          setBatchSummary(p.batchSummary || null);
        })
        .catch(() => { toast.error('Product not found'); navigate('/products'); })
        .finally(() => setLoading(false));
    }
  }, [isEditing, navigate, productId, user?.id]);

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleFetchDetails = async () => {
    if (!form.name.trim()) return;
    setFetchingAI(true);
    try {
      const res = await aiApi.getMedicineDetails(form.name);
      if (res.success && res.data) {
        setForm(prev => ({
          ...prev,
          salt: res.data.salt || prev.salt,
          manufacturer: res.data.manufacturer || prev.manufacturer
        }));
        toast.success('Medicine details fetched successfully!');
      }
    } catch (err) {
      toast.error('Failed to fetch details via AI');
    } finally {
      setFetchingAI(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Product name is required');
      return;
    }
    // Expiry and quantity only exist when seeding a new product's first batch
    if (!isEditing && !form.expiryDate) {
      toast.error('Expiry date is required');
      return;
    }
    if (!isEditing && form.quantity !== '' && !(Number(form.quantity) > 0)) {
      toast.error('Quantity must be greater than 0');
      return;
    }
    if (!(parseInt(form.packSize, 10) >= 1)) {
      toast.error('Conversion must be 1 or more');
      return;
    }
    setSaving(true);
    try {
      const { batchNumber, expiryDate, quantity, ...fields } = form;
      const data = {
        ...fields,
        // Batch number / expiry / quantity seed the FIRST batch of a new product. After
        // that they belong to each batch and stock is derived, so edits never send them.
        ...(isEditing ? {} : {
          batchNumber: batchNumber.trim() || null,
          expiryDate: isoToDdmmyyyy(expiryDate),
          quantity: quantity !== '' ? Number(quantity) : 1,
        }),
        purchaseDate: form.purchaseDate.trim() || null,
        packSize: parseInt(form.packSize, 10),
        minStock: form.minStock !== '' ? Number(form.minStock) : null,
        defaultMrp: form.defaultMrp !== '' ? Number(form.defaultMrp) : null,
        defaultRate: form.defaultRate !== '' ? Number(form.defaultRate) : null,
        purchaseRate: form.purchaseRate !== '' ? Number(form.purchaseRate) : null,
        sellingRate: form.sellingRate !== '' ? Number(form.sellingRate) : null,
        ptr: form.ptr !== '' ? Number(form.ptr) : null,
        gstPercent: form.gstPercent !== '' ? Number(form.gstPercent) : null,
        notes: form.notes.trim() || null,
      };

      if (isEditing) {
        await productApi.updateProduct(user.id, productId, data);
        toast.success('Product updated!');
      } else {
        await productApi.createProduct(user.id, data);
        toast.success('Product created!');
      }
      navigate('/products');
    } catch (err) {
      toast.error(err.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="loading-spinner"><div className="spinner" /></div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigate('/products')}>
          <ArrowLeft size={18} />
        </button>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>{isEditing ? 'Edit Product' : 'Add Product'}</h2>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header"><h3>Basic Info</h3></div>
          <div className="card-body">
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Product Name *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input className="form-input" style={{ flex: 1 }} value={form.name} onChange={e => updateField('name', e.target.value)} placeholder="e.g. Paracetamol 500mg" required />
                  <button type="button" className="btn btn-secondary" onClick={handleFetchDetails} disabled={fetchingAI || !form.name.trim()} title="Get details via AI" style={{ padding: '0 12px' }}>
                    {fetchingAI ? <Loader size={16} className="spinner" /> : <Wand2 size={16} />}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Salt Composition</label>
                <input className="form-input" value={form.salt} onChange={e => updateField('salt', e.target.value)} placeholder="e.g. Paracetamol" />
              </div>
              <div className="form-group">
                <label className="form-label">Manufacturer</label>
                <input className="form-input" value={form.manufacturer} onChange={e => updateField('manufacturer', e.target.value)} placeholder="e.g. Cipla" />
              </div>
            </div>
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">HSN Code</label>
                <input className="form-input" value={form.hsnCode} onChange={e => updateField('hsnCode', e.target.value)} placeholder="e.g. 3004" />
              </div>
              <div className="form-group">
                <label className="form-label">Purchase Date</label>
                <input className="form-input" value={form.purchaseDate} onChange={e => updateField('purchaseDate', e.target.value)} placeholder="DD-MM-YYYY" />
              </div>
              <div className="form-group">
                <label className="form-label">Min Stock Alert</label>
                <input className="form-input" type="number" value={form.minStock} onChange={e => updateField('minStock', e.target.value)} placeholder="10" />
              </div>
            </div>
            {isEditing ? (
              <div style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 8, background: '#eef2ff', color: '#3730a3' }}>
                <Layers size={18} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {batchSummary
                      ? `${batchSummary.batchCount} batch${batchSummary.batchCount === 1 ? '' : 'es'} · ${batchSummary.stockLabel} in stock`
                      : 'Stock summary unavailable'}
                  </div>
                  <div style={{ fontSize: 13 }}>Batch number, expiry and quantity are tracked per batch — correct them from the purchase bill they came from, or Quick Sell.</div>
                </div>
              </div>
            ) : (
              <div className="form-row-3">
                <div className="form-group">
                  <label className="form-label">Batch Number</label>
                  <input className="form-input" value={form.batchNumber} onChange={e => updateField('batchNumber', e.target.value)} placeholder="e.g. B12345" />
                </div>
                <div className="form-group">
                  <label className="form-label">Expiry Date *</label>
                  <input className="form-input" type="date" value={form.expiryDate} onChange={e => updateField('expiryDate', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Quantity</label>
                  <input className="form-input" type="number" min="0" step="any" value={form.quantity} onChange={e => updateField('quantity', e.target.value)} placeholder="1" />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header"><h3>Pack &amp; Schedule</h3></div>
          <div className="card-body">
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Unit 1 (pack)</label>
                <select className="form-input" value={form.packLabel} onChange={e => updateField('packLabel', e.target.value)}>
                  {[...new Set([...PACK_LABELS, form.packLabel])].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Unit 2 (base)</label>
                <select className="form-input" value={form.baseUnit} onChange={e => updateField('baseUnit', e.target.value)}>
                  {[...new Set([...BASE_UNITS, form.baseUnit])].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Conversion — 1 {form.packLabel} = __ {form.baseUnit}(s)</label>
                <input className="form-input" type="number" min="1" step="1" value={form.packSize} onChange={e => updateField('packSize', e.target.value)} placeholder="e.g. 15" />
              </div>
            </div>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
              1 {form.packLabel} = {form.packSize || 1} {form.baseUnit}{String(form.packSize) === '1' ? '' : 's'}. Stock is always counted in {form.baseUnit}s.
            </p>
            <label className="form-label">Schedule</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['none', 'None'], ['h1', 'H1'], ['nrx', 'NRX']].map(([k, label]) => (
                <button key={k} type="button" onClick={() => updateField('scheduleFlag', k)}
                  className={`btn btn-sm ${form.scheduleFlag === k ? (k === 'none' ? 'btn-primary' : 'btn-danger') : 'btn-secondary'}`}>{label}</button>
              ))}
            </div>
            {form.scheduleFlag !== 'none' && (
              <p style={{ fontSize: 13, color: '#b91c1c', marginTop: 8 }}>
                Sales of this medicine require the patient and doctor name, and are billed immediately — they cannot be saved as a quick sale.
              </p>
            )}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header"><h3>Pricing</h3></div>
          <div className="card-body">
            <div className="form-row-3" style={{ marginTop: 4 }}>
              <div className="form-group">
                <label className="form-label">MRP (₹)</label>
                <input className="form-input" type="number" step="0.01" value={form.defaultMrp} onChange={e => updateField('defaultMrp', e.target.value)} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label className="form-label">Purchase Rate (₹)</label>
                <input className="form-input" type="number" step="0.01" value={form.purchaseRate} onChange={e => updateField('purchaseRate', e.target.value)} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label className="form-label">Selling Rate (₹)</label>
                <input className="form-input" type="number" step="0.01" value={form.sellingRate} onChange={e => updateField('sellingRate', e.target.value)} placeholder="0.00" />
              </div>
            </div>
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Default Rate (₹)</label>
                <input className="form-input" type="number" step="0.01" value={form.defaultRate} onChange={e => updateField('defaultRate', e.target.value)} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label className="form-label">PTR (₹)</label>
                <input className="form-input" type="number" step="0.01" value={form.ptr} onChange={e => updateField('ptr', e.target.value)} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label className="form-label">GST %</label>
                <input className="form-input" type="number" step="0.01" value={form.gstPercent} onChange={e => updateField('gstPercent', e.target.value)} placeholder="e.g. 12" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-input" rows={2} value={form.notes} onChange={e => updateField('notes', e.target.value)} placeholder="Optional notes…" />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <Loader size={16} className="spinner" /> : <Save size={16} />}
            {isEditing ? 'Update Product' : 'Create Product'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/products')}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
