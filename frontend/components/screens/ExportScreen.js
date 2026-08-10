import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import PrimaryButton from '@/components/ui/PrimaryButton';
import DateField from '@/components/ui/DateField';

/**
 * Export Data — Excel/CSV export of everything in Setu.
 *
 * Three steps: pick a type, set filters, choose a format. The row count is always
 * shown before generating, and the finished file goes straight to the native share
 * sheet (WhatsApp is the path most pharmacists actually use).
 */

const EXPORT_TYPES = [
  {
    key: 'purchases',
    title: 'Purchase Entries',
    subtitle: 'For import into Marg, Logic, Tally',
    detail: 'One row per bill line, plus a GST summary sheet for your accountant.',
    icon: 'receipt-outline',
    color: '#4F46E5',
    background: '#EEF2FF',
    hasDateRange: true,
    hasDistributor: true,
  },
  {
    key: 'expiry',
    title: 'Expiry Report',
    subtitle: 'The return list for your distributor',
    detail: 'Product, batch, expiry and quantity — optionally one sheet per distributor.',
    icon: 'alert-circle-outline',
    color: '#D97706',
    background: '#FEF3C7',
    hasExpiryWindow: true,
    hasGrouping: true,
  },
  {
    key: 'sales',
    title: 'Sale Register',
    subtitle: 'Daily sales, with the H1 register',
    detail: 'Date, product, batch, quantity and price. Filter to Schedule H1/NRX only.',
    icon: 'cart-outline',
    color: '#059669',
    background: '#ECFDF5',
    hasDateRange: true,
    hasScheduleFilter: true,
  },
  {
    key: 'ledger',
    title: 'Distributor Ledger',
    subtitle: 'Statement and payment list',
    detail: 'One distributor per workbook: running balance, then every payment.',
    icon: 'account-balance-wallet',
    ionIcon: 'wallet-outline',
    color: '#DC2626',
    background: '#FEF2F2',
    requiresDistributor: true,
  },
];

const EXPIRY_WINDOWS = [
  { key: 30, label: '30 days' },
  { key: 60, label: '60 days' },
  { key: 90, label: '90 days' },
  { key: 180, label: '180 days' },
  { key: null, label: 'All' },
];

// ---------- date helpers ----------
function toIso(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function isoToDdmmyyyy(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

function ddmmyyyyToIso(value) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value || '');
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

function presetRange(preset) {
  const now = new Date();
  const today = toIso(now);

  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      // Current week, Monday through today
      const day = now.getDay(); // 0 = Sunday
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      return { from: toIso(monday), to: today };
    }
    case 'month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toIso(first), to: today };
    }
    default:
      return { from: null, to: null };
  }
}

// ============================================================
// Distributor picker
// ============================================================
function DistributorPicker({ visible, distributors, selectedIds, multi, onToggle, onClose }) {
  const [query, setQuery] = useState('');
  const filtered = distributors.filter((d) =>
    d.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <AppBar title="Select Distributor" onBack={onClose} />
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search distributors…"
            placeholderTextColor="#94A3B8"
          />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {filtered.map((d) => {
            const selected = selectedIds.includes(d.id);
            return (
              <Pressable
                key={d.id}
                style={[styles.pickerRow, selected && styles.pickerRowSelected]}
                onPress={() => onToggle(d)}
              >
                <View style={styles.pickerAvatar}>
                  <ThemedText style={styles.pickerAvatarText}>
                    {d.name.charAt(0).toUpperCase()}
                  </ThemedText>
                </View>
                <ThemedText style={styles.pickerRowText} numberOfLines={1}>{d.name}</ThemedText>
                {selected && <Ionicons name="checkmark-circle" size={22} color="#4F46E5" />}
              </Pressable>
            );
          })}
          {filtered.length === 0 && (
            <ThemedText style={styles.emptyHint}>No distributors found</ThemedText>
          )}
        </ScrollView>
        {multi && (
          <View style={styles.pickerFooter}>
            <PrimaryButton title="Done" onPress={onClose} />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ============================================================
// Export screen
// ============================================================
export default function ExportScreen({
  distributors = [],
  onBack,
  onPreview,
  onGenerate,
  isGenerating = false,
}) {
  const [selectedType, setSelectedType] = useState(null);
  const [preset, setPreset] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [withinDays, setWithinDays] = useState(90);
  const [groupByDistributor, setGroupByDistributor] = useState(false);
  const [scheduleOnly, setScheduleOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [distributorIds, setDistributorIds] = useState([]);
  const [format, setFormat] = useState('xlsx');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const config = EXPORT_TYPES.find((t) => t.key === selectedType);

  const filters = useMemo(() => {
    if (!config) return {};
    const range = preset === 'custom'
      ? { from: ddmmyyyyToIso(customFrom), to: ddmmyyyyToIso(customTo) }
      : presetRange(preset);

    const built = { includeArchived };

    if (config.hasDateRange) {
      if (range.from) built.from = range.from;
      if (range.to) built.to = range.to;
    }
    if (config.hasExpiryWindow && withinDays !== null) built.withinDays = withinDays;
    if (config.hasGrouping) built.groupByDistributor = groupByDistributor;
    if (config.hasScheduleFilter && scheduleOnly) built.scheduleOnly = true;
    if (config.hasDistributor && distributorIds.length > 0) built.distributorIds = distributorIds;
    if (config.requiresDistributor && distributorIds.length > 0) {
      built.distributorId = distributorIds[0];
    }
    return built;
  }, [
    config, preset, customFrom, customTo, withinDays, groupByDistributor,
    scheduleOnly, includeArchived, distributorIds,
  ]);

  // A ledger export is meaningless without a distributor chosen
  const missingDistributor = !!config?.requiresDistributor && distributorIds.length === 0;

  // Refresh the row count whenever the filters change
  useEffect(() => {
    if (!config || missingDistributor) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    (async () => {
      const result = await onPreview(selectedType, filters);
      if (!cancelled) {
        setPreview(result);
        setPreviewLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [config, selectedType, filters, missingDistributor, onPreview]);

  const handleToggleDistributor = useCallback((distributor) => {
    const multi = !config?.requiresDistributor;
    setDistributorIds((prev) => {
      if (!multi) return [distributor.id];
      return prev.includes(distributor.id)
        ? prev.filter((id) => id !== distributor.id)
        : [...prev, distributor.id];
    });
    if (config?.requiresDistributor) setPickerVisible(false);
  }, [config]);

  const handleGenerate = useCallback(() => {
    onGenerate(selectedType, filters, format);
  }, [onGenerate, selectedType, filters, format]);

  const resetFilters = useCallback(() => {
    setPreset('month');
    setCustomFrom('');
    setCustomTo('');
    setWithinDays(90);
    setGroupByDistributor(false);
    setScheduleOnly(false);
    setIncludeArchived(false);
    setDistributorIds([]);
    setFormat('xlsx');
    setPreview(null);
  }, []);

  // ===== Step 1: pick a type =====
  if (!config) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <AppBar title="Export Data" onBack={onBack} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText style={styles.introText}>
            Take your data out as a clean Excel file — for your ERP, your accountant, or
            your distributor.
          </ThemedText>

          {EXPORT_TYPES.map((type) => (
            <Pressable
              key={type.key}
              style={({ pressed }) => [styles.typeCard, pressed && styles.typeCardPressed]}
              onPress={() => { resetFilters(); setSelectedType(type.key); }}
            >
              <View style={[styles.typeIcon, { backgroundColor: type.background }]}>
                <Ionicons name={type.ionIcon || type.icon} size={24} color={type.color} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.typeTitle}>{type.title}</ThemedText>
                <ThemedText style={styles.typeSubtitle}>{type.subtitle}</ThemedText>
                <ThemedText style={styles.typeDetail}>{type.detail}</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ===== Steps 2 & 3: filters + format =====
  const noData = preview && preview.rowCount === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppBar title={config.title} onBack={() => setSelectedType(null)} />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Date range */}
        {config.hasDateRange && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Date Range</ThemedText>
            <View style={styles.chipRow}>
              {[
                { key: 'today', label: 'Today' },
                { key: 'week', label: 'This week' },
                { key: 'month', label: 'This month' },
                { key: 'custom', label: 'Custom' },
              ].map((option) => (
                <Pressable
                  key={option.key}
                  style={[styles.chip, preset === option.key && styles.chipActive]}
                  onPress={() => setPreset(option.key)}
                >
                  <ThemedText style={[styles.chipText, preset === option.key && styles.chipTextActive]}>
                    {option.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            {preset === 'custom' ? (
              <View style={styles.row}>
                <View style={styles.halfField}>
                  <DateField label="From" value={customFrom} onChange={setCustomFrom} />
                </View>
                <View style={styles.halfField}>
                  <DateField label="To" value={customTo} onChange={setCustomTo} />
                </View>
              </View>
            ) : (
              <ThemedText style={styles.rangeHint}>
                {isoToDdmmyyyy(presetRange(preset).from)} to {isoToDdmmyyyy(presetRange(preset).to)}
              </ThemedText>
            )}
          </View>
        )}

        {/* Expiry window */}
        {config.hasExpiryWindow && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Expiring Within</ThemedText>
            <View style={styles.chipRow}>
              {EXPIRY_WINDOWS.map((option) => (
                <Pressable
                  key={String(option.key)}
                  style={[styles.chip, withinDays === option.key && styles.chipActive]}
                  onPress={() => setWithinDays(option.key)}
                >
                  <ThemedText style={[styles.chipText, withinDays === option.key && styles.chipTextActive]}>
                    {option.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Distributor */}
        {(config.hasDistributor || config.requiresDistributor) && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>
              Distributor{config.requiresDistributor ? '' : ' (optional)'}
            </ThemedText>
            <Pressable style={styles.selectorRow} onPress={() => setPickerVisible(true)}>
              <Ionicons name="business-outline" size={18} color="#64748B" />
              <ThemedText style={styles.selectorText} numberOfLines={1}>
                {distributorIds.length === 0
                  ? config.requiresDistributor ? 'Choose a distributor' : 'All distributors'
                  : distributorIds.length === 1
                  ? distributors.find((d) => d.id === distributorIds[0])?.name || '1 selected'
                  : `${distributorIds.length} selected`}
              </ThemedText>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </Pressable>
          </View>
        )}

        {/* Toggles */}
        {(config.hasGrouping || config.hasScheduleFilter) && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Options</ThemedText>
            {config.hasGrouping && (
              <Pressable
                style={styles.toggleRow}
                onPress={() => setGroupByDistributor((v) => !v)}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.toggleLabel}>One sheet per distributor</ThemedText>
                  <ThemedText style={styles.toggleHint}>
                    Send each distributor only their own return list
                  </ThemedText>
                </View>
                <View style={[styles.toggle, groupByDistributor && styles.toggleOn]}>
                  <View style={[styles.toggleKnob, groupByDistributor && styles.toggleKnobOn]} />
                </View>
              </Pressable>
            )}
            {config.hasScheduleFilter && (
              <Pressable style={styles.toggleRow} onPress={() => setScheduleOnly((v) => !v)}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.toggleLabel}>Schedule H1 / NRX only</ThemedText>
                  <ThemedText style={styles.toggleHint}>
                    The register a drug inspector asks for
                  </ThemedText>
                </View>
                <View style={[styles.toggle, scheduleOnly && styles.toggleOn]}>
                  <View style={[styles.toggleKnob, scheduleOnly && styles.toggleKnobOn]} />
                </View>
              </Pressable>
            )}
          </View>
        )}

        {/* Archived toggle — off by default, per the export rules */}
        <View style={styles.section}>
          <Pressable style={styles.toggleRow} onPress={() => setIncludeArchived((v) => !v)}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.toggleLabel}>Include archived records</ThemedText>
              <ThemedText style={styles.toggleHint}>Off by default</ThemedText>
            </View>
            <View style={[styles.toggle, includeArchived && styles.toggleOn]}>
              <View style={[styles.toggleKnob, includeArchived && styles.toggleKnobOn]} />
            </View>
          </Pressable>
        </View>

        {/* Format */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Format</ThemedText>
          <View style={styles.chipRow}>
            {[
              { key: 'xlsx', label: 'Excel (.xlsx)' },
              { key: 'csv', label: 'CSV' },
            ].map((option) => (
              <Pressable
                key={option.key}
                style={[styles.formatChip, format === option.key && styles.chipActive]}
                onPress={() => setFormat(option.key)}
              >
                <ThemedText style={[styles.chipText, format === option.key && styles.chipTextActive]}>
                  {option.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          {format === 'csv' && config.key === 'purchases' && (
            <ThemedText style={styles.formatHint}>
              CSV holds the purchase rows only. Choose Excel to also get the GST Summary sheet.
            </ThemedText>
          )}
          {format === 'csv' && config.hasGrouping && groupByDistributor && (
            <ThemedText style={styles.formatHint}>
              CSV is a single sheet — choose Excel to get one sheet per distributor.
            </ThemedText>
          )}
        </View>

        {/* Row count preview */}
        <View style={[styles.previewCard, noData && styles.previewCardEmpty]}>
          {previewLoading ? (
            <ActivityIndicator color="#4F46E5" />
          ) : missingDistributor ? (
            <ThemedText style={styles.previewTextEmpty}>
              Choose a distributor to continue
            </ThemedText>
          ) : (
            <>
              <Ionicons
                name={noData ? 'information-circle-outline' : 'checkmark-circle'}
                size={20}
                color={noData ? '#B45309' : '#059669'}
              />
              <ThemedText style={[styles.previewText, noData && styles.previewTextEmpty]}>
                {preview?.summary || 'Choose your filters'}
              </ThemedText>
            </>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          title={isGenerating ? 'Generating…' : 'Generate & Share'}
          icon="share-social-outline"
          onPress={handleGenerate}
          loading={isGenerating}
          disabled={isGenerating || previewLoading || noData || missingDistributor}
        />
      </View>

      <DistributorPicker
        visible={pickerVisible}
        distributors={distributors}
        selectedIds={distributorIds}
        multi={!config.requiresDistributor}
        onToggle={handleToggleDistributor}
        onClose={() => setPickerVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { padding: 16, paddingBottom: 32 },

  introText: { fontSize: 13.5, color: '#64748B', lineHeight: 20, marginBottom: 18 },

  typeCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14, backgroundColor: '#FFFFFF',
    borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9',
  },
  typeCardPressed: { opacity: 0.85, backgroundColor: '#F8FAFC' },
  typeIcon: {
    width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  typeTitle: { fontSize: 15.5, fontWeight: '700', color: '#0F172A' },
  typeSubtitle: { fontSize: 12.5, fontWeight: '600', color: '#4F46E5', marginTop: 2 },
  typeDetail: { fontSize: 12, color: '#94A3B8', marginTop: 5, lineHeight: 17 },

  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 11.5, fontWeight: '700', color: '#64748B', textTransform: 'uppercase',
    letterSpacing: 0.4, marginBottom: 10,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: '#FFFFFF',
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  formatChip: {
    flex: 1, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  chipActive: { backgroundColor: '#EEF2FF', borderColor: '#4F46E5' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  chipTextActive: { color: '#4F46E5', fontWeight: '700' },

  rangeHint: { fontSize: 12.5, color: '#94A3B8', marginTop: 10, fontWeight: '600' },
  formatHint: { fontSize: 12, color: '#94A3B8', marginTop: 10, lineHeight: 17 },

  row: { flexDirection: 'row', gap: 12, marginTop: 12 },
  halfField: { flex: 1 },

  selectorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF',
    borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  selectorText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0F172A' },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF',
    borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9',
  },
  toggleLabel: { fontSize: 13.5, fontWeight: '600', color: '#0F172A' },
  toggleHint: { fontSize: 11.5, color: '#94A3B8', marginTop: 2 },
  toggle: {
    width: 46, height: 27, borderRadius: 14, backgroundColor: '#E2E8F0',
    padding: 3, justifyContent: 'center',
  },
  toggleOn: { backgroundColor: '#4F46E5' },
  toggleKnob: {
    width: 21, height: 21, borderRadius: 11, backgroundColor: '#FFFFFF',
  },
  toggleKnobOn: { alignSelf: 'flex-end' },

  previewCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#ECFDF5', borderRadius: 14, padding: 16, minHeight: 56,
  },
  previewCardEmpty: { backgroundColor: '#FFFBEB' },
  previewText: { fontSize: 13.5, fontWeight: '700', color: '#065F46' },
  previewTextEmpty: { fontSize: 13.5, fontWeight: '700', color: '#92400E' },

  footer: {
    padding: 16, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0',
  },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF',
    marginHorizontal: 16, marginTop: 16, paddingHorizontal: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: '#0F172A' },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF',
    borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  pickerRowSelected: { borderColor: '#4F46E5', backgroundColor: '#F5F7FF' },
  pickerAvatar: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: '#EEF2FF',
    justifyContent: 'center', alignItems: 'center',
  },
  pickerAvatarText: { fontSize: 14, fontWeight: '700', color: '#4F46E5' },
  pickerRowText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0F172A' },
  pickerFooter: { padding: 16, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  emptyHint: { textAlign: 'center', color: '#94A3B8', marginTop: 32, fontSize: 13 },
});
