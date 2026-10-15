import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { exportApi, distributorApi } from '../services/api';
import { ArrowLeft, ChevronRight, Receipt, AlertCircle, ShoppingCart, Wallet, Download, CheckCircle2, Info, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDDMMYYYY, formatDDMMYYYYOr } from '../utils/dateFormat';

/**
 * Export Data — Excel/CSV export. Web counterpart of mobile ExportScreen: pick a type,
 * set filters, choose a format. The row count is shown before generating; on web the
 * finished file is a normal browser download instead of the share sheet.
 */
const EXPORT_TYPES = [
  { key: 'purchases', title: 'Purchase Entries', subtitle: 'For import into Marg, Logic, Tally',
    detail: 'One row per bill line, plus a GST summary sheet for your accountant.', Icon: Receipt, color: '#4f46e5', bg: '#eef2ff',
    hasDateRange: true, hasDistributor: true },
  { key: 'expiry', title: 'Expiry Report', subtitle: 'The return list for your distributor',
    detail: 'Product, batch, expiry and quantity — optionally one sheet per distributor.', Icon: AlertCircle, color: '#d97706', bg: '#fef3c7',
    hasExpiryWindow: true, hasGrouping: true },
  { key: 'sales', title: 'Sale Register', subtitle: 'Daily sales, with the H1 register',
    detail: 'Date, product, batch, quantity and price. Filter to Schedule H1/NRX only.', Icon: ShoppingCart, color: '#059669', bg: '#ecfdf5',
    hasDateRange: true, hasScheduleFilter: true },
  { key: 'ledger', title: 'Distributor Ledger', subtitle: 'Statement and payment list',
    detail: 'One distributor per workbook: running balance, then every payment.', Icon: Wallet, color: '#dc2626', bg: '#fef2f2',
    requiresDistributor: true },
];

const EXPIRY_WINDOWS = [30, 60, 90, 180, null];
const PRESETS = [{ key: 'today', label: 'Today' }, { key: 'week', label: 'This week' }, { key: 'month', label: 'This month' }, { key: 'custom', label: 'Custom' }];

function toIso(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function presetRange(preset) {
  const now = new Date();
  const today = toIso(now);
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'week') {
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    return { from: toIso(monday), to: today };
  }
  if (preset === 'month') return { from: toIso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  return { from: null, to: null };
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', cursor: 'pointer' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: '#6b7280' }}>{hint}</div>}
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18 }} />
    </label>
  );
}

function Chips({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <button key={String(o.key)} type="button" className={`btn btn-sm ${value === o.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => onChange(o.key)}>{o.label}</button>
      ))}
    </div>
  );
}

export default function ExportsPage() {
  const { user } = useAuth();
  const [distributors, setDistributors] = useState([]);
  const [history, setHistory] = useState([]);
  const [type, setType] = useState(null);
  const [preset, setPreset] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [withinDays, setWithinDays] = useState(90);
  const [groupByDistributor, setGroupByDistributor] = useState(false);
  const [scheduleOnly, setScheduleOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [distributorIds, setDistributorIds] = useState([]);
  const [distQuery, setDistQuery] = useState('');
  const [format, setFormat] = useState('xlsx');
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadHistory = () => user?.id && exportApi.getHistory(user.id).then((r) => setHistory(r.logs || [])).catch(() => {});

  useEffect(() => {
    if (!user?.id) return;
    distributorApi.getDistributors(user.id).then((r) => setDistributors(r.distributors || [])).catch(() => {});
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const config = EXPORT_TYPES.find((t) => t.key === type);

  const filters = useMemo(() => {
    if (!config) return {};
    const range = preset === 'custom' ? { from: customFrom || null, to: customTo || null } : presetRange(preset);
    const f = { includeArchived };
    if (config.hasDateRange) { if (range.from) f.from = range.from; if (range.to) f.to = range.to; }
    if (config.hasExpiryWindow && withinDays !== null) f.withinDays = withinDays;
    if (config.hasGrouping) f.groupByDistributor = groupByDistributor;
    if (config.hasScheduleFilter && scheduleOnly) f.scheduleOnly = true;
    if (config.hasDistributor && distributorIds.length) f.distributorIds = distributorIds;
    if (config.requiresDistributor && distributorIds.length) f.distributorId = distributorIds[0];
    return f;
  }, [config, preset, customFrom, customTo, withinDays, groupByDistributor, scheduleOnly, includeArchived, distributorIds]);

  const missingDistributor = !!config?.requiresDistributor && distributorIds.length === 0;

  // Refresh the row count whenever the filters change
  useEffect(() => {
    if (!config || missingDistributor || !user?.id) { setPreview(null); return undefined; }
    let cancelled = false;
    setPreviewLoading(true);
    const t = setTimeout(async () => {
      const res = await exportApi.preview(user.id, type, filters).catch((err) => ({ summary: err.message, rowCount: 0 }));
      if (!cancelled) { setPreview(res); setPreviewLoading(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [config, type, filters, missingDistributor, user?.id]);

  const pick = (key) => {
    setType(key);
    setPreset('month'); setCustomFrom(''); setCustomTo(''); setWithinDays(90);
    setGroupByDistributor(false); setScheduleOnly(false); setIncludeArchived(false);
    setDistributorIds([]); setDistQuery(''); setFormat('xlsx'); setPreview(null);
  };

  const toggleDistributor = (id) => {
    if (config.requiresDistributor) setDistributorIds([id]);
    else setDistributorIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await exportApi.generate(user.id, type, filters, format);
      toast.success(`Downloaded ${res.fileName}${res.rowCount ? ` · ${res.rowCount} rows` : ''}`);
      loadHistory();
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      setGenerating(false);
    }
  };

  if (!config) {
    return (
      <div style={{ maxWidth: 900 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Export Data</h2>
        <p style={{ color: '#6b7280', marginBottom: 24 }}>Take your data out as a clean Excel file — for your ERP, your accountant, or your distributor.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 32 }}>
          {EXPORT_TYPES.map(({ key, title, subtitle, detail, Icon, color, bg }) => (
            <button key={key} type="button" className="card" onClick={() => pick(key)}
              style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: 18, textAlign: 'left', cursor: 'pointer', border: '1px solid #e5e7eb' }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: bg, color, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon size={22} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{title}</div>
                <div style={{ fontSize: 13, color: '#4b5563' }}>{subtitle}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{detail}</div>
              </div>
              <ChevronRight size={18} style={{ color: '#cbd5e1' }} />
            </button>
          ))}
        </div>

        {history.length > 0 && (
          <div className="card">
            <div className="card-header"><h3>Recent Exports</h3></div>
            <div className="table-container">
              <table>
                <thead><tr><th>Date</th><th>Type</th><th>File</th><th style={{ textAlign: 'right' }}>Rows</th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>{formatDDMMYYYYOr(h.createdAt, '—')}</td>
                      <td>{EXPORT_TYPES.find((t) => t.key === h.exportType)?.title || h.exportType}<span style={{ color: "#9ca3af", fontSize: 12 }}> · {(h.format || "").toUpperCase()}</span></td>
                      <td style={{ fontSize: 13 }}>{h.fileName || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{h.rowCount ?? '—'}</td>
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

  const noData = preview && preview.rowCount === 0;
  const range = presetRange(preset);
  const shownDistributors = distributors.filter((d) => d.name.toLowerCase().includes(distQuery.toLowerCase()));

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost btn-icon" onClick={() => setType(null)} aria-label="Back"><ArrowLeft size={20} /></button>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>{config.title}</h2>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: 'grid', gap: 20 }}>
          {config.hasDateRange && (
            <div>
              <label className="form-label">Date range</label>
              <Chips options={PRESETS} value={preset} onChange={setPreset} />
              {preset === 'custom' ? (
                <div className="form-row" style={{ marginTop: 10 }}>
                  <div className="form-group"><label className="form-label">From</label><input type="date" className="form-input" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">To</label><input type="date" className="form-input" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>{formatDDMMYYYY(range.from)} to {formatDDMMYYYY(range.to)}</div>
              )}
            </div>
          )}

          {config.hasExpiryWindow && (
            <div>
              <label className="form-label">Expiring within</label>
              <Chips options={EXPIRY_WINDOWS.map((d) => ({ key: d, label: d ? `${d} days` : 'All' }))} value={withinDays} onChange={setWithinDays} />
            </div>
          )}

          {(config.hasDistributor || config.requiresDistributor) && (
            <div>
              <label className="form-label">
                Distributor{config.requiresDistributor ? '' : ' (optional — none selected means all)'}
              </label>
              <div className="search-bar" style={{ marginBottom: 8 }}>
                <Search size={16} />
                <input className="form-input" placeholder="Search distributors…" value={distQuery} onChange={(e) => setDistQuery(e.target.value)} />
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                {shownDistributors.map((d) => (
                  <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                    background: distributorIds.includes(d.id) ? '#eef2ff' : undefined }}>
                    <input type={config.requiresDistributor ? 'radio' : 'checkbox'} name="export-distributor" checked={distributorIds.includes(d.id)} onChange={() => toggleDistributor(d.id)} />
                    {d.name}
                  </label>
                ))}
                {shownDistributors.length === 0 && <div style={{ padding: 12, color: '#6b7280' }}>No distributors found</div>}
              </div>
            </div>
          )}

          <div>
            {config.hasGrouping && <Toggle label="One sheet per distributor" hint="Send each distributor only their own return list" checked={groupByDistributor} onChange={setGroupByDistributor} />}
            {config.hasScheduleFilter && <Toggle label="Schedule H1 / NRX only" hint="The register a drug inspector asks for" checked={scheduleOnly} onChange={setScheduleOnly} />}
            <Toggle label="Include archived records" hint="Off by default" checked={includeArchived} onChange={setIncludeArchived} />
          </div>

          <div>
            <label className="form-label">Format</label>
            <Chips options={[{ key: 'xlsx', label: 'Excel (.xlsx)' }, { key: 'csv', label: 'CSV' }]} value={format} onChange={setFormat} />
            {format === 'csv' && config.key === 'purchases' && <div style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>CSV holds the purchase rows only. Choose Excel to also get the GST Summary sheet.</div>}
            {format === 'csv' && config.hasGrouping && groupByDistributor && <div style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>CSV is a single sheet — choose Excel to get one sheet per distributor.</div>}
          </div>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, marginBottom: 16, background: noData || missingDistributor ? '#fffbeb' : '#f0fdf4' }}>
        {previewLoading ? <div className="spinner" style={{ width: 20, height: 20 }} />
          : missingDistributor ? <><Info size={20} style={{ color: '#b45309' }} /> Choose a distributor to continue</>
            : <>{noData ? <Info size={20} style={{ color: '#b45309' }} /> : <CheckCircle2 size={20} style={{ color: '#059669' }} />}
              <span style={{ flex: 1 }}>{preview?.summary || 'Choose your filters'}</span></>}
      </div>

      <button className="btn btn-primary" style={{ width: '100%' }} onClick={generate}
        disabled={generating || previewLoading || noData || missingDistributor}>
        <Download size={16} /> {generating ? 'Generating…' : 'Generate & Download'}
      </button>
    </div>
  );
}
