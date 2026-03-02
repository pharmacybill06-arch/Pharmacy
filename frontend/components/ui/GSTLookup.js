import React, { useState, useCallback } from 'react';
import {
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { gstinApi } from '@/services/api';

/**
 * GSTLookup Component
 * Allows user to enter a GST number and fetch distributor info from Sandbox API
 * 
 * @param {function} onDistributorFound - Called with { name, gstin, address, phone, dlNumber, email } + full API data
 * @param {function} onError - Called with error message string
 * @param {string} initialGstin - Pre-fill GSTIN value
 */
export default function GSTLookup({ onDistributorFound, onError, initialGstin = '' }) {
  const [gstin, setGstin] = useState(initialGstin);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Format GSTIN as user types (uppercase, max 15 chars)
  const handleGstinChange = useCallback((text) => {
    const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
    setGstin(cleaned);
    // Clear previous results when user edits
    if (result || error) {
      setResult(null);
      setError(null);
    }
  }, [result, error]);

  const handleLookup = useCallback(async () => {
    if (!gstin || gstin.length !== 15) {
      const msg = 'Please enter a valid 15-character GSTIN';
      setError(msg);
      onError?.(msg);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await gstinApi.lookupGstin(gstin);

      if (response.success && response.valid && response.data) {
        setResult(response.data);
        // Pass distributor-ready data to parent
        onDistributorFound?.({
          ...response.data.distributor,
          // Also pass full API response for display
          _apiData: response.data,
        });
      } else if (response.success && !response.valid) {
        const msg = response.message || 'GSTIN not found in GST records';
        setError(msg);
        onError?.(msg);
      } else {
        const msg = response.error || 'Failed to lookup GSTIN';
        setError(msg);
        onError?.(msg);
      }
    } catch (err) {
      const msg = err.message || 'GST lookup failed. Please try again.';
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [gstin, onDistributorFound, onError]);

  const isValidFormat = gstin.length === 15;

  return (
    <View style={styles.container}>
      {/* GSTIN Input Row */}
      <View style={styles.inputRow}>
        <View style={styles.inputWrapper}>
          <Ionicons name="document-text-outline" size={18} color="#64748B" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            value={gstin}
            onChangeText={handleGstinChange}
            placeholder="Enter 15-digit GSTIN"
            placeholderTextColor="#94A3B8"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={15}
            keyboardType="default"
            editable={!loading}
          />
          {gstin.length > 0 && !loading && (
            <Pressable onPress={() => { setGstin(''); setResult(null); setError(null); }} style={styles.clearButton}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </Pressable>
          )}
        </View>
        <Pressable
          style={[
            styles.lookupButton,
            (!isValidFormat || loading) && styles.lookupButtonDisabled,
          ]}
          onPress={handleLookup}
          disabled={!isValidFormat || loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Ionicons name="search" size={16} color="#FFFFFF" />
              <ThemedText style={styles.lookupButtonText}>Fetch</ThemedText>
            </>
          )}
        </Pressable>
      </View>

      {/* Character counter */}
      <ThemedText style={[styles.charCount, isValidFormat && styles.charCountValid]}>
        {gstin.length}/15
      </ThemedText>

      {/* Error Display */}
      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={16} color="#DC2626" />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </View>
      )}

      {/* Success Result Display */}
      {result && (
        <View style={styles.resultContainer}>
          <View style={styles.resultHeader}>
            <Ionicons name="checkmark-circle" size={18} color="#059669" />
            <ThemedText style={styles.resultTitle}>GST Details Found</ThemedText>
          </View>
          
          <View style={styles.resultBody}>
            {/* Business Name */}
            <View style={styles.resultRow}>
              <Ionicons name="business-outline" size={15} color="#64748B" />
              <View style={styles.resultInfo}>
                <ThemedText style={styles.resultLabel}>Business Name</ThemedText>
                <ThemedText style={styles.resultValue}>
                  {result.tradeName || result.legalName || 'N/A'}
                </ThemedText>
              </View>
            </View>

            {/* Legal Name (if different from trade name) */}
            {result.legalName && result.tradeName && result.legalName !== result.tradeName && (
              <View style={styles.resultRow}>
                <Ionicons name="person-outline" size={15} color="#64748B" />
                <View style={styles.resultInfo}>
                  <ThemedText style={styles.resultLabel}>Legal Name</ThemedText>
                  <ThemedText style={styles.resultValue}>{result.legalName}</ThemedText>
                </View>
              </View>
            )}

            {/* GSTIN */}
            <View style={styles.resultRow}>
              <Ionicons name="document-text-outline" size={15} color="#64748B" />
              <View style={styles.resultInfo}>
                <ThemedText style={styles.resultLabel}>GSTIN</ThemedText>
                <ThemedText style={styles.resultValue}>{result.gstin}</ThemedText>
              </View>
            </View>

            {/* Status */}
            <View style={styles.resultRow}>
              <Ionicons name="shield-checkmark-outline" size={15} color={result.status === 'Active' ? '#059669' : '#DC2626'} />
              <View style={styles.resultInfo}>
                <ThemedText style={styles.resultLabel}>Status</ThemedText>
                <ThemedText style={[
                  styles.resultValue,
                  { color: result.status === 'Active' ? '#059669' : '#DC2626' }
                ]}>
                  {result.status || 'N/A'}
                </ThemedText>
              </View>
            </View>

            {/* Taxpayer Type */}
            {result.taxpayerType && (
              <View style={styles.resultRow}>
                <Ionicons name="briefcase-outline" size={15} color="#64748B" />
                <View style={styles.resultInfo}>
                  <ThemedText style={styles.resultLabel}>Type</ThemedText>
                  <ThemedText style={styles.resultValue}>{result.taxpayerType}</ThemedText>
                </View>
              </View>
            )}

            {/* Address */}
            {result.address?.full && (
              <View style={styles.resultRow}>
                <Ionicons name="location-outline" size={15} color="#64748B" />
                <View style={styles.resultInfo}>
                  <ThemedText style={styles.resultLabel}>Address</ThemedText>
                  <ThemedText style={styles.resultValue}>{result.address.full}</ThemedText>
                </View>
              </View>
            )}

            {/* Registration Date */}
            {result.registrationDate && (
              <View style={styles.resultRow}>
                <Ionicons name="calendar-outline" size={15} color="#64748B" />
                <View style={styles.resultInfo}>
                  <ThemedText style={styles.resultLabel}>Registered</ThemedText>
                  <ThemedText style={styles.resultValue}>{result.registrationDate}</ThemedText>
                </View>
              </View>
            )}
          </View>

          <View style={styles.resultFooter}>
            <Ionicons name="information-circle-outline" size={14} color="#4F46E5" />
            <ThemedText style={styles.footerText}>
              This distributor info will be used for the bill
            </ThemedText>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    paddingVertical: 12,
    letterSpacing: 0.5,
    fontFamily: 'monospace',
  },
  clearButton: {
    padding: 4,
  },
  lookupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
    minWidth: 80,
  },
  lookupButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  lookupButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  charCount: {
    fontSize: 11,
    fontWeight: '500',
    color: '#94A3B8',
    textAlign: 'right',
    marginTop: 4,
  },
  charCountValid: {
    color: '#059669',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#DC2626',
    flex: 1,
  },
  resultContainer: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    marginTop: 10,
    overflow: 'hidden',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  resultTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  resultBody: {
    padding: 12,
    gap: 10,
  },
  resultRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  resultInfo: {
    flex: 1,
  },
  resultLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 1,
  },
  resultValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  resultFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    borderTopWidth: 1,
    borderTopColor: '#BBF7D0',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#4F46E5',
    flex: 1,
  },
});
