import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { paymentApi, ledgerApi } from '../services/api';
import { Wallet, Search, Pencil, Archive, IndianRupee, Hash } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDDMMYYYYOr } from '../utils/dateFormat';
import { formatINR, formatINRShort, PAYMENT_MODES, PAYMENT_MODE_LABEL } from '../utils/money';

const PAGE_SIZE = 25;

/**
 * Every payment made to any distributor. Web counterpart of mobile PaymentsListScreen.
 *
 * One deliberate difference: mobile offers "delete", which on the backend is a hard
 * delete with no audit trail. Here the action is "archive" (POST /ledger/payments/:id/
 * archive), the same reversible operation the ledger uses everywhere else.
 */
export default function PaymentsPage() {
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('all');

  const load = useCallback(async (nextPage = 1) => {
    if (!user?.id) return;
    try {
      nextPage === 1 ? setLoading(true) : setLoadingMore(true);
      const [list, st] = await Promise.all([
        paymentApi.getPayments(user.id, { page: nextPage, limit: PAGE_SIZE }),
        nextPage === 1 ? paymentApi.getPaymentStats(user.id) : Promise.resolve(null),
      ]);
      setPayments((prev) => (nextPage === 1 ? list.payments || [] : [...prev, ...(list.payments || [])]));
      setTotalPages(list.totalPages || 1);
      setPage(nextPage);
      if (st) setStats(st.stats || null);
    } catch (err) {
      toast.error(err.message || 'Failed to load payments');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user?.id]);

  useEffect(() => { load(1); }, [load]);

  const archive = async (p) => {
    if (!window.confirm(`Archive this ${formatINR(p.amount)} payment to ${p.distributor?.name || 'this distributor'}? It will be removed from the ledger. Archived payments can be restored.`)) return;
    try {
      await ledgerApi.archivePayment(p.id);
      setPayments((prev) => prev.filter((x) => x.id !== p.id));
      toast.success('Payment archived');
    } catch (err) {
      toast.error(err.message || 'Failed to archive payment');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments
      .filter((p) => !p.isArchived)
      .filter((p) => mode === 'all' || p.paymentMethod === mode)
      .filter((p) => !q
        || (p.distributor?.name || p.payeeName || '').toLowerCase().includes(q)
        || (p.referenceNumber || p.upiRefNumber || p.transactionId || '').toLowerCase().includes(q));
  }, [payments, search, mode]);

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Payments</h2>
        <Link to="/ledger" className="btn btn-primary"><Wallet size={16} /> Record via Distributor Payments</Link>
      </div>

      {stats && (
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-card-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}><IndianRupee size={20} /></div>
            <div><div className="stat-card-label">Total Paid</div><div className="stat-card-value">{formatINRShort(stats.totalPaid)}</div></div>
          </div>
          <div className="stat-card">
            <div className="stat-card-icon" style={{ background: '#eef2ff', color: '#4f46e5' }}><Hash size={20} /></div>
            <div><div className="stat-card-label">Payments</div><div className="stat-card-value">{stats.totalPayments}</div></div>
          </div>
          {stats.topDistributors?.[0] && (
            <div className="stat-card">
              <div>
                <div className="stat-card-label">Paid Most To</div>
                <div className="stat-card-value" style={{ fontSize: 16 }}>{stats.topDistributors[0].distributorName}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{formatINR(stats.topDistributors[0].totalPaid)} · {stats.topDistributors[0].paymentCount} payments</div>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ maxWidth: 360, flex: 1 }}>
          <Search size={16} />
          <input className="form-input" placeholder="Search distributor or reference..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="form-input" style={{ width: 160 }} value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="all">All modes</option>
          {PAYMENT_MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="empty-state"><Wallet size={48} />
          <h3>{search || mode !== 'all' ? 'No matching payments' : 'No payments recorded yet'}</h3>
          <p>Payments are recorded from a distributor's page under Distributor Payments.</p></div></div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Date</th><th>Distributor</th><th>Mode</th><th>Reference</th><th style={{ textAlign: 'right' }}>Amount</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDDMMYYYYOr(p.paymentDate, '—')}</td>
                    <td>
                      {p.distributorId
                        ? <Link to={`/ledger/${p.distributorId}`} style={{ fontWeight: 500 }}>{p.distributor?.name || 'Distributor'}</Link>
                        : <span style={{ color: '#6b7280' }}>{p.payeeName || 'Unmatched'}</span>}
                    </td>
                    <td><span className="badge badge-primary">{PAYMENT_MODE_LABEL[p.paymentMethod] || p.paymentMethod || '—'}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{p.referenceNumber || p.upiRefNumber || p.transactionId || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatINR(p.amount)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {p.distributorId && (
                        <Link to={`/ledger/${p.distributorId}/payments/${p.id}`} className="btn btn-ghost btn-sm"><Pencil size={14} /> Edit</Link>
                      )}
                      <button className="btn btn-ghost btn-icon btn-sm" title="Archive payment" aria-label="Archive payment" onClick={() => archive(p)}>
                        <Archive size={14} style={{ color: '#b91c1c' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {page < totalPages && (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <button className="btn btn-secondary" onClick={() => load(page + 1)} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
