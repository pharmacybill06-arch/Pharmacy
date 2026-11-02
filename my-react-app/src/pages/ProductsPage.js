import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { productApi, distributorApi } from '../services/api';
import {
  Package, Search, Plus, Edit, Trash2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X, ShoppingCart,
  Sparkles, GitMerge, AlertCircle, CheckCircle2, HelpCircle, PlusCircle, Info, Bookmark,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDDMMYYYY } from '../utils/dateFormat';

const LIMIT = 25;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function expiryColor(days) {
  if (days === null || days === undefined) return '#94a3b8';
  if (days < 90) return '#ef4444';
  if (days < 180) return '#f59e0b';
  return '#10b981';
}

function ExpiryText({ date, days }) {
  return days !== null && days !== undefined
    ? <span style={{ color: expiryColor(days) }}>Exp: {date} · {days}d left</span>
    : <span style={{ color: '#94a3b8' }}>Exp: {date || 'Unknown'}</span>;
}

function Modal({ title, onClose, children, footer, width = 480 }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

function ExpiryMonthModal({ value, onClose, onSelect }) {
  const [year, setYear] = useState(value ? Number(value.split('-')[1]) : new Date().getFullYear());
  return (
    <Modal title="Expiring in" onClose={onClose} width={360}
      footer={value && <button className="btn btn-secondary" onClick={() => { onSelect(null); onClose(); }}>Clear</button>}>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginBottom: 12 }}>
        <button className="btn btn-ghost btn-icon" aria-label="Previous year" onClick={() => setYear((y) => y - 1)}><ChevronLeft size={18} /></button>
        <strong>{year}</strong>
        <button className="btn btn-ghost btn-icon" aria-label="Next year" onClick={() => setYear((y) => y + 1)}><ChevronRight size={18} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {MONTHS.map((name, i) => {
          const key = `${String(i + 1).padStart(2, '0')}-${year}`;
          return (
            <button key={key} className={`btn btn-sm ${value === key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { onSelect(key); onClose(); }}>{name}</button>
          );
        })}
      </div>
    </Modal>
  );
}

function ReceivedRangeModal({ from, to, onClose, onApply }) {
  const [f, setF] = useState(from || '');
  const [t, setT] = useState(to || '');
  return (
    <Modal title="Received on" onClose={onClose} width={400}
      footer={<>
        <button className="btn btn-secondary" onClick={() => { onApply(null, null); onClose(); }}>Clear</button>
        <button className="btn btn-primary" onClick={() => { onApply(f || null, t || null); onClose(); }}>Apply</button>
      </>}>
      <div className="form-row">
        <div className="form-group"><label className="form-label">From</label>
          <input type="date" className="form-input" value={f} onChange={(e) => setF(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">To</label>
          <input type="date" className="form-input" value={t} onChange={(e) => setT(e.target.value)} /></div>
      </div>
    </Modal>
  );
}

function DistributorModal({ distributors, selectedIds, onClose, onApply }) {
  const [sel, setSel] = useState(selectedIds);
  const [q, setQ] = useState('');
  const shown = distributors.filter((d) => d.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title="Distributor" onClose={onClose} width={440}
      footer={<>
        <button className="btn btn-secondary" onClick={() => { onApply([]); onClose(); }}>Clear</button>
        <button className="btn btn-primary" onClick={() => { onApply(sel); onClose(); }}>Apply</button>
      </>}>
      <div className="search-bar" style={{ marginBottom: 8 }}>
        <Search size={16} />
        <input className="form-input" placeholder="Search distributors…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {shown.map((d) => (
        <label key={d.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 4px', cursor: 'pointer' }}>
          <input type="checkbox" checked={sel.includes(d.id)}
            onChange={() => setSel((p) => (p.includes(d.id) ? p.filter((x) => x !== d.id) : [...p, d.id]))} />
          {d.name}
        </label>
      ))}
      {shown.length === 0 && <p style={{ color: '#6b7280' }}>No distributors found</p>}
    </Modal>
  );
}

function MergeConfirmModal({ products, merging, onClose, onConfirm }) {
  // Default to whichever has more batches — usually the more established entry
  const [survivorId, setSurvivorId] = useState(products[0].batchCount >= products[1].batchCount ? products[0].id : products[1].id);
  const duplicate = products.find((p) => p.id !== survivorId);
  return (
    <Modal title="Merge Products" onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" disabled={merging} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={merging} onClick={() => onConfirm(survivorId, duplicate.id)}>{merging ? 'Merging…' : 'Merge'}</button>
      </>}>
      <p style={{ marginBottom: 10, color: '#4b5563' }}>Which one do you want to keep?</p>
      {products.map((p) => (
        <label key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, marginBottom: 6, borderRadius: 8, cursor: 'pointer',
          border: `1px solid ${p.id === survivorId ? '#4f46e5' : '#e5e7eb'}`, background: p.id === survivorId ? '#eef2ff' : '#fff' }}>
          <input type="radio" name="survivor" checked={p.id === survivorId} onChange={() => setSurvivorId(p.id)} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{p.name}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{p.batchCount} batch{p.batchCount === 1 ? '' : 'es'}</div>
          </div>
          {p.id === survivorId && <span className="badge badge-success">Keep</span>}
        </label>
      ))}
      <div style={{ display: 'flex', gap: 8, padding: 10, borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: 13, marginTop: 8 }}>
        <Info size={16} style={{ flexShrink: 0 }} />
        <span>“{duplicate?.name}” will be archived, not deleted. Its batches and purchase history move to the product you keep.</span>
      </div>
    </Modal>
  );
}

const VERDICTS = {
  match: { Icon: CheckCircle2, color: '#047857', bg: '#ecfdf5', title: 'This looks like a product you already have' },
  unsure: { Icon: HelpCircle, color: '#b45309', bg: '#fffbeb', title: 'Possible matches — your call' },
  new: { Icon: PlusCircle, color: '#1d4ed8', bg: '#eff6ff', title: 'Looks like a genuinely new medicine' },
};

/**
 * "What is this product?" — AI identification for a catalog entry auto-created from a
 * garbled OCR name. The AI only suggests: the pharmacist merges it into the real
 * product, or confirms it is new, optionally accepting the corrected details.
 */
function IdentifyModal({ state, onClose, onMerge, onSaveAsNew }) {
  const { product, result, isLoading, error, isApplying } = state;
  const ai = result?.ai;
  const verdict = ai ? VERDICTS[ai.verdict] || VERDICTS.unsure : null;
  const corrected = ai?.likelyRealName && ai.likelyRealName.toLowerCase() !== product.name.toLowerCase() ? ai.likelyRealName : null;
  return (
    <Modal title="What is this product?" onClose={onClose} width={560}
      footer={<button className="btn btn-secondary" disabled={isApplying} onClick={onClose}>Close</button>}>
      <p style={{ fontWeight: 700, marginBottom: 10 }}>{product.name}</p>
      {isLoading && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#6b7280' }}>
          <div className="spinner" style={{ width: 18, height: 18 }} /> Checking this against your catalog and its purchase history…
        </div>
      )}
      {error && !isLoading && (
        <div style={{ display: 'flex', gap: 8, padding: 10, borderRadius: 8, background: '#fef2f2', color: '#b91c1c' }}><AlertCircle size={16} /> {error}</div>
      )}
      {ai && !isLoading && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 10, borderRadius: 8, background: verdict.bg, color: verdict.color, fontWeight: 600, marginBottom: 8 }}>
            <verdict.Icon size={18} /> {verdict.title}
          </div>
          {ai.reasoning && <p style={{ fontSize: 14, color: '#4b5563', marginBottom: 12 }}>{ai.reasoning}</p>}
          {ai.matches.length > 0 && (
            <>
              <div className="form-label">{ai.matches.length === 1 ? 'Suggested match' : 'Suggested matches'}</div>
              {ai.matches.map((m) => (
                <div key={m.productId} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{m.name}</strong>
                    <span className={`badge ${m.confidence >= 0.7 ? 'badge-success' : 'badge-warning'}`}>{Math.round(m.confidence * 100)}%</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{[m.manufacturer, m.salt, `stock ${m.stock}`].filter(Boolean).join(' · ')}</div>
                  {m.reason && <div style={{ fontSize: 13, color: '#4b5563', margin: '4px 0' }}>{m.reason}</div>}
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 6 }} disabled={isApplying} onClick={() => onMerge(m)}>
                    <GitMerge size={14} /> {isApplying ? 'Merging…' : `Merge into “${m.name}”`}
                  </button>
                </div>
              ))}
            </>
          )}
          {result.nameCollision && (
            <div style={{ padding: 10, borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: 13, marginBottom: 8 }}>
              You already have a product named “{result.nameCollision.name}”. Renaming would clash with it — merge into it instead.
              <div><button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} disabled={isApplying}
                onClick={() => onMerge({ productId: result.nameCollision.id, name: result.nameCollision.name })}>Merge into “{result.nameCollision.name}”</button></div>
            </div>
          )}
          <div className="form-label" style={{ marginTop: 8 }}>Or keep it as its own product</div>
          {(corrected || ai.salt || ai.manufacturer) && !result.nameCollision ? (
            <div style={{ padding: 10, borderRadius: 8, background: '#f8fafc', fontSize: 13, marginBottom: 8 }}>
              <div style={{ color: '#6b7280', marginBottom: 4 }}>Saving will also apply what the AI worked out:</div>
              {corrected && <div>Name: <strong>{corrected}</strong></div>}
              {ai.salt && <div>Salt: <strong>{ai.salt}</strong></div>}
              {ai.manufacturer && <div>Manufacturer: <strong>{ai.manufacturer}</strong></div>}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>Keeps “{product.name}” exactly as it is, with its batches and stock untouched.</p>
          )}
          <button className="btn btn-secondary btn-sm" disabled={isApplying}
            onClick={() => onSaveAsNew({ name: result.nameCollision ? null : corrected, salt: ai.salt, manufacturer: ai.manufacturer })}>
            <Bookmark size={14} /> {isApplying ? 'Saving…' : corrected && !result.nameCollision ? 'Save as a new product (corrected)' : 'Save as a new product'}
          </button>
          <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 10 }}>
            AI suggestion from {result.candidatesConsidered} catalog {result.candidatesConsidered === 1 ? 'entry' : 'entries'} and this product's invoice history. Always check against the physical pack before merging.
          </p>
        </>
      )}
    </Modal>
  );
}

const NO_IDENTIFY = { product: null, result: null, isLoading: false, error: null, isApplying: false };

/**
 * Batch-aware product list — web counterpart of mobile ProductsListScreen: one search box
 * across name/batch/invoice, distributor + expiry-month + received-date filters, FEFO
 * sort, expand-in-place batches, merge duplicates, and AI identification.
 */
export default function ProductsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [distributorIds, setDistributorIds] = useState([]);
  const [expiryMonth, setExpiryMonth] = useState(null);
  const [receivedFrom, setReceivedFrom] = useState(null);
  const [receivedTo, setReceivedTo] = useState(null);
  const [sort, setSort] = useState('fefo');

  const [distributors, setDistributors] = useState([]);
  const [modal, setModal] = useState(null); // distributor | month | range
  const [expandedId, setExpandedId] = useState(null);

  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState([]);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const [candidateCount, setCandidateCount] = useState(0);
  const [identify, setIdentify] = useState(NO_IDENTIFY);
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async (page = 1) => {
    if (!user?.id) return;
    const mine = ++seq.current;
    page === 1 ? setLoading(true) : setLoadingMore(true);
    setError(null);
    try {
      const res = await productApi.getEnrichedProducts(user.id, {
        page, limit: LIMIT, search, distributorIds, expiryMonth, receivedFrom, receivedTo, sort,
      });
      if (mine !== seq.current) return;
      setProducts((prev) => (page === 1 ? res.products || [] : [...prev, ...(res.products || [])]));
      setPagination(res.pagination || { page, total: 0, hasMore: false });
    } catch (err) {
      if (mine === seq.current) setError(err.message || 'Failed to load products');
    } finally {
      if (mine === seq.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [user?.id, search, distributorIds, expiryMonth, receivedFrom, receivedTo, sort]);

  useEffect(() => { load(1); }, [load]);

  useEffect(() => {
    if (!user?.id) return;
    distributorApi.getDistributors(user.id).then((r) => setDistributors(r.distributors || [])).catch(() => {});
  }, [user?.id]);

  // Heuristic duplicate-name suggestions: a nudge towards merge mode, never auto-merged
  useEffect(() => {
    if (!user?.id) return;
    productApi.getMergeCandidates(user.id).then((r) => setCandidateCount(r.suggestions?.length || 0)).catch(() => {});
  }, [user?.id, products.length]);

  const distributorName = useMemo(() => new Map(distributors.map((d) => [d.id, d.name])), [distributors]);
  const activeFilterCount = distributorIds.length + (expiryMonth ? 1 : 0) + (receivedFrom || receivedTo ? 1 : 0);

  const clearAll = () => { setDistributorIds([]); setExpiryMonth(null); setReceivedFrom(null); setReceivedTo(null); };

  const remove = async (p) => {
    if (!window.confirm(`Delete “${p.name}”?`)) return;
    try {
      await productApi.deleteProduct(user.id, p.id);
      toast.success('Product deleted');
      load(1);
    } catch (err) {
      toast.error(err.message || 'Failed to delete product');
    }
  };

  const toggleMerge = () => { setMergeMode((m) => !m); setMergeSelection([]); setExpandedId(null); };

  const toggleSelect = (p) => setMergeSelection((prev) => {
    if (prev.find((x) => x.id === p.id)) return prev.filter((x) => x.id !== p.id);
    return prev.length >= 2 ? [prev[1], p] : [...prev, p]; // rolling selection — keep it to 2
  });

  const confirmMerge = async (survivorId, duplicateId) => {
    setMerging(true);
    try {
      await productApi.mergeProducts(user.id, survivorId, duplicateId);
      setMergeOpen(false); setMergeMode(false); setMergeSelection([]);
      toast.success('The duplicate product has been merged and archived.');
      load(1);
    } catch (err) {
      toast.error(err.message || 'Failed to merge products');
    } finally {
      setMerging(false);
    }
  };

  const openIdentify = async (product) => {
    setIdentify({ ...NO_IDENTIFY, product, isLoading: true });
    try {
      const res = await productApi.identifyProduct(user.id, product.id);
      setIdentify((s) => (s.product?.id === product.id ? { ...s, result: res, isLoading: false } : s));
    } catch (err) {
      setIdentify((s) => (s.product?.id === product.id ? { ...s, isLoading: false, error: err.message || 'Could not identify this product right now.' } : s));
    }
  };

  // The OCR ghost is always the duplicate; the established catalog entry survives
  const identifyMerge = async (match) => {
    const ghost = identify.product;
    setIdentify((s) => ({ ...s, isApplying: true }));
    try {
      await productApi.mergeProducts(user.id, match.productId, ghost.id);
      setIdentify(NO_IDENTIFY);
      toast.success(`“${ghost.name}” was merged into “${match.name}” and archived.`);
      load(1);
    } catch (err) {
      setIdentify((s) => ({ ...s, isApplying: false }));
      toast.error(err.message || 'Failed to merge products');
    }
  };

  const identifySave = async ({ name, salt, manufacturer }) => {
    const product = identify.product;
    const updates = {};
    if (name) updates.name = name;
    if (salt) updates.salt = salt;
    if (manufacturer) updates.manufacturer = manufacturer;
    if (!Object.keys(updates).length) {
      setIdentify(NO_IDENTIFY);
      toast.success(`“${product.name}” stays in your catalog as its own product.`);
      return;
    }
    setIdentify((s) => ({ ...s, isApplying: true }));
    try {
      await productApi.updateProduct(user.id, product.id, updates);
      setIdentify(NO_IDENTIFY);
      toast.success(`Saved as “${updates.name || product.name}” in your product catalog.`);
      load(1);
    } catch (err) {
      setIdentify((s) => ({ ...s, isApplying: false }));
      toast.error(err.message || 'Failed to save the product');
    }
  };

  const chip = (active) => `btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Products ({pagination.total})</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn ${mergeMode ? 'btn-primary' : 'btn-secondary'}`} onClick={toggleMerge}>
            <GitMerge size={16} /> {mergeMode ? 'Cancel merge' : 'Merge duplicates'}
          </button>
          <Link to="/products/new" className="btn btn-primary"><Plus size={16} /> Add Product</Link>
        </div>
      </div>

      <div className="search-bar" style={{ marginBottom: 12, maxWidth: 460 }}>
        <Search size={16} />
        <input className="form-input" placeholder="Search by name, batch or invoice #..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <button className={chip(distributorIds.length > 0)} onClick={() => setModal('distributor')}>Distributor{distributorIds.length ? ` (${distributorIds.length})` : ''}</button>
        <button className={chip(!!expiryMonth)} onClick={() => setModal('month')}>Expiring in{expiryMonth ? `: ${expiryMonth}` : ''}</button>
        <button className={chip(!!(receivedFrom || receivedTo))} onClick={() => setModal('range')}>Received on</button>
        <span style={{ width: 1, height: 22, background: '#e5e7eb', margin: '0 4px' }} />
        <button className={chip(sort === 'fefo')} onClick={() => setSort('fefo')}>Earliest expiry</button>
        <button className={chip(sort === 'name')} onClick={() => setSort('name')}>A-Z</button>
      </div>

      {activeFilterCount > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {distributorIds.map((id) => (
            <button key={id} className="badge badge-primary" style={{ border: 'none', cursor: 'pointer' }} onClick={() => setDistributorIds(distributorIds.filter((x) => x !== id))}>
              {distributorName.get(id) || id} ×
            </button>
          ))}
          {expiryMonth && <button className="badge badge-primary" style={{ border: 'none', cursor: 'pointer' }} onClick={() => setExpiryMonth(null)}>Exp {expiryMonth} ×</button>}
          {(receivedFrom || receivedTo) && (
            <button className="badge badge-primary" style={{ border: 'none', cursor: 'pointer' }} onClick={() => { setReceivedFrom(null); setReceivedTo(null); }}>
              Received {receivedFrom ? formatDDMMYYYY(receivedFrom) : '…'} – {receivedTo ? formatDDMMYYYY(receivedTo) : '…'} ×
            </button>
          )}
          {activeFilterCount >= 2 && <button className="btn btn-ghost btn-sm" onClick={clearAll}>Clear all</button>}
        </div>
      )}

      {!mergeMode && candidateCount > 0 && (
        <button onClick={toggleMerge} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', marginBottom: 12, borderRadius: 8, border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', cursor: 'pointer', textAlign: 'left' }}>
          <AlertCircle size={16} />
          <span style={{ flex: 1 }}>{candidateCount} possible duplicate {candidateCount === 1 ? 'pair' : 'pairs'} found — click to review</span>
          <ChevronRight size={14} />
        </button>
      )}

      {mergeMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 12, borderRadius: 8, background: '#eef2ff', color: '#3730a3' }}>
          <span style={{ flex: 1 }}>Select 2 products that are the same drug ({mergeSelection.length}/2 selected)</span>
          <button className="btn btn-primary btn-sm" disabled={mergeSelection.length !== 2} onClick={() => setMergeOpen(true)}>Merge selected</button>
        </div>
      )}

      {error ? (
        <div className="card"><div className="empty-state"><AlertCircle size={40} style={{ color: '#dc2626' }} /><h3>{error}</h3>
          <button className="btn btn-primary" onClick={() => load(1)}>Retry</button></div></div>
      ) : loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : products.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Package size={48} />
            {searchInput || activeFilterCount ? (
              <><h3>No products match</h3><button className="btn btn-secondary" onClick={() => { setSearchInput(''); clearAll(); }}>Clear filters</button></>
            ) : (
              <><h3>No products yet</h3><p>Products are added automatically when you save bills, or you can add them manually.</p>
                <Link to="/products/new" className="btn btn-primary" style={{ marginTop: 16 }}><Plus size={16} /> Add Product</Link></>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="table-container">
              <table>
                <thead>
                  <tr>{mergeMode && <th style={{ width: 36 }} />}<th>Product</th><th>Earliest expiry</th><th>Distributor</th><th style={{ textAlign: 'right' }}>Batches</th><th /></tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const expanded = expandedId === p.id && !mergeMode;
                    const selected = !!mergeSelection.find((x) => x.id === p.id);
                    const match = (p.batches || []).find((b) => b.matchedSearch);
                    return (
                      <React.Fragment key={p.id}>
                        <tr style={{ cursor: 'pointer', background: selected ? '#eef2ff' : undefined }}
                          onClick={() => (mergeMode ? toggleSelect(p) : setExpandedId(expanded ? null : p.id))}>
                          {mergeMode && <td><input type="checkbox" readOnly checked={selected} aria-label={`Select ${p.name}`} /></td>}
                          <td>
                            <div style={{ fontWeight: 600 }}>{p.name}</div>
                            {match && <div style={{ fontSize: 12, color: '#4f46e5' }}>Invoice #{match.invoiceNumber} · {match.distributorName} · {match.invoiceDate || ''}</div>}
                          </td>
                          <td style={{ fontSize: 13 }}><ExpiryText date={p.earliestExpiry} days={p.daysToEarliestExpiry} /></td>
                          <td style={{ fontSize: 13, color: '#4b5563' }}>
                            {p.distributors?.length === 1 ? p.distributors[0] : p.distributors?.length > 1 ? `${p.distributors.length} distributors` : 'No distributor on record'}
                          </td>
                          <td style={{ textAlign: 'right' }}>{p.batchCount}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                            {!mergeMode && (
                              <>
                                <button className="btn btn-ghost btn-icon btn-sm" title="Sell" aria-label="Sell" onClick={() => navigate('/sales/new', { state: { product: p } })}><ShoppingCart size={14} style={{ color: '#4f46e5' }} /></button>
                                <button className="btn btn-ghost btn-icon btn-sm" title="What is this product?" aria-label="What is this product?" onClick={() => openIdentify(p)}><Sparkles size={14} style={{ color: '#7c3aed' }} /></button>
                                <Link to={`/products/${p.id}/edit`} className="btn btn-ghost btn-icon btn-sm" title="Edit" aria-label="Edit"><Edit size={14} /></Link>
                                <button className="btn btn-ghost btn-icon btn-sm" title="Delete" aria-label="Delete" onClick={() => remove(p)}><Trash2 size={14} style={{ color: '#dc2626' }} /></button>
                                <button className="btn btn-ghost btn-icon btn-sm" aria-label={expanded ? 'Collapse' : 'Expand'} onClick={() => setExpandedId(expanded ? null : p.id)}>
                                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={5} style={{ background: '#f8fafc', padding: 0 }}>
                              <table style={{ margin: 0 }}>
                                <thead><tr><th>Batch</th><th>Qty</th><th>Expiry</th><th>Distributor</th><th>Invoice</th></tr></thead>
                                <tbody>
                                  {(p.batches || []).map((b, i) => (
                                    <tr key={`${b.billId}-${i}`} style={{ opacity: b.isArchived ? 0.6 : 1 }}>
                                      <td style={{ fontFamily: 'monospace', fontWeight: b.matchedSearch ? 700 : 400 }}>
                                        {b.batchNumber || '—'}{b.isArchived && <span className="badge badge-warning" style={{ marginLeft: 6 }}>Archived</span>}
                                      </td>
                                      <td>{b.quantity ?? '—'}</td>
                                      <td style={{ fontSize: 13 }}><ExpiryText date={b.expiryDate} days={b.daysLeft} /></td>
                                      <td style={{ fontSize: 13 }}>{b.distributorName || 'Unknown distributor'}</td>
                                      <td style={{ fontSize: 13 }}>
                                        {b.invoiceNumber ? <Link to={`/bills/${b.billId}`}>#{b.invoiceNumber}</Link> : '—'}{b.invoiceDate ? ` · ${b.invoiceDate}` : ''}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {pagination.hasMore && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button className="btn btn-secondary" disabled={loadingMore} onClick={() => load(pagination.page + 1)}>{loadingMore ? 'Loading…' : 'Load more'}</button>
            </div>
          )}
        </>
      )}

      {modal === 'distributor' && <DistributorModal distributors={distributors} selectedIds={distributorIds} onClose={() => setModal(null)} onApply={setDistributorIds} />}
      {modal === 'month' && <ExpiryMonthModal value={expiryMonth} onClose={() => setModal(null)} onSelect={setExpiryMonth} />}
      {modal === 'range' && <ReceivedRangeModal from={receivedFrom} to={receivedTo} onClose={() => setModal(null)} onApply={(f, t) => { setReceivedFrom(f); setReceivedTo(t); }} />}
      {mergeOpen && mergeSelection.length === 2 && <MergeConfirmModal products={mergeSelection} merging={merging} onClose={() => setMergeOpen(false)} onConfirm={confirmMerge} />}
      {identify.product && <IdentifyModal state={identify} onClose={() => setIdentify(NO_IDENTIFY)} onMerge={identifyMerge} onSaveAsNew={identifySave} />}
    </div>
  );
}
