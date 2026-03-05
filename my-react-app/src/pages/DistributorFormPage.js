import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { distributorApi, gstinApi } from '../services/api';
import { ArrowLeft, Save, Search, Loader } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DistributorFormPage() {
  const { user } = useAuth();
  const { distributorId } = useParams();
  const navigate = useNavigate();
  const isEditing = !!distributorId;

  const [form, setForm] = useState({
    name: '', phone: '', gstin: '', dlNumber: '', address: '', email: '',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gstinLoading, setGstinLoading] = useState(false);

  useEffect(() => {
    if (isEditing) {
      setLoading(true);
      distributorApi.getDistributorById(distributorId)
        .then(res => {
          const d = res.distributor || res;
          setForm({
            name: d.name || '',
            phone: d.phone || '',
            gstin: d.gstin || '',
            dlNumber: d.dlNumber || '',
            address: d.address || '',
            email: d.email || '',
          });
        })
        .catch(() => { toast.error('Distributor not found'); navigate('/distributors'); })
        .finally(() => setLoading(false));
    }
  }, [distributorId]);

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const lookupGstin = async () => {
    if (!form.gstin || form.gstin.length !== 15) {
      toast.error('Enter a valid 15-character GSTIN');
      return;
    }
    setGstinLoading(true);
    try {
      const result = await gstinApi.lookupGstin(form.gstin);
      if (result.distributorData) {
        const d = result.distributorData;
        setForm(prev => ({
          ...prev,
          name: d.name || prev.name,
          address: d.address || prev.address,
          phone: d.phone || prev.phone,
          email: d.email || prev.email,
        }));
        toast.success('GSTIN details fetched!');
      } else {
        toast.error('No details found for this GSTIN');
      }
    } catch (err) {
      toast.error(err.message || 'GSTIN lookup failed');
    } finally {
      setGstinLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Distributor name is required');
      return;
    }
    setSaving(true);
    try {
      if (isEditing) {
        await distributorApi.updateDistributor(distributorId, form);
        toast.success('Distributor updated!');
      } else {
        await distributorApi.createDistributor(user.id, form);
        toast.success('Distributor created!');
      }
      navigate('/distributors');
    } catch (err) {
      toast.error(err.message || 'Failed to save distributor');
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
        <button className="btn btn-ghost btn-icon" onClick={() => navigate('/distributors')}>
          <ArrowLeft size={18} />
        </button>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>{isEditing ? 'Edit Distributor' : 'Add Distributor'}</h2>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header"><h3>GSTIN Lookup</h3></div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
              Enter GSTIN to auto-fill distributor details
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="form-input"
                style={{ maxWidth: 300 }}
                value={form.gstin}
                onChange={e => updateField('gstin', e.target.value.toUpperCase())}
                placeholder="e.g. 27AAPFU0939F1ZV"
                maxLength={15}
              />
              <button type="button" className="btn btn-secondary" onClick={lookupGstin} disabled={gstinLoading}>
                {gstinLoading ? <Loader size={14} className="spinner" /> : <Search size={14} />}
                Lookup
              </button>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header"><h3>Distributor Details</h3></div>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input className="form-input" value={form.name} onChange={e => updateField('name', e.target.value)} placeholder="Distributor name" required />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" value={form.phone} onChange={e => updateField('phone', e.target.value)} placeholder="Phone number" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" value={form.email} onChange={e => updateField('email', e.target.value)} placeholder="Email address" />
              </div>
              <div className="form-group">
                <label className="form-label">DL Number</label>
                <input className="form-input" value={form.dlNumber} onChange={e => updateField('dlNumber', e.target.value)} placeholder="Drug license number" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Address</label>
              <textarea className="form-input" rows={3} value={form.address} onChange={e => updateField('address', e.target.value)} placeholder="Full address" />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <Loader size={16} className="spinner" /> : <Save size={16} />}
            {isEditing ? 'Update Distributor' : 'Create Distributor'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/distributors')}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
