import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ledgerApi } from '../services/api';
import { ArrowLeft, Plus, Pencil, FileText, Wallet, ScrollText } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDDMMYYYYOr, billDisplayDateShort } from '../utils/dateFormat';
import { formatINR, BILL_STATUS, PAYMENT_MODE_LABEL } from '../utils/money';

/**
 * One distributor's account: bills with payment status, payments, and a running
 * statement. Web counterpart of mobile DistributorLedgerDetailScreen, on the same
 * GET /ledger/distributor/:id endpoint.
 */
export default function LedgerDetailPage() {
  const { distributorId } = useParams();
  const navigate = useNavigate();
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('bills');
  const [openingModal, setOpeningModal] = useState(false);

  const load = useCallback(async () => {
    try {
      setLedger(await ledgerApi.getDistributorLedger(distributorId));
    } catch (err) {
      toast.error(err.message || 'Failed to load ledger');
    } finally {
      setLoading(false);
    }
  }, [distributorId]);

  useEffect(() => { load(); }, [load]);

  // Memoised so the fallback `[]` is stable and the overdue total below doesn't
  // recompute on every render.
  const bills = useMemo(() => ledger?.bills || [], [ledger]);
  const payments = useMemo(() => ledger?.payments || [], [ledger]);
  const ledgerRows = useMemo(() => ledger?.ledgerRows || [], [ledger]);
  const distributor = ledger?.distributor;

  // The statement's last running balance is the authoritative outstanding figure.
  const outstanding = ledgerRows.length ? ledgerRows[ledgerRows.length - 1].runningBalance : 0;
  const overdue = useMemo(
    () => bills.filter((b) => b.isOverdue || b.status === 'overdue').reduce((s, b) => s + (Number(b.balance) || 0), 0),
    [bills]
  );
  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;
  if (!distributor) {
    return (
      <div className="card"><div className="empty-state"><h3>Distributor not found</h3>
        <Link to="/ledger" className="btn btn-primary" style={{ marginTop: 16 }}>Back to payments</Link></div></div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-icon" onClick={() => navigate('/ledger')} aria-label="Back"><ArrowLeft size={18} /></button>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700 }}>{distributor.name}</h2>
            <p style={{ color: '#6b7280', fontSize: 14 }}>
              {[distributor.phone, distributor.gstin && `GSTIN ${distributor.gstin}`].filter(Boolean).join(' · ') || 'Distributor ledger'}
            </p>
          </div>
        </div>
        <Link to={`/ledger/${distributorId}/pay`} className="btn btn-primary"><Plus size={16} /> Record Payment</Link>
      </div>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div>
            <div className="stat-card-label">Outstanding</div>
            <div className="stat-card-value">{formatINR(outstanding)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-card-label">Overdue</div>
            <div className="stat-card-value" style={{ color: overdue > 0 ? '#dc2626' : undefined }}>{formatINR(overdue)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-card-label">Paid So Far</div>
            <div className="stat-card-value">{formatINR(totalPaid)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div style={{ flex: 1 }}>
            <div className="stat-card-label">Opening Balance</div>
            <div className="stat-card-value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {formatINR(distributor.openingBalance || 0)}
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setOpeningModal(true)} aria-label="Edit opening balance"><Pencil size={14} /></button>
            </div>
            {distributor.openingBalanceNote && <div style={{ fontSize: 12, color: '#6b7280' }}>{distributor.openingBalanceNote}</div>}
          </div>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {[
          { key: 'bills', label: `Bills (${bills.length})`, icon: FileText },
          { key: 'payments', label: `Payments (${payments.length})`, icon: Wallet },
          { key: 'statement', label: 'Statement', icon: ScrollText },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            <Icon size={14} style={{ marginRight: 6, verticalAlign: -2 }} />{label}
          </button>
        ))}
      </div>

      {tab === 'bills' && <BillsTab bills={bills} />}
      {tab === 'payments' && <PaymentsTab payments={payments} distributorId={distributorId} />}
      {tab === 'statement' && <StatementTab rows={ledgerRows} />}

      {openingModal && (
        <OpeningBalanceModal
          distributor={distributor}
          onClose={() => setOpeningModal(false)}
          onSaved={() => { setOpeningModal(false); load(); }}
        />
      )}
    </div>
  );
}

function BillsTab({ bills }) {
  if (bills.length === 0) {
    return <div className="card"><div className="empty-state"><FileText size={40} /><h3>No bills from this distributor</h3></div></div>;
  }
  return (
    <div className="card">
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Invoice Date</th>
              <th>Due Date</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th style={{ textAlign: 'right' }}>Paid</th>
              <th style={{ textAlign: 'right' }}>Balance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((b) => {
              const st = BILL_STATUS[b.status] || BILL_STATUS.unpaid;
              return (
                <tr key={b.id}>
                  <td><Link to={`/bills/${b.id}`} style={{ fontWeight: 500 }}>{b.invoiceNumber || 'N/A'}</Link></td>
                  <td>{billDisplayDateShort(b)}</td>
                  <td>{formatDDMMYYYYOr(b.dueDate, '—')}</td>
                  <td style={{ textAlign: 'right' }}>{formatINR(b.grandTotal)}</td>
                  <td style={{ textAlign: 'right' }}>{formatINR(b.amountPaid ?? b.paidAmount)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatINR(b.balance)}</td>
                  <td><span className={`badge ${st.badge}`}>{st.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentsTab({ payments, distributorId }) {
  if (payments.length === 0) {
    return <div className="card"><div className="empty-state"><Wallet size={40} /><h3>No payments recorded yet</h3>
      <Link to={`/ledger/${distributorId}/pay`} className="btn btn-primary" style={{ marginTop: 16 }}><Plus size={16} /> Record Payment</Link></div></div>;
  }
  return (
    <div className="card">
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Mode</th>
              <th>Reference</th>
              <th>Settled Against</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const settled = (p.allocations || [])
                .map((a) => (a.allocationType === 'opening_balance' ? 'Opening balance' : a.bill?.invoiceNumber || 'Bill'))
                .join(', ');
              return (
                <tr key={p.id}>
                  <td>{formatDDMMYYYYOr(p.paymentDate, '—')}</td>
                  <td><span className="badge badge-primary">{PAYMENT_MODE_LABEL[p.paymentMethod] || p.paymentMethod}</span></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{p.referenceNumber || '—'}</td>
                  <td style={{ fontSize: 13, color: '#6b7280' }}>{settled || 'On account'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatINR(p.amount)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {/* Opens the same form used to record it — editable, not a read-only popup. */}
                    <Link to={`/ledger/${distributorId}/payments/${p.id}`} className="btn btn-ghost btn-sm"><Pencil size={14} /> Edit</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatementTab({ rows }) {
  if (rows.length === 0) {
    return <div className="card"><div className="empty-state"><ScrollText size={40} /><h3>No transactions yet</h3></div></div>;
  }
  return (
    <div className="card">
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Particulars</th>
              <th style={{ textAlign: 'right' }}>Debit</th>
              <th style={{ textAlign: 'right' }}>Credit</th>
              <th style={{ textAlign: 'right' }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.billId || r.paymentId || 'row'}-${i}`}>
                <td>{formatDDMMYYYYOr(r.date, '—')}</td>
                <td>{r.billId ? <Link to={`/bills/${r.billId}`}>{r.particulars}</Link> : r.particulars}</td>
                <td style={{ textAlign: 'right' }}>{r.debit ? formatINR(r.debit) : ''}</td>
                <td style={{ textAlign: 'right', color: '#16a34a' }}>{r.credit ? formatINR(r.credit) : ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatINR(r.runningBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OpeningBalanceModal({ distributor, onClose, onSaved }) {
  const [amount, setAmount] = useState(String(distributor.openingBalance ?? 0));
  const [note, setNote] = useState(distributor.openingBalanceNote || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (Number.isNaN(value) || value < 0) {
      setError('Enter an amount of zero or more.');
      return;
    }
    setSaving(true);
    try {
      await ledgerApi.updateOpeningBalance(distributor.id, { openingBalance: value, note });
      toast.success('Opening balance updated');
      onSaved();
    } catch (err) {
      setError(err.message || 'Failed to update opening balance');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="modal-header"><h3>Opening Balance</h3></div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
            What you already owed {distributor.name} before you started recording bills here.
          </p>
          <div className="form-group">
            <label className="form-label">Amount (₹)</label>
            <input className="form-input" type="number" min="0" step="0.01" value={amount} onChange={(e) => { setAmount(e.target.value); setError(null); }} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Note (optional)</label>
            <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Carried over from old register" />
          </div>
          {error && <div className="form-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
