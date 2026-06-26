/**
 * ExpiryActionPanel
 * Surfaces only batches inside the action window (≤90 days).
 * Default view: "review by exception" — items new since last review.
 * Handles qty prompt + Sold / Return / Write-off actions inline.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { expiryApi } from '@/services/api';

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  return `₹${Number(n).toFixed(0)}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function urgencyColor(days) {
  if (days == null) return '#64748B';
  if (days < 0) return '#DC2626';
  if (days <= 30) return '#DC2626';
  if (days <= 60) return '#D97706';
  return '#059669';
}

function urgencyBg(days) {
  if (days == null) return '#F1F5F9';
  if (days < 0) return '#FEF2F2';
  if (days <= 30) return '#FEF2F2';
  if (days <= 60) return '#FFFBEB';
  return '#F0FDF4';
}

function daysLabel(days) {
  if (days == null) return 'No date';
  if (days < 0) return `${Math.abs(days)}d expired`;
  if (days === 0) return 'Expires today';
  return `${days}d left`;
}

// ─── Qty prompt modal ────────────────────────────────────────────────────────

function QtyModal({ item, onConfirm, onClose }) {
  const [val, setVal] = useState(
    item?.remainingQty != null ? String(item.remainingQty) : ''
  );

  const handleConfirm = () => {
    const n = parseFloat(val);
    if (isNaN(n) || n < 0) return;
    onConfirm(n);
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <ThemedText style={styles.modalTitle}>How many left?</ThemedText>
          <ThemedText style={styles.modalSub} numberOfLines={2}>
            {item?.name}  ·  Batch {item?.batchNumber || 'N/A'}
          </ThemedText>
          <TextInput
            style={styles.qtyInput}
            value={val}
            onChangeText={setVal}
            keyboardType="decimal-pad"
            placeholder="Enter quantity"
            placeholderTextColor="#94A3B8"
            autoFocus
            selectTextOnFocus
          />
          {val !== '' && parseFloat(val) === 0 && (
            <ThemedText style={styles.modalHint}>
              Qty = 0 will auto-clear this batch as Sold/Finished.
            </ThemedText>
          )}
          <View style={styles.modalButtons}>
            <Pressable style={styles.modalCancelBtn} onPress={onClose}>
              <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.modalConfirmBtn, (!val || isNaN(parseFloat(val))) && styles.modalConfirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!val || isNaN(parseFloat(val))}
            >
              <ThemedText style={styles.modalConfirmText}>Confirm</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Action buttons row ───────────────────────────────────────────────────────

function ActionRow({ item, onAction, loading }) {
  const returnOpen = item.returnEligible;
  const returnTill = fmtDate(item.returnOpenDate);

  return (
    <View style={styles.actionRow}>
      {/* Sold / Finished */}
      <Pressable
        style={[styles.actionBtn, styles.actionBtnSold]}
        onPress={() => onAction(item.id, 'sold')}
        disabled={loading}
      >
        <Ionicons name="checkmark-circle-outline" size={14} color="#047857" />
        <ThemedText style={styles.actionBtnTextSold}>Sold</ThemedText>
      </Pressable>

      {/* Return to distributor */}
      <Pressable
        style={[
          styles.actionBtn,
          returnOpen ? styles.actionBtnReturn : styles.actionBtnReturnDisabled,
        ]}
        onPress={() => returnOpen && onAction(item.id, 'returned')}
        disabled={!returnOpen || loading}
      >
        <Ionicons
          name="arrow-undo-circle-outline"
          size={14}
          color={returnOpen ? '#1D4ED8' : '#94A3B8'}
        />
        <ThemedText
          style={returnOpen ? styles.actionBtnTextReturn : styles.actionBtnTextDisabled}
        >
          Return{returnOpen ? '' : ' (closed)'}
        </ThemedText>
      </Pressable>

      {/* Write off */}
      <Pressable
        style={[styles.actionBtn, styles.actionBtnWriteoff]}
        onPress={() => onAction(item.id, 'writeoff')}
        disabled={loading}
      >
        <Ionicons name="trash-outline" size={14} color="#B45309" />
        <ThemedText style={styles.actionBtnTextWriteoff}>Write off</ThemedText>
      </Pressable>
    </View>
  );
}

// ─── Single batch card ────────────────────────────────────────────────────────

const BatchCard = React.memo(({ item, onQtyTap, onAction, actionLoading }) => {
  const color = urgencyColor(item.daysUntilExpiry);
  const bg = urgencyBg(item.daysUntilExpiry);
  const hasQty = item.remainingQty != null;

  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      {/* Top row */}
      <View style={styles.cardTop}>
        <View style={[styles.urgencyBadge, { backgroundColor: bg }]}>
          <ThemedText style={[styles.urgencyText, { color }]}>
            {daysLabel(item.daysUntilExpiry)}
          </ThemedText>
        </View>
        {item.returnEligible && (
          <View style={styles.returnTag}>
            <Ionicons name="arrow-undo" size={11} color="#1D4ED8" />
            <ThemedText style={styles.returnTagText}>
              Return open till {fmtDate(item.returnOpenDate)}
            </ThemedText>
          </View>
        )}
      </View>

      {/* Name + batch */}
      <ThemedText style={styles.cardName} numberOfLines={2}>
        {item.name}
      </ThemedText>
      <ThemedText style={styles.cardMeta}>
        Batch {item.batchNumber || 'N/A'}  ·  Exp {item.expiryDate}
        {item.distributor ? `  ·  ${item.distributor}` : ''}
      </ThemedText>

      {/* Qty row + value */}
      <View style={styles.cardQtyRow}>
        <Pressable style={styles.qtyTapZone} onPress={() => onQtyTap(item)}>
          <View style={styles.qtyBubble}>
            <Ionicons name="layers-outline" size={14} color="#4F46E5" />
            <ThemedText style={styles.qtyBubbleText}>
              {hasQty ? `${item.remainingQty} remaining` : 'Tap to enter qty'}
            </ThemedText>
            <Ionicons name="pencil" size={11} color="#818CF8" />
          </View>
        </Pressable>
        {item.valueAtRisk > 0 && (
          <ThemedText style={styles.valueText}>{fmt(item.valueAtRisk)} at risk</ThemedText>
        )}
      </View>

      {/* Action buttons — only shown after qty is known */}
      {hasQty && item.remainingQty > 0 && (
        <ActionRow item={item} onAction={onAction} loading={actionLoading} />
      )}
    </View>
  );
});

BatchCard.displayName = 'BatchCard';

// ─── Main panel ──────────────────────────────────────────────────────────────

export default function ExpiryActionPanel({ userId, onScanPress }) {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [qtyItem, setQtyItem] = useState(null); // item being qty-prompted
  const [hasFetched, setHasFetched] = useState(false);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await expiryApi.getWindow(userId);
      if (res.success) {
        setItems(res.items || []);
        setSummary(res.summary || null);
        setHasFetched(true);
      } else {
        setError(res.error || 'Failed to load');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Expose refresh for parent useFocusEffect
  React.useEffect(() => {
    fetch();
  }, [fetch]);

  // "review by exception": new items only (entered window in last 30 days) unless showAll
  const displayed = showAll
    ? items
    : items.filter((i) => {
        if (!i.firstEnteredWindowAt) return true;
        const ms = new Date(i.firstEnteredWindowAt).getTime();
        return Date.now() - ms <= 30 * 86_400_000;
      });

  const hiddenCount = items.length - displayed.length;

  const handleQtyConfirm = async (qty) => {
    const item = qtyItem;
    setQtyItem(null);
    if (!item) return;
    setActionLoading(true);
    try {
      await expiryApi.applyAction(item.id, 'update_qty', qty);
      if (qty === 0) {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      } else {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, remainingQty: qty, valueAtRisk: qty * (i.unitCost || 0) } : i))
        );
      }
    } catch (e) {
      // silent — user can retry
    } finally {
      setActionLoading(false);
    }
  };

  const handleAction = async (itemId, action) => {
    setActionLoading(true);
    try {
      await expiryApi.applyAction(itemId, action);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (e) {
      // silent
    } finally {
      setActionLoading(false);
    }
  };

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      {/* Section header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <ThemedText style={styles.headerTitle}>Action Required</ThemedText>
          {summary && (
            <View style={styles.headerBadge}>
              <ThemedText style={styles.headerBadgeText}>{summary.totalItems}</ThemedText>
            </View>
          )}
        </View>
        <Pressable onPress={fetch} hitSlop={12}>
          <Ionicons name="refresh" size={18} color="#4F46E5" />
        </Pressable>
      </View>

      {/* Money summary */}
      {summary && summary.totalItems > 0 && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryTile}>
            <ThemedText style={styles.summaryLabel}>Value at risk</ThemedText>
            <ThemedText style={styles.summaryValue}>{fmt(summary.totalValueAtRisk)}</ThemedText>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryTile}>
            <ThemedText style={styles.summaryLabel}>Returnable now</ThemedText>
            <ThemedText style={[styles.summaryValue, { color: '#1D4ED8' }]}>
              {fmt(summary.totalReturnable)}
            </ThemedText>
          </View>
        </View>
      )}

      {/* List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#4F46E5" />
          <ThemedText style={styles.loadingText}>Checking expiry window…</ThemedText>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={32} color="#DC2626" />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <Pressable style={styles.retryBtn} onPress={fetch}>
            <ThemedText style={styles.retryBtnText}>Retry</ThemedText>
          </Pressable>
        </View>
      ) : hasFetched && items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="shield-checkmark-outline" size={40} color="#10B981" />
          <ThemedText style={styles.emptyTitle}>All clear</ThemedText>
          <ThemedText style={styles.emptySub}>
            No batches expiring in the next 90 days need attention.
          </ThemedText>
          <Pressable style={styles.scanCta} onPress={onScanPress}>
            <ThemedText style={styles.scanCtaText}>Scan a bill</ThemedText>
          </Pressable>
        </View>
      ) : (
        <>
          {displayed.length === 0 && hiddenCount > 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="checkmark-circle-outline" size={36} color="#059669" />
              <ThemedText style={styles.emptyTitle}>Nothing new this month</ThemedText>
              <ThemedText style={styles.emptySub}>
                {hiddenCount} older batch{hiddenCount !== 1 ? 'es' : ''} in window.
              </ThemedText>
            </View>
          ) : (
            <View style={styles.list}>
              {displayed.map((item) => (
                <BatchCard
                  key={item.id}
                  item={item}
                  onQtyTap={setQtyItem}
                  onAction={handleAction}
                  actionLoading={actionLoading}
                />
              ))}
            </View>
          )}

          {/* Show-all / review-now toggle */}
          {hiddenCount > 0 && (
            <Pressable style={styles.showAllBtn} onPress={() => setShowAll((v) => !v)}>
              <Ionicons
                name={showAll ? 'chevron-up' : 'chevron-down'}
                size={14}
                color="#4F46E5"
              />
              <ThemedText style={styles.showAllText}>
                {showAll
                  ? 'Show new only'
                  : `Review all ${items.length} in window (${hiddenCount} older)`}
              </ThemedText>
            </Pressable>
          )}
        </>
      )}

      {/* Qty modal */}
      {qtyItem && (
        <QtyModal
          item={qtyItem}
          onConfirm={handleQtyConfirm}
          onClose={() => setQtyItem(null)}
        />
      )}
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    marginBottom: 8,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },

  // Money summary
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    overflow: 'hidden',
  },
  summaryTile: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 10,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: -0.3,
  },

  list: { gap: 10 },

  // Batch card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderLeftWidth: 4,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: '#F1F5F9',
    borderRightColor: '#F1F5F9',
    borderBottomColor: '#F1F5F9',
    padding: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  urgencyBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  urgencyText: {
    fontSize: 11,
    fontWeight: '700',
  },
  returnTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  returnTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  cardName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 3,
  },
  cardMeta: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 10,
  },

  // Qty zone
  cardQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  qtyTapZone: { flex: 1 },
  qtyBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  qtyBubbleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
  },
  valueText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnSold: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  actionBtnTextSold: { fontSize: 12, fontWeight: '700', color: '#047857' },
  actionBtnReturn: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  actionBtnReturnDisabled: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  actionBtnTextReturn: { fontSize: 12, fontWeight: '700', color: '#1D4ED8' },
  actionBtnTextDisabled: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  actionBtnWriteoff: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  actionBtnTextWriteoff: { fontSize: 12, fontWeight: '700', color: '#B45309' },

  // Show all toggle
  showAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 10,
    paddingVertical: 10,
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
  },
  showAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
  },

  // Empty state
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 28,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  scanCta: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 9,
    backgroundColor: '#4F46E5',
    borderRadius: 10,
  },
  scanCtaText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Center utility
  center: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  loadingText: { fontSize: 13, color: '#64748B' },
  errorText: { fontSize: 13, color: '#DC2626', textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#4F46E5',
    borderRadius: 10,
  },
  retryBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Qty modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
      },
      android: { elevation: 10 },
    }),
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  modalSub: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
  },
  qtyInput: {
    height: 52,
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    backgroundColor: '#F8FAFF',
    marginBottom: 8,
  },
  modalHint: {
    fontSize: 12,
    color: '#D97706',
    marginBottom: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#64748B' },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
  },
  modalConfirmBtnDisabled: { backgroundColor: '#C7D2FE' },
  modalConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
