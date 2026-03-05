import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../services/api';
import { User, Save, Loader, Store, Phone } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const { user, updateUser } = useAuth();

  const [form, setForm] = useState({
    name: user?.name || '',
    shopName: user?.shopName || '',
  });
  const [saving, setSaving] = useState(false);

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const result = await authApi.updateProfile(user.id, form);
      updateUser(result.user || { ...user, ...form });
      toast.success('Profile updated!');
    } catch (err) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Profile</h2>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><h3>Account Info</h3></div>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: '#dbeafe', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#2563eb',
            }}>
              <User size={28} />
            </div>
            <div>
              <p style={{ fontWeight: 600, fontSize: 18 }}>{user?.name || 'User'}</p>
              <p style={{ color: '#6b7280', fontSize: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Phone size={12} /> +91 {user?.phone}
              </p>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header"><h3>Edit Profile</h3></div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Name</label>
              <input className="form-input" value={form.name} onChange={e => updateField('name', e.target.value)} placeholder="Your name" />
            </div>
            <div className="form-group">
              <label className="form-label">Shop Name</label>
              <input className="form-input" value={form.shopName} onChange={e => updateField('shopName', e.target.value)} placeholder="Your shop name" />
            </div>
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input className="form-input" value={user?.phone || ''} disabled style={{ background: '#f3f4f6' }} />
              <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Phone number cannot be changed</p>
            </div>
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <Loader size={16} className="spinner" /> : <Save size={16} />}
          Save Changes
        </button>
      </form>
    </div>
  );
}
