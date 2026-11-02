import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { billApi, productApi, invoiceApi, distributorApi, ledgerApi, expiryApi } from '../services/api';
import { formatDDMMYYYYOr } from '../utils/dateFormat';
import { formatINR } from '../utils/money';
import {
  FileText, Package, Truck, Receipt, ScanLine,
  Plus, AlertTriangle, Clock, ShoppingCart, AlertCircle, ChevronRight, CalendarClock,
  ClipboardList, Download, Wallet, IndianRupee, HeartPulse,
} from 'lucide-react';

/** Same grouping as the mobile home screen's Quick Actions. */
const QUICK_ACTIONS = [
  { label: 'Sales', items: [
    { to: '/sales', Icon: ClipboardList, title: 'Daily Sales', sub: 'Sale register', color: '#059669', bg: '#ecfdf5' },
    { to: '/sales/new', Icon: ShoppingCart, title: 'Quick Sell', sub: 'Record a sale', color: '#4f46e5', bg: '#eef2ff' },
  ] },
  { label: 'Inventory', items: [
    { to: '/products', Icon: Package, title: 'Products', sub: 'Manage catalog', color: '#4f46e5', bg: '#eef2ff' },
    { to: '/distributors', Icon: Truck, title: 'Distributors', sub: 'Manage suppliers', color: '#d97706', bg: '#fef3c7' },
    { to: '/exports', Icon: Download, title: 'Export Data', sub: 'Excel & CSV', color: '#0d9488', bg: '#f0fdfa' },
  ] },
  { label: 'Payments & Care', items: [
    { to: '/ledger', Icon: Wallet, title: 'Distributor Dues', sub: 'Khata & payments', color: '#dc2626', bg: '#fef2f2' },
    { to: '/payments', Icon: IndianRupee, title: 'UPI Payments', sub: 'Payment history', color: '#059669', bg: '#f0fdf4' },
    { to: '/patients', Icon: HeartPulse, title: 'Refill Reminders', sub: 'Medication sync', color: '#dc2626', bg: '#fef2f2' },
  ] },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ bills: 0, products: 0, distributors: 0, invoices: 0 });
  const [recentBills, setRecentBills] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [overdue, setOverdue] = useState({ totalOverdue: 0, distributorsWithOverdue: 0 });
  const [expiry, setExpiry] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    try {
      const [billsRes, productsRes, distributorsRes, invoiceStats, overdueRes, windowRes] = await Promise.all([
        billApi.getUserBills(user.id).catch(() => ({ bills: [] })),
        productApi.getAllProducts(user.id).catch(() => ({ products: [], total: 0 })),
        distributorApi.getDistributors(user.id).catch(() => ({ distributors: [] })),
        invoiceApi.getInvoices(user.id, { page: 1, limit: 1 }).catch(() => null),
        ledgerApi.getOverdueAlert(user.id).catch(() => null),
        expiryApi.getWindow(user.id).catch(() => null),
      ]);
      if (overdueRes) setOverdue(overdueRes);
      if (windowRes) setExpiry({ count: windowRes.items?.length || 0, summary: windowRes.summary });

      const bills = billsRes.bills || [];
      const products = productsRes.products || [];
      const distributors = distributorsRes.distributors || [];

      setStats({
        bills: bills.length,
        products: productsRes.total || products.length,
        distributors: distributors.length,
        invoices: invoiceStats?.pagination?.total || 0,
      });

      setRecentBills(bills.slice(0, 5));
      setLowStock(products.filter(p => p.stock !== null && p.minStock !== null && p.stock <= p.minStock).slice(0, 5));
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    loadDashboard();
  }, [loadDashboard, user?.id]);

  if (loading) {
    return <div className="loading-spinner"><div className="spinner" /></div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Welcome, {user?.name || 'User'}!</h2>
        <p style={{ color: '#6b7280', fontSize: 14 }}>{user?.shopName || 'Pharmacy Dashboard'}</p>
      </div>

      {/* The counter path and the scan path are never more than a click away */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Link to="/sales/new" className="btn btn-primary"><ShoppingCart size={16} /> Sell</Link>
        <Link to="/scan" className="btn btn-secondary"><ScanLine size={16} /> Scan For Expiry</Link>
      </div>

      {overdue.totalOverdue > 0 && (
        <Link to="/ledger" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 12, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', textDecoration: 'none', fontWeight: 600 }}>
          <AlertCircle size={20} />
          <span style={{ flex: 1 }}>{formatINR(overdue.totalOverdue)} overdue across {overdue.distributorsWithOverdue} distributor{overdue.distributorsWithOverdue !== 1 ? 's' : ''}</span>
          <ChevronRight size={18} />
        </Link>
      )}

      {expiry && (
        <Link to="/expiry" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 20, borderRadius: 10, textDecoration: 'none', fontWeight: 600,
          background: expiry.count ? '#fff7ed' : '#f0fdf4', border: `1px solid ${expiry.count ? '#fed7aa' : '#bbf7d0'}`, color: expiry.count ? '#9a3412' : '#166534' }}>
          <CalendarClock size={20} />
          <span style={{ flex: 1 }}>
            {expiry.count
              ? `${expiry.count} batch${expiry.count === 1 ? '' : 'es'} expiring within ${expiry.summary?.windowDays || 90} days${expiry.summary?.totalValueAtRisk ? ` — ${formatINR(expiry.summary.totalValueAtRisk)} at risk` : ' — enter what is left to see the value at risk'}`
              : 'All clear — nothing needs action in the expiry window'}
          </span>
          <ChevronRight size={18} />
        </Link>
      )}

      {/* Stats Grid */}
      <div className="stats-grid">
        <Link to="/bills" style={{ textDecoration: 'none' }}>
          <div className="stat-card">
            <div className="stat-card-icon" style={{ background: '#dbeafe', color: '#2563eb' }}>
              <FileText size={20} />
            </div>
            <div className="stat-card-value">{stats.bills}</div>
            <div className="stat-card-label">Purchase Bills</div>
          </div>
        </Link>
        <Link to="/products" style={{ textDecoration: 'none' }}>
          <div className="stat-card">
            <div className="stat-card-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
              <Package size={20} />
            </div>
            <div className="stat-card-value">{stats.products}</div>
            <div className="stat-card-label">Products</div>
          </div>
        </Link>
        <Link to="/distributors" style={{ textDecoration: 'none' }}>
          <div className="stat-card">
            <div className="stat-card-icon" style={{ background: '#fef3c7', color: '#f59e0b' }}>
              <Truck size={20} />
            </div>
            <div className="stat-card-value">{stats.distributors}</div>
            <div className="stat-card-label">Distributors</div>
          </div>
        </Link>
        <Link to="/invoices" style={{ textDecoration: 'none' }}>
          <div className="stat-card">
            <div className="stat-card-icon" style={{ background: '#f3e8ff', color: '#7c3aed' }}>
              <Receipt size={20} />
            </div>
            <div className="stat-card-value">{stats.invoices}</div>
            <div className="stat-card-label">Sales Invoices</div>
          </div>
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3>Quick Actions</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link to="/products/new" className="btn btn-ghost btn-sm"><Plus size={14} /> Product</Link>
            <Link to="/distributors/new" className="btn btn-ghost btn-sm"><Plus size={14} /> Distributor</Link>
            <Link to="/invoices/create" className="btn btn-ghost btn-sm"><Plus size={14} /> Invoice</Link>
          </div>
        </div>
        <div className="card-body">
          {QUICK_ACTIONS.map((group) => (
            <div key={group.label} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>{group.label}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
                {group.items.map(({ to, Icon, title, sub, color, bg }) => (
                  <Link key={to} to={to} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: '1px solid #e5e7eb', borderRadius: 10, textDecoration: 'none', color: 'inherit' }}>
                    <span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: bg, color, flexShrink: 0 }}><Icon size={18} /></span>
                    <span>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{sub}</div>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Recent Bills */}
        <div className="card">
          <div className="card-header">
            <h3><Clock size={16} style={{ marginRight: 8 }} /> Recent Bills</h3>
            <Link to="/bills" className="btn btn-ghost btn-sm">View All</Link>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {recentBills.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>
                <p>No bills yet. Scan your first bill!</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Distributor</th>
                    <th>Amount</th>
                    <th>Invoice Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentBills.map(bill => (
                    <tr key={bill.id}>
                      <td>
                        <Link to={`/bills/${bill.id}`}>{bill.invoiceNumber || 'N/A'}</Link>
                      </td>
                      <td>{bill.distributor?.name || bill.pharmacyName || '-'}</td>
                      <td>₹{(bill.grandTotal || 0).toFixed(2)}</td>
                      <td>{formatDDMMYYYYOr(bill.invoiceDate, '-')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="card">
          <div className="card-header">
            <h3><AlertTriangle size={16} style={{ marginRight: 8 }} /> Low Stock Alerts</h3>
            <Link to="/inventory" className="btn btn-ghost btn-sm">View All</Link>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {lowStock.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>
                <p>No low stock items</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Stock</th>
                    <th>Min Stock</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.map(p => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{p.stock}</td>
                      <td>{p.minStock}</td>
                      <td>
                        <span className={`badge ${p.stock === 0 ? 'badge-danger' : 'badge-warning'}`}>
                          {p.stock === 0 ? 'Out of Stock' : 'Low Stock'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
