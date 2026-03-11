import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AppBar from '@/components/ui/AppBar';
import Card from '@/components/ui/Card';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import Toast from '@/components/ui/Toast';
import { parseUpiPaymentText, getPaymentAppName, formatPaymentAmount } from '@/utils/paymentParser';

/**
 * Editable Field Component
 */
const EditableField = ({ label, value, onChangeText, placeholder, icon, keyboardType, multiline }) => (
  <View style={styles.fieldContainer}>
    <View style={styles.fieldLabelRow}>
      {icon && <MaterialIcons name={icon} size={16} color="#64748B" style={styles.fieldIcon} />}
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
    </View>
    <TextInput
      style={[styles.fieldInput, multiline && styles.fieldInputMultiline]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#94A3B8"
      keyboardType={keyboardType || 'default'}
      multiline={multiline}
      numberOfLines={multiline ? 3 : 1}
    />
  </View>
);

/**
 * Distributor Selector Component
 */
const DistributorSelector = ({ distributors, selected, onSelect, matchedDistributor }) => {
  const [showAll, setShowAll] = useState(false);
  const displayList = showAll ? distributors : distributors.slice(0, 5);

  return (
    <Card style={styles.distributorCard}>
      <ThemedText style={styles.sectionTitle}>Link to Distributor</ThemedText>

      {matchedDistributor && !selected && (
        <Pressable
          style={styles.matchedBanner}
          onPress={() => onSelect(matchedDistributor)}
        >
          <MaterialIcons name="auto-awesome" size={18} color="#059669" />
          <ThemedText style={styles.matchedText}>
            Auto-matched: <ThemedText style={styles.matchedName}>{matchedDistributor.name}</ThemedText>
          </ThemedText>
          <ThemedText style={styles.tapToLink}>Tap to link</ThemedText>
        </Pressable>
      )}

      {selected && (
        <View style={styles.selectedDistributor}>
          <View style={styles.selectedAvatar}>
            <ThemedText style={styles.selectedAvatarText}>
              {selected.name.charAt(0).toUpperCase()}
            </ThemedText>
          </View>
          <View style={styles.selectedInfo}>
            <ThemedText style={styles.selectedName}>{selected.name}</ThemedText>
            {selected.gstin && (
              <ThemedText style={styles.selectedGstin}>GST: {selected.gstin}</ThemedText>
            )}
          </View>
          <Pressable onPress={() => onSelect(null)} style={styles.clearButton}>
            <Ionicons name="close-circle" size={22} color="#94A3B8" />
          </Pressable>
        </View>
      )}

      {!selected && (
        <>
          <ThemedText style={styles.selectHint}>Select a distributor:</ThemedText>
          {displayList.map((d) => (
            <Pressable
              key={d.id}
              style={({ pressed }) => [
                styles.distributorOption,
                pressed && styles.distributorOptionPressed,
              ]}
              onPress={() => onSelect(d)}
            >
              <View style={styles.distributorAvatar}>
                <ThemedText style={styles.distributorAvatarText}>
                  {d.name.charAt(0).toUpperCase()}
                </ThemedText>
              </View>
              <View style={styles.distributorOptionInfo}>
                <ThemedText style={styles.distributorOptionName}>{d.name}</ThemedText>
                {d.phone && (
                  <ThemedText style={styles.distributorOptionPhone}>{d.phone}</ThemedText>
                )}
              </View>
            </Pressable>
          ))}
          {distributors.length > 5 && (
            <Pressable onPress={() => setShowAll(!showAll)}>
              <ThemedText style={styles.showMoreText}>
                {showAll ? 'Show less' : `Show all ${distributors.length} distributors`}
              </ThemedText>
            </Pressable>
          )}
          {distributors.length === 0 && (
            <ThemedText style={styles.noDistributors}>
              No distributors found. The payment will be saved without a distributor link.
            </ThemedText>
          )}
        </>
      )}
    </Card>
  );
};

/**
 * SharedPaymentScreen
 * Receives shared text from UPI apps, parses it, and saves the payment
 */
export default function SharedPaymentScreen({
  sharedText,
  distributors = [],
  onSave,
  onBack,
  loading = false,
  matchedDistributor = null,
}) {
  const [parsedData, setParsedData] = useState(null);
  const [parseResult, setParseResult] = useState(null);

  // Editable fields
  const [amount, setAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [paymentApp, setPaymentApp] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedDistributor, setSelectedDistributor] = useState(null);
  const [rawText, setRawText] = useState('');

  const [toast, setToast] = useState({ visible: false, message: '', type: 'info', title: '' });
  const [showRawText, setShowRawText] = useState(false);

  // Parse the shared text on mount
  useEffect(() => {
    if (sharedText) {
      setRawText(sharedText);
      const result = parseUpiPaymentText(sharedText);
      setParseResult(result);

      if (result.data) {
        const d = result.data;
        setAmount(d.amount ? String(d.amount) : '');
        setTransactionId(d.transactionId || '');
        setPayeeName(d.payeeName || '');
        setPaymentApp(d.paymentApp || '');
        setPaymentDate(d.paymentDate || new Date().toISOString());
        setParsedData(d);
      }
    }
  }, [sharedText]);

  // Auto-select matched distributor
  useEffect(() => {
    if (matchedDistributor && !selectedDistributor) {
      // Don't auto-select, but show as suggested
    }
  }, [matchedDistributor]);

  const showToast = (message, type = 'info', title = '') => {
    setToast({ visible: true, message, type, title });
  };

  const handleSave = useCallback(() => {
    if (!amount || parseFloat(amount) <= 0) {
      showToast('Please enter a valid payment amount', 'error', 'Invalid Amount');
      return;
    }

    const paymentData = {
      amount: parseFloat(amount),
      transactionId: transactionId.trim() || null,
      upiRefNumber: parsedData?.upiRefNumber || null,
      payeeName: payeeName.trim() || null,
      payeeUpiId: parsedData?.payeeUpiId || null,
      payerUpiId: parsedData?.payerUpiId || null,
      paymentApp: paymentApp || null,
      paymentMethod: 'upi',
      paymentDate: paymentDate || new Date().toISOString(),
      paymentStatus: parsedData?.paymentStatus || 'success',
      rawSharedText: rawText || null,
      distributorId: selectedDistributor?.id || null,
      notes: notes.trim() || null,
    };

    onSave?.(paymentData);
  }, [amount, transactionId, payeeName, paymentApp, paymentDate, notes, selectedDistributor, parsedData, rawText, onSave]);

  const formatDateForDisplay = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <AppBar title="Record Payment" onBack={onBack} />

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Parse Status Banner */}
            {parseResult && (
              <Card style={styles.statusCard}>
                <View style={styles.statusRow}>
                  <MaterialIcons
                    name={parseResult.success ? 'check-circle' : 'info'}
                    size={22}
                    color={parseResult.success ? '#059669' : '#D97706'}
                  />
                  <View style={styles.statusTextContainer}>
                    <ThemedText style={styles.statusTitle}>
                      {parseResult.success
                        ? `Payment details parsed from ${getPaymentAppName(paymentApp)}`
                        : 'Could not fully parse payment details'}
                    </ThemedText>
                    <ThemedText style={styles.statusSubtitle}>
                      {parseResult.success
                        ? 'Review and edit the details below before saving'
                        : 'Please fill in the details manually'}
                    </ThemedText>
                  </View>
                </View>

                {/* Confidence indicators */}
                <View style={styles.parseIndicators}>
                  <View style={[styles.indicator, parseResult.parsed?.hasAmount && styles.indicatorGreen]}>
                    <ThemedText style={[styles.indicatorText, parseResult.parsed?.hasAmount && styles.indicatorTextGreen]}>
                      Amount {parseResult.parsed?.hasAmount ? '✓' : '✗'}
                    </ThemedText>
                  </View>
                  <View style={[styles.indicator, parseResult.parsed?.hasTransactionId && styles.indicatorGreen]}>
                    <ThemedText style={[styles.indicatorText, parseResult.parsed?.hasTransactionId && styles.indicatorTextGreen]}>
                      Txn ID {parseResult.parsed?.hasTransactionId ? '✓' : '✗'}
                    </ThemedText>
                  </View>
                  <View style={[styles.indicator, parseResult.parsed?.hasPayeeName && styles.indicatorGreen]}>
                    <ThemedText style={[styles.indicatorText, parseResult.parsed?.hasPayeeName && styles.indicatorTextGreen]}>
                      Payee {parseResult.parsed?.hasPayeeName ? '✓' : '✗'}
                    </ThemedText>
                  </View>
                </View>
              </Card>
            )}

            {/* Amount (Prominent) */}
            <Card style={styles.amountCard}>
              <ThemedText style={styles.amountLabel}>Payment Amount</ThemedText>
              <View style={styles.amountInputRow}>
                <ThemedText style={styles.rupeeSymbol}>₹</ThemedText>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor="#CBD5E1"
                  keyboardType="decimal-pad"
                />
              </View>
              {paymentApp && (
                <View style={styles.appBadge}>
                  <MaterialIcons name="payment" size={14} color="#4F46E5" />
                  <ThemedText style={styles.appBadgeText}>
                    {getPaymentAppName(paymentApp)}
                  </ThemedText>
                </View>
              )}
            </Card>

            {/* Transaction Details */}
            <Card style={styles.detailsCard}>
              <ThemedText style={styles.sectionTitle}>Transaction Details</ThemedText>

              <EditableField
                label="Transaction / UPI Ref ID"
                value={transactionId}
                onChangeText={setTransactionId}
                placeholder="Enter transaction ID"
                icon="receipt"
              />

              <EditableField
                label="Paid To"
                value={payeeName}
                onChangeText={setPayeeName}
                placeholder="Payee / merchant name"
                icon="store"
              />

              <View style={styles.fieldContainer}>
                <View style={styles.fieldLabelRow}>
                  <MaterialIcons name="calendar-today" size={16} color="#64748B" style={styles.fieldIcon} />
                  <ThemedText style={styles.fieldLabel}>Payment Date</ThemedText>
                </View>
                <ThemedText style={styles.dateDisplay}>
                  {formatDateForDisplay(paymentDate) || 'Not detected'}
                </ThemedText>
              </View>
            </Card>

            {/* Distributor Selection */}
            <DistributorSelector
              distributors={distributors}
              selected={selectedDistributor}
              onSelect={setSelectedDistributor}
              matchedDistributor={matchedDistributor}
            />

            {/* Notes */}
            <Card style={styles.notesCard}>
              <EditableField
                label="Notes (Optional)"
                value={notes}
                onChangeText={setNotes}
                placeholder="Add any notes about this payment..."
                icon="note"
                multiline
              />
            </Card>

            {/* Raw Text Toggle */}
            {rawText && (
              <Pressable
                style={styles.rawTextToggle}
                onPress={() => setShowRawText(!showRawText)}
              >
                <Ionicons
                  name={showRawText ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color="#64748B"
                />
                <ThemedText style={styles.rawTextToggleText}>
                  {showRawText ? 'Hide' : 'Show'} original shared text
                </ThemedText>
              </Pressable>
            )}
            {showRawText && rawText && (
              <Card style={styles.rawTextCard}>
                <ThemedText style={styles.rawTextContent}>{rawText}</ThemedText>
              </Card>
            )}

            {/* Save Button */}
            <View style={styles.buttonContainer}>
              <PrimaryButton
                title={loading ? 'Saving...' : 'Save Payment'}
                icon="checkmark-circle-outline"
                onPress={handleSave}
                loading={loading}
                disabled={loading || !amount}
              />
            </View>

            <View style={styles.bottomSpacer} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        title={toast.title}
        onDismiss={() => setToast({ ...toast, visible: false })}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },

  // Status Card
  statusCard: {
    padding: 16,
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  statusTextContainer: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  statusSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  parseIndicators: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  indicator: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  indicatorGreen: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  indicatorText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DC2626',
  },
  indicatorTextGreen: {
    color: '#16A34A',
  },

  // Amount Card
  amountCard: {
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rupeeSymbol: {
    fontSize: 36,
    fontWeight: '700',
    color: '#059669',
    marginRight: 4,
  },
  amountInput: {
    fontSize: 36,
    fontWeight: '700',
    color: '#059669',
    minWidth: 120,
    textAlign: 'center',
  },
  appBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  appBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
  },

  // Details Card
  detailsCard: {
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
  },

  // Field
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  fieldIcon: {
    marginRight: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  fieldInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
  },
  fieldInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  dateDisplay: {
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '500',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  // Distributor Card
  distributorCard: {
    padding: 16,
    marginBottom: 16,
  },
  matchedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 12,
  },
  matchedText: {
    flex: 1,
    fontSize: 13,
    color: '#065F46',
  },
  matchedName: {
    fontWeight: '700',
  },
  tapToLink: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  selectHint: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 8,
  },
  selectedDistributor: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  selectedAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  selectedInfo: {
    flex: 1,
    marginLeft: 12,
  },
  selectedName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  selectedGstin: {
    fontSize: 12,
    color: '#4F46E5',
    marginTop: 2,
  },
  clearButton: {
    padding: 4,
  },
  distributorOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 4,
  },
  distributorOptionPressed: {
    backgroundColor: '#F1F5F9',
  },
  distributorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  distributorAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4F46E5',
  },
  distributorOptionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  distributorOptionName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  distributorOptionPhone: {
    fontSize: 12,
    color: '#64748B',
  },
  showMoreText: {
    fontSize: 13,
    color: '#4F46E5',
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 8,
  },
  noDistributors: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 12,
  },

  // Notes
  notesCard: {
    padding: 16,
    marginBottom: 16,
  },

  // Raw Text
  rawTextToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginBottom: 8,
  },
  rawTextToggleText: {
    fontSize: 13,
    color: '#64748B',
  },
  rawTextCard: {
    padding: 14,
    marginBottom: 16,
    backgroundColor: '#F8FAFC',
  },
  rawTextContent: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Buttons
  buttonContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
  bottomSpacer: {
    height: 40,
  },
});
