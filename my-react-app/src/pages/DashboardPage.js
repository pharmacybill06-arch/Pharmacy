import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { billApi, productApi, invoiceApi, distributorApi } from '../services/api';
import {
  FileText, Package, Truck, Receipt, ScanLine,
  Plus, AlertTriangle, Clock
} from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ bills: 0, products: 0, distributors: 0, invoices: 0 });
  const [recentBills, setRecentBills] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    try {
      const [billsRes, productsRes, distributorsRes, invoiceStats] = await Promise.all([
        billApi.getUserBills(user.id).catch(() => ({ bills: [] })),
        productApi.getProducts(user.id, { limit: 100 }).catch(() => ({ products: [], total: 0 })),
        distributorApi.getDistributors(user.id).catch(() => ({ distributors: [] })),
        invoiceApi.getStats(user.id).catch(() => ({ totalInvoices: 0 })),
      ]);

      const bills = billsRes.bills || [];
      const products = productsRes.products || [];
      const distributors = distributorsRes.distributors || [];

      setStats({
        bills: bills.length,
        products: productsRes.total || products.length,
        distributors: distributors.length,
        invoices: invoiceStats.totalInvoices || 0,
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
        </div>
        <div className="card-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link to="/scan" className="btn btn-primary"><ScanLine size={16} /> Scan Bill</Link>
          <Link to="/products/new" className="btn btn-secondary"><Plus size={16} /> Add Product</Link>
          <Link to="/distributors/new" className="btn btn-secondary"><Plus size={16} /> Add Distributor</Link>
          <Link to="/invoices/create" className="btn btn-secondary"><Plus size={16} /> Create Invoice</Link>
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
                    <th>Date</th>
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
                      <td>{bill.invoiceDate ? new Date(bill.invoiceDate).toLocaleDateString() : '-'}</td>
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
