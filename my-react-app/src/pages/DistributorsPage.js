import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { distributorApi } from '../services/api';
import { Truck, Search, Plus, Eye, Edit, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DistributorsPage() {
  const { user } = useAuth();
  const [distributors, setDistributors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadDistributors = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await distributorApi.getDistributors(user.id);
      setDistributors(res.distributors || []);
    } catch (err) {
      toast.error('Failed to load distributors');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadDistributors();
  }, [loadDistributors]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this distributor?')) return;
    try {
      await distributorApi.deleteDistributor(id);
      setDistributors(prev => prev.filter(d => d.id !== id));
      toast.success('Distributor deleted');
    } catch (err) {
      toast.error('Failed to delete distributor');
    }
  };

  const filtered = distributors.filter(d => {
    const q = search.toLowerCase();
    return !q ||
      d.name.toLowerCase().includes(q) ||
      (d.phone || '').includes(q) ||
      (d.gstin || '').toLowerCase().includes(q);
  });

  if (loading) {
    return <div className="loading-spinner"><div className="spinner" /></div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Distributors ({distributors.length})</h2>
        <Link to="/distributors/new" className="btn btn-primary"><Plus size={16} /> Add Distributor</Link>
      </div>

      <div className="search-bar" style={{ marginBottom: 20, maxWidth: 400 }}>
        <Search size={16} />
        <input className="form-input" placeholder="Search distributors..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Truck size={48} />
            <h3>No distributors found</h3>
            <p>{search ? 'Try a different search' : 'Add your first distributor'}</p>
            {!search && <Link to="/distributors/new" className="btn btn-primary" style={{ marginTop: 16 }}><Plus size={16} /> Add Distributor</Link>}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>GSTIN</th>
                  <th>DL Number</th>
                  <th>Address</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 500 }}>
                      <Link to={`/distributors/${d.id}`}>{d.name}</Link>
                    </td>
                    <td>{d.phone || '-'}</td>
                    <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{d.gstin || '-'}</td>
                    <td>{d.dlNumber || '-'}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.address || '-'}
                    </td>
                    <td>
                      <span className={`badge ${d.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {d.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Link to={`/distributors/${d.id}`} className="btn btn-ghost btn-icon"><Eye size={14} /></Link>
                        <Link to={`/distributors/${d.id}/edit`} className="btn btn-ghost btn-icon"><Edit size={14} /></Link>
                        <button className="btn btn-ghost btn-icon" onClick={() => handleDelete(d.id)}>
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
