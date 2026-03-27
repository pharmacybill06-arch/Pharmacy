import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { productApi, aiApi } from '../services/api';
import { ArrowLeft, Save, Loader, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ProductFormPage() {
  const { user } = useAuth();
  const { productId } = useParams();
  const navigate = useNavigate();
  const isEditing = !!productId;

  const [form, setForm] = useState({
    name: '', salt: '', manufacturer: '', hsnCode: '', batchNumber: '',
    expiryDate: '', stock: '', minStock: '', unit: 'pcs',
    defaultMrp: '', purchaseRate: '', sellingRate: '', ptr: '',
    gstPercent: '',
  });
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
            batchNumber: p.batchNumber || '',
            expiryDate: p.expiryDate ? p.expiryDate.split('T')[0] : '',
            stock: p.stock ?? '',
            minStock: p.minStock ?? '',
            unit: p.unit || 'pcs',
            defaultMrp: p.defaultMrp ?? '',
            purchaseRate: p.purchaseRate ?? '',
            sellingRate: p.sellingRate ?? '',
            ptr: p.ptr ?? '',
            gstPercent: p.gstPercent ?? '',
          });
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
    setSaving(true);
    try {
      const data = {
        ...form,
        stock: form.stock !== '' ? Number(form.stock) : null,
        minStock: form.minStock !== '' ? Number(form.minStock) : null,
        defaultMrp: form.defaultMrp !== '' ? Number(form.defaultMrp) : null,
        purchaseRate: form.purchaseRate !== '' ? Number(form.purchaseRate) : null,
        sellingRate: form.sellingRate !== '' ? Number(form.sellingRate) : null,
        ptr: form.ptr !== '' ? Number(form.ptr) : null,
        gstPercent: form.gstPercent !== '' ? Number(form.gstPercent) : null,
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
                <label className="form-label">Batch Number</label>
                <input className="form-input" value={form.batchNumber} onChange={e => updateField('batchNumber', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Expiry Date</label>
                <input className="form-input" type="date" value={form.expiryDate} onChange={e => updateField('expiryDate', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header"><h3>Stock & Pricing</h3></div>
          <div className="card-body">
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Current Stock</label>
                <input className="form-input" type="number" value={form.stock} onChange={e => updateField('stock', e.target.value)} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Min Stock Alert</label>
                <input className="form-input" type="number" value={form.minStock} onChange={e => updateField('minStock', e.target.value)} placeholder="10" />
              </div>
              <div className="form-group">
                <label className="form-label">Unit</label>
                <select className="form-input" value={form.unit} onChange={e => updateField('unit', e.target.value)}>
                  <option value="pcs">Pieces</option>
                  <option value="strip">Strip</option>
                  <option value="box">Box</option>
                  <option value="bottle">Bottle</option>
                  <option value="tube">Tube</option>
                  <option value="vial">Vial</option>
                  <option value="kg">Kg</option>
                  <option value="ml">ML</option>
                </select>
              </div>
            </div>
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
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">PTR (₹)</label>
                <input className="form-input" type="number" step="0.01" value={form.ptr} onChange={e => updateField('ptr', e.target.value)} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label className="form-label">GST %</label>
                <input className="form-input" type="number" step="0.01" value={form.gstPercent} onChange={e => updateField('gstPercent', e.target.value)} placeholder="e.g. 12" />
              </div>
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
