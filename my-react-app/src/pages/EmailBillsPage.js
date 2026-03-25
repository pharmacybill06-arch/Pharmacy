import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { emailBillApi } from '../services/api';
import {
  Mail, Download, RefreshCw, CheckCircle, XCircle, MinusCircle,
  Clock, AlertTriangle, FileText, Loader2, MailOpen, ChevronDown, ChevronUp,
  Inbox, Search, Zap, Paperclip, FileType, Eye, CheckSquare, Square,
  ArrowRight, Sparkles, Shield, MailCheck
} from 'lucide-react';
import toast from 'react-hot-toast';

// ============================================================================
// STATUS CONFIGS
// ============================================================================
const statusConfig = {
  processed: { icon: CheckCircle, color: '#22c55e', bg: 'rgba(34,197,94,0.1)', label: 'Processed' },
  failed:    { icon: XCircle,    color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Failed' },
  skipped:   { icon: MinusCircle, color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', label: 'Skipped' },
};

const billTypeLabels = {
  'body-text':  { label: 'In Email Body', color: '#8b5cf6', icon: FileType },
  'attachment': { label: 'In Attachment', color: '#3b82f6', icon: Paperclip },
  'both':       { label: 'Body + Attachment', color: '#f59e0b', icon: Sparkles },
  'none':       { label: 'Not a Bill', color: '#94a3b8', icon: MinusCircle },
};

const providerDefaults = {
  zoho: { imapHost: 'imap.zoho.in', imapPort: '993', imapSecure: true, mailbox: 'INBOX' },
  gmail: { imapHost: 'imap.gmail.com', imapPort: '993', imapSecure: true, mailbox: 'INBOX' },
  custom: { imapHost: '', imapPort: '993', imapSecure: true, mailbox: 'INBOX' },
};

const emptyConnectionForm = {
  provider: 'zoho',
  authType: 'imap_password',
  emailAddress: '',
  displayName: '',
  password: '',
  imapHost: 'imap.zoho.in',
  imapPort: '993',
  imapSecure: true,
  mailbox: 'INBOX',
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function EmailBillsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('inbox');  // 'inbox' or 'history'

  // Inbox state
  const [inboxEmails, setInboxEmails] = useState([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState(new Set());
  const [processing, setProcessing] = useState(false);
  const [extractingEmailId, setExtractingEmailId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [connection, setConnection] = useState(null);
  const [connectionForm, setConnectionForm] = useState(emptyConnectionForm);
  const [loadingConnection, setLoadingConnection] = useState(false);
  const [savingConnection, setSavingConnection] = useState(false);
  const [connectionChecked, setConnectionChecked] = useState(false);

  // History state
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [expandedLog, setExpandedLog] = useState(null);
  const [stats, setStats] = useState({ processed: 0, failed: 0, skipped: 0, totalBills: 0 });

  const updateConnectionField = (field, value) => {
    setConnectionForm(prev => {
      if (field === 'provider') {
        const defaults = providerDefaults[value] || providerDefaults.custom;
        return {
          ...prev,
          provider: value,
          imapHost: defaults.imapHost,
          imapPort: defaults.imapPort,
          imapSecure: defaults.imapSecure,
          mailbox: prev.mailbox || defaults.mailbox,
        };
      }
      return { ...prev, [field]: value };
    });
  };

  const loadConnection = useCallback(async () => {
    if (!user?.id) return;
    setConnectionChecked(false);
    setLoadingConnection(true);
    try {
      const result = await emailBillApi.getConnection(user.id);
      const data = result.data || null;
      setConnection(data);
      setConnectionForm(prev => ({
        ...emptyConnectionForm,
        ...prev,
        provider: data?.provider || 'zoho',
        authType: data?.authType || 'imap_password',
        emailAddress: data?.emailAddress || '',
        displayName: data?.displayName || '',
        imapHost: data?.imapHost || (providerDefaults[data?.provider || 'zoho'] || providerDefaults.custom).imapHost,
        imapPort: data?.imapPort ? String(data.imapPort) : (providerDefaults[data?.provider || 'zoho'] || providerDefaults.custom).imapPort,
        imapSecure: data?.imapSecure !== undefined ? data.imapSecure : true,
        mailbox: data?.mailbox || 'INBOX',
        password: '',
      }));
    } catch (err) {
      console.error('Failed to load email connection:', err);
      toast.error(err.message || 'Failed to load email connection');
    } finally {
      setConnectionChecked(true);
      setLoadingConnection(false);
    }
  }, [user?.id]);

  const handleSaveConnection = async (e) => {
    e.preventDefault();
    if (!user?.id) return;

    if (!connectionForm.emailAddress || !connectionForm.password) {
      toast.error('Email and app password are required');
      return;
    }

    if (!connectionForm.imapHost || !connectionForm.imapPort) {
      toast.error('IMAP host and port are required');
      return;
    }

    setSavingConnection(true);
    try {
      await emailBillApi.saveConnection({
        userId: user.id,
        ...connectionForm,
      });
      toast.success('Mailbox connection saved');
      await loadConnection();
      await loadInbox(searchQuery);
    } catch (err) {
      toast.error(err.message || 'Failed to save mailbox connection');
    } finally {
      setSavingConnection(false);
    }
  };

  // ===== INBOX FUNCTIONS =====
  const loadInbox = useCallback(async (search = '') => {
    if (!user?.id) return;
    setLoadingInbox(true);
    try {
      const result = await emailBillApi.listInbox(user.id, 30, search);
      setInboxEmails(result.data || []);
      setSelectedEmails(new Set());
    } catch (err) {
      console.error('Failed to load inbox:', err);
      if (/connection|configured|No active email inbox connection/i.test(err.message || '')) {
        setConnection(null);
      }
      toast.error(err.message || 'Failed to load inbox');
    } finally {
      setLoadingInbox(false);
    }
  }, [user?.id]);

  const handleSearch = () => {
    loadInbox(searchQuery);
  };

  const toggleEmailSelection = (messageId) => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const selectAllBills = () => {
    const billEmails = inboxEmails
      .filter(e => e.billDetection?.isBill && !e.processingStatus)
      .map(e => e.messageId);
    setSelectedEmails(new Set(billEmails));
  };

  const clearSelection = () => setSelectedEmails(new Set());

  // Extract a single email and navigate to the editable bill form
  const handleExtractEmail = async (email) => {
    if (!user?.id) return;
    setExtractingEmailId(email.messageId);

    try {
      toast.loading('Extracting bill data from email...', { id: 'extract' });
      const result = await emailBillApi.extractFromEmail(user.id, email.messageId, email.folderId);
      toast.dismiss('extract');

      if (!result.data?.parsedData) {
        toast.error('Could not extract bill data from this email');
        return;
      }

      const { parsedData, ocrText, duplicateBill, subject, source } = result.data;

      // Show duplicate warning
      if (duplicateBill) {
        const proceed = window.confirm(
          `⚠️ Duplicate Invoice Found!\n\n` +
          `Invoice #${duplicateBill.invoiceNumber} already exists in your records.\n` +
          `Distributor: ${duplicateBill.pharmacyName || 'N/A'}\n` +
          `Amount: ₹${duplicateBill.grandTotal || 'N/A'}\n` +
          `Saved on: ${new Date(duplicateBill.createdAt).toLocaleDateString('en-IN')}\n\n` +
          `Do you still want to open this bill for editing?`
        );
        if (!proceed) return;
      }

      // Navigate to the bill form with extracted data
      toast.success(`Bill extracted from ${source === 'attachment' ? 'attachment' : 'email body'} — review and save!`);
      navigate('/bill-form', {
        state: {
          parsedData,
          ocrText: ocrText || '',
          imageFile: null,
          emailSource: { messageId: email.messageId, subject, source },
        },
      });
    } catch (err) {
      toast.dismiss('extract');
      toast.error(err.message || 'Extraction failed');
    } finally {
      setExtractingEmailId(null);
    }
  };

  const handleProcessSelected = async () => {
    if (!user?.id || selectedEmails.size === 0) return;

    // If only one email selected, use extract flow (navigate to form)
    if (selectedEmails.size === 1) {
      const msgId = [...selectedEmails][0];
      const email = inboxEmails.find(e => e.messageId === msgId);
      if (email) {
        await handleExtractEmail(email);
        return;
      }
    }

    // For multiple emails, use batch processing
    setProcessing(true);
    const emailsToProcess = inboxEmails
      .filter(e => selectedEmails.has(e.messageId))
      .map(e => ({ messageId: e.messageId, folderId: e.folderId }));

    try {
      const result = await emailBillApi.processSelected(user.id, emailsToProcess);
      toast.success(result.message || 'Processing complete!');
      await loadInbox(searchQuery);
      await loadLogs();
    } catch (err) {
      toast.error(err.message || 'Processing failed');
    } finally {
      setProcessing(false);
    }
  };

  // ===== HISTORY FUNCTIONS =====
  const loadLogs = useCallback(async () => {
    if (!user?.id) return;
    setLoadingLogs(true);
    try {
      const result = await emailBillApi.getLogs(user.id);
      setLogs(result.data || []);
      const data = result.data || [];
      setStats({
        processed: data.filter(l => l.status === 'processed').length,
        failed: data.filter(l => l.status === 'failed').length,
        skipped: data.filter(l => l.status === 'skipped').length,
        totalBills: data.reduce((sum, l) => sum + (l.billsCreated || 0), 0),
      });
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, [user?.id]);

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

  useEffect(() => {
    if (user?.id) {
      loadConnection();
    }
  }, [user?.id, loadConnection]);

  useEffect(() => {
    if (!connectionChecked) return;
    if (activeTab === 'inbox' && connection) {
      loadInbox();
    } else if (activeTab === 'history' && connection) {
      loadLogs();
    }
  }, [activeTab, connection, connectionChecked, loadInbox, loadLogs]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getConfidenceBadge = (detection) => {
    if (!detection) return null;
    const pct = Math.round((detection.confidence || 0) * 100);
    const color = detection.isBill
      ? pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#94a3b8'
      : '#94a3b8';
    return (
      <span style={{
        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
        background: `${color}18`, color,
      }}>
        {pct}%
      </span>
    );
  };

  // Count selected bills
  const selectedCount = selectedEmails.size;
  const billCount = inboxEmails.filter(e => e.billDetection?.isBill).length;
  const unprocessedBillCount = inboxEmails.filter(e => e.billDetection?.isBill && !e.processingStatus).length;

  return (
    <div style={{ padding: 0 }}>
      {/* Page Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 20, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Mail size={24} style={{ color: 'var(--primary)' }} />
            Smart Email Bills
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>
            Connect your email to automatically detect and import bills
          </p>
        </div>
      </div>

      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)',
        padding: 18, marginBottom: 20,
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 12, marginBottom: 14, flexWrap: 'wrap',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={16} />
              Connect Your Email
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Connect your Gmail or Zoho account to automatically scan for bills
            </p>
          </div>
          <div style={{
            fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 999,
            background: connection ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.12)',
            color: connection ? '#22c55e' : '#f59e0b',
          }}>
            {loadingConnection ? 'Checking...' : connection ? 'Connected' : 'Not connected'}
          </div>
        </div>

        {connection && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 10, marginBottom: 16,
          }}>
            <div style={miniCardStyle}>
              <div style={miniLabelStyle}>Email</div>
              <div style={miniValueStyle}>{connection.emailAddress || 'Configured'}</div>
            </div>
            <div style={miniCardStyle}>
              <div style={miniLabelStyle}>Provider</div>
              <div style={miniValueStyle}>{String(connection.provider || 'custom').toUpperCase()}</div>
            </div>
            <div style={miniCardStyle}>
              <div style={miniLabelStyle}>Last Synced</div>
              <div style={miniValueStyle}>{formatDate(connection.lastSyncedAt)}</div>
            </div>
          </div>
        )}

        <form onSubmit={handleSaveConnection}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 12, marginBottom: 14,
          }}>
            <div>
              <label style={fieldLabelStyle}>Email Provider</label>
              <select
                value={connectionForm.provider}
                onChange={e => updateConnectionField('provider', e.target.value)}
                style={fieldInputStyle}
              >
                <option value="gmail">Gmail</option>
                <option value="zoho">Zoho Mail</option>
              </select>
            </div>
            <div>
              <label style={fieldLabelStyle}>Email Address</label>
              <input
                value={connectionForm.emailAddress}
                onChange={e => updateConnectionField('emailAddress', e.target.value)}
                placeholder="your-email@gmail.com"
                style={fieldInputStyle}
              />
            </div>
            <div>
              <label style={fieldLabelStyle}>App Password</label>
              <input
                type="password"
                value={connectionForm.password}
                onChange={e => updateConnectionField('password', e.target.value)}
                placeholder="16-character app password"
                style={fieldInputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="submit"
              disabled={savingConnection}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', fontSize: 13, fontWeight: 700,
                border: 'none', borderRadius: 8, cursor: savingConnection ? 'wait' : 'pointer',
                background: 'var(--primary)', color: '#fff',
              }}
            >
              {savingConnection ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</> : <><Shield size={14} /> Connect Mailbox</>}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Generate an app password from your {connectionForm.provider === 'gmail' ? 'Gmail' : 'Zoho'} account settings
            </span>
          </div>
        </form>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--border)',
      }}>
        {[
          { key: 'inbox', label: 'Inbox', icon: Inbox, badge: billCount > 0 ? `${billCount} bills` : null },
          { key: 'history', label: 'History', icon: Clock, badge: stats.totalBills > 0 ? `${stats.totalBills}` : null },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 20px', fontSize: 14, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: 'transparent',
              color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-secondary)',
              borderBottom: activeTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -2,
              transition: 'all 0.2s',
            }}
          >
            <tab.icon size={16} />
            {tab.label}
            {tab.badge && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 20,
                background: activeTab === tab.key ? 'var(--primary)' : 'var(--bg-secondary)',
                color: activeTab === tab.key ? '#fff' : 'var(--text-secondary)',
              }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ================================================================== */}
      {/* INBOX TAB */}
      {/* ================================================================== */}
      {activeTab === 'inbox' && (
        <>
          {!connection && connectionChecked && (
            <div style={{
              marginBottom: 16, padding: 16, borderRadius: 10,
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
              color: '#92400e',
            }}>
              Connect your email above to start scanning for bills
            </div>
          )}

          {/* Search + Actions Bar */}
          <div style={{
            display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center',
            opacity: connection ? 1 : 0.55,
            pointerEvents: connection ? 'auto' : 'none',
          }}>
            <div style={{
              display: 'flex', flex: 1, minWidth: 200, maxWidth: 400,
              background: 'var(--bg-secondary)', borderRadius: 8,
              border: '1px solid var(--border)', overflow: 'hidden',
            }}>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Search emails (e.g. invoice, bill)..."
                style={{
                  flex: 1, border: 'none', background: 'transparent',
                  padding: '8px 14px', fontSize: 13, outline: 'none',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                onClick={handleSearch}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  padding: '8px 12px', color: 'var(--text-secondary)',
                }}
              >
                <Search size={16} />
              </button>
            </div>

            <button
              onClick={() => loadInbox(searchQuery)}
              disabled={loadingInbox}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', fontSize: 13, fontWeight: 600,
                borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg-secondary)', cursor: 'pointer',
                color: 'var(--text-primary)',
              }}
            >
              <RefreshCw size={14} className={loadingInbox ? 'spin' : ''} />
              {loadingInbox ? 'Loading...' : 'Refresh Inbox'}
            </button>

            {unprocessedBillCount > 0 && (
              <button
                onClick={selectAllBills}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', fontSize: 13, fontWeight: 600,
                  borderRadius: 8, border: '1px solid rgba(139,92,246,0.3)',
                  background: 'rgba(139,92,246,0.08)', cursor: 'pointer',
                  color: '#8b5cf6',
                }}
              >
                <Zap size={14} />
                Select All Bills ({unprocessedBillCount})
              </button>
            )}

            {selectedCount > 0 && (
              <>
                <button
                  onClick={clearSelection}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', fontSize: 13, fontWeight: 500,
                    borderRadius: 8, border: '1px solid var(--border)',
                    background: 'var(--bg-secondary)', cursor: 'pointer',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Clear ({selectedCount})
                </button>

                <button
                  onClick={handleProcessSelected}
                  disabled={processing}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 18px', fontSize: 14, fontWeight: 700,
                    borderRadius: 8, border: 'none', cursor: processing ? 'not-allowed' : 'pointer',
                    background: processing ? 'var(--bg-secondary)' : 'var(--primary)',
                    color: '#fff', transition: 'all 0.2s',
                    boxShadow: processing ? 'none' : '0 2px 8px rgba(37,99,235,0.3)',
                  }}
                >
                  {processing ? (
                    <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Processing...</>
                  ) : (
                    <><ArrowRight size={16} /> Extract {selectedCount} Email{selectedCount > 1 ? 's' : ''}</>
                  )}
                </button>
              </>
            )}
          </div>

          {/* Email List */}
          <div style={{
            background: 'var(--bg-secondary)', borderRadius: 12,
            border: '1px solid var(--border)', overflow: 'hidden',
          }}>
            {loadingInbox ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
                <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', opacity: 0.4, marginBottom: 12 }} />
                <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Scanning your inbox...</p>
                <p style={{ fontSize: 13, margin: '6px 0 0', opacity: 0.7 }}>AI is detecting which emails contain bills</p>
              </div>
            ) : inboxEmails.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
                <Inbox size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
                <p style={{ fontSize: 16, fontWeight: 500, margin: '0 0 6px' }}>No emails found</p>
                <p style={{ fontSize: 13, margin: 0 }}>Click "Refresh Inbox" to scan your mailbox</p>
              </div>
            ) : (
              <div>
                {/* Header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '36px 1fr 180px 120px 100px',
                  padding: '10px 14px', borderBottom: '1px solid var(--border)',
                  fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                  gap: 8,
                }}>
                  <span></span>
                  <span>Subject</span>
                  <span>From</span>
                  <span>Date</span>
                  <span style={{ textAlign: 'center' }}>Action</span>
                </div>

                {/* Rows */}
                {inboxEmails.map(email => {
                  const isSelected = selectedEmails.has(email.messageId);
                  const detection = email.billDetection || {};
                  const alreadyProcessed = email.processingStatus?.status === 'processed';
                  const isBill = detection.isBill;

                  return (
                    <div
                      key={email.messageId}
                      onClick={() => !alreadyProcessed && toggleEmailSelection(email.messageId)}
                      style={{
                        display: 'grid', gridTemplateColumns: '36px 1fr 180px 120px 100px',
                        padding: '12px 14px', borderBottom: '1px solid var(--border)',
                        cursor: alreadyProcessed ? 'default' : 'pointer',
                        gap: 8, alignItems: 'center',
                        background: isSelected
                          ? 'rgba(37,99,235,0.05)'
                          : alreadyProcessed ? 'rgba(34,197,94,0.03)' : 'transparent',
                        transition: 'background 0.15s',
                        opacity: alreadyProcessed ? 0.7 : 1,
                      }}
                      onMouseEnter={e => {
                        if (!alreadyProcessed && !isSelected)
                          e.currentTarget.style.background = 'var(--bg-hover, rgba(0,0,0,0.02))';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = isSelected
                          ? 'rgba(37,99,235,0.05)'
                          : alreadyProcessed ? 'rgba(34,197,94,0.03)' : 'transparent';
                      }}
                    >
                      {/* Checkbox */}
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        {alreadyProcessed ? (
                          <MailCheck size={18} style={{ color: '#22c55e' }} />
                        ) : isSelected ? (
                          <CheckSquare size={18} style={{ color: 'var(--primary)' }} />
                        ) : (
                          <Square size={18} style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
                        )}
                      </div>

                      {/* Subject + Preview + Bill Badge */}
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{
                          fontWeight: 600, fontSize: 13,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          {email.hasAttachments && (
                            <Paperclip size={12} style={{
                              color: 'var(--text-secondary)', flexShrink: 0,
                            }} />
                          )}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {email.subject}
                          </span>
                          {isBill && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700,
                              background: 'rgba(34,197,94,0.12)', color: '#16a34a',
                              flexShrink: 0,
                            }}>
                              <FileText size={10} />
                              Bill
                            </span>
                          )}
                        </div>
                        {email.preview && (
                          <div style={{
                            fontSize: 12, color: 'var(--text-secondary)', marginTop: 2,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            maxWidth: '100%',
                          }}>
                            {email.preview.substring(0, 100)}
                          </div>
                        )}
                      </div>

                      {/* Sender */}
                      <div style={{
                        fontSize: 12, color: 'var(--text-secondary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {email.sender}
                      </div>

                      {/* Date */}
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {formatDate(email.receivedTime)}
                      </div>

                      {/* Extract Action Button */}
                      <div style={{ textAlign: 'center' }}>
                        {alreadyProcessed ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                            background: 'rgba(34,197,94,0.1)', color: '#22c55e',
                          }}>
                            <CheckCircle size={11} />
                            Imported
                          </span>
                        ) : isBill ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleExtractEmail(email); }}
                            disabled={extractingEmailId === email.messageId}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                              border: 'none', cursor: extractingEmailId === email.messageId ? 'wait' : 'pointer',
                              background: extractingEmailId === email.messageId ? 'var(--bg-secondary)' : 'var(--primary)',
                              color: '#fff', transition: 'all 0.15s',
                            }}
                          >
                            {extractingEmailId === email.messageId ? (
                              <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> ...</>
                            ) : (
                              <><Download size={12} /> Import</>
                            )}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ================================================================== */}
      {/* HISTORY TAB */}
      {/* ================================================================== */}
      {activeTab === 'history' && (
        <>
          {!connection && connectionChecked && (
            <div style={{
              marginBottom: 16, padding: 16, borderRadius: 10,
              background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.2)',
              color: 'var(--text-secondary)',
            }}>
              Processing history will appear here after this customer connects a mailbox and imports bills.
            </div>
          )}

          {/* Stats Cards */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12, marginBottom: 24,
            opacity: connection ? 1 : 0.55,
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

          {/* Logs Table */}
          <div style={{
            background: 'var(--bg-secondary)', borderRadius: 12,
            border: '1px solid var(--border)', overflow: 'hidden',
            opacity: connection ? 1 : 0.7,
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

            {loadingLogs ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
                <div className="spinner" style={{ margin: '0 auto 12px' }} />
                Loading logs...
              </div>
            ) : logs.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
                <MailOpen size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
                <p style={{ fontSize: 16, fontWeight: 500, margin: '0 0 6px' }}>No emails processed yet</p>
                <p style={{ fontSize: 13, margin: 0 }}>Go to Inbox tab and select emails to extract bills from</p>
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
        </>
      )}

      {/* Inline animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin { animation: spin 1s linear infinite; }
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

const fieldLabelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-secondary)',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
};

const fieldInputStyle = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  padding: '10px 12px',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

const miniCardStyle = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '10px 12px',
  background: 'var(--bg-primary)',
};

const miniLabelStyle = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
  marginBottom: 4,
};

const miniValueStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-primary)',
  wordBreak: 'break-word',
};
