import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { patientApi } from '../services/api';
import { ArrowLeft, Phone, MessageCircle, Pencil, Trash2, RefreshCw, Pill, BellRing, CheckCircle2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDDMMYYYYOr } from '../utils/dateFormat';
import { getDosageSummary, getPackQuantity, getDosageFieldConfig, normalizeDosageForm, toNumber } from '../utils/dosageForms';
import { telHref, whatsAppHref, buildRefillReminderMessage, runOutStatus } from '../utils/contact';

/** Same quantity → payload conversion as mobile's ConfirmPickupModal. */
function pickupUpdate(m, enteredQuantity) {
  const dosageForm = normalizeDosageForm(m.dosageForm);
  const dosePerDay = toNumber(m.dosePerDay || m.dosageDetails?.dosePerDay);
  if (dosageForm === 'tablet') {
    const tabletsPerStrip = toNumber(m.tabletsPerStrip || m.dosageDetails?.tabletsPerStrip);
    const stripsDispensed = tabletsPerStrip > 0 ? enteredQuantity / tabletsPerStrip : 0;
    return { medicineId: m.id, dosageForm, stripsDispensed, tabletsPerStrip, dosePerDay, dosageDetails: { stripsDispensed, tabletsPerStrip, dosePerDay } };
  }
  const packField = getDosageFieldConfig(dosageForm).fields[0]?.key;
  return { medicineId: m.id, dosageForm, dosePerDay, dosageDetails: { ...(m.dosageDetails || {}), [packField]: enteredQuantity } };
}

function PickupModal({ medicines, syncItems, onClose, onConfirm, saving }) {
  const [qty, setQty] = useState(() => Object.fromEntries(medicines.map((m) => {
    const s = syncItems.find((x) => x.medicineId === m.id);
    const extra = s ? s.extraAmount ?? s.extraTablets ?? 0 : 0;
    return [m.id, String(getPackQuantity(m) + extra)];
  })));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Confirm Pickup</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>Enter the quantity actually dispensed today. The cycle resets from today's date.</p>
          {medicines.map((m) => {
            const s = syncItems.find((x) => x.medicineId === m.id);
            const unit = getDosageFieldConfig(m.dosageForm).quantityLabel;
            return (
              <div key={m.id} className="form-group">
                <label className="form-label">{m.name} <span style={{ fontWeight: 400, color: '#6b7280' }}>({unit})</span></label>
                {s && <div style={{ fontSize: 12, color: '#4f46e5', marginBottom: 4 }}>Sync recommends +{s.extraAmount ?? s.extraTablets} {s.quantityLabel || 'units'} to align refills</div>}
                <input className="form-input" type="number" min="0" step="any" value={qty[m.id] ?? ''} onChange={(e) => setQty((q) => ({ ...q, [m.id]: e.target.value }))} />
              </div>
            );
          })}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving}
            onClick={() => onConfirm(medicines.map((m) => pickupUpdate(m, parseFloat(qty[m.id]) || 0)))}>
            {saving ? 'Saving…' : 'Confirm Pickup'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Patient profile, medicines, sync recommendation, reminder + pickup. Web counterpart of mobile PatientDetailScreen. */
export default function PatientDetailPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { patientId } = useParams();
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pickupOpen, setPickupOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await patientApi.getPatientById(user.id, patientId);
      setPatient(res.patient);
    } catch (err) {
      toast.error(err.message || 'Failed to load patient');
    } finally {
      setLoading(false);
    }
  }, [user?.id, patientId]);

  useEffect(() => { load(); }, [load]);

  const active = useMemo(() => (patient?.medicines || []).filter((m) => m.isActive), [patient]);
  const sync = patient?.sync || { targetDate: null, items: [] };

  const remove = async () => {
    if (!window.confirm(`Delete "${patient.name}"? This cannot be undone.`)) return;
    try {
      await patientApi.deletePatient(user.id, patientId);
      toast.success('Patient deleted');
      navigate('/patients', { replace: true });
    } catch (err) {
      toast.error(err.message || 'Failed to delete patient');
    }
  };

  const logReminder = async () => {
    setBusy(true);
    try {
      await patientApi.sendReminder(user.id, patientId);
      toast.success('Reminder logged');
    } catch (err) {
      toast.error(err.message || 'Failed to log reminder');
    } finally {
      setBusy(false);
    }
  };

  const confirmPickup = async (updates) => {
    setBusy(true);
    try {
      await patientApi.confirmPickup(user.id, patientId, updates);
      toast.success('Pickup confirmed — cycle reset from today');
      setPickupOpen(false);
      await load();
    } catch (err) {
      toast.error(err.message || 'Failed to confirm pickup');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;
  if (!patient) return <div className="card"><div className="empty-state"><h3>Patient not found</h3><Link to="/patients">Back to patients</Link></div></div>;

  const tel = telHref(patient.phone);
  const wa = whatsAppHref(patient.phone, buildRefillReminderMessage(patient, user?.shopName));

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigate('/patients')} aria-label="Back"><ArrowLeft size={20} /></button>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#eef2ff', color: '#4f46e5', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 18 }}>
          {(patient.name || 'P').charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>{patient.name}</h2>
          <div style={{ color: '#6b7280' }}>{patient.phone}</div>
        </div>
        {tel && <a className="btn btn-secondary" href={tel}><Phone size={16} /> Call</a>}
        {wa && <a className="btn btn-secondary" href={wa} target="_blank" rel="noreferrer" style={{ color: '#128c4b' }}><MessageCircle size={16} /> WhatsApp</a>}
        <Link className="btn btn-secondary" to={`/patients/${patientId}/edit`}><Pencil size={16} /> Edit</Link>
        <button className="btn btn-ghost" onClick={remove} style={{ color: '#dc2626' }}><Trash2 size={16} /> Delete</button>
      </div>

      {patient.notes && (
        <div className="card" style={{ marginBottom: 20 }}><div className="card-body">
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Notes</div>{patient.notes}
        </div></div>
      )}

      {sync.items.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderColor: '#c7d2fe' }}>
          <div className="card-header"><h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><RefreshCw size={18} style={{ color: '#4f46e5' }} /> Medication Sync Recommendation</h3></div>
          <div className="card-body">
            <p style={{ marginBottom: 8 }}>Target common refill date: <strong>{formatDDMMYYYYOr(sync.targetDate, '-')}</strong></p>
            {sync.items.map((i) => (
              <div key={i.medicineId} style={{ fontSize: 14, padding: '4px 0' }}>
                <strong>{i.name}</strong> — short-fill +{i.extraAmount ?? i.extraTablets} {i.quantityLabel || 'units'} to bridge {i.gapDays}d
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Medicines ({active.length})</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={logReminder} title="Logs the reminder — no SMS is sent yet. Use WhatsApp to message the patient.">
              <BellRing size={14} /> Log Reminder
            </button>
            <button className="btn btn-primary btn-sm" disabled={!active.length || busy} onClick={() => setPickupOpen(true)}><CheckCircle2 size={14} /> Confirm Pickup</button>
          </div>
        </div>
        {active.length === 0 ? (
          <div className="empty-state"><Pill size={40} /><h3>No medicines</h3><p>Click Edit to add chronic medicines.</p></div>
        ) : (
          <div className="table-container">
            <table>
              <thead><tr><th>Medicine</th><th>Dosage</th><th>Runs out</th><th>Status</th></tr></thead>
              <tbody>
                {active.map((m) => {
                  const st = runOutStatus(m.daysLeft, { short: true });
                  return (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 600 }}>{m.name}</td>
                      <td style={{ fontSize: 13, color: '#4b5563' }}>{getDosageSummary(m)}</td>
                      <td>{formatDDMMYYYYOr(m.runOutDate, '-')}</td>
                      <td>
                        <span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span>
                        {m.lowStock && <span className="badge badge-danger" style={{ marginLeft: 6 }}>Low stock</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pickupOpen && <PickupModal medicines={active} syncItems={sync.items} saving={busy} onClose={() => setPickupOpen(false)} onConfirm={confirmPickup} />}
    </div>
  );
}
