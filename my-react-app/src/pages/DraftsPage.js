import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { billApi } from '../services/api';
import { FileText, Search, Trash2, Edit3, CheckCircle, Clock, ScanLine } from 'lucide-react';
import toast from 'react-hot-toast';

// Draft Card Component
function DraftCard({ draft, onDelete, onEdit, onConvert }) {
  const distributorName = draft.distributor?.name || draft.pharmacyName || 'Unknown Distributor';
  const itemCount = draft._count?.items ?? draft.items?.length ?? 0;

  const dateLabel = draft.createdAt
    ? new Date(draft.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'No Date';

  const timeLabel = draft.createdAt
    ? new Date(draft.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div style={{
      background: 'white',
      borderRadius: 12,
      border: '1px solid #FDE68A',
      padding: '16px',
      marginBottom: 10,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      position: 'relative',
    }}>
      {/* Draft badge */}
      <div style={{
        position: 'absolute', top: 12, right: 12,
        display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 11, fontWeight: 700, color: '#92400E',
        background: '#FEF3C7', border: '1px solid #FDE68A',
        borderRadius: 999, padding: '3px 10px',
      }}>
        <Clock size={12} />
        Draft
      </div>

      {/* Top Row: Distributor Name + Grand Total */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, paddingRight: 72 }}>
        <div style={{ flex: 1, marginRight: 12, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
            {distributorName}
          </span>
          <span style={{ fontSize: 12, color: '#64748B' }}>
            #{draft.invoiceNumber || 'N/A'}
            {itemCount > 0 && ` · ${itemCount} item${itemCount !== 1 ? 's' : ''}`}
          </span>
        </div>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>
          ₹{(draft.grandTotal || 0).toFixed(2)}
        </span>
      </div>

      {/* Items preview */}
      {draft.items && draft.items.length > 0 && (
        <div style={{
          background: '#FFFBEB', borderRadius: 8, padding: '8px 10px', marginBottom: 8,
          fontSize: 12, color: '#78350F',
        }}>
          {draft.items.slice(0, 3).map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                {item.name || 'Unnamed'}
              </span>
              <span style={{ fontWeight: 600 }}>
                {item.quantity} × ₹{(item.rate || 0).toFixed(2)}
              </span>
            </div>
          ))}
          {draft.items.length > 3 && (
            <div style={{ color: '#92400E', fontStyle: 'italic', marginTop: 2 }}>
              +{draft.items.length - 3} more item{draft.items.length - 3 !== 1 ? 's' : ''}...
            </div>
          )}
        </div>
      )}

      {/* Bottom Row: Date + Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 11, fontWeight: 600, color: '#374151',
          background: '#F1F5F9', border: '1px solid #E2E8F0',
          borderRadius: 999, padding: '3px 10px',
        }}>
          {dateLabel} {timeLabel}
        </span>

        {/* Actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
            onClick={() => onEdit(draft)}
            title="Edit Draft"
          >
            <Edit3 size={13} /> Edit
          </button>
          <button
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
            onClick={() => onConvert(draft)}
            title="Save as Bill"
          >
            <CheckCircle size={13} /> Save as Bill
          </button>
          <button
            className="btn btn-ghost btn-icon"
            title="Delete Draft"
            onClick={() => onDelete(draft.id)}
          >
            <Trash2 size={14} style={{ color: '#dc2626' }} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DraftsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [converting, setConverting] = useState(null);

  useEffect(() => {
    loadDrafts();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDrafts = async () => {
    if (!user?.id) return;
    try {
      const res = await billApi.getUserDrafts(user.id);
      setDrafts(res.drafts || []);
    } catch (err) {
      toast.error('Failed to load drafts');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (draftId) => {
    if (!window.confirm('Are you sure you want to delete this draft?')) return;
    try {
      await billApi.deleteBill(draftId);
      setDrafts(prev => prev.filter(d => d.id !== draftId));
      toast.success('Draft deleted');
    } catch (err) {
      toast.error('Failed to delete draft');
    }
  };

  const handleEdit = (draft) => {
    // Navigate to bill form with draft data pre-filled
    const parsedData = {
      invoiceNumber: draft.invoiceNumber || '',
      invoiceDate: draft.invoiceDate ? new Date(draft.invoiceDate).toISOString().split('T')[0] : '',
      pharmacyName: draft.distributor?.name || draft.pharmacyName || '',
      distributorId: draft.distributorId || '',
      subtotal: draft.subtotal || '',
      cgst: draft.cgst || '',
      sgst: draft.sgst || '',
      grandTotal: draft.grandTotal || '',
      paymentType: draft.paymentType || 'credit',
      items: (draft.items || []).map(item => ({
        name: item.name || '',
        manufacturer: item.manufacturer || '',
        batchNumber: item.batchNumber || '',
        expiryDate: item.expiryDate || '',
        hsnCode: item.hsnCode || '',
        quantity: item.quantity ?? 1,
        freeQuantity: item.freeQuantity ?? 0,
        unit: item.unit || 'pcs',
        mrp: item.mrp || '',
        rate: item.rate || '',
        gstPercent: item.gstPercent || '',
        discount: item.discount || '',
        itemTotal: item.itemTotal || '',
      })),
    };

    navigate('/bill-form', {
      state: {
        parsedData,
        ocrText: draft.rawOcrText || '',
        draftId: draft.id, // pass draft ID so we can update instead of creating new
      },
    });
  };

  const handleConvert = async (draft) => {
    if (!window.confirm('Convert this draft to a saved bill? This will finalize it and sync products.')) return;
    
    setConverting(draft.id);
    try {
      // Build parsedData from draft for the convert endpoint
      const parsedData = {
        pharmacyName: draft.distributor?.name || draft.pharmacyName || '',
        shopAddress: draft.shopAddress || '',
        invoiceNumber: draft.invoiceNumber || '',
        invoiceDate: draft.invoiceDate || '',
        subtotal: draft.subtotal,
        cgst: draft.cgst,
        sgst: draft.sgst,
        totalGst: draft.totalGst,
        discountAmount: draft.discountAmount,
        roundOff: draft.roundOff,
        grandTotal: draft.grandTotal,
        paymentType: draft.paymentType,
        items: (draft.items || []).map(item => ({
          name: item.name,
          manufacturer: item.manufacturer,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          hsnCode: item.hsnCode,
          quantity: item.quantity,
          freeQuantity: item.freeQuantity,
          unit: item.unit,
          mrp: item.mrp,
          rate: item.rate,
          gstPercent: item.gstPercent,
          cgstPercent: item.cgstPercent,
          sgstPercent: item.sgstPercent,
          discount: item.discount,
          itemTotal: item.itemTotal,
        })),
      };

      await billApi.convertDraft(draft.id, parsedData);
      toast.success('Draft converted to bill successfully!');
      setDrafts(prev => prev.filter(d => d.id !== draft.id));
    } catch (err) {
      toast.error(err.message || 'Failed to convert draft');
    } finally {
      setConverting(null);
    }
  };

  const filtered = drafts.filter(d => {
    const q = search.toLowerCase();
    return !q ||
      (d.invoiceNumber || '').toLowerCase().includes(q) ||
      (d.pharmacyName || '').toLowerCase().includes(q) ||
      (d.distributor?.name || '').toLowerCase().includes(q) ||
      (d.items || []).some(item => (item.name || '').toLowerCase().includes(q));
  });

  if (loading) {
    return <div className="loading-spinner"><div className="spinner" /></div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={24} style={{ color: '#D97706' }} />
            Drafts
          </h2>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>
            Bills saved from mobile scanning — edit and finalize them here
          </p>
        </div>
        <a href="/scan" className="btn btn-primary"><ScanLine size={16} /> Scan New Bill</a>
      </div>

      {/* Search */}
      {drafts.length > 0 && (
        <div className="search-bar" style={{ marginBottom: 20, maxWidth: 400 }}>
          <Search size={16} />
          <input
            className="form-input"
            placeholder="Search drafts by invoice #, distributor, item..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Summary */}
      {filtered.length > 0 && (
        <div style={{ fontSize: 13, color: '#64748B', marginBottom: 12 }}>
          {filtered.length} draft{filtered.length !== 1 ? 's' : ''}
          {' · '}Total ₹{filtered.reduce((s, d) => s + (d.grandTotal || 0), 0).toFixed(2)}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <FileText size={48} style={{ color: '#D97706' }} />
            <h3>{search ? 'No drafts match your search' : 'No drafts yet'}</h3>
            <p>
              {search
                ? 'Try a different search term'
                : 'Scan a bill from the mobile app and save it as a draft to see it here.'}
            </p>
          </div>
        </div>
      ) : (
        <div>
          {filtered.map(draft => (
            <DraftCard
              key={draft.id}
              draft={draft}
              onDelete={handleDelete}
              onEdit={handleEdit}
              onConvert={handleConvert}
            />
          ))}
        </div>
      )}
    </div>
  );
}
