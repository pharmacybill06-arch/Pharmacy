import React from 'react';
import { View, StyleSheet, SafeAreaView, ScrollView, Pressable, Platform } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import Card from '@/components/ui/Card';

/**
 * OcrReviewScreen
 * Shows OCR extracted text with confidence score
 * IMPORTANT: Do not change OCR text data
 */
export default function OcrReviewScreen({
  extractedText,
  confidence = 92,
  onContinue,
  onEditManually,
  onBack,
  onCopyText,
}) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <AppBar
          title="OCR Review"
          onBack={onBack}
        />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Status Pill */}
          <View style={styles.statusPill}>
            <Ionicons name="sparkles-outline" size={16} color="#4F46E5" />
            <ThemedText style={styles.statusText}>
              Gemini Parsed • {confidence}% confidence
            </ThemedText>
          </View>

          {/* Extracted Text Card */}
          <Card style={styles.textCard}>
            {/* Header with Copy Button */}
            <View style={styles.cardHeader}>
              <ThemedText style={styles.cardTitle}>Extracted Text</ThemedText>
              <Pressable
                style={({ pressed }) => [
                  styles.copyButton,
                  pressed && styles.copyButtonPressed,
                ]}
                onPress={onCopyText}
              >
                <Ionicons name="copy-outline" size={18} color="#0F172A" />
              </Pressable>
            </View>

            {/* Text Content */}
            <View style={styles.textContent}>
              <ScrollView
                style={styles.textScrollView}
                nestedScrollEnabled
                showsVerticalScrollIndicator={true}
              >
                <ThemedText style={styles.extractedText}>
                  {extractedText || 'No text extracted'}
                </ThemedText>
              </ScrollView>
            </View>
          </Card>

          {/* Bottom Spacer for Sticky Actions */}
          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Sticky Bottom Actions */}
        <View style={styles.stickyActions}>
          <PrimaryButton
            title="Continue"
            icon="checkmark-outline"
            onPress={onContinue}
          />
          
          <View style={styles.buttonSpacer} />
          
          <SecondaryButton
            title="Edit Manually"
            icon="create-outline"
            onPress={onEditManually}
          />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 160, // Space for sticky actions
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
    marginLeft: 6,
  },
  textCard: {
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  copyButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyButtonPressed: {
    opacity: 0.6,
  },
  textContent: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 12,
    minHeight: 200,
    maxHeight: 400,
  },
  textScrollView: {
    flex: 1,
  },
  extractedText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#0F172A',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 20,
  },
  bottomSpacer: {
    height: 20,
  },
  stickyActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  buttonSpacer: {
    height: 10,
  },
});
