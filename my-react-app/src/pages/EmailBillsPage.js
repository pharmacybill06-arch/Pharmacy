import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { emailBillApi } from '../services/api';
import {
  Mail, Download, RefreshCw, CheckCircle, XCircle, MinusCircle,
  Clock, AlertTriangle, FileText, Loader2, MailOpen, ChevronDown, ChevronUp
} from 'lucide-react';
import toast from 'react-hot-toast';

const statusConfig = {
  processed: { icon: CheckCircle, color: '#22c55e', bg: 'rgba(34,197,94,0.1)', label: 'Processed' },
  failed:    { icon: XCircle,    color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Failed' },
  skipped:   { icon: MinusCircle, color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', label: 'Skipped' },
};

export default function EmailBillsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [expandedLog, setExpandedLog] = useState(null);
  const [stats, setStats] = useState({ processed: 0, failed: 0, skipped: 0, totalBills: 0 });

  const loadLogs = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const result = await emailBillApi.getLogs();
      setLogs(result.data || []);

      // Calculate stats
      const data = result.data || [];
      setStats({
        processed: data.filter(l => l.status === 'processed').length,
        failed: data.filter(l => l.status === 'failed').length,
        skipped: data.filter(l => l.status === 'skipped').length,
        totalBills: data.reduce((sum, l) => sum + (l.billsCreated || 0), 0),
      });
    } catch (err) {
      console.error('Failed to load email logs:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleFetchEmails = async () => {
    if (!user?.id) return;
    setFetching(true);
    try {
      const result = await emailBillApi.fetchAndProcess(user.id);
      toast.success(result.message || 'Emails processed!');
      await loadLogs();
    } catch (err) {
      toast.error(err.message || 'Failed to fetch emails');
    } finally {
      setFetching(false);
    }
  };

  const handleRetry = async (logId) => {
    if (!user?.id) return;
    try {
      await emailBillApi.retryEmail(logId, user.id);
      toast.success('Retry completed');
      await loadLogs();
    } catch (err) {
      toast.error(err.message || 'Retry failed');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ padding: 0 }}>
      {/* Page Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 24, flexWrap: 'wrap', gap: 12
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Mail size={24} style={{ color: 'var(--primary)' }} />
            Email Bills
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>
            Extract invoices from your Zoho Mail inbox
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleFetchEmails}
          disabled={fetching}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', fontSize: 14, fontWeight: 600,
            borderRadius: 8, border: 'none', cursor: fetching ? 'not-allowed' : 'pointer',
            background: fetching ? 'var(--bg-secondary)' : 'var(--primary)',
            color: '#fff', transition: 'all 0.2s',
          }}
        >
          {fetching ? (
            <><Loader2 size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> Fetching...</>
          ) : (
            <><Download size={18} /> Fetch Emails</>
          )}
        </button>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12, marginBottom: 24
      }}>
        {[
          { label: 'Total Bills', value: stats.totalBills, icon: FileText, color: '#6366f1' },
          { label: 'Processed', value: stats.processed, icon: CheckCircle, color: '#22c55e' },
          { label: 'Failed', value: stats.failed, icon: XCircle, color: '#ef4444' },
          { label: 'Skipped', value: stats.skipped, icon: MinusCircle, color: '#94a3b8' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--bg-secondary)', borderRadius: 10, padding: '16px 18px',
            display: 'flex', alignItems: 'center', gap: 12,
            border: '1px solid var(--border)',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: `${stat.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <stat.icon size={20} style={{ color: stat.color }} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Email Logs Table */}
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 12,
        border: '1px solid var(--border)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Processing History</h3>
          <button onClick={loadLogs} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13,
          }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            Loading logs...
          </div>
        ) : logs.length === 0 ? (
          <div style={{
            padding: 60, textAlign: 'center', color: 'var(--text-secondary)',
          }}>
            <MailOpen size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
            <p style={{ fontSize: 16, fontWeight: 500, margin: '0 0 6px' }}>No emails processed yet</p>
            <p style={{ fontSize: 13, margin: 0 }}>Click "Fetch Emails" to scan your Zoho Mail inbox</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Subject</th>
                  <th style={thStyle}>Sender</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Bills</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const config = statusConfig[log.status] || statusConfig.skipped;
                  const StatusIcon = config.icon;
                  const isExpanded = expandedLog === log.id;

                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        style={{
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                        onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover, rgba(0,0,0,0.02))'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            <span style={{ fontWeight: 500, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                              {log.subject || '(no subject)'}
                            </span>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                            {log.sender || '—'}
                          </span>
                        </td>
                        <td style={tdStyle}>{formatDate(log.emailDate || log.processedAt)}</td>
                        <td style={tdStyle}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                            background: config.bg, color: config.color,
                          }}>
                            <StatusIcon size={12} /> {config.label}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontWeight: 600 }}>{log.billsCreated || 0}</span>
                        </td>
                        <td style={tdStyle}>
                          {log.status === 'failed' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRetry(log.id); }}
                              style={{
                                background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 6,
                                padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4,
                              }}
                            >
                              <RefreshCw size={12} /> Retry
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} style={{
                            padding: '12px 18px', background: 'var(--bg-tertiary, rgba(0,0,0,0.02))',
                            borderBottom: '1px solid var(--border)',
                          }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                              <div><strong>Message ID:</strong> {log.messageId}</div>
                              <div><strong>Attachments:</strong> {log.attachments || 0}</div>
                              <div><strong>Processed at:</strong> {formatDate(log.processedAt)}</div>
                              <div><strong>Bills Created:</strong> {log.billsCreated || 0}</div>
                              {log.errorMessage && (
                                <div style={{ gridColumn: '1 / -1', color: '#ef4444', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                                  <span>{log.errorMessage}</span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inline animation for spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const thStyle = {
  padding: '10px 14px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 12,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const tdStyle = {
  padding: '10px 14px',
  verticalAlign: 'middle',
};
