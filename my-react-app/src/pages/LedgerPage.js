import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ledgerApi } from '../services/api';
import { Wallet, AlertTriangle, Truck, Search, IndianRupee, ScanLine } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDDMMYYYYOr } from '../utils/dateFormat';
import { formatINR, formatINRShort } from '../utils/money';

/**
 * Distributor Payments — what you owe each distributor.
 *
 * Web counterpart of the mobile ledger list (app/ledger.js → DistributorLedgerListScreen).
 * Same endpoint (GET /ledger/user/:id/summary), so both clients show identical figures.
 */
export default function LedgerPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState({ distributors: [], totalOutstanding: 0, totalOverdue: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyDue, setOnlyDue] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await ledgerApi.getSummary(user.id);
      setSummary({
        distributors: res.distributors || [],
        totalOutstanding: res.totalOutstanding || 0,
        totalOverdue: res.totalOverdue || 0,
      });
    } catch (err) {
      toast.error(err.message || 'Failed to load distributor payments');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return summary.distributors
      .filter((d) => !onlyDue || (d.outstanding || 0) > 0.005)
      .filter((d) => !q || (d.name || '').toLowerCase().includes(q))
      // Most money owed first — the ones that need attention lead.
      .sort((a, b) => (b.overdue || 0) - (a.overdue || 0) || (b.outstanding || 0) - (a.outstanding || 0));
  }, [summary.distributors, search, onlyDue]);

  const withDues = summary.distributors.filter((d) => (d.outstanding || 0) > 0.005).length;
  const withOverdue = summary.distributors.filter((d) => (d.overdue || 0) > 0.005).length;

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Distributor Payments</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/payments" className="btn btn-secondary"><Wallet size={16} /> All Payments</Link>
          <Link to="/ledger/scan" className="btn btn-primary"><ScanLine size={16} /> Scan UPI Screenshot</Link>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: '#eef2ff', color: '#4f46e5' }}><IndianRupee size={20} /></div>
          <div>
            <div className="stat-card-label">Total Outstanding</div>
            <div className="stat-card-value">{formatINRShort(summary.totalOutstanding)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: '#fef2f2', color: '#dc2626' }}><AlertTriangle size={20} /></div>
          <div>
            <div className="stat-card-label">Overdue</div>
            <div className="stat-card-value" style={{ color: summary.totalOverdue > 0 ? '#dc2626' : undefined }}>
              {formatINRShort(summary.totalOverdue)}
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}><Truck size={20} /></div>
          <div>
            <div className="stat-card-label">Distributors with Dues</div>
            <div className="stat-card-value">
              {withDues}
              {withOverdue > 0 && <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}> · {withOverdue} overdue</span>}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ maxWidth: 360, flex: 1 }}>
          <Search size={16} />
          <input className="form-input" placeholder="Search distributors..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} />
          Only with dues
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Wallet size={48} />
            <h3>{search || onlyDue ? 'No matching distributors' : 'No distributors yet'}</h3>
            <p>{search || onlyDue ? 'Try clearing the filters' : 'Distributors appear here once you save their bills'}</p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Distributor</th>
                  <th style={{ textAlign: 'right' }}>Outstanding</th>
                  <th style={{ textAlign: 'right' }}>Overdue</th>
                  <th>Last Payment</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link to={`/ledger/${d.id}`} style={{ fontWeight: 600 }}>{d.name}</Link>
                      {d.phone && <div style={{ fontSize: 12, color: '#6b7280' }}>{d.phone}</div>}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatINR(d.outstanding)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {(d.overdue || 0) > 0.005
                        ? <span className="badge badge-danger">{formatINR(d.overdue)}</span>
                        : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                    <td>{formatDDMMYYYYOr(d.lastPaymentDate, 'No payments yet')}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Link to={`/ledger/${d.id}`} className="btn btn-ghost btn-sm">View</Link>
                      {(d.outstanding || 0) > 0.005 && (
                        <Link to={`/ledger/${d.id}/pay`} className="btn btn-primary btn-sm" style={{ marginLeft: 6 }}>Record Payment</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
