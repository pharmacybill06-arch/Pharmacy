import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { invoiceApi } from '../services/api';
import { Receipt, Search, Plus, Trash2, TrendingUp, Eye, Printer, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { billDisplayDateShort, formatDDMMYYYYOr } from '../utils/dateFormat';
import { formatINR } from '../utils/money';

/** Full invoice with its lines, printable. */
function InvoiceView({ invoice, onClose }) {
  const rows = [
    ['Subtotal', invoice.subtotal],
    ['CGST', invoice.cgst],
    ['SGST', invoice.sgst],
    ['Discount', invoice.discountAmount ? -invoice.discountAmount : 0],
    ['Round off', invoice.roundOff],
  ].filter(([, v]) => v);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Invoice {invoice.invoiceNumber || ''}</h3>
          <button className="btn btn-ghost btn-icon no-print" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <strong>{invoice.customerName || 'Walk-in customer'}</strong>
              {invoice.customerPhone && <div style={{ fontSize: 13, color: '#6b7280' }}>{invoice.customerPhone}</div>}
              {invoice.customerAddress && <div style={{ fontSize: 13, color: '#6b7280' }}>{invoice.customerAddress}</div>}
            </div>
            <div style={{ textAlign: 'right', fontSize: 13 }}>
              <div>{formatDDMMYYYYOr(invoice.invoiceDate, '-')}</div>
              <span className={`badge ${(invoice.paymentType || 'cash') === 'cash' ? 'badge-success' : 'badge-primary'}`}>{(invoice.paymentType || 'cash') === 'cash' ? 'Cash' : 'Credit'}</span>
            </div>
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Rate</th><th style={{ textAlign: 'right' }}>GST</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
              <tbody>
                {(invoice.items || []).map((i) => (
                  <tr key={i.id}>
                    <td>{i.name}{i.batchNumber && <div style={{ fontSize: 12, color: '#6b7280' }}>Batch {i.batchNumber}</div>}</td>
                    <td style={{ textAlign: 'right' }}>{i.quantity}</td>
                    <td style={{ textAlign: 'right' }}>{formatINR(i.rate || 0)}</td>
                    <td style={{ textAlign: 'right' }}>{i.gstPercent || 0}%</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatINR(i.itemTotal || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12, marginLeft: 'auto', maxWidth: 280 }}>
            {rows.map(([label, v]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '2px 0' }}><span>{label}</span><span>{formatINR(v)}</span></div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16, borderTop: '1px solid #e5e7eb', marginTop: 4, paddingTop: 4 }}>
              <span>Grand Total</span><span>{formatINR(invoice.grandTotal || 0)}</span>
            </div>
            {invoice.balanceAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b45309', fontSize: 14 }}><span>Balance</span><span>{formatINR(invoice.balanceAmount)}</span></div>
            )}
          </div>
        </div>
        <div className="modal-footer no-print">
          <button className="btn btn-secondary" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function InvoicesPage() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const limit = 100;

  const openInvoice = async (id) => {
    try {
      const res = await invoiceApi.getInvoiceById(user.id, id);
      setViewing(res.invoice);
    } catch (err) {
      toast.error(err.message || 'Failed to load invoice');
    }
  };

  const loadInvoices = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [invoicesRes, statsRes] = await Promise.all([
        invoiceApi.getInvoices(user.id, { page: 1, limit }),
        invoiceApi.getStats(user.id).catch(() => null),
      ]);
      setInvoices(invoicesRes.invoices || invoicesRes.bills || []);
      setTotalCount(invoicesRes.pagination?.total ?? (invoicesRes.invoices || []).length);
      setStats(statsRes?.stats || null);
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
      (inv.customerName || '').toLowerCase().includes(q) ||
      (inv.customerPhone || '').includes(q);
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
            <div className="stat-card-value">{totalCount}</div>
            <div className="stat-card-label">Total Invoices</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-icon" style={{ background: '#dcfce7', color: '#16a34a' }}><TrendingUp size={20} /></div>
            <div className="stat-card-value">₹{((stats.totalRevenue || 0) / 1000).toFixed(1)}K</div>
            <div className="stat-card-label">Revenue ({stats.period || 'Last 30 days'})</div>
          </div>
        </div>
      )}

      <div className="search-bar" style={{ marginBottom: 20, maxWidth: 400 }}>
        <Search size={16} />
        <input className="form-input" placeholder="Search invoice #, name or phone..." value={search} onChange={e => setSearch(e.target.value)} />
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
                  <th>Invoice Date</th>
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
                    <td>
                      {inv.customerName || '-'}
                      {inv.customerPhone && <div style={{ fontSize: 12, color: '#6b7280' }}>{inv.customerPhone}</div>}
                    </td>
                    <td>{billDisplayDateShort(inv)}</td>
                    <td>{inv._count?.items || inv.items?.length || 0}</td>
                    <td style={{ fontWeight: 600 }}>
                      ₹{(inv.grandTotal || 0).toFixed(2)}
                      {inv.balanceAmount > 0 && <div style={{ fontSize: 12, fontWeight: 400, color: '#b45309' }}>Balance ₹{inv.balanceAmount.toFixed(2)}</div>}
                    </td>
                    <td><span className={`badge ${inv.paymentType === 'cash' ? 'badge-success' : 'badge-primary'}`}>{inv.paymentType || 'cash'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-icon" title="View" aria-label="View invoice" onClick={() => openInvoice(inv.id)}><Eye size={14} /></button>
                        <button className="btn btn-ghost btn-icon" title="Delete" aria-label="Delete invoice" onClick={() => handleDelete(inv.id)}>
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
      {viewing && <InvoiceView invoice={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
