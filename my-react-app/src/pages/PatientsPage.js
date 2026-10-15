import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { patientApi } from '../services/api';
import { Plus, Search, Users, Phone, MessageCircle, AlarmClock, PackageX } from 'lucide-react';
import toast from 'react-hot-toast';
import { telHref, whatsAppHref, buildRefillReminderMessage, runOutStatus } from '../utils/contact';

/**
 * Refill Reminders — chronic patients sorted by soonest medicine run-out.
 * Web counterpart of mobile PatientsListScreen.
 */
export default function PatientsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    patientApi.getPatients(user.id)
      .then((res) => setPatients(res.patients || []))
      .catch((err) => toast.error(err.message || 'Failed to load patients'))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => p.name?.toLowerCase().includes(q) || p.phone?.includes(q));
  }, [patients, search]);

  const dueSoon = patients.filter((p) => p.daysLeft != null && p.daysLeft <= 7).length;
  const lowStock = patients.filter((p) => p.lowStock).length;

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Refill Reminders</h2>
        <Link to="/patients/new" className="btn btn-primary"><Plus size={16} /> Add Patient</Link>
      </div>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: '#eef2ff', color: '#4f46e5' }}><Users size={20} /></div>
          <div><div className="stat-card-label">Patients</div><div className="stat-card-value">{patients.length}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: '#fffbeb', color: '#d97706' }}><AlarmClock size={20} /></div>
          <div><div className="stat-card-label">Due in 7 days</div><div className="stat-card-value" style={{ color: '#d97706' }}>{dueSoon}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: '#fef2f2', color: '#dc2626' }}><PackageX size={20} /></div>
          <div><div className="stat-card-label">Low Stock</div><div className="stat-card-value" style={{ color: '#dc2626' }}>{lowStock}</div></div>
        </div>
      </div>

      {patients.length === 0 ? (
        <div className="card"><div className="empty-state">
          <Users size={48} /><h3>No patients yet</h3><p>Add a chronic patient to start tracking refills.</p>
          <Link to="/patients/new" className="btn btn-primary" style={{ marginTop: 12 }}><Plus size={16} /> Add Patient</Link>
        </div></div>
      ) : (
        <>
          <div className="search-bar" style={{ maxWidth: 360, marginBottom: 16 }}>
            <Search size={16} />
            <input className="form-input" placeholder="Search name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="card">
            <div className="table-container">
              <table>
                <thead><tr><th>Patient</th><th>Medicines</th><th>Next run-out</th><th></th></tr></thead>
                <tbody>
                  {filtered.map((p) => {
                    const st = runOutStatus(p.daysLeft);
                    const wa = whatsAppHref(p.phone, buildRefillReminderMessage(p, user?.shopName));
                    const tel = telHref(p.phone);
                    return (
                      <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/patients/${p.id}`)}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#eef2ff', color: '#4f46e5', display: 'grid', placeItems: 'center', fontWeight: 700 }}>
                              {(p.name || 'P').charAt(0).toUpperCase()}
                            </div>
                            <div><div style={{ fontWeight: 600 }}>{p.name}</div><div style={{ fontSize: 12, color: '#6b7280' }}>{p.phone}</div></div>
                          </div>
                        </td>
                        <td>
                          {p.medicines?.length || 0} medicine{p.medicines?.length === 1 ? '' : 's'}
                          {p.lowStock && <span className="badge badge-danger" style={{ marginLeft: 6 }}>Low stock</span>}
                        </td>
                        <td style={{ color: st.color, fontWeight: 600 }}>{st.label}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                          {tel && <a className="btn btn-ghost btn-icon btn-sm" href={tel} title="Call" aria-label="Call"><Phone size={15} style={{ color: '#4f46e5' }} /></a>}
                          {wa && <a className="btn btn-ghost btn-icon btn-sm" href={wa} target="_blank" rel="noreferrer" title="WhatsApp refill reminder" aria-label="WhatsApp"><MessageCircle size={15} style={{ color: '#25d366' }} /></a>}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: '#6b7280', padding: 24 }}>No patients found for “{search}”</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
