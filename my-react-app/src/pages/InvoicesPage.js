import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { invoiceApi } from '../services/api';
import { Receipt, Search, Plus, Trash2, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';

export default function InvoicesPage() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const limit = 20;

  const loadInvoices = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [invoicesRes, statsRes] = await Promise.all([
        invoiceApi.getInvoices(user.id, { page: 1, limit }),
        invoiceApi.getStats(user.id).catch(() => null),
      ]);
      setInvoices(invoicesRes.invoices || invoicesRes.bills || []);
      setStats(statsRes);
    } catch (err) {
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [limit, user?.id]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const handleDelete = async (invoiceId) => {
    if (!window.confirm('Delete this invoice? Stock will be reversed.')) return;
    try {
      await invoiceApi.deleteInvoice(user.id, invoiceId);
      setInvoices(prev => prev.filter(i => i.id !== invoiceId));
      toast.success('Invoice deleted & stock reversed');
    } catch (err) {
      toast.error('Failed to delete invoice');
    }
  };

  const filtered = invoices.filter(inv => {
    const q = search.toLowerCase();
    return !q ||
      (inv.invoiceNumber || '').toLowerCase().includes(q) ||
      (inv.customerName || '').toLowerCase().includes(q);
  });

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Sales Invoices</h2>
        <Link to="/invoices/create" className="btn btn-primary"><Plus size={16} /> Create Invoice</Link>
      </div>

      {/* Stats */}
      {stats && (
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-card-icon" style={{ background: '#dbeafe', color: '#2563eb' }}><Receipt size={20} /></div>
            <div className="stat-card-value">{stats.totalInvoices || 0}</div>
            <div className="stat-card-label">Total Invoices</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-icon" style={{ background: '#dcfce7', color: '#16a34a' }}><TrendingUp size={20} /></div>
            <div className="stat-card-value">₹{((stats.totalRevenue || 0) / 1000).toFixed(1)}K</div>
            <div className="stat-card-label">Total Revenue</div>
          </div>
        </div>
      )}

      <div className="search-bar" style={{ marginBottom: 20, maxWidth: 400 }}>
        <Search size={16} />
        <input className="form-input" placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Receipt size={48} />
            <h3>No invoices found</h3>
            <p>{search ? 'Try a different search' : 'Create your first sales invoice'}</p>
            {!search && <Link to="/invoices/create" className="btn btn-primary" style={{ marginTop: 16 }}><Plus size={16} /> Create Invoice</Link>}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 500 }}>{inv.invoiceNumber || 'N/A'}</td>
                    <td>{inv.customerName || '-'}</td>
                    <td>{inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString() : inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '-'}</td>
                    <td>{inv._count?.items || inv.items?.length || 0}</td>
                    <td style={{ fontWeight: 600 }}>₹{(inv.grandTotal || 0).toFixed(2)}</td>
                    <td><span className={`badge ${inv.paymentType === 'cash' ? 'badge-success' : 'badge-primary'}`}>{inv.paymentType || 'cash'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-icon" onClick={() => handleDelete(inv.id)}>
                          <Trash2 size={14} style={{ color: '#dc2626' }} />
                        </button>
                      </div>
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
