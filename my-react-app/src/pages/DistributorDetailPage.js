import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { distributorApi, billApi, paymentApi } from '../services/api';
import { ArrowLeft, Edit, FileText, Phone, MapPin, Trash2, Loader2, CreditCard, Wallet, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDDMMYYYYOr } from '../utils/dateFormat';
import { formatINR } from '../utils/money';

export default function DistributorDetailPage() {
  const { distributorId } = useParams();
  const navigate = useNavigate();
  const [distributor, setDistributor] = useState(null);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingBillId, setDeletingBillId] = useState(null);
  const [payments, setPayments] = useState({ payments: [], stats: null });
  // Bills are paged; the invoice-number search runs on the server, so it also finds
  // bills that "Load more" has not brought in yet. Same matching as mobile.
  const [billSearch, setBillSearch] = useState('');
  const [billPage, setBillPage] = useState(1);
  const [billTotal, setBillTotal] = useState(0);
  const [billsLoading, setBillsLoading] = useState(false);
  const loadedSearch = useRef('');
  const billSeq = useRef(0);
  const BILLS_PAGE = 20;

  const loadBills = useCallback(async (page, search) => {
    const seq = ++billSeq.current;
    setBillsLoading(true);
    try {
      const res = await distributorApi.getDistributorBills(distributorId, { page, limit: BILLS_PAGE, search: search || undefined });
      if (seq !== billSeq.current) return; // a newer request is in flight
      loadedSearch.current = search;
      setBills((prev) => (page === 1 ? res.bills || [] : [...prev, ...(res.bills || [])]));
      setBillPage(page);
      setBillTotal(res.total || 0);
    } catch (err) {
      if (seq === billSeq.current) toast.error(err.message || 'Failed to load bills');
    } finally {
      if (seq === billSeq.current) setBillsLoading(false);
    }
  }, [distributorId]);

  useEffect(() => {
    if (loading) return undefined;
    const query = billSearch.trim();
    if (query === loadedSearch.current) return undefined;
    const t = setTimeout(() => loadBills(1, query), 300);
    return () => clearTimeout(t);
  }, [billSearch, loading, loadBills]);

  const handleDeleteDistributor = async () => {
    if (!window.confirm(`Delete “${distributor.name}”? This cannot be undone.`)) return;
    try {
      await distributorApi.deleteDistributor(distributorId);
      toast.success('Distributor deleted');
      navigate('/distributors');
    } catch (err) {
      toast.error(err.message || 'Failed to delete distributor');
    }
  };

  /**
   * Delete an uploaded bill. This is destructive and it moves stock, so the confirm
   * spells out exactly what goes: the backend reverses the batch quantities this bill
   * put on the shelf, which is why we fetch the impact first rather than guessing.
   */
  const handleDeleteBill = async (bill) => {
    let impact = null;
    try {
      impact = await billApi.getBillDeleteImpact(bill.id);
    } catch {
      // Non-fatal — fall back to a generic warning rather than blocking the delete.
    }

    const lines = [
      `Delete invoice ${bill.invoiceNumber || '(no number)'}?`,
      '',
      impact
        ? `${impact.itemCount} line item${impact.itemCount === 1 ? '' : 's'} will be removed.`
        : 'Its line items will be removed.',
    ];
    if (impact?.stockAffectedCount > 0) {
      lines.push(
        `${impact.stockAffectedCount} of them added stock, which will be taken back off the shelf:`,
        ...impact.stockLines.slice(0, 6).map(l => `  • ${l.name} — ${l.totalUnits} (batch ${l.batchNumber})`),
      );
      if (impact.stockLines.length > 6) lines.push(`  …and ${impact.stockLines.length - 6} more`);
    }
    lines.push('', 'This cannot be undone.');

    if (!window.confirm(lines.join(String.fromCharCode(10)))) return;

    setDeletingBillId(bill.id);
    try {
      const res = await billApi.deleteBill(bill.id);
      setBills(prev => prev.filter(b => b.id !== bill.id));
      setBillTotal(t => Math.max(0, t - 1));
      const warnings = res?.stock?.warnings || [];
      if (warnings.length > 0) {
        // Stock went negative — the pharmacist had already sold beyond this bill.
        toast(warnings[0], { icon: '⚠️', duration: 9000, style: { maxWidth: 520 } });
      } else {
        toast.success(`Invoice ${bill.invoiceNumber || ''} deleted`.trim());
      }
    } catch (err) {
      toast.error(err.message || 'Failed to delete bill');
    } finally {
      setDeletingBillId(null);
    }
  };

  const loadDistributor = useCallback(async () => {
    try {
      const [distRes, billsRes, payRes] = await Promise.all([
        distributorApi.getDistributorById(distributorId),
        distributorApi.getDistributorBills(distributorId, { page: 1, limit: BILLS_PAGE }).catch(() => ({ bills: [], total: 0 })),
        paymentApi.getDistributorPayments(distributorId, { limit: 3 }).catch(() => null),
      ]);
      setDistributor(distRes.distributor || distRes);
      setBills(billsRes.bills || []);
      setBillTotal(billsRes.total || 0);
      setBillPage(1);
      loadedSearch.current = '';
      if (payRes) setPayments({ payments: payRes.payments || [], stats: payRes.stats || null });
    } catch (err) {
      toast.error('Distributor not found');
      navigate('/distributors');
    } finally {
      setLoading(false);
    }
  }, [distributorId, navigate]);

  useEffect(() => {
    loadDistributor();
  }, [loadDistributor]);

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;
  if (!distributor) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-icon" onClick={() => navigate('/distributors')}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700 }}>{distributor.name}</h2>
            <p style={{ color: '#6b7280', fontSize: 14 }}>
              <span className={`badge ${distributor.isActive ? 'badge-success' : 'badge-danger'}`}>
                {distributor.isActive ? 'Active' : 'Inactive'}
              </span>
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to={`/ledger/${distributorId}`} className="btn btn-secondary"><Wallet size={14} /> Ledger</Link>
          <Link to={`/distributors/${distributorId}/edit`} className="btn btn-secondary"><Edit size={14} /> Edit</Link>
          <button className="btn btn-ghost" style={{ color: '#dc2626' }} onClick={handleDeleteDistributor}><Trash2 size={14} /> Delete</button>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card"><div><div className="stat-card-label">Total Bills</div><div className="stat-card-value">{distributor.totalBills ?? billTotal}</div></div></div>
        <div className="stat-card"><div><div className="stat-card-label">Products</div><div className="stat-card-value">{distributor.totalProducts || 0}</div></div></div>
        <div className="stat-card"><div><div className="stat-card-label">Total Purchase</div><div className="stat-card-value" style={{ color: '#059669' }}>{formatINR(distributor.totalAmount || 0)}</div></div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        <div className="card">
          <div className="card-header"><h3>Contact Information</h3></div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {distributor.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Phone size={16} style={{ color: '#6b7280' }} />
                  <span>{distributor.phone}</span>
                </div>
              )}
              {distributor.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: '#6b7280', fontSize: 16 }}>@</span>
                  <span>{distributor.email}</span>
                </div>
              )}
              {distributor.address && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <MapPin size={16} style={{ color: '#6b7280', marginTop: 2 }} />
                  <span>{distributor.address}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Business Details</h3></div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <p style={{ fontSize: 12, color: '#6b7280' }}>GSTIN</p>
                <p style={{ fontWeight: 500, fontFamily: 'monospace' }}>{distributor.gstin || 'Not provided'}</p>
              </div>
              <div>
                <p style={{ fontSize: 12, color: '#6b7280' }}>DL Number</p>
                <p style={{ fontWeight: 500 }}>{distributor.dlNumber || 'Not provided'}</p>
              </div>
              <div>
                <p style={{ fontSize: 12, color: '#6b7280' }}>Last Transaction</p>
                <p style={{ fontWeight: 500 }}>{formatDDMMYYYYOr(distributor.lastTransaction, '-')}</p>
              </div>
              {distributor.notes && (
                <div>
                  <p style={{ fontSize: 12, color: '#6b7280' }}>Notes</p>
                  <p>{distributor.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CreditCard size={16} /> Payment History</h3>
          <Link to={`/ledger/${distributorId}`} className="btn btn-ghost btn-sm">View All</Link>
        </div>
        <div className="card-body">
          {payments.stats?.totalPayments ? (
            <>
              <div style={{ display: 'flex', gap: 32, marginBottom: 12 }}>
                <div><div style={{ fontSize: 18, fontWeight: 700 }}>{formatINR(payments.stats.totalPaid)}</div><div style={{ fontSize: 12, color: '#6b7280' }}>Total Paid</div></div>
                <div><div style={{ fontSize: 18, fontWeight: 700, color: '#4f46e5' }}>{payments.stats.totalPayments}</div><div style={{ fontSize: 12, color: '#6b7280' }}>Payments</div></div>
              </div>
              {payments.payments.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: '1px solid #f1f5f9', fontSize: 14 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.paymentStatus === 'success' ? '#059669' : '#d97706' }} />
                  <strong>{formatINR(p.amount)}</strong>
                  <span style={{ color: '#6b7280' }}>{formatDDMMYYYYOr(p.paymentDate, '-')}</span>
                  {p.paymentApp && <span style={{ marginLeft: 'auto', color: '#6b7280', textTransform: 'capitalize' }}>{p.paymentApp.replace('_', ' ')}</span>}
                </div>
              ))}
            </>
          ) : (
            <p style={{ color: '#6b7280' }}>No payments recorded yet.</p>
          )}
        </div>
      </div>

      {/* Bills from this distributor */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3>
            Purchase Bills ({billTotal})
            {loadedSearch.current && <span style={{ fontWeight: 400, fontSize: 13, color: '#6b7280' }}> — {billTotal} match{billTotal === 1 ? '' : 'es'}</span>}
          </h3>
          <div className="search-bar" style={{ width: 280 }}>
            <Search size={16} />
            <input className="form-input" placeholder="Search by invoice number" value={billSearch} onChange={(e) => setBillSearch(e.target.value)} aria-label="Search invoices by number" />
            {billsLoading ? <Loader2 size={15} style={{ color: '#6b7280', animation: 'spin 1s linear infinite' }} />
              : billSearch && <button className="btn btn-ghost btn-icon btn-sm" aria-label="Clear invoice search" onClick={() => setBillSearch('')}><X size={14} /></button>}
          </div>
        </div>
        <div className="table-container">
          {bills.length === 0 ? (
            <div className="empty-state" style={{ padding: 32 }}>
              {billSearch.trim() ? <Search size={32} /> : <FileText size={32} />}
              <p>{billSearch.trim()
                ? (billsLoading ? 'Searching…' : `No invoice matching “${billSearch.trim()}”`)
                : 'No bills from this distributor yet'}</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Invoice Date</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bills.map(bill => (
                  <tr key={bill.id}>
                    <td><Link to={`/bills/${bill.id}`} style={{ fontWeight: 500 }}>{bill.invoiceNumber || 'N/A'}</Link></td>
                    <td>{formatDDMMYYYYOr(bill.invoiceDate, '-')}</td>
                    <td>{bill._count?.items || 0}</td>
                    <td style={{ fontWeight: 600 }}>₹{(bill.grandTotal || 0).toFixed(2)}</td>
                    <td><span className="badge badge-primary">{bill.paymentType || 'credit'}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-ghost btn-icon"
                        title={`Delete invoice ${bill.invoiceNumber || ''}`}
                        aria-label={`Delete invoice ${bill.invoiceNumber || ''}`}
                        disabled={deletingBillId === bill.id}
                        onClick={() => handleDeleteBill(bill)}
                      >
                        {deletingBillId === bill.id
                          ? <Loader2 size={15} style={{ color: '#6b7280', animation: 'spin 1s linear infinite' }} />
                          : <Trash2 size={15} style={{ color: '#dc2626' }} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {bills.length < billTotal && (
          <div style={{ padding: 16, textAlign: 'center' }}>
            <button className="btn btn-secondary" disabled={billsLoading} onClick={() => loadBills(billPage + 1, loadedSearch.current)}>
              {billsLoading ? 'Loading…' : `Load more (${billTotal - bills.length} remaining)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
