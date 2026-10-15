import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { salesApi } from '../services/api';
import { ShoppingCart, ChevronLeft, ChevronRight, Search, X, Receipt, Lock, Clock, CheckCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDDMMYYYY } from '../utils/dateFormat';
import { formatINR } from '../utils/money';
import { SCHEDULE_LABEL, todayLocalIso, shiftDate, formatTime } from '../utils/sales';

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function dayLabel(iso) {
  if (iso === todayLocalIso()) return 'Today';
  if (iso === shiftDate(todayLocalIso(), -1)) return 'Yesterday';
  return formatDDMMYYYY(iso);
}

function StatusBadge({ status }) {
  return status === 'billed'
    ? <span className="badge badge-success">Billed</span>
    : <span className="badge badge-warning">Quick</span>;
}

// ============================================================
// Convert-to-bill modal — batch/qty locked, prices + customer editable
// ============================================================
function ConvertModal({ sale, onClose, onConfirm, saving }) {
  const [customerName, setCustomerName] = useState(sale.customerName || '');
  const [customerPhone, setCustomerPhone] = useState(sale.customerPhone || '');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [prices, setPrices] = useState(() => Object.fromEntries(
    sale.items.map((i) => [i.id, i.pricePerBase != null ? String(i.pricePerBase) : '']),
  ));

  const total = useMemo(() => round2(sale.items.reduce((sum, i) => {
    const p = parseFloat(prices[i.id]);
    return sum + (Number.isNaN(p) ? 0 : i.quantityBase * p);
  }, 0)), [sale.items, prices]);

  const confirm = () => onConfirm(sale.id, {
    customerName: customerName.trim() || null,
    customerPhone: customerPhone.trim() || null,
    invoiceNumber: invoiceNumber.trim() || null,
    items: sale.items.map((i) => ({ saleItemId: i.id, pricePerBase: prices[i.id] === '' ? null : parseFloat(prices[i.id]) })),
    totalAmount: total,
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create Bill</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
            Sale recorded {formatDDMMYYYY(sale.saleDate)}. Batch and quantity are locked — the stock was already deducted.
          </p>
          {sale.items.map((item) => (
            <div key={item.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong>{item.productName}</strong>
                <span style={{ fontSize: 11, color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Lock size={10} /> locked</span>
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 8px' }}>
                {item.quantityLabel}{item.batchNumber ? ` · Batch ${item.batchNumber}` : ''}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label className="form-label" style={{ margin: 0, flex: 1 }}>Price per unit</label>
                <input className="form-input" type="number" step="0.01" min="0" style={{ width: 120 }} placeholder="0.00"
                  value={prices[item.id]} onChange={(e) => setPrices((p) => ({ ...p, [item.id]: e.target.value }))} />
              </div>
            </div>
          ))}
          <div className="form-row" style={{ marginTop: 12 }}>
            <div className="form-group">
              <label className="form-label">Customer name</label>
              <input className="form-input" placeholder="Walk-in customer" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Invoice number</label>
            <input className="form-input" placeholder="Auto if left blank" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </div>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <div><div style={{ fontSize: 12, color: '#6b7280' }}>Bill total</div><strong style={{ fontSize: 18 }}>{formatINR(total)}</strong></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={confirm} disabled={saving}>{saving ? 'Creating…' : 'Create Bill'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Sales — web counterpart of mobile's Daily Sale Register + Pending Bills.
 * Quick Sell lives on its own page (/sales/new).
 */
export default function SalesPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'pending' ? 'pending' : 'register';

  const [date, setDate] = useState(todayLocalIso());
  const [register, setRegister] = useState(null);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [selected, setSelected] = useState({});
  const [converting, setConverting] = useState(null);
  const [saving, setSaving] = useState(false);
  const searchSeq = useRef(0);

  const loadRegister = useCallback(async (d) => {
    if (!user?.id) return;
    setLoading(true);
    try {
      setRegister(await salesApi.getDailyRegister(user.id, d));
    } catch (err) {
      toast.error(err.message || 'Failed to load sales');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const loadPending = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await salesApi.getPendingSales(user.id);
      setPending(res.sales || []);
    } catch (err) {
      toast.error(err.message || 'Failed to load pending sales');
    }
  }, [user?.id]);

  useEffect(() => { loadRegister(date); }, [loadRegister, date]);
  useEffect(() => { loadPending(); }, [loadPending]);

  // Cross-date medicine search, debounced; a stale response never overwrites a newer one
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || !user?.id) { setSearchResults(null); return undefined; }
    const seq = ++searchSeq.current;
    const t = setTimeout(async () => {
      try {
        const res = await salesApi.searchSales(user.id, q);
        if (seq === searchSeq.current) setSearchResults({ ...res, query: q });
      } catch (err) {
        if (seq === searchSeq.current) toast.error(err.message || 'Search failed');
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, user?.id]);

  const convertOne = async (saleId, data) => {
    setSaving(true);
    try {
      await salesApi.convertToBill(saleId, data);
      toast.success('Bill created');
      setConverting(null);
      setSelected((s) => ({ ...s, [saleId]: false }));
      await Promise.all([loadPending(), loadRegister(date)]);
    } catch (err) {
      toast.error(err.message || 'Failed to create bill');
    } finally {
      setSaving(false);
    }
  };

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  const convertSelected = async () => {
    setSaving(true);
    let ok = 0;
    const failures = [];
    for (const id of selectedIds) {
      try {
        // Prices already on the sale lines carry over untouched
        await salesApi.convertToBill(id, {});
        ok++;
      } catch (err) {
        failures.push(err.message);
      }
    }
    if (failures.length === 0) toast.success(`${ok} sale${ok === 1 ? '' : 's'} billed`);
    else toast.error(`${ok} billed, ${failures.length} failed: ${failures[0]}`);
    setSelected({});
    setSaving(false);
    await Promise.all([loadPending(), loadRegister(date)]);
  };

  const summary = register?.summary || {};
  const sales = register?.sales || [];
  const isToday = date === todayLocalIso();
  const setTab = (t) => setParams(t === 'pending' ? { tab: 'pending' } : {});

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Sales</h2>
        <Link to="/sales/new" className="btn btn-primary"><ShoppingCart size={16} /> Quick Sell</Link>
      </div>

      <div className="tabs" style={{ marginBottom: 20 }}>
        <button className={`tab ${tab === 'register' ? 'active' : ''}`} onClick={() => setTab('register')}>Daily Register</button>
        <button className={`tab ${tab === 'pending' ? 'active' : ''}`} onClick={() => setTab('pending')}>
          Pending Bills{pending.length ? ` (${pending.length})` : ''}
        </button>
      </div>

      {tab === 'register' ? (
        <>
          <div className="search-bar" style={{ maxWidth: 420, marginBottom: 16 }}>
            <Search size={16} />
            <input className="form-input" placeholder="Search a medicine across all days…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          {searchResults ? (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Sales of “{searchResults.query}” — all days</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => setQuery('')}><X size={14} /> Clear</button>
              </div>
              {!searchResults.products?.length ? (
                <div className="empty-state"><Search size={40} /><h3>No sales found</h3></div>
              ) : searchResults.products.map((g) => (
                <div key={g.productId} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ padding: '12px 20px', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <strong>{g.productName}</strong>
                    {SCHEDULE_LABEL[g.scheduleFlag] && <span className="badge badge-danger">{SCHEDULE_LABEL[g.scheduleFlag]}</span>}
                    <span style={{ fontSize: 13, color: '#6b7280' }}>
                      {g.saleCount} sale{g.saleCount === 1 ? '' : 's'}{g.firstSoldAt ? ` since ${formatDDMMYYYY(g.firstSoldAt)}` : ''}
                    </span>
                  </div>
                  <div className="table-container">
                    <table>
                      <thead><tr><th>Date</th><th>Quantity</th><th>Batch</th><th>Status</th></tr></thead>
                      <tbody>
                        {g.sales.map((s, i) => (
                          <tr key={`${s.saleId}-${i}`}>
                            <td>{formatDDMMYYYY(s.saleDate)}</td>
                            <td>{s.quantityLabel}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{s.batchNumber || '—'}</td>
                            <td>{s.status && <StatusBadge status={s.status} />}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button className="btn btn-secondary btn-icon" aria-label="Previous day" onClick={() => setDate(shiftDate(date, -1))}><ChevronLeft size={18} /></button>
                    <div style={{ textAlign: 'center', minWidth: 120 }}>
                      <div style={{ fontWeight: 700 }}>{dayLabel(date)}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{formatDDMMYYYY(date)}</div>
                    </div>
                    <button className="btn btn-secondary btn-icon" aria-label="Next day" disabled={isToday} onClick={() => setDate(shiftDate(date, 1))}><ChevronRight size={18} /></button>
                    <input type="date" className="form-input" style={{ width: 160 }} max={todayLocalIso()} value={date}
                      onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Pick a date" />
                    {!isToday && <button className="btn btn-ghost btn-sm" onClick={() => setDate(todayLocalIso())}>Today</button>}
                  </div>
                  <div style={{ display: 'flex', gap: 28 }}>
                    <div><div style={{ fontSize: 12, color: '#6b7280' }}>Items sold</div><strong style={{ fontSize: 18 }}>{summary.totalItems || 0}</strong></div>
                    <div><div style={{ fontSize: 12, color: '#6b7280' }}>Total</div><strong style={{ fontSize: 18 }}>{formatINR(summary.totalAmount || 0)}</strong></div>
                    <div><div style={{ fontSize: 12, color: '#6b7280' }}>Unbilled</div>
                      <strong style={{ fontSize: 18, color: summary.unbilledCount ? '#b45309' : undefined }}>{summary.unbilledCount || 0}</strong></div>
                  </div>
                </div>
              </div>

              {pending.length > 0 && (
                <button className="card" onClick={() => setTab('pending')}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 16, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', cursor: 'pointer', textAlign: 'left' }}>
                  <Receipt size={18} />
                  <span style={{ flex: 1 }}>{pending.length} sale{pending.length === 1 ? '' : 's'} ready to bill whenever you have time</span>
                  <ChevronRight size={18} />
                </button>
              )}

              <div className="card">
                {loading ? (
                  <div className="loading-spinner"><div className="spinner" /></div>
                ) : sales.length === 0 ? (
                  <div className="empty-state"><ShoppingCart size={44} /><h3>No sales recorded</h3><p>Use Quick Sell to record a sale in a couple of clicks.</p></div>
                ) : (
                  <div className="table-container">
                    <table>
                      <thead><tr><th>Time</th><th>Items</th><th>Customer</th><th style={{ textAlign: 'right' }}>Amount</th><th>Status</th></tr></thead>
                      <tbody>
                        {sales.map((sale) => (
                          <tr key={sale.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>{formatTime(sale.saleDate)}</td>
                            <td>
                              {sale.items.map((item) => (
                                <div key={item.id} style={{ fontSize: 14 }}>
                                  {item.productName} × {item.quantityLabel}
                                  {item.batchNumber && <span style={{ color: '#6b7280', fontSize: 12 }}> — Batch {item.batchNumber}</span>}
                                </div>
                              ))}
                            </td>
                            <td style={{ fontSize: 13 }}>
                              {sale.customerName || '—'}
                              {sale.doctorName && <div style={{ color: '#6b7280' }}>Dr. {sale.doctorName.replace(/^dr\.?\s*/i, '')}</div>}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{sale.totalAmount != null ? formatINR(sale.totalAmount) : '—'}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {sale.hasScheduledItem && <span className="badge badge-danger" style={{ marginRight: 4 }}>H1</span>}
                              <StatusBadge status={sale.status} />
                              {sale.status === 'quick' && (
                                <button className="btn btn-ghost btn-sm" onClick={() => setConverting(pending.find((p) => p.id === sale.id) || sale)}>Bill</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 16, background: '#eef2ff', color: '#3730a3' }}>
            <Clock size={18} />
            <span>Every sale is already recorded and stock is deducted. Bill them here whenever you have time.</span>
          </div>
          <div className="card">
            {pending.length === 0 ? (
              <div className="empty-state"><CheckCheck size={44} /><h3>Nothing pending</h3><p>Every recorded sale has been billed.</p></div>
            ) : (
              <>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>
                          <input type="checkbox" aria-label="Select all"
                            checked={selectedIds.length === pending.length}
                            onChange={(e) => setSelected(e.target.checked ? Object.fromEntries(pending.map((s) => [s.id, true])) : {})} />
                        </th>
                        <th>Sale date</th><th>Items</th><th style={{ textAlign: 'right' }}>Amount</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pending.map((sale) => (
                        <tr key={sale.id}>
                          <td><input type="checkbox" aria-label="Select sale" checked={!!selected[sale.id]}
                            onChange={() => setSelected((s) => ({ ...s, [sale.id]: !s[sale.id] }))} /></td>
                          <td style={{ whiteSpace: 'nowrap' }}>{formatDDMMYYYY(sale.saleDate)}</td>
                          <td>
                            {sale.items.map((item) => (
                              <div key={item.id} style={{ fontSize: 14 }}>
                                {item.productName} × {item.quantityLabel}
                                {item.batchNumber && <span style={{ color: '#6b7280', fontSize: 12 }}> — {item.batchNumber}</span>}
                              </div>
                            ))}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{sale.totalAmount != null ? formatINR(sale.totalAmount) : '—'}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => setConverting(sale)}>Create Bill</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {selectedIds.length > 0 && (
                  <div style={{ padding: 16, display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center', borderTop: '1px solid #f1f5f9' }}>
                    <span style={{ color: '#6b7280' }}>{selectedIds.length} selected</span>
                    <button className="btn btn-primary" disabled={saving} onClick={convertSelected}>{saving ? 'Billing…' : 'Bill Selected'}</button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {converting && <ConvertModal sale={converting} saving={saving} onClose={() => setConverting(null)} onConfirm={convertOne} />}
    </div>
  );
}
