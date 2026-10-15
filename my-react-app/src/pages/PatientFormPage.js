import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { patientApi } from '../services/api';
import { ArrowLeft, Plus, Trash2, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  DOSAGE_FORM_OPTIONS, getDosageFieldConfig, getDaysOfSupply, getDosageSummary,
  normalizeDosageForm, buildDosageDetails, toNumber,
} from '../utils/dosageForms';

let tempIdCounter = 0;
const makeTempId = () => `temp-${Date.now()}-${++tempIdCounter}`;

const DETAIL_KEYS = ['stripsDispensed', 'tabletsPerStrip', 'bottleSizeMl', 'mlPerDose', 'tubeSizeG', 'gPerDose',
  'inhalerCount', 'puffsPerDose', 'unitsPerVial', 'unitsPerDose', 'dropsPerDose', 'dosePerDay'];

function emptyMedicine() {
  return { tempId: makeTempId(), name: '', dosageForm: 'tablet', ...Object.fromEntries(DETAIL_KEYS.map((k) => [k, ''])) };
}

function hydrateMedicine(m) {
  const details = m?.dosageDetails || m || {};
  return {
    id: m.id,
    name: m.name || '',
    dosageForm: normalizeDosageForm(m?.dosageForm),
    ...Object.fromEntries(DETAIL_KEYS.map((k) => [k, String(details[k] ?? m[k] ?? '')])),
  };
}

/**
 * Add / edit a chronic patient and their medicines. Web counterpart of mobile
 * PatientFormScreen; on edit the medicine list is diffed against the original
 * (add / update / delete) exactly like the mobile save handler.
 */
export default function PatientFormPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { patientId } = useParams();
  const isEditing = !!patientId;

  const [original, setOriginal] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', notes: '' });
  const [medicines, setMedicines] = useState([]);
  const [errors, setErrors] = useState({});
  const [medErrors, setMedErrors] = useState({});
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEditing || !user?.id) return;
    patientApi.getPatientById(user.id, patientId)
      .then((res) => {
        const p = res.patient;
        setOriginal(p);
        setForm({ name: p.name || '', phone: p.phone || '', notes: p.notes || '' });
        setMedicines((p.medicines || []).filter((m) => m.isActive !== false).map(hydrateMedicine));
      })
      .catch((err) => toast.error(err.message || 'Failed to load patient'))
      .finally(() => setLoading(false));
  }, [isEditing, patientId, user?.id]);

  const setField = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: null }));
  };

  const keyOf = (m) => m.id || m.tempId;
  const updateMed = (key, updated) => {
    setMedicines((list) => list.map((m) => (keyOf(m) === key ? updated : m)));
    if (medErrors[key]) setMedErrors((e) => ({ ...e, [key]: null }));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Patient name is required';
    if (!form.phone.trim()) e.phone = 'Phone number is required';
    const me = {};
    medicines.forEach((m) => {
      if (!m.name.trim()) { me[keyOf(m)] = 'Medicine name is required'; return; }
      const bad = getDosageFieldConfig(m.dosageForm).fields.find((f) => !(toNumber(m[f.key]) > 0));
      if (bad) me[keyOf(m)] = `${bad.label} must be greater than 0`;
    });
    setErrors(e);
    setMedErrors(me);
    return !Object.keys(e).length && !Object.keys(me).length;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    const patientData = { name: form.name.trim(), phone: form.phone.trim(), notes: form.notes.trim() || null };
    const meds = medicines.map((m) => {
      const dosageForm = normalizeDosageForm(m.dosageForm);
      const details = buildDosageDetails(dosageForm, m);
      return {
        id: m.id,
        name: m.name.trim(),
        dosageForm,
        ...details,
        stripsDispensed: dosageForm === 'tablet' ? toNumber(m.stripsDispensed) : 0,
        tabletsPerStrip: dosageForm === 'tablet' ? toNumber(m.tabletsPerStrip) : 0,
        dosePerDay: toNumber(m.dosePerDay),
        dosageDetails: details,
      };
    });

    setSaving(true);
    try {
      if (isEditing) {
        await patientApi.updatePatient(user.id, patientId, patientData);
        const originalIds = (original?.medicines || []).filter((m) => m.isActive !== false).map((m) => m.id);
        const finalIds = meds.filter((m) => m.id).map((m) => m.id);
        await Promise.all([
          ...originalIds.filter((id) => !finalIds.includes(id)).map((id) => patientApi.deleteMedicine(user.id, patientId, id)),
          ...meds.filter((m) => !m.id).map((m) => patientApi.addMedicine(user.id, patientId, m)),
          ...meds.filter((m) => m.id).map((m) => patientApi.updateMedicine(user.id, patientId, m.id, m)),
        ]);
        toast.success('Patient updated');
        navigate(`/patients/${patientId}`, { replace: true });
      } else {
        const res = await patientApi.createPatient(user.id, { ...patientData, medicines: meds });
        toast.success('Patient added');
        navigate(res.patient?.id ? `/patients/${res.patient.id}` : '/patients', { replace: true });
      }
    } catch (err) {
      toast.error(err.message || 'Failed to save patient');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <form onSubmit={submit} style={{ maxWidth: 820 }} noValidate>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => navigate(-1)} aria-label="Back"><ArrowLeft size={20} /></button>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>{isEditing ? 'Edit Patient' : 'Add Patient'}</h2>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><h3>Patient Details</h3></div>
        <div className="card-body">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Patient name *</label>
              <input className={`form-input ${errors.name ? 'form-input-error' : ''}`} autoFocus={!isEditing} placeholder="e.g., Ramesh Kumar"
                value={form.name} onChange={(e) => setField('name', e.target.value)} />
              {errors.name && <div className="form-error">{errors.name}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Phone number *</label>
              <input className={`form-input ${errors.phone ? 'form-input-error' : ''}`} type="tel" placeholder="e.g., 9876543210"
                value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
              {errors.phone && <div className="form-error">{errors.phone}</div>}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={3} placeholder="Optional notes…" value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Medicines</h3>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMedicines((l) => [...l, emptyMedicine()])}><Plus size={14} /> Add Medicine</button>
        </div>
        <div className="card-body">
          {medicines.length === 0 && <p style={{ color: '#6b7280' }}>No medicines added yet. Click “Add Medicine” to add a chronic medicine.</p>}
          {medicines.map((m) => {
            const key = keyOf(m);
            const config = getDosageFieldConfig(m.dosageForm);
            return (
              <div key={key} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <input className="form-input" style={{ flex: 1 }} placeholder="e.g., Telmisartan 40mg" value={m.name}
                    onChange={(e) => updateMed(key, { ...m, name: e.target.value })} aria-label="Medicine name" />
                  <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove medicine"
                    onClick={() => setMedicines((l) => l.filter((x) => keyOf(x) !== key))}><Trash2 size={16} style={{ color: '#dc2626' }} /></button>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {DOSAGE_FORM_OPTIONS.map((o) => (
                    <button key={o.value} type="button" className={`btn btn-sm ${m.dosageForm === o.value ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => updateMed(key, { ...m, dosageForm: o.value })}>{o.label}</button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                  {config.fields.map((f) => (
                    <div key={f.key} className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">{f.label}</label>
                      <input className="form-input" type="number" min="0" step="any" placeholder={f.placeholder}
                        value={m[f.key]} onChange={(e) => updateMed(key, { ...m, [f.key]: e.target.value })} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 14 }}>
                  <span style={{ color: '#6b7280' }}>{getDosageSummary(m)}</span>
                  <strong>Runs out in {Math.max(0, Math.round(getDaysOfSupply(m) * 10) / 10)} days</strong>
                </div>
                {medErrors[key] && <div className="form-error" style={{ marginTop: 6 }}>{medErrors[key]}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: '#64748b', fontSize: 13, marginBottom: 20 }}>
        <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        Days of supply is computed from the selected dosage form. The run-out date and medication sync recommendation are shown on the patient's page.
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Patient'}</button>
      </div>
    </form>
  );
}
