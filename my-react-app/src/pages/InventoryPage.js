import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { productApi } from '../services/api';
import { Warehouse, Search, AlertTriangle, Package, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function InventoryPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | low | out | expiring

  useEffect(() => {
    loadInventory();
  }, [user?.id]);

  const loadInventory = async () => {
    if (!user?.id) return;
    try {
      const [productsRes, statsRes] = await Promise.all([
        productApi.getProducts(user.id, { limit: 500 }),
        productApi.getProductStats(user.id).catch(() => null),
      ]);
      setProducts(productsRes.products || []);
      setStats(statsRes);
    } catch (err) {
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const now = new Date();
  const threeMonths = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const filtered = products.filter(p => {
    const q = search.toLowerCase();
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || (p.manufacturer || '').toLowerCase().includes(q);
    if (!matchesSearch) return false;

    switch (filter) {
      case 'low':
        return p.stock !== null && p.minStock !== null && p.stock <= p.minStock && p.stock > 0;
      case 'out':
        return p.stock !== null && p.stock === 0;
      case 'expiring':
        return p.expiryDate && new Date(p.expiryDate) <= threeMonths;
      default:
        return true;
    }
  });

  const totalStock = products.reduce((sum, p) => sum + (p.stock || 0), 0);
  const lowStockCount = products.filter(p => p.stock !== null && p.minStock !== null && p.stock <= p.minStock && p.stock > 0).length;
  const outOfStockCount = products.filter(p => p.stock !== null && p.stock === 0).length;
  const expiringCount = products.filter(p => p.expiryDate && new Date(p.expiryDate) <= threeMonths).length;

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Inventory</h2>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card" onClick={() => setFilter('all')} style={{ cursor: 'pointer', border: filter === 'all' ? '2px solid #2563eb' : undefined }}>
          <div className="stat-card-icon" style={{ background: '#dbeafe', color: '#2563eb' }}><Package size={20} /></div>
          <div className="stat-card-value">{products.length}</div>
          <div className="stat-card-label">Total Products</div>
        </div>
        <div className="stat-card" onClick={() => setFilter('all')} style={{ cursor: 'pointer' }}>
          <div className="stat-card-icon" style={{ background: '#dcfce7', color: '#16a34a' }}><CheckCircle size={20} /></div>
          <div className="stat-card-value">{totalStock}</div>
          <div className="stat-card-label">Total Stock Units</div>
        </div>
        <div className="stat-card" onClick={() => setFilter('low')} style={{ cursor: 'pointer', border: filter === 'low' ? '2px solid #f59e0b' : undefined }}>
          <div className="stat-card-icon" style={{ background: '#fef3c7', color: '#f59e0b' }}><AlertTriangle size={20} /></div>
          <div className="stat-card-value">{lowStockCount}</div>
          <div className="stat-card-label">Low Stock</div>
        </div>
        <div className="stat-card" onClick={() => setFilter('out')} style={{ cursor: 'pointer', border: filter === 'out' ? '2px solid #dc2626' : undefined }}>
          <div className="stat-card-icon" style={{ background: '#fee2e2', color: '#dc2626' }}><Warehouse size={20} /></div>
          <div className="stat-card-value">{outOfStockCount}</div>
          <div className="stat-card-label">Out of Stock</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="tabs">
        {[
          { key: 'all', label: `All (${products.length})` },
          { key: 'low', label: `Low Stock (${lowStockCount})` },
          { key: 'out', label: `Out of Stock (${outOfStockCount})` },
          { key: 'expiring', label: `Expiring Soon (${expiringCount})` },
        ].map(tab => (
          <button key={tab.key} className={`tab ${filter === tab.key ? 'active' : ''}`} onClick={() => setFilter(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="search-bar" style={{ marginBottom: 20, maxWidth: 400 }}>
        <Search size={16} />
        <input className="form-input" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Manufacturer</th>
                <th>Batch</th>
                <th>Stock</th>
                <th>Min Stock</th>
                <th>MRP</th>
                <th>Expiry</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>No products match the criteria</td></tr>
              ) : filtered.map(p => {
                const isLow = p.stock !== null && p.minStock !== null && p.stock <= p.minStock && p.stock > 0;
                const isOut = p.stock !== null && p.stock === 0;
                const isExpiring = p.expiryDate && new Date(p.expiryDate) <= threeMonths;
                const isExpired = p.expiryDate && new Date(p.expiryDate) < now;

                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>{p.name}</td>
                    <td>{p.manufacturer || '-'}</td>
                    <td>{p.batchNumber || '-'}</td>
                    <td style={{ fontWeight: 600, color: isOut ? '#dc2626' : isLow ? '#f59e0b' : '#16a34a' }}>
                      {p.stock ?? '-'}
                    </td>
                    <td>{p.minStock ?? '-'}</td>
                    <td>₹{(p.defaultMrp || 0).toFixed(2)}</td>
                    <td>
                      {p.expiryDate ? (
                        <span className={`badge ${isExpired ? 'badge-danger' : isExpiring ? 'badge-warning' : 'badge-success'}`}>
                          {new Date(p.expiryDate).toLocaleDateString()}
                        </span>
                      ) : '-'}
                    </td>
                    <td>
                      {isOut ? <span className="badge badge-danger">Out of Stock</span>
                        : isLow ? <span className="badge badge-warning">Low Stock</span>
                        : <span className="badge badge-success">In Stock</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
