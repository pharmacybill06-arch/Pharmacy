import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { productApi } from '../services/api';
import { Package, Search, Plus, Edit, Trash2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ProductsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => {
    loadProducts();
  }, [user?.id, page, search]);

  const loadProducts = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await productApi.getProducts(user.id, { page, limit, search: search || undefined });
      setProducts(res.products || []);
      setTotal(res.total || 0);
    } catch (err) {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (productId) => {
    if (!window.confirm('Delete this product?')) return;
    try {
      await productApi.deleteProduct(user.id, productId);
      setProducts(prev => prev.filter(p => p.id !== productId));
      toast.success('Product deleted');
    } catch (err) {
      toast.error('Failed to delete product');
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Products ({total})</h2>
        <Link to="/products/new" className="btn btn-primary"><Plus size={16} /> Add Product</Link>
      </div>

      <div className="search-bar" style={{ marginBottom: 20, maxWidth: 400 }}>
        <Search size={16} />
        <input
          className="form-input"
          placeholder="Search products..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : products.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Package size={48} />
            <h3>No products found</h3>
            <p>{search ? 'Try a different search' : 'Add products manually or scan bills to build your catalog'}</p>
            {!search && <Link to="/products/new" className="btn btn-primary" style={{ marginTop: 16 }}><Plus size={16} /> Add Product</Link>}
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Manufacturer</th>
                    <th>Stock</th>
                    <th>MRP</th>
                    <th>Purchase Rate</th>
                    <th>Selling Rate</th>
                    <th>GST %</th>
                    <th>Expiry</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => (
                    <tr key={product.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{product.name}</div>
                        {product.batchNumber && <div style={{ fontSize: 11, color: '#6b7280' }}>Batch: {product.batchNumber}</div>}
                      </td>
                      <td>{product.manufacturer || '-'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {product.stock ?? '-'}
                          {product.stock !== null && product.minStock !== null && product.stock <= product.minStock && (
                            <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
                          )}
                        </div>
                      </td>
                      <td>₹{(product.defaultMrp || 0).toFixed(2)}</td>
                      <td>₹{(product.purchaseRate || 0).toFixed(2)}</td>
                      <td>₹{(product.sellingRate || 0).toFixed(2)}</td>
                      <td>{product.gstPercent || 0}%</td>
                      <td>
                        {product.expiryDate ? (
                          <span className={`badge ${new Date(product.expiryDate) < new Date() ? 'badge-danger' : 'badge-success'}`}>
                            {new Date(product.expiryDate).toLocaleDateString()}
                          </span>
                        ) : '-'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Link to={`/products/${product.id}/edit`} className="btn btn-ghost btn-icon"><Edit size={14} /></Link>
                          <button className="btn btn-ghost btn-icon" onClick={() => handleDelete(product.id)}>
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
              <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
              <span style={{ display: 'flex', alignItems: 'center', fontSize: 14, color: '#6b7280' }}>
                Page {page} of {totalPages}
              </span>
              <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
