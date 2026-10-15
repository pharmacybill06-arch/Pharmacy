import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { expiryApi, billApi } from '../services/api';
import { CalendarClock, CheckCircle2, Undo2, Trash2, AlertTriangle, Search, ShieldCheck, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDDMMYYYY } from '../utils/dateFormat';
import { formatINR, formatINRShort } from '../utils/money';

const STOCK_PAGE = 50;

/**
 * Batch expiry — mirrors mobile's parser (app/(tabs)/index.js) exactly, so both clients
 * show the same "days left" for the same line. MM/YY expires at the end of that month.
 */
function parseExpiryDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  let m = text.match(/^(\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const month = Number(m[1]);
    const year = Number(m[2].length === 2 ? `20${m[2]}` : m[2]);
    if (month >= 1 && month <= 12) return new Date(year, month, 0);
  }
  m = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const first = Number(m[1]);
    const second = Number(m[2]);
    const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    const day = first > 12 ? first : second;
    const month = first > 12 ? second : first;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return new Date(year, month - 1, day);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysLabel(days) {
  if (days == null) return { text: '—', color: '#9ca3af' };
  if (days < 0) return { text: `${Math.abs(days)}d expired`, color: '#b91c1c' };
  if (days === 0) return { text: 'Expires today', color: '#b91c1c' };
  if (days <= 30) return { text: `${days}d left`, color: '#b91c1c' };
  if (days <= 90) return { text: `${days}d left`, color: '#b45309' };
  return { text: `${days}d left`, color: '#047857' };
}

/**
 * Expiry Manager — web counterpart of the mobile home screen.
 *
 *   Action Required  GET /expiry/user/:id/window — batches inside the expiry window,
 *                    each with Sold / Return / Write-off and an editable quantity
 *                    (PATCH /expiry/items/:id/action), the same actions as mobile.
 *   Tracked Stock    every bill line with an expiry, soonest first — per batch, which
 *                    is more accurate than the single product-level date the
 *                    Inventory page filters on.
 */
export default function ExpiryPage() {
  const { user } = useAuth();
  const [windowData, setWindowData] = useState({ items: [], summary: null });
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [qtyEdit, setQtyEdit] = useState(null); // { id, value }
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('upcoming'); // upcoming | expired | all
  const [visible, setVisible] = useState(STOCK_PAGE);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [win, billRes] = await Promise.all([
        expiryApi.getWindow(user.id).catch(() => ({ items: [], summary: null })),
        billApi.getUserBills(user.id).catch(() => ({ bills: [] })),
      ]);
      setWindowData({ items: win.items || [], summary: win.summary || null });
      setBills(billRes.bills || []);
    } catch (err) {
      toast.error(err.message || 'Failed to load expiry data');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const act = async (item, action) => {
    const verb = { sold: 'Mark as sold / finished', returned: 'Return to distributor', writeoff: 'Write off' }[action];
    // Each of these removes the batch from the action list; write-off loses its value.
    if (action === 'writeoff' && !window.confirm(`Write off ${item.name} (batch ${item.batchNumber || '—'})? Its ${formatINR(item.valueAtRisk)} value is counted as lost.`)) return;
    setBusyId(item.id);
    try {
      await expiryApi.applyAction(item.id, action);
      setWindowData((w) => ({ ...w, items: w.items.filter((i) => i.id !== item.id) }));
      toast.success(`${verb}: ${item.name}`);
    } catch (err) {
      toast.error(err.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const saveQty = async (item) => {
    const qty = parseFloat(qtyEdit.value);
    if (Number.isNaN(qty) || qty < 0) { toast.error('Enter a quantity of zero or more'); return; }
    setBusyId(item.id);
    try {
      await expiryApi.applyAction(item.id, 'update_qty', qty);
      setWindowData((w) => ({
        ...w,
        items: w.items.map((i) => (i.id === item.id ? { ...i, remainingQty: qty, valueAtRisk: qty * (i.unitCost || 0) } : i)),
      }));
      setQtyEdit(null);
      toast.success('Quantity updated');
    } catch (err) {
      toast.error(err.message || 'Failed to update quantity');
    } finally {
      setBusyId(null);
    }
  };

  const stock = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return bills
      .flatMap((bill) => (bill.items || []).map((item) => {
        const parsed = parseExpiryDate(item.expiryDate);
        return {
          ...item,
          bill,
          expiryParsed: parsed,
          days: parsed ? Math.ceil((parsed.getTime() - today.getTime()) / 86_400_000) : null,
        };
      }))
      .filter((i) => i.expiryDate)
      .sort((a, b) => (a.days == null ? 1 : b.days == null ? -1 : a.days - b.days));
  }, [bills]);

  const filteredStock = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stock
      .filter((i) => stockFilter === 'all' || (stockFilter === 'expired' ? i.days != null && i.days < 0 : i.days == null || i.days >= 0))
      .filter((i) => !q || (i.name || '').toLowerCase().includes(q) || (i.batchNumber || '').toLowerCase().includes(q)
        || (i.bill?.distributor?.name || i.bill?.pharmacyName || '').toLowerCase().includes(q));
  }, [stock, search, stockFilter]);

  const expiredCount = stock.filter((i) => i.days != null && i.days < 0).length;
  const within90 = stock.filter((i) => i.days != null && i.days >= 0 && i.days <= 90).length;
  const s = windowData.summary;

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Expiry Manager</h2>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: '#fef2f2', color: '#dc2626' }}><AlertTriangle size={20} /></div>
          <div><div className="stat-card-label">Action Required</div><div className="stat-card-value">{windowData.items.length}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: '#fff7ed', color: '#c2410c' }}><CalendarClock size={20} /></div>
          <div><div className="stat-card-label">Value at Risk</div><div className="stat-card-value">{formatINRShort(s?.totalValueAtRisk || 0)}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: '#eff6ff', color: '#1d4ed8' }}><Undo2 size={20} /></div>
          <div><div className="stat-card-label">Still Returnable</div><div className="stat-card-value">{formatINRShort(s?.totalReturnable || 0)}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: '#fef2f2', color: '#b91c1c' }}><Trash2 size={20} /></div>
          <div>
            <div className="stat-card-label">Tracked Batches</div>
            <div className="stat-card-value">{stock.length}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{expiredCount} expired · {within90} within 90 days</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3>Action Required{s ? ` — expiring within ${s.windowDays} days` : ''}</h3>
        </div>
        {windowData.items.length === 0 ? (
          <div className="empty-state">
            <ShieldCheck size={44} style={{ color: '#16a34a' }} />
            <h3>All clear</h3>
            <p>No batches expiring in the next {s?.windowDays || 90} days need attention.</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>At Risk</th><th>Return</th><th></th></tr>
              </thead>
              <tbody>
                {windowData.items.map((item) => {
                  const d = daysLabel(item.daysUntilExpiry);
                  const qty = item.remainingQty ?? item.quantity;
                  const busy = busyId === item.id;
                  return (
                    <tr key={item.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{item.distributor || '—'}</div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{item.batchNumber || '—'}</td>
                      <td>
                        <div>{formatDDMMYYYY(item.expiryDateParsed) || item.expiryDate}</div>
                        <div style={{ fontSize: 12, color: d.color, fontWeight: 600 }}>{d.text}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {qtyEdit?.id === item.id ? (
                          <span style={{ display: 'inline-flex', gap: 4 }}>
                            <input className="form-input" type="number" min="0" style={{ width: 72 }} autoFocus value={qtyEdit.value}
                              onChange={(e) => setQtyEdit({ id: item.id, value: e.target.value })}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveQty(item); if (e.key === 'Escape') setQtyEdit(null); }} />
                            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => saveQty(item)}>Save</button>
                          </span>
                        ) : (
                          <button className="btn btn-ghost btn-sm" title="Correct the remaining quantity" onClick={() => setQtyEdit({ id: item.id, value: String(qty) })}>
                            {qty} <Pencil size={12} />
                          </button>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatINR(item.valueAtRisk)}</td>
                      <td>
                        {item.returnEligible
                          ? <span className="badge badge-success">Open</span>
                          : <span className="badge badge-warning" title={`Opens ${formatDDMMYYYY(item.returnOpenDate)}`}>Opens {formatDDMMYYYY(item.returnOpenDate)}</span>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(item, 'sold')} title="Sold / finished"><CheckCircle2 size={14} style={{ color: '#047857' }} /> Sold</button>
                        <button className="btn btn-ghost btn-sm" disabled={busy || !item.returnEligible} onClick={() => act(item, 'returned')}
                          title={item.returnEligible ? 'Return to distributor' : 'Return window not open yet'}><Undo2 size={14} style={{ color: item.returnEligible ? '#1d4ed8' : '#9ca3af' }} /> Return</button>
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(item, 'writeoff')} title="Write off"><Trash2 size={14} style={{ color: '#b45309' }} /> Write off</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <h3>All Tracked Stock</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="search-bar" style={{ width: 260 }}>
              <Search size={16} />
              <input className="form-input" placeholder="Medicine, batch or distributor" value={search} onChange={(e) => { setSearch(e.target.value); setVisible(STOCK_PAGE); }} />
            </div>
            <select className="form-input" style={{ width: 150 }} value={stockFilter} onChange={(e) => { setStockFilter(e.target.value); setVisible(STOCK_PAGE); }}>
              <option value="upcoming">Not expired</option>
              <option value="expired">Expired ({expiredCount})</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>
        {filteredStock.length === 0 ? (
          <div className="empty-state"><CalendarClock size={40} /><h3>No batches match</h3></div>
        ) : (
          <>
            <div className="table-container">
              <table>
                <thead><tr><th>Medicine</th><th>Batch</th><th>Distributor</th><th style={{ textAlign: 'right' }}>Qty</th><th>Expiry</th><th>Status</th></tr></thead>
                <tbody>
                  {filteredStock.slice(0, visible).map((i) => {
                    const d = daysLabel(i.days);
                    return (
                      <tr key={i.id}>
                        <td style={{ fontWeight: 500 }}>{i.name}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{i.batchNumber || '—'}</td>
                        <td>
                          <Link to={`/bills/${i.bill.id}`} style={{ fontSize: 13 }}>{i.bill?.distributor?.name || i.bill?.pharmacyName || 'Bill'}</Link>
                        </td>
                        <td style={{ textAlign: 'right' }}>{i.quantity}</td>
                        <td>{i.expiryParsed ? formatDDMMYYYY(i.expiryParsed) : i.expiryDate}</td>
                        <td style={{ color: d.color, fontWeight: 600, fontSize: 13 }}>{d.text}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {visible < filteredStock.length && (
              <div style={{ padding: 16, textAlign: 'center' }}>
                <button className="btn btn-secondary" onClick={() => setVisible((v) => v + STOCK_PAGE)}>
                  Load more ({filteredStock.length - visible} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
