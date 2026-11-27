import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { billApi, ledgerApi } from '../services/api';
import { formatDDMMYYYYOr } from '../utils/dateFormat';
import { formatINR } from '../utils/money';
import { checkBillHeader, DATE_MESSAGES } from '../utils/dateRules';

const ISSUE_LABEL = {
  MISSING_INVOICE_NUMBER: 'Invoice number nahi hai',
  MISSING_INVOICE_DATE: 'Invoice date nahi hai',
  FUTURE_INVOICE_DATE: 'Date future ki hai',
  DUE_BEFORE_INVOICE: 'Due date invoice date se pehle hai',
};

const isoOf = (v) => (v ? String(v).slice(0, 10) : '');

function Row({ bill, onDone }) {
  const [form, setForm] = useState({
    invoiceNumber: bill.invoiceNumber || '',
    invoiceDate: isoOf(bill.invoiceDate),
    dueDate: isoOf(bill.dueDate),
  });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const check = checkBillHeader(form);
  const errors = touched ? { ...serverErrors, ...check.errors } : serverErrors;

  const save = async (confirmOldDate = false) => {
    setTouched(true);
    if (Object.keys(check.errors).length) return;
    if (check.oldDateWarning && !confirmOldDate) {
      if (!window.confirm(DATE_MESSAGES.oldInvoice)) return;
      confirmOldDate = true;
    }
    setSaving(true);
    setServerErrors({});
    try {
      const res = await billApi.updateBillHeader(bill.id, {
        invoiceNumber: form.invoiceNumber.trim(),
        invoiceDate: form.invoiceDate,
        dueDate: form.dueDate || null,
        confirmOldDate,
      });
      toast.success('Bill complete ho gaya');
      // Never adjust advance money without asking
      const prompt = res.onAccountPrompt;
      if (prompt && window.confirm(`${prompt.message}\n\nOK = Haan · Cancel = Na`)) {
        const applied = await ledgerApi.applyOnAccount(prompt.billId);
        toast.success(`${formatINR(applied.applied)} advance adjust ho gaya`);
      }
      onDone();
    } catch (err) {
      if (err.code === 'CONFIRM_OLD_INVOICE_DATE') {
        setSaving(false);
        if (window.confirm(DATE_MESSAGES.oldInvoice)) save(true);
        return;
      }
      const fe = {};
      for (const e of err.details?.errors || []) fe[e.field] = e.message;
      setServerErrors(fe);
      toast.error(err.message || 'Save nahi ho paya');
    } finally {
      setSaving(false);
    }
  };

  const field = (key, label, type = 'text', required = false) => (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label className="form-label">{label}{required ? ' *' : ''}</label>
      <input className={`form-input ${errors[key] ? 'form-input-error' : ''}`} type={type} value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
      {errors[key] && <div className="form-error">{errors[key]}</div>}
    </div>
  );

  return (
    <tr>
      <td style={{ verticalAlign: 'top' }}>
        <div style={{ fontWeight: 600 }}>{bill.distributor?.name || bill.pharmacyName || '—'}</div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>{formatINR(bill.grandTotal)} · upload {formatDDMMYYYYOr(bill.createdAt, '—')}</div>
        <div style={{ fontSize: 12, color: '#b45309', fontWeight: 600 }}>{(bill.detailIssues || []).map((c) => ISSUE_LABEL[c] || c).join(' · ')}</div>
        <Link to={`/bills/${bill.id}`} style={{ fontSize: 12 }}>Bill kholein</Link>
      </td>
      <td style={{ verticalAlign: 'top' }}>{field('invoiceNumber', 'Invoice Number', 'text', true)}</td>
      <td style={{ verticalAlign: 'top' }}>{field('invoiceDate', 'Invoice Date', 'date', true)}</td>
      <td style={{ verticalAlign: 'top' }}>{field('dueDate', 'Due Date', 'date')}</td>
      <td style={{ verticalAlign: 'top', paddingTop: 28 }}>
        <button className="btn btn-primary btn-sm" onClick={() => save(false)} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </td>
    </tr>
  );
}

/**
 * "X bills me details baaki" — every bill missing an invoice number/date (email imports
 * and older bills), filled in one place. Until complete they stay out of FIFO
 * auto-allocation; their stock and outstanding already count.
 */
export default function NeedsDetailsPage() {
  const { user } = useAuth();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await billApi.getBillsNeedingDetails(user.id);
      setBills(res.bills || []);
    } catch (err) {
      toast.error(err.message || 'Load nahi hua');
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Bills me details baaki</h2>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>
        Invoice number aur date bharne tak ye bills payment ke auto-allocation me nahi aate. Stock aur outstanding me ye pehle se gine ja rahe hain.
      </p>
      {bills.length === 0 ? (
        <div className="card"><div className="empty-state"><h3>Sab bills complete hain</h3></div></div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table>
              <thead><tr><th>Bill</th><th>Invoice #</th><th>Invoice date</th><th>Due date</th><th></th></tr></thead>
              <tbody>
                {bills.map((b) => <Row key={b.id} bill={b} onDone={load} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
