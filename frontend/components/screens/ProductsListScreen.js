import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import Card from '@/components/ui/Card';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DateField from '@/components/ui/DateField';
import { useEnrichedProductList, useProductCRUD } from '@/hooks/useProducts';
import { productApi, distributorApi } from '@/services/api';
import { ddmmyyyyToIso } from '@/utils/dateFormat';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getExpiryColor(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return '#94A3B8';
  if (daysLeft < 90) return '#EF4444';
  if (daysLeft < 180) return '#F59E0B';
  return '#10B981';
}


/**
 * Batch row — used inside an expanded product card
 */
function BatchRow({ batch }) {
  const color = getExpiryColor(batch.daysLeft);
  return (
    <View style={[styles.batchRow, batch.isArchived && styles.batchRowArchived]}>
      <View style={styles.batchRowTop}>
        <ThemedText style={[styles.batchNumber, batch.matchedSearch && styles.batchNumberHighlight]} numberOfLines={1}>
          Batch {batch.batchNumber || '—'}
        </ThemedText>
        {batch.isArchived && (
          <View style={styles.archivedTag}>
            <ThemedText style={styles.archivedTagText}>Archived</ThemedText>
          </View>
        )}
      </View>
      <View style={styles.batchRowMeta}>
        <ThemedText style={styles.batchMetaText}>Qty {batch.quantity ?? '—'}</ThemedText>
        <ThemedText style={styles.batchMetaDot}>·</ThemedText>
        {batch.daysLeft !== null ? (
          <ThemedText style={[styles.batchMetaText, { color }]}>
            Exp: {batch.expiryDate} · {batch.daysLeft}d left
          </ThemedText>
        ) : (
          <ThemedText style={[styles.batchMetaText, { color: '#94A3B8' }]}>
            Exp: {batch.expiryDate || 'Unknown'}
          </ThemedText>
        )}
      </View>
      <View style={styles.batchRowMeta}>
        <ThemedText style={styles.batchMetaTextMuted} numberOfLines={1}>
          {batch.distributorName || 'Unknown distributor'}
        </ThemedText>
        {batch.invoiceNumber && (
          <>
            <ThemedText style={styles.batchMetaDot}>·</ThemedText>
            <ThemedText style={styles.batchMetaTextMuted} numberOfLines={1}>
              Inv #{batch.invoiceNumber}{batch.invoiceDate ? ` · ${batch.invoiceDate}` : ''}
            </ThemedText>
          </>
        )}
      </View>
    </View>
  );
}

/**
 * Product card — new redesigned layout with expand-in-place batch list
 */
const ProductCard = React.memo(({ item, expanded, onToggleExpand, onEdit, onLongPress, onSell, onIdentify, mergeMode, selected, onToggleSelect }) => {
  const color = getExpiryColor(item.daysToEarliestExpiry);
  const searchMatch = item.batches.find((b) => b.matchedSearch);

  return (
    <Card style={[styles.productCardInner, mergeMode && selected && styles.productCardSelected]} noPadding>
      <Pressable
        onPress={() => (mergeMode ? onToggleSelect(item) : onToggleExpand(item.id))}
        onLongPress={() => !mergeMode && onLongPress(item)}
        style={({ pressed }) => pressed && styles.pressedOverlay}
      >
        <View style={styles.cardTopRow}>
          {mergeMode && (
            <Ionicons
              name={selected ? 'checkbox' : 'square-outline'}
              size={22}
              color={selected ? '#4F46E5' : '#94A3B8'}
              style={styles.mergeCheckbox}
            />
          )}
          <View style={styles.cardTextCol}>
            <ThemedText style={styles.productName} numberOfLines={1}>
              {item.name}
            </ThemedText>
            {item.daysToEarliestExpiry !== null ? (
              <ThemedText style={[styles.expiryLine, { color }]} numberOfLines={1}>
                Exp: {item.earliestExpiry} · {item.daysToEarliestExpiry}d left
              </ThemedText>
            ) : (
              <ThemedText style={[styles.expiryLine, { color: '#94A3B8' }]} numberOfLines={1}>
                Exp: {item.earliestExpiry || 'Unknown'}
              </ThemedText>
            )}
            <ThemedText style={styles.distributorLine} numberOfLines={1}>
              {item.distributors.length === 1
                ? item.distributors[0]
                : item.distributors.length > 1
                ? `${item.distributors.length} distributors`
                : 'No distributor on record'}
            </ThemedText>
            {searchMatch && (
              <View style={styles.matchTag}>
                <ThemedText style={styles.matchTagText} numberOfLines={1}>
                  Invoice #{searchMatch.invoiceNumber} · {searchMatch.distributorName} · {searchMatch.invoiceDate || ''}
                </ThemedText>
              </View>
            )}
          </View>
          <View style={styles.cardRightCol}>
            <View style={styles.batchBadge}>
              <ThemedText style={styles.batchBadgeText}>{item.batchCount}</ThemedText>
              <ThemedText style={styles.batchBadgeLabel}>batch{item.batchCount === 1 ? '' : 'es'}</ThemedText>
            </View>
            {!mergeMode && (
              <>
                {/* Sell straight from the list — the counter path is never more than a tap away */}
                <Pressable onPress={() => onSell?.(item)} hitSlop={8} style={styles.sellIconButton}>
                  <Ionicons name="cart-outline" size={16} color="#4F46E5" />
                </Pressable>
                {/* "What is this?" — for products auto-created from a garbled OCR name */}
                <Pressable onPress={() => onIdentify?.(item)} hitSlop={8} style={styles.identifyIconButton}>
                  <Ionicons name="sparkles-outline" size={16} color="#7C3AED" />
                </Pressable>
                <Pressable onPress={() => onEdit(item)} hitSlop={8} style={styles.editIconButton}>
                  <Ionicons name="create-outline" size={16} color="#64748B" />
                </Pressable>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#94A3B8" />
              </>
            )}
          </View>
        </View>
      </Pressable>

      {expanded && !mergeMode && (
        <View style={styles.batchListContainer}>
          {item.batches.map((b, idx) => (
            <BatchRow key={`${b.billId}-${idx}`} batch={b} />
          ))}
        </View>
      )}
    </Card>
  );
});

ProductCard.displayName = 'ProductCard';

/**
 * Month-year picker modal (no native picker exists in this app — built inline)
 */
function ExpiryMonthModal({ visible, value, onClose, onSelect }) {
  const now = new Date();
  const [year, setYear] = useState(() => {
    if (value) {
      const [, y] = value.split('-');
      return Number(y);
    }
    return now.getFullYear();
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>Expiring in</ThemedText>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#64748B" />
            </Pressable>
          </View>
          <View style={styles.yearStepper}>
            <Pressable onPress={() => setYear((y) => y - 1)} hitSlop={8}>
              <Ionicons name="chevron-back" size={20} color="#4F46E5" />
            </Pressable>
            <ThemedText style={styles.yearText}>{year}</ThemedText>
            <Pressable onPress={() => setYear((y) => y + 1)} hitSlop={8}>
              <Ionicons name="chevron-forward" size={20} color="#4F46E5" />
            </Pressable>
          </View>
          <View style={styles.monthGrid}>
            {MONTH_NAMES.map((name, idx) => {
              const mm = String(idx + 1).padStart(2, '0');
              const key = `${mm}-${year}`;
              const isSelected = value === key;
              return (
                <Pressable
                  key={key}
                  style={[styles.monthCell, isSelected && styles.monthCellSelected]}
                  onPress={() => {
                    onSelect(key);
                    onClose();
                  }}
                >
                  <ThemedText style={[styles.monthCellText, isSelected && styles.monthCellTextSelected]}>
                    {name}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          {value && (
            <Pressable
              style={styles.modalClearButton}
              onPress={() => {
                onSelect(null);
                onClose();
              }}
            >
              <ThemedText style={styles.modalClearButtonText}>Clear</ThemedText>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Received-on date range modal
 */
function ReceivedRangeModal({ visible, from, to, onClose, onApply }) {
  const [fromLocal, setFromLocal] = useState(from || '');
  const [toLocal, setToLocal] = useState(to || '');

  useEffect(() => {
    if (visible) {
      setFromLocal(from || '');
      setToLocal(to || '');
    }
  }, [visible, from, to]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalKeyboardView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Received on</ThemedText>
              <Pressable onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={22} color="#64748B" />
              </Pressable>
            </View>
            <DateField label="From" value={fromLocal} onChange={setFromLocal} />
            <DateField label="To" value={toLocal} onChange={setToLocal} />
            <View style={styles.modalActionRow}>
              <Pressable
                style={styles.modalClearButton}
                onPress={() => {
                  onApply(null, null);
                  onClose();
                }}
              >
                <ThemedText style={styles.modalClearButtonText}>Clear</ThemedText>
              </Pressable>
              <Pressable
                style={styles.modalApplyButton}
                onPress={() => {
                  onApply(ddmmyyyyToIso(fromLocal), ddmmyyyyToIso(toLocal));
                  onClose();
                }}
              >
                <ThemedText style={styles.modalApplyButtonText}>Apply</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Distributor multi-select modal
 */
function DistributorModal({ visible, distributors, selectedIds, onClose, onApply }) {
  const [localSelected, setLocalSelected] = useState(selectedIds);

  useEffect(() => {
    if (visible) setLocalSelected(selectedIds);
  }, [visible, selectedIds]);

  const toggle = (id) => {
    setLocalSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>Distributor</ThemedText>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#64748B" />
            </Pressable>
          </View>
          <ScrollView style={styles.distributorList}>
            {distributors.map((d) => {
              const isSelected = localSelected.includes(d.id);
              return (
                <Pressable key={d.id} style={styles.distributorRow} onPress={() => toggle(d.id)}>
                  <Ionicons
                    name={isSelected ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={isSelected ? '#4F46E5' : '#94A3B8'}
                  />
                  <ThemedText style={styles.distributorRowText} numberOfLines={1}>
                    {d.name}
                  </ThemedText>
                </Pressable>
              );
            })}
            {distributors.length === 0 && (
              <ThemedText style={styles.noDistributorsText}>No distributors yet</ThemedText>
            )}
          </ScrollView>
          <View style={styles.modalActionRow}>
            <Pressable
              style={styles.modalClearButton}
              onPress={() => {
                onApply([]);
                onClose();
              }}
            >
              <ThemedText style={styles.modalClearButtonText}>Clear</ThemedText>
            </Pressable>
            <Pressable
              style={styles.modalApplyButton}
              onPress={() => {
                onApply(localSelected);
                onClose();
              }}
            >
              <ThemedText style={styles.modalApplyButtonText}>Apply</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Merge confirmation — pick which of the two selected products survives.
 * The other is archived (never deleted); its batches move to the survivor.
 */
function MergeConfirmModal({ visible, products, onClose, onConfirm, isMerging }) {
  const [survivorId, setSurvivorId] = useState(null);

  useEffect(() => {
    if (visible && products.length === 2) {
      // Default to whichever has more batches — usually the more "established" entry
      const preferred = products[0].batchCount >= products[1].batchCount ? products[0] : products[1];
      setSurvivorId(preferred.id);
    }
  }, [visible, products]);

  if (products.length !== 2) return null;
  const duplicate = products.find((p) => p.id !== survivorId);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>Merge Products</ThemedText>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#64748B" />
            </Pressable>
          </View>
          <ThemedText style={styles.mergeHint}>Which one do you want to keep?</ThemedText>

          {products.map((p) => {
            const isSurvivor = p.id === survivorId;
            return (
              <Pressable
                key={p.id}
                style={[styles.mergeOptionRow, isSurvivor && styles.mergeOptionRowSelected]}
                onPress={() => setSurvivorId(p.id)}
              >
                <Ionicons
                  name={isSurvivor ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={isSurvivor ? '#4F46E5' : '#94A3B8'}
                />
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.mergeOptionName} numberOfLines={2}>{p.name}</ThemedText>
                  <ThemedText style={styles.mergeOptionMeta}>
                    {p.batchCount} batch{p.batchCount === 1 ? '' : 'es'}
                  </ThemedText>
                </View>
                {isSurvivor && (
                  <View style={styles.mergeKeepTag}>
                    <ThemedText style={styles.mergeKeepTagText}>Keep</ThemedText>
                  </View>
                )}
              </Pressable>
            );
          })}

          <View style={styles.mergeWarningBox}>
            <Ionicons name="information-circle" size={16} color="#B45309" />
            <ThemedText style={styles.mergeWarningText}>
              "{duplicate?.name}" will be archived, not deleted. Its batches and purchase
              history move to the product you keep.
            </ThemedText>
          </View>

          <View style={styles.modalActionRow}>
            <Pressable style={styles.modalClearButton} onPress={onClose} disabled={isMerging}>
              <ThemedText style={styles.modalClearButtonText}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={styles.modalApplyButton}
              onPress={() => onConfirm(survivorId, duplicate.id)}
              disabled={isMerging}
            >
              <ThemedText style={styles.modalApplyButtonText}>
                {isMerging ? 'Merging…' : 'Merge'}
              </ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const VERDICT_STYLES = {
  match: { icon: 'checkmark-circle', color: '#047857', bg: '#ECFDF5', title: 'This looks like a product you already have' },
  unsure: { icon: 'help-circle', color: '#B45309', bg: '#FFFBEB', title: 'Possible matches — your call' },
  new: { icon: 'add-circle', color: '#1D4ED8', bg: '#EFF6FF', title: 'Looks like a genuinely new medicine' },
};

/**
 * "What is this product?" — AI identification for a catalog entry that was auto-created
 * from a distributor invoice's OCR text (see productIdentifyService on the backend).
 * When OCR misreads a medicine name, syncProductsFromBillItems finds no catalog match and
 * creates a brand-new product, so the pharmacy ends up with a ghost entry like
 * "DURENGE 500 MG TAB" for a drug it has always stocked under its real name.
 *
 * The AI only ever suggests. From here the pharmacist either merges the ghost into the
 * real product, or confirms it is new — optionally accepting the corrected spelling and
 * the salt/manufacturer the AI filled in. Nothing happens without a tap.
 */
function IdentifyProductModal({ visible, product, result, isLoading, error, isApplying, onClose, onMerge, onSaveAsNew }) {
  if (!product) return null;

  const ai = result?.ai;
  const verdict = ai ? VERDICT_STYLES[ai.verdict] || VERDICT_STYLES.unsure : null;
  const correctedName =
    ai?.likelyRealName && ai.likelyRealName.toLowerCase() !== product.name.toLowerCase()
      ? ai.likelyRealName
      : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>What is this product?</ThemedText>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#64748B" />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <ThemedText style={styles.identifySubject} numberOfLines={3}>{product.name}</ThemedText>

            {isLoading && (
              <View style={styles.identifyLoading}>
                <ActivityIndicator size="small" color="#7C3AED" />
                <ThemedText style={styles.identifyLoadingText}>
                  Checking this against your catalog and its purchase history…
                </ThemedText>
              </View>
            )}

            {!!error && !isLoading && (
              <View style={styles.identifyErrorBox}>
                <Ionicons name="alert-circle" size={16} color="#B91C1C" />
                <ThemedText style={styles.identifyErrorText}>{error}</ThemedText>
              </View>
            )}

            {ai && !isLoading && (
              <>
                <View style={[styles.verdictBanner, { backgroundColor: verdict.bg }]}>
                  <Ionicons name={verdict.icon} size={18} color={verdict.color} />
                  <ThemedText style={[styles.verdictTitle, { color: verdict.color }]}>{verdict.title}</ThemedText>
                </View>

                {!!ai.reasoning && <ThemedText style={styles.aiReasoning}>{ai.reasoning}</ThemedText>}

                {ai.matches.length > 0 && (
                  <>
                    <ThemedText style={styles.identifySectionLabel}>
                      {ai.matches.length === 1 ? 'Suggested match' : 'Suggested matches'}
                    </ThemedText>
                    {ai.matches.map((match) => (
                      <View key={match.productId} style={styles.matchRow}>
                        <View style={styles.matchRowTop}>
                          <ThemedText style={styles.matchName} numberOfLines={2}>{match.name}</ThemedText>
                          <View
                            style={[
                              styles.confidenceBadge,
                              { backgroundColor: match.confidence >= 0.7 ? '#D1FAE5' : '#FEF3C7' },
                            ]}
                          >
                            <ThemedText
                              style={[
                                styles.confidenceBadgeText,
                                { color: match.confidence >= 0.7 ? '#047857' : '#B45309' },
                              ]}
                            >
                              {Math.round(match.confidence * 100)}%
                            </ThemedText>
                          </View>
                        </View>
                        <ThemedText style={styles.matchMeta} numberOfLines={1}>
                          {[match.manufacturer, match.salt, `stock ${match.stock}`].filter(Boolean).join(' · ')}
                        </ThemedText>
                        {!!match.reason && <ThemedText style={styles.matchReason}>{match.reason}</ThemedText>}
                        <Pressable
                          style={styles.mergeIntoButton}
                          onPress={() => onMerge(match)}
                          disabled={isApplying}
                        >
                          <Ionicons name="git-merge-outline" size={15} color="#FFFFFF" />
                          <ThemedText style={styles.mergeIntoButtonText}>
                            {isApplying ? 'Merging…' : `Merge into "${match.name}"`}
                          </ThemedText>
                        </Pressable>
                      </View>
                    ))}
                  </>
                )}

                {/* The AI's corrected spelling would collide with a different catalog entry —
                    that entry IS the product, so offer the merge rather than a failing rename. */}
                {result.nameCollision && (
                  <View style={styles.collisionBox}>
                    <Ionicons name="information-circle" size={16} color="#B45309" />
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.collisionText}>
                        You already have a product named "{result.nameCollision.name}". Renaming would
                        clash with it — merge into it instead.
                      </ThemedText>
                      <Pressable
                        style={styles.collisionMergeButton}
                        onPress={() => onMerge({ productId: result.nameCollision.id, name: result.nameCollision.name })}
                        disabled={isApplying}
                      >
                        <ThemedText style={styles.collisionMergeButtonText}>
                          Merge into "{result.nameCollision.name}"
                        </ThemedText>
                      </Pressable>
                    </View>
                  </View>
                )}

                <ThemedText style={styles.identifySectionLabel}>Or keep it as its own product</ThemedText>
                {(correctedName || ai.salt || ai.manufacturer) && !result.nameCollision ? (
                  <View style={styles.suggestionBox}>
                    <ThemedText style={styles.suggestionIntro}>Saving will also apply what the AI worked out:</ThemedText>
                    {!!correctedName && (
                      <ThemedText style={styles.suggestionLine}>
                        Name: <ThemedText style={styles.suggestionValue}>{correctedName}</ThemedText>
                      </ThemedText>
                    )}
                    {!!ai.salt && (
                      <ThemedText style={styles.suggestionLine}>
                        Salt: <ThemedText style={styles.suggestionValue}>{ai.salt}</ThemedText>
                      </ThemedText>
                    )}
                    {!!ai.manufacturer && (
                      <ThemedText style={styles.suggestionLine}>
                        Manufacturer: <ThemedText style={styles.suggestionValue}>{ai.manufacturer}</ThemedText>
                      </ThemedText>
                    )}
                  </View>
                ) : (
                  <ThemedText style={styles.identifyHint}>
                    Keeps "{product.name}" exactly as it is, with its batches and stock untouched.
                  </ThemedText>
                )}

                <Pressable
                  style={styles.saveAsNewButton}
                  onPress={() => onSaveAsNew({ name: correctedName, salt: ai.salt, manufacturer: ai.manufacturer })}
                  disabled={isApplying}
                >
                  <Ionicons name="bookmark-outline" size={15} color="#4F46E5" />
                  <ThemedText style={styles.saveAsNewButtonText}>
                    {isApplying
                      ? 'Saving…'
                      : correctedName && !result.nameCollision
                      ? 'Save as a new product (corrected)'
                      : 'Save as a new product'}
                  </ThemedText>
                </Pressable>

                <ThemedText style={styles.aiFootnote}>
                  AI suggestion from {result.candidatesConsidered} catalog{' '}
                  {result.candidatesConsidered === 1 ? 'entry' : 'entries'} and this product's invoice
                  history. Always check against the physical pack before merging.
                </ThemedText>
              </>
            )}
          </ScrollView>

          <View style={styles.modalActionRow}>
            <Pressable style={styles.modalClearButton} onPress={onClose} disabled={isApplying}>
              <ThemedText style={styles.modalClearButtonText}>Close</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Empty State
 */
const EmptyState = ({ hasActiveFilters, onClearFilters, onAddPress }) => (
  <View style={styles.emptyContainer}>
    <View style={styles.emptyIconContainer}>
      <Ionicons name="cube-outline" size={64} color="#CBD5E1" />
    </View>
    <ThemedText style={styles.emptyTitle}>
      {hasActiveFilters ? 'No products match' : 'No products yet'}
    </ThemedText>
    {hasActiveFilters ? (
      <Pressable style={styles.emptyAddButton} onPress={onClearFilters}>
        <ThemedText style={styles.emptyAddButtonText}>Clear filters?</ThemedText>
      </Pressable>
    ) : (
      <>
        <ThemedText style={styles.emptySubtitle}>
          Products will be automatically added when you save bills, or you can add them manually
        </ThemedText>
        <Pressable style={styles.emptyAddButton} onPress={onAddPress}>
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <ThemedText style={styles.emptyAddButtonText}>Add Product</ThemedText>
        </Pressable>
      </>
    )}
  </View>
);

/**
 * ProductsListScreen
 * Batch-aware product list: search across name/batch/invoice, distributor +
 * expiry-month + received-date filters, FEFO sort, expand-in-place batch view.
 */
export default function ProductsListScreen({ userId, onBack, onProductPress, onAddPress, onSellPress }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteDialog, setDeleteDialog] = useState({ visible: false, product: null });
  const [expandedId, setExpandedId] = useState(null);
  const [distributorModalVisible, setDistributorModalVisible] = useState(false);
  const [monthModalVisible, setMonthModalVisible] = useState(false);
  const [rangeModalVisible, setRangeModalVisible] = useState(false);
  const [distributors, setDistributors] = useState([]);

  // Merge Products tool
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState([]); // up to 2 product objects
  const [mergeConfirmVisible, setMergeConfirmVisible] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeCandidateCount, setMergeCandidateCount] = useState(0);

  // "What is this product?" — AI identification for OCR-created catalog entries
  const [identify, setIdentify] = useState({
    visible: false,
    product: null,
    result: null,
    isLoading: false,
    error: null,
    isApplying: false,
  });

  const {
    products,
    pagination,
    distributorIds,
    setDistributorIds,
    expiryMonth,
    setExpiryMonth,
    receivedFrom,
    receivedTo,
    setReceivedRange,
    sort,
    setSort,
    activeFilterCount,
    clearAllFilters,
    isLoading,
    isRefreshing,
    error,
    refresh,
    loadMore,
    updateSearch,
  } = useEnrichedProductList(userId);

  const { deleteProduct, isLoading: isDeleting } = useProductCRUD(userId);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      updateSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, updateSearch]);

  // Fetch distributor options once
  useEffect(() => {
    if (!userId) return;
    distributorApi.getDistributors(userId).then((res) => {
      setDistributors(res.distributors || []);
    }).catch(() => {});
  }, [userId]);

  // Heuristic duplicate-name suggestions — surfaced as a banner nudging toward Merge mode,
  // never auto-merged
  useEffect(() => {
    if (!userId) return;
    productApi.getMergeCandidates(userId).then((res) => {
      setMergeCandidateCount(res.suggestions?.length || 0);
    }).catch(() => {});
  }, [userId, products.length]);

  const distributorNameById = useMemo(
    () => new Map(distributors.map((d) => [d.id, d.name])),
    [distributors]
  );

  const handleToggleExpand = useCallback((id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleEdit = useCallback(async (item) => {
    try {
      const res = await productApi.getProductById(userId, item.id);
      onProductPress?.(res.product);
    } catch (err) {
      Alert.alert('Error', 'Failed to load product details.');
    }
  }, [userId, onProductPress]);

  const handleLongPress = useCallback((product) => {
    setDeleteDialog({ visible: true, product });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    const product = deleteDialog.product;
    setDeleteDialog({ visible: false, product: null });
    try {
      await deleteProduct(product.id);
      refresh();
    } catch (err) {
      Alert.alert('Error', 'Failed to delete product. Please try again.');
    }
  }, [deleteDialog.product, deleteProduct, refresh]);

  const toggleMergeMode = useCallback(() => {
    setMergeMode((prev) => !prev);
    setMergeSelection([]);
    setExpandedId(null);
  }, []);

  const handleToggleSelect = useCallback((product) => {
    setMergeSelection((prev) => {
      const already = prev.find((p) => p.id === product.id);
      if (already) return prev.filter((p) => p.id !== product.id);
      if (prev.length >= 2) return [prev[1], product]; // rolling selection — keep it to 2
      return [...prev, product];
    });
  }, []);

  const handleMergeConfirm = useCallback(async (survivorId, duplicateId) => {
    setIsMerging(true);
    try {
      await productApi.mergeProducts(userId, survivorId, duplicateId);
      setMergeConfirmVisible(false);
      setMergeMode(false);
      setMergeSelection([]);
      refresh();
      Alert.alert('Merged', 'The duplicate product has been merged and archived.');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to merge products. Please try again.');
    } finally {
      setIsMerging(false);
    }
  }, [userId, refresh]);

  const handleIdentify = useCallback(async (product) => {
    setIdentify({ visible: true, product, result: null, isLoading: true, error: null, isApplying: false });
    try {
      const res = await productApi.identifyProduct(userId, product.id);
      setIdentify((prev) => (prev.product?.id === product.id ? { ...prev, result: res, isLoading: false } : prev));
    } catch (err) {
      setIdentify((prev) =>
        prev.product?.id === product.id
          ? { ...prev, isLoading: false, error: err.message || 'Could not identify this product right now.' }
          : prev
      );
    }
  }, [userId]);

  // The OCR ghost is always the duplicate; the established catalog entry survives.
  const handleIdentifyMerge = useCallback(async (match) => {
    const ghost = identify.product;
    setIdentify((prev) => ({ ...prev, isApplying: true }));
    try {
      await productApi.mergeProducts(userId, match.productId, ghost.id);
      setIdentify({ visible: false, product: null, result: null, isLoading: false, error: null, isApplying: false });
      refresh();
      Alert.alert('Merged', `"${ghost.name}" was merged into "${match.name}" and archived.`);
    } catch (err) {
      setIdentify((prev) => ({ ...prev, isApplying: false }));
      Alert.alert('Error', err.message || 'Failed to merge products. Please try again.');
    }
  }, [identify.product, userId, refresh]);

  const handleIdentifySaveAsNew = useCallback(async ({ name, salt, manufacturer }) => {
    const product = identify.product;
    const updates = {};
    if (name) updates.name = name;
    if (salt) updates.salt = salt;
    if (manufacturer) updates.manufacturer = manufacturer;

    // Nothing the AI could add — the product is already saved and correct as it stands.
    if (Object.keys(updates).length === 0) {
      setIdentify({ visible: false, product: null, result: null, isLoading: false, error: null, isApplying: false });
      Alert.alert('Kept', `"${product.name}" stays in your catalog as its own product.`);
      return;
    }

    setIdentify((prev) => ({ ...prev, isApplying: true }));
    try {
      await productApi.updateProduct(userId, product.id, updates);
      setIdentify({ visible: false, product: null, result: null, isLoading: false, error: null, isApplying: false });
      refresh();
      Alert.alert('Saved', `Saved as "${updates.name || product.name}" in your product catalog.`);
    } catch (err) {
      setIdentify((prev) => ({ ...prev, isApplying: false }));
      Alert.alert('Error', err.message || 'Failed to save the product. Please try again.');
    }
  }, [identify.product, userId, refresh]);

  const closeIdentify = useCallback(() => {
    setIdentify({ visible: false, product: null, result: null, isLoading: false, error: null, isApplying: false });
  }, []);

  const renderItem = useCallback(
    ({ item }) => (
      <ProductCard
        item={item}
        expanded={expandedId === item.id}
        onToggleExpand={handleToggleExpand}
        onEdit={handleEdit}
        onLongPress={handleLongPress}
        onSell={onSellPress}
        onIdentify={handleIdentify}
        mergeMode={mergeMode}
        selected={!!mergeSelection.find((p) => p.id === item.id)}
        onToggleSelect={handleToggleSelect}
      />
    ),
    [expandedId, handleToggleExpand, handleEdit, handleLongPress, onSellPress, handleIdentify, mergeMode, mergeSelection, handleToggleSelect]
  );

  const keyExtractor = useCallback((item) => item.id, []);

  const renderFooter = useCallback(() => {
    if (!pagination.hasMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#4F46E5" />
      </View>
    );
  }, [pagination.hasMore]);

  const hasActiveFilters = activeFilterCount > 0 || !!searchQuery;

  const ListEmptyComponent = useCallback(
    () => (
      <EmptyState
        hasActiveFilters={hasActiveFilters}
        onClearFilters={() => {
          setSearchQuery('');
          clearAllFilters();
        }}
        onAddPress={onAddPress}
      />
    ),
    [hasActiveFilters, clearAllFilters, onAddPress]
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <AppBar title="My Products" onBack={onBack} rightIcon="add" onRightPress={onAddPress} />

        <View style={styles.content}>
          {/* Search Bar */}
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={20} color="#64748B" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, batch or invoice #..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="#94A3B8" />
              </Pressable>
            )}
          </View>

          {/* Filter chip row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
            <Pressable
              style={[styles.filterChip, distributorIds.length > 0 && styles.filterChipActive]}
              onPress={() => setDistributorModalVisible(true)}
            >
              <ThemedText style={[styles.filterChipText, distributorIds.length > 0 && styles.filterChipTextActive]}>
                Distributor{distributorIds.length > 0 ? ` (${distributorIds.length})` : ''}
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.filterChip, expiryMonth && styles.filterChipActive]}
              onPress={() => setMonthModalVisible(true)}
            >
              <ThemedText style={[styles.filterChipText, expiryMonth && styles.filterChipTextActive]}>
                Expiring in{expiryMonth ? `: ${expiryMonth}` : ''}
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.filterChip, (receivedFrom || receivedTo) && styles.filterChipActive]}
              onPress={() => setRangeModalVisible(true)}
            >
              <ThemedText style={[styles.filterChipText, (receivedFrom || receivedTo) && styles.filterChipTextActive]}>
                Received on
              </ThemedText>
            </Pressable>
            <View style={styles.filterDivider} />
            <Pressable style={[styles.sortChip, sort === 'fefo' && styles.sortChipActive]} onPress={() => setSort('fefo')}>
              <ThemedText style={[styles.sortChipText, sort === 'fefo' && styles.sortChipTextActive]}>Earliest expiry</ThemedText>
            </Pressable>
            <Pressable style={[styles.sortChip, sort === 'name' && styles.sortChipActive]} onPress={() => setSort('name')}>
              <ThemedText style={[styles.sortChipText, sort === 'name' && styles.sortChipTextActive]}>A-Z</ThemedText>
            </Pressable>
          </ScrollView>

          {/* Active filter chips */}
          {(distributorIds.length > 0 || expiryMonth || receivedFrom || receivedTo) && (
            <View style={styles.activeChipsRow}>
              {distributorIds.map((id) => (
                <Pressable
                  key={id}
                  style={styles.activeChip}
                  onPress={() => setDistributorIds(distributorIds.filter((x) => x !== id))}
                >
                  <ThemedText style={styles.activeChipText} numberOfLines={1}>
                    {distributorNameById.get(id) || id}
                  </ThemedText>
                  <Ionicons name="close" size={12} color="#4F46E5" />
                </Pressable>
              ))}
              {expiryMonth && (
                <Pressable style={styles.activeChip} onPress={() => setExpiryMonth(null)}>
                  <ThemedText style={styles.activeChipText}>Exp {expiryMonth}</ThemedText>
                  <Ionicons name="close" size={12} color="#4F46E5" />
                </Pressable>
              )}
              {(receivedFrom || receivedTo) && (
                <Pressable style={styles.activeChip} onPress={() => setReceivedRange(null, null)}>
                  <ThemedText style={styles.activeChipText}>Received range</ThemedText>
                  <Ionicons name="close" size={12} color="#4F46E5" />
                </Pressable>
              )}
              {activeFilterCount >= 2 && (
                <Pressable style={styles.clearAllChip} onPress={clearAllFilters}>
                  <ThemedText style={styles.clearAllChipText}>Clear all</ThemedText>
                </Pressable>
              )}
            </View>
          )}

          {/* Stats Bar */}
          <View style={styles.statsBar}>
            <ThemedText style={styles.statsText}>
              {pagination.total} {pagination.total === 1 ? 'product' : 'products'}
            </ThemedText>
            <Pressable onPress={toggleMergeMode} style={styles.mergeToggle} hitSlop={6}>
              <Ionicons name="git-merge-outline" size={14} color={mergeMode ? '#4F46E5' : '#64748B'} />
              <ThemedText style={[styles.mergeToggleText, mergeMode && styles.mergeToggleTextActive]}>
                {mergeMode ? 'Cancel merge' : 'Merge duplicates'}
              </ThemedText>
            </Pressable>
          </View>

          {!mergeMode && mergeCandidateCount > 0 && (
            <Pressable style={styles.duplicateBanner} onPress={toggleMergeMode}>
              <Ionicons name="alert-circle-outline" size={16} color="#B45309" />
              <ThemedText style={styles.duplicateBannerText}>
                {mergeCandidateCount} possible duplicate {mergeCandidateCount === 1 ? 'pair' : 'pairs'} found — tap to review
              </ThemedText>
              <Ionicons name="chevron-forward" size={14} color="#B45309" />
            </Pressable>
          )}

          {mergeMode && (
            <View style={styles.mergeModeHint}>
              <ThemedText style={styles.mergeModeHintText}>
                Select 2 products that are the same drug ({mergeSelection.length}/2 selected)
              </ThemedText>
            </View>
          )}

          {error && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={24} color="#DC2626" />
              <ThemedText style={styles.errorText}>{error}</ThemedText>
              <Pressable style={styles.retryButton} onPress={refresh}>
                <ThemedText style={styles.retryText}>Retry</ThemedText>
              </Pressable>
            </View>
          )}

          <FlatList
            style={styles.productList}
            data={products}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={!isLoading ? ListEmptyComponent : null}
            ListFooterComponent={renderFooter}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={refresh} colors={['#4F46E5']} tintColor="#4F46E5" />
            }
          />
        </View>

        {mergeMode && mergeSelection.length === 2 && (
          <View style={styles.mergeActionBar}>
            <ThemedText style={styles.mergeActionBarText} numberOfLines={1}>
              {mergeSelection[0].name} + {mergeSelection[1].name}
            </ThemedText>
            <Pressable style={styles.mergeActionButton} onPress={() => setMergeConfirmVisible(true)}>
              <ThemedText style={styles.mergeActionButtonText}>Merge these 2</ThemedText>
            </Pressable>
          </View>
        )}

        <MergeConfirmModal
          visible={mergeConfirmVisible}
          products={mergeSelection}
          onClose={() => setMergeConfirmVisible(false)}
          onConfirm={handleMergeConfirm}
          isMerging={isMerging}
        />

        <IdentifyProductModal
          visible={identify.visible}
          product={identify.product}
          result={identify.result}
          isLoading={identify.isLoading}
          error={identify.error}
          isApplying={identify.isApplying}
          onClose={closeIdentify}
          onMerge={handleIdentifyMerge}
          onSaveAsNew={handleIdentifySaveAsNew}
        />

        <ConfirmDialog
          visible={deleteDialog.visible}
          title="Delete Product"
          message={`Are you sure you want to delete "${deleteDialog.product?.name}"? This action cannot be undone.`}
          type="danger"
          confirmText={isDeleting ? 'Deleting...' : 'Delete'}
          cancelText="Cancel"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteDialog({ visible: false, product: null })}
        />

        <DistributorModal
          visible={distributorModalVisible}
          distributors={distributors}
          selectedIds={distributorIds}
          onClose={() => setDistributorModalVisible(false)}
          onApply={setDistributorIds}
        />
        <ExpiryMonthModal
          visible={monthModalVisible}
          value={expiryMonth}
          onClose={() => setMonthModalVisible(false)}
          onSelect={setExpiryMonth}
        />
        <ReceivedRangeModal
          visible={rangeModalVisible}
          from={receivedFrom}
          to={receivedTo}
          onClose={() => setRangeModalVisible(false)}
          onApply={setReceivedRange}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  safeArea: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexShrink: 0,
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15, color: '#0F172A', fontWeight: '500' },

  // flexShrink: 0 pins these to their natural height — without it, Yoga's default
  // flexShrink:1 lets the FlatList below squeeze them when its own content grows,
  // which read as the filter row "collapsing" while data was loading in.
  filterRow: { flexGrow: 0, flexShrink: 0, marginBottom: 8 },
  filterRowContent: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: { backgroundColor: '#EEF2FF', borderColor: '#4F46E5' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  filterChipTextActive: { color: '#4F46E5' },
  filterDivider: { width: 1, height: 20, backgroundColor: '#E2E8F0', marginHorizontal: 2 },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sortChipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  sortChipText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  sortChipTextActive: { color: '#FFFFFF' },

  activeChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8, flexShrink: 0 },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    maxWidth: 200,
  },
  activeChipText: { fontSize: 11, fontWeight: '600', color: '#4F46E5' },
  clearAllChip: { paddingHorizontal: 10, paddingVertical: 5 },
  clearAllChipText: { fontSize: 11, fontWeight: '700', color: '#DC2626' },

  statsBar: { paddingVertical: 6, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  statsText: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  productList: { flex: 1 },
  listContent: { paddingBottom: 100 },

  mergeToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 6 },
  mergeToggleText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  mergeToggleTextActive: { color: '#4F46E5' },

  duplicateBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFBEB',
    borderRadius: 10, borderWidth: 1, borderColor: '#FDE68A', padding: 10, marginBottom: 8,
    flexShrink: 0,
  },
  duplicateBannerText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#92400E' },

  mergeModeHint: { paddingHorizontal: 4, paddingBottom: 8, flexShrink: 0 },
  mergeModeHintText: { fontSize: 12, fontWeight: '600', color: '#4F46E5' },

  mergeActionBar: {
    position: 'absolute', left: 16, right: 16, bottom: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#0F172A', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16,
  },
  mergeActionBarText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#E2E8F0' },
  mergeActionButton: { backgroundColor: '#4F46E5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  mergeActionButtonText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  mergeHint: { fontSize: 13, color: '#64748B', marginBottom: 12 },
  mergeOptionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#E2E8F0', marginBottom: 8,
  },
  mergeOptionRowSelected: { borderColor: '#4F46E5', backgroundColor: '#EEF2FF' },
  mergeOptionName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  mergeOptionMeta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  mergeKeepTag: { backgroundColor: '#4F46E5', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  mergeKeepTagText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase' },
  mergeWarningBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FFFBEB',
    borderRadius: 10, padding: 10, marginTop: 4,
  },
  mergeWarningText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 16 },

  // "What is this product?" — AI identification
  identifyIconButton: { padding: 5, borderRadius: 8, backgroundColor: '#F5F3FF' },
  identifySubject: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  identifyLoading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20 },
  identifyLoadingText: { flex: 1, fontSize: 13, color: '#64748B', lineHeight: 18 },
  identifyErrorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FEF2F2',
    borderRadius: 10, padding: 10,
  },
  identifyErrorText: { flex: 1, fontSize: 12, color: '#B91C1C', lineHeight: 16 },
  verdictBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 10 },
  verdictTitle: { flex: 1, fontSize: 13, fontWeight: '700' },
  aiReasoning: { fontSize: 13, color: '#475569', lineHeight: 19, marginTop: 10 },
  identifySectionLabel: {
    fontSize: 11, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase',
    letterSpacing: 0.5, marginTop: 18, marginBottom: 8,
  },
  identifyHint: { fontSize: 12, color: '#64748B', lineHeight: 17 },
  matchRow: { borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12, padding: 12, marginBottom: 8 },
  matchRowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  matchName: { flex: 1, fontSize: 14, fontWeight: '700', color: '#0F172A' },
  confidenceBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  confidenceBadgeText: { fontSize: 11, fontWeight: '800' },
  matchMeta: { fontSize: 12, color: '#64748B', marginTop: 3 },
  matchReason: { fontSize: 12, color: '#475569', lineHeight: 17, marginTop: 6 },
  mergeIntoButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#4F46E5', borderRadius: 10, paddingVertical: 10, marginTop: 10,
  },
  mergeIntoButtonText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  collisionBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FFFBEB',
    borderRadius: 10, padding: 10, marginTop: 8,
  },
  collisionText: { fontSize: 12, color: '#92400E', lineHeight: 16 },
  collisionMergeButton: {
    backgroundColor: '#B45309', borderRadius: 8, paddingVertical: 8,
    paddingHorizontal: 10, alignItems: 'center', marginTop: 8,
  },
  collisionMergeButtonText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  suggestionBox: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10 },
  suggestionIntro: { fontSize: 12, color: '#64748B', marginBottom: 6 },
  suggestionLine: { fontSize: 12, color: '#64748B', lineHeight: 19 },
  suggestionValue: { fontWeight: '700', color: '#0F172A' },
  saveAsNewButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#4F46E5', borderRadius: 10, paddingVertical: 11, marginTop: 10,
  },
  saveAsNewButtonText: { fontSize: 13, fontWeight: '700', color: '#4F46E5' },
  aiFootnote: { fontSize: 11, color: '#94A3B8', lineHeight: 15, marginTop: 14 },

  productCardInner: { padding: 0, borderRadius: 18, marginBottom: 10, overflow: 'hidden' },
  productCardSelected: { borderWidth: 2, borderColor: '#4F46E5' },
  mergeCheckbox: { marginRight: 10, marginTop: 2 },
  pressedOverlay: { opacity: 0.7 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 14 },
  cardTextCol: { flex: 1, marginRight: 10 },
  productName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  expiryLine: { fontSize: 13, fontWeight: '600', marginTop: 3 },
  distributorLine: { fontSize: 12, color: '#64748B', marginTop: 3 },
  matchTag: {
    marginTop: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  matchTagText: { fontSize: 11, fontWeight: '600', color: '#92400E' },
  cardRightCol: { alignItems: 'flex-end', gap: 6 },
  batchBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    minWidth: 56,
  },
  batchBadgeText: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  batchBadgeLabel: { fontSize: 9, color: '#64748B', textTransform: 'uppercase' },
  editIconButton: { padding: 2 },
  sellIconButton: {
    padding: 5,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
  },

  batchListContainer: { borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  batchRow: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  batchRowArchived: { opacity: 0.55 },
  batchRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  batchNumber: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  batchNumberHighlight: { backgroundColor: '#FEF3C7', paddingHorizontal: 4, borderRadius: 4 },
  archivedTag: { backgroundColor: '#E2E8F0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  archivedTagText: { fontSize: 9, fontWeight: '700', color: '#475569', textTransform: 'uppercase' },
  batchRowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  batchMetaText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  batchMetaTextMuted: { fontSize: 12, color: '#64748B' },
  batchMetaDot: { fontSize: 12, color: '#CBD5E1' },

  footerLoader: { paddingVertical: 20, alignItems: 'center' },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 32,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#0F172A', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
  },
  emptyAddButtonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },

  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    gap: 8,
    flexShrink: 0,
  },
  errorText: { flex: 1, fontSize: 13, color: '#DC2626' },
  retryButton: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#DC2626', borderRadius: 6 },
  retryText: { fontSize: 12, fontWeight: '600', color: '#FFFFFF' },

  modalKeyboardView: { flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  modalActionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalClearButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  modalClearButtonText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  modalApplyButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#4F46E5' },
  modalApplyButtonText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  yearStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 16 },
  yearText: { fontSize: 16, fontWeight: '700', color: '#0F172A', minWidth: 60, textAlign: 'center' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  monthCell: {
    width: '30%',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    marginBottom: 8,
  },
  monthCellSelected: { backgroundColor: '#4F46E5' },
  monthCellText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  monthCellTextSelected: { color: '#FFFFFF' },

  distributorList: { maxHeight: 320 },
  distributorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  distributorRowText: { fontSize: 14, color: '#0F172A', flex: 1 },
  noDistributorsText: { fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingVertical: 20 },
});
