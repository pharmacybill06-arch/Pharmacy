import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { distributorApi } from '../services/api';
import { ArrowLeft, Edit, FileText, Phone, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DistributorDetailPage() {
  const { distributorId } = useParams();
  const navigate = useNavigate();
  const [distributor, setDistributor] = useState(null);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadDistributor = useCallback(async () => {
    try {
      const [distRes, billsRes] = await Promise.all([
        distributorApi.getDistributorById(distributorId),
        distributorApi.getDistributorBills(distributorId).catch(() => ({ bills: [] })),
      ]);
      setDistributor(distRes.distributor || distRes);
      setBills(billsRes.bills || []);
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
        <Link to={`/distributors/${distributorId}/edit`} className="btn btn-secondary">
          <Edit size={14} /> Edit
        </Link>
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
                <p style={{ fontSize: 12, color: '#6b7280' }}>Total Bills</p>
                <p style={{ fontWeight: 500 }}>{bills.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bills from this distributor */}
      <div className="card">
        <div className="card-header">
          <h3>Purchase Bills ({bills.length})</h3>
        </div>
        <div className="table-container">
          {bills.length === 0 ? (
            <div className="empty-state" style={{ padding: 32 }}>
              <FileText size={32} />
              <p>No bills from this distributor yet</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {bills.map(bill => (
                  <tr key={bill.id}>
                    <td><Link to={`/bills/${bill.id}`} style={{ fontWeight: 500 }}>{bill.invoiceNumber || 'N/A'}</Link></td>
                    <td>{bill.invoiceDate ? new Date(bill.invoiceDate).toLocaleDateString() : '-'}</td>
                    <td>{bill._count?.items || 0}</td>
                    <td style={{ fontWeight: 600 }}>₹{(bill.grandTotal || 0).toFixed(2)}</td>
                    <td><span className="badge badge-primary">{bill.paymentType || 'credit'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
