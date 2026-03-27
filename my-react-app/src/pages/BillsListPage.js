import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { billApi } from '../services/api';
import { FileText, Search, Trash2, Eye, ScanLine, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';

// Helper: compute GST display info for a bill
function getGstInfo(bill) {
  const cgst = bill.cgst || 0;
  const sgst = bill.sgst || 0;
  const totalGst = bill.totalGst || cgst + sgst;
  const subtotal = bill.subtotal || 0;

  if (totalGst <= 0) return null;

  // Compute effective GST% from subtotal (pre-tax base)
  let pctDisplay = '';
  if (subtotal > 0) {
    const pct = Math.round((totalGst / subtotal) * 100);
    if (pct > 0) pctDisplay = `${pct}%`;
  }

  return { totalGst, cgst, sgst, pctDisplay };
}

// Bill Card Component
function BillCard({ bill, onDelete }) {
  const distributorName = bill.distributor?.name || bill.pharmacyName || 'Unknown Distributor';
  const isLegacy = !bill.distributorId && bill.pharmacyName;
  const gst = getGstInfo(bill);
  const itemCount = bill._count?.items ?? bill.items?.length ?? 0;

  const dateLabel = bill.invoiceDate
    ? new Date(bill.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'No Date';

  const isCash = (bill.paymentType || '').toLowerCase() === 'cash';

  return (
    <div style={{
      background: 'white',
      borderRadius: 12,
      border: '1px solid #E2E8F0',
      padding: '16px',
      marginBottom: 10,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {/* Top Row: Distributor Name + Grand Total */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ flex: 1, marginRight: 12, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {distributorName}
            </span>
            {isLegacy && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: '#92400E',
                background: '#FEF3C7', border: '1px solid #FDE68A',
                borderRadius: 6, padding: '2px 6px',
              }}>Legacy</span>
            )}
          </div>
          <span style={{ fontSize: 12, color: '#64748B' }}>
            #{bill.invoiceNumber || 'N/A'}
            {itemCount > 0 && ` · ${itemCount} item${itemCount !== 1 ? 's' : ''}`}
          </span>
        </div>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>
          ₹{(bill.grandTotal || 0).toFixed(2)}
        </span>
      </div>

      {/* GST Row: shows percentage + CGST/SGST breakdown */}
      {gst && (
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
          background: '#F8FAFC', borderRadius: 8, padding: '6px 10px', marginBottom: 8,
          fontSize: 12, color: '#475569',
        }}>
          <Receipt size={12} color="#64748B" />
          <span style={{ fontWeight: 600 }}>
            GST{gst.pctDisplay ? ` (${gst.pctDisplay})` : ''}: ₹{gst.totalGst.toFixed(2)}
          </span>
          {gst.cgst > 0 && gst.sgst > 0 && (
            <span style={{ color: '#94A3B8' }}>
              · CGST ₹{gst.cgst.toFixed(2)} + SGST ₹{gst.sgst.toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* Bottom Row: Date chip + Payment chip + Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Date chip */}
        <span style={{
          fontSize: 11, fontWeight: 600, color: '#374151',
          background: '#F1F5F9', border: '1px solid #E2E8F0',
          borderRadius: 999, padding: '3px 10px',
        }}>{dateLabel}</span>

        {/* Payment chip */}
        <span style={{
          fontSize: 11, fontWeight: 600,
          borderRadius: 999, padding: '3px 10px',
          ...(isCash
            ? { background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0' }
            : { background: '#DBEAFE', color: '#1d4ed8', border: '1px solid #BFDBFE' }),
        }}>
          {(bill.paymentType || 'credit').charAt(0).toUpperCase() + (bill.paymentType || 'credit').slice(1)}
        </span>

        {/* Actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <Link to={`/bills/${bill.id}`} className="btn btn-ghost btn-icon" title="View">
            <Eye size={14} />
          </Link>
          <button className="btn btn-ghost btn-icon" title="Delete" onClick={() => onDelete(bill.id)}>
            <Trash2 size={14} style={{ color: '#dc2626' }} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BillsListPage() {
  const { user } = useAuth();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadBills = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await billApi.getUserBills(user.id);
      setBills(res.bills || []);
    } catch (err) {
      toast.error('Failed to load bills');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  const handleDelete = async (billId) => {
    if (!window.confirm('Are you sure you want to delete this bill?')) return;
    try {
      await billApi.deleteBill(billId);
      setBills(prev => prev.filter(b => b.id !== billId));
      toast.success('Bill deleted');
    } catch (err) {
      toast.error('Failed to delete bill');
    }
  };

  const filtered = bills.filter(b => {
    const q = search.toLowerCase();
    return !q ||
      (b.invoiceNumber || '').toLowerCase().includes(q) ||
      (b.pharmacyName || '').toLowerCase().includes(q) ||
      (b.distributor?.name || '').toLowerCase().includes(q);
  });

  if (loading) {
    return <div className="loading-spinner"><div className="spinner" /></div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Purchase Bills</h2>
        <Link to="/scan" className="btn btn-primary"><ScanLine size={16} /> Scan Bill</Link>
      </div>

      {/* Search */}
      <div className="search-bar" style={{ marginBottom: 20, maxWidth: 400 }}>
        <Search size={16} />
        <input
          className="form-input"
          placeholder="Search by invoice #, distributor..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Summary strip */}
      {filtered.length > 0 && (
        <div style={{ fontSize: 13, color: '#64748B', marginBottom: 12 }}>
          {filtered.length} bill{filtered.length !== 1 ? 's' : ''}
          {' · '}Total ₹{filtered.reduce((s, b) => s + (b.grandTotal || 0), 0).toFixed(2)}
          {' · '}GST ₹{filtered.reduce((s, b) => {
            const g = getGstInfo(b);
            return s + (g ? g.totalGst : 0);
          }, 0).toFixed(2)}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <FileText size={48} />
            <h3>No bills found</h3>
            <p>{search ? 'Try a different search term' : 'Scan your first bill to get started!'}</p>
            {!search && (
              <Link to="/scan" className="btn btn-primary" style={{ marginTop: 16 }}>
                <ScanLine size={16} /> Scan Bill
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div>
          {filtered.map(bill => (
            <BillCard key={bill.id} bill={bill} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
