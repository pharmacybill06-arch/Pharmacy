import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { billApi } from '../services/api';
import { ArrowLeft, Trash2, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

export default function BillDetailsPage() {
  const { billId } = useParams();
  const navigate = useNavigate();
  const [bill, setBill] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadBill = useCallback(async () => {
    try {
      const [billRes, itemsRes] = await Promise.all([
        billApi.getBillById(billId),
        billApi.getBillItems(billId).catch(() => ({ items: [] })),
      ]);
      setBill(billRes.bill || billRes);
      setItems(itemsRes.items || []);
    } catch (err) {
      toast.error('Failed to load bill');
      navigate('/bills');
    } finally {
      setLoading(false);
    }
  }, [billId, navigate]);

  useEffect(() => {
    loadBill();
  }, [loadBill]);

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this bill?')) return;
    try {
      await billApi.deleteBill(billId);
      toast.success('Bill deleted');
      navigate('/bills');
    } catch (err) {
      toast.error('Failed to delete bill');
    }
  };

  if (loading) {
    return <div className="loading-spinner"><div className="spinner" /></div>;
  }

  if (!bill) {
    return (
      <div className="empty-state">
        <FileText size={48} />
        <h3>Bill not found</h3>
        <Link to="/bills" className="btn btn-primary" style={{ marginTop: 16 }}>Back to Bills</Link>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-icon" onClick={() => navigate('/bills')}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700 }}>Bill #{bill.invoiceNumber || 'N/A'}</h2>
            <p style={{ color: '#6b7280', fontSize: 14 }}>
              {bill.invoiceDate ? new Date(bill.invoiceDate).toLocaleDateString() : 'No date'} • 
              {bill.distributor?.name || bill.pharmacyName || 'Unknown distributor'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-danger btn-sm" onClick={handleDelete}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>

      {/* Bill Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        <div className="card">
          <div className="card-header"><h3>Bill Information</h3></div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <p style={{ fontSize: 12, color: '#6b7280' }}>Invoice Number</p>
                <p style={{ fontWeight: 500 }}>{bill.invoiceNumber || 'N/A'}</p>
              </div>
              <div>
                <p style={{ fontSize: 12, color: '#6b7280' }}>Invoice Date</p>
                <p style={{ fontWeight: 500 }}>{bill.invoiceDate ? new Date(bill.invoiceDate).toLocaleDateString() : 'N/A'}</p>
              </div>
              <div>
                <p style={{ fontSize: 12, color: '#6b7280' }}>Payment Type</p>
                <p><span className="badge badge-primary">{bill.paymentType || 'credit'}</span></p>
              </div>
              <div>
                <p style={{ fontSize: 12, color: '#6b7280' }}>Status</p>
                <p><span className={`badge ${bill.status === 'confirmed' ? 'badge-success' : 'badge-warning'}`}>{bill.status || 'pending'}</span></p>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Amount Summary</h3></div>
          <div className="card-body">
            {(() => {
              const subtotal = bill.subtotal || 0;
              const cgst = bill.cgst || 0;
              const sgst = bill.sgst || 0;
              const totalGst = bill.totalGst || (cgst + sgst);
              const discountAmount = bill.discountAmount || 0;
              const roundOff = bill.roundOff || 0;

              // Compute GST percentages from pre-tax subtotal
              const fmtPct = (amt) => {
                if (subtotal <= 0 || amt <= 0) return '';
                const pct = (amt / subtotal) * 100;
                // Round to 1 decimal, strip trailing .0
                const rounded = Math.round(pct * 10) / 10;
                return ` (${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%)`;
              };

              // Verify: subtotal + totalGst - discount + roundOff = grandTotal
              const computed = subtotal + totalGst - discountAmount + roundOff;
              const grandTotal = bill.grandTotal || computed;

              return (
                <div className="bill-summary">
                  <div className="bill-summary-row">
                    <span>Subtotal (before tax)</span>
                    <span>₹{subtotal.toFixed(2)}</span>
                  </div>

                  {cgst > 0 && (
                    <div className="bill-summary-row">
                      <span style={{ color: '#4b5563' }}>CGST{fmtPct(cgst)}</span>
                      <span>₹{cgst.toFixed(2)}</span>
                    </div>
                  )}
                  {sgst > 0 && (
                    <div className="bill-summary-row">
                      <span style={{ color: '#4b5563' }}>SGST{fmtPct(sgst)}</span>
                      <span>₹{sgst.toFixed(2)}</span>
                    </div>
                  )}

                  {/* Show combined GST line when both present */}
                  {cgst > 0 && sgst > 0 && (
                    <div className="bill-summary-row" style={{ fontWeight: 600, color: '#1d4ed8', fontSize: 13 }}>
                      <span>Total GST{fmtPct(totalGst)}</span>
                      <span>₹{totalGst.toFixed(2)}</span>
                    </div>
                  )}

                  {/* Show single GST line if only one component */}
                  {totalGst > 0 && cgst === 0 && sgst === 0 && (
                    <div className="bill-summary-row">
                      <span>GST{fmtPct(totalGst)}</span>
                      <span>₹{totalGst.toFixed(2)}</span>
                    </div>
                  )}

                  {discountAmount > 0 && (
                    <div className="bill-summary-row" style={{ color: '#16a34a' }}>
                      <span>Discount</span>
                      <span>−₹{discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {roundOff !== 0 && (
                    <div className="bill-summary-row">
                      <span>Round Off</span>
                      <span>{roundOff >= 0 ? '+' : ''}₹{roundOff.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="bill-summary-row total">
                    <span>Grand Total</span>
                    <span>₹{grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

        <div className="card">
        <div className="card-header">
          <h3>Bill Items ({items.length})</h3>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th>HSN</th>
                <th>Qty</th>
                <th>Free</th>
                <th>MRP</th>
                <th>Rate</th>
                <th>Discount</th>
                <th>GST %</th>
                <th>GST Amt</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={13} style={{ textAlign: 'center', padding: 32, color: '#6b7280' }}>No items</td></tr>
              ) : items.map((item, i) => {
                // Strictly show itemTotal as rate × quantity, ignore discount and GST in this column
                const baseAmount = (item.rate || 0) * (item.quantity || 0);
                return (
                  <tr key={item.id || i}>
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{item.name}</td>
                    <td>{item.batchNumber || '-'}</td>
                    <td>{item.expiryDate || '-'}</td>
                    <td>{item.hsnCode || '-'}</td>
                    <td>{item.quantity}</td>
                    <td>{item.freeQuantity || 0}</td>
                    <td>₹{(item.mrp || 0).toFixed(2)}</td>
                    <td>₹{(item.rate || 0).toFixed(2)}</td>
                    <td>{item.discount || 0}%</td>
                    <td style={{ color: '#1d4ed8', fontWeight: 600 }}>{item.gstPercent || 0}%</td>
                    <td style={{ color: '#1d4ed8' }}>
                      {/* GST amount can still be shown for info, but not included in itemTotal */}
                      {item.gstPercent > 0 ? `₹${(baseAmount * (item.gstPercent / 100)).toFixed(2)}` : '-'}
                      {item.cgstPercent > 0 && (
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                          CGST {item.cgstPercent}% + SGST {item.sgstPercent}%
                        </div>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>₹{baseAmount.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                  <td colSpan={11} style={{ textAlign: 'right', padding: '10px 16px', color: '#374151' }}>Totals:</td>
                  <td style={{ color: '#1d4ed8', padding: '10px 16px' }}>
                    ₹{items.reduce((s, item) => s + ((item.rate || 0) * (item.quantity || 0)), 0).toFixed(2)}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    ₹{items.reduce((s, item) => s + ((item.rate || 0) * (item.quantity || 0)), 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
