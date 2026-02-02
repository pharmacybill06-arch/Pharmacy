import ThemedText from '@/components/themed-text';
import ThemedView from '@/components/themed-view';

import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from 'react-native';
import { calculateParseConfidence, formatParsedDataForForm, getItemsNeedingReview, parseOcrWithGemini } from './gemini-integration';
import InvoiceMetadataSection from './sections/InvoiceMetadataSection';
import ItemListSection from './sections/ItemListSection';
import OcrReferenceSection from './sections/OcrReferenceSection';
import PharmacyDetailsSection from './sections/PharmacyDetailsSection';
import TaxTotalsSection from './sections/TaxTotalsSection';

export default function BillForm({
  ocrText,
  onSubmit,
  onCancel,
  initialData,
}) {
  const [formData, setFormData] = useState({
    pharmacyName: initialData?.pharmacyName || '',
    shopAddress: initialData?.shopAddress || '',
    phoneNumbers: initialData?.phoneNumbers || '',
    gstin: initialData?.gstin || '',
    dlNumber: initialData?.dlNumber || '',
    invoiceNumber: initialData?.invoiceNumber || '',
    invoiceDate: initialData?.invoiceDate || '',
    dueDate: initialData?.dueDate || '',
    paymentType: initialData?.paymentType || 'cash',
    currentBalance: initialData?.currentBalance || 0,
    items: initialData?.items || [],
    subtotal: 0,
    cgst: 0,
    sgst: 0,
    totalGst: 0,
    roundOff: initialData?.roundOff || 0,
    grandTotal: 0,
  });

  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiError, setGeminiError] = useState(null);
  const [geminiConfidence, setGeminiConfidence] = useState(null);
  const [itemsNeedingManualReview, setItemsNeedingManualReview] = useState(0);

  useEffect(() => {
    calculateTotals();
  }, [formData.items]);

  useEffect(() => {
    if (!ocrText || ocrText.trim().length === 0) {
      console.log('[BillForm] No OCR text provided, skipping Gemini parsing');
      return;
    }

    const parseOcrWithGeminiIntegration = async () => {
      try {
        console.log(`[BillForm] Starting Gemini parsing - OCR text length: ${ocrText.length} characters`);
        setGeminiLoading(true);
        setGeminiError(null);

        console.log('[BillForm] Calling parseOcrWithGemini function...');
        const parsedData = await parseOcrWithGemini(ocrText);
        console.log('[BillForm] Gemini parse completed successfully', parsedData);

        console.log('[BillForm] Formatting parsed data for form...');
        const formattedData = formatParsedDataForForm(parsedData);
        console.log('[BillForm] Formatted data:', formattedData);

        const confidence = calculateParseConfidence(parsedData);
        console.log(`[BillForm] Parse confidence score: ${(confidence * 100).toFixed(1)}%`);
        setGeminiConfidence(confidence);

        const reviewItems = getItemsNeedingReview(formattedData.items);
        console.log(`[BillForm] Items flagged for manual review: ${reviewItems.length}`, reviewItems);
        setItemsNeedingManualReview(reviewItems.length);

        console.log('[BillForm] Updating form with parsed data...');
        setFormData((prev) => ({
          ...prev,
          ...formattedData,
          items: formattedData.items,
        }));

        console.log('[BillForm] Gemini integration working! Data auto-populated.');
        Alert.alert(
          'Gemini OCR Parse Complete ✅',
          `Confidence: ${(confidence * 100).toFixed(1)}%\n` +
          `Items requiring review: ${reviewItems.length}\n\n` +
          'Data has been auto-populated. Please review carefully!'
        );

        setGeminiLoading(false);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('[BillForm] Gemini parsing failed:', errorMessage, error);
        setGeminiError(errorMessage);
        setGeminiLoading(false);

        Alert.alert(
          'Gemini OCR Parse Failed ❌',
          `Error: ${errorMessage}\n\n` +
          'Please check the backend server is running and try again.\n' +
          'You can still edit the bill manually.'
        );
      }
    };

    parseOcrWithGeminiIntegration();
  }, [ocrText]);

  const calculateTotals = () => {
    let subtotal = 0;
    let totalGstAmount = 0;

    formData.items.forEach((item) => {
      const itemSubtotal = item.quantity * item.rate;
      const itemDiscount = item.discount || 0;
      const itemAfterDiscount = itemSubtotal - itemDiscount;
      const gstAmount = (itemAfterDiscount * item.gstPercent) / 100;

      subtotal += itemAfterDiscount;
      totalGstAmount += gstAmount;
    });

    const cgstAmount = totalGstAmount / 2;
    const sgstAmount = totalGstAmount / 2;

    const roundOff = formData.roundOff || 0;
    const grandTotal = subtotal + totalGstAmount + roundOff;

    setFormData((prev) => ({
      ...prev,
      subtotal: Math.round(subtotal * 100) / 100,
      cgst: Math.round(cgstAmount * 100) / 100,
      sgst: Math.round(sgstAmount * 100) / 100,
      totalGst: Math.round(totalGstAmount * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
    }));
  };

  const updatePharmacyDetails = (details) => {
    setFormData((prev) => ({ ...prev, ...details }));
  };

  const updateInvoiceMetadata = (metadata) => {
    setFormData((prev) => ({ ...prev, ...metadata }));
  };

  const updateItems = (items) => {
    setFormData((prev) => ({ ...prev, items }));
  };

  const updateRoundOff = (roundOff) => {
    setFormData((prev) => ({ ...prev, roundOff }));
  };

  const handleSubmit = () => {
    if (!formData.pharmacyName.trim()) {
      Alert.alert('Validation Error', 'Pharmacy name is required');
      return;
    }

    if (!formData.invoiceNumber.trim()) {
      Alert.alert('Validation Error', 'Invoice number is required');
      return;
    }

    if (!formData.invoiceDate.trim()) {
      Alert.alert('Validation Error', 'Invoice date is required');
      return;
    }

    if (formData.items.length === 0) {
      Alert.alert('Validation Error', 'At least one item is required');
      return;
    }

    const invalidItem = formData.items.find(
      (item) =>
        !item.name.trim() ||
        item.quantity <= 0 ||
        !item.unit.trim() ||
        item.rate <= 0 ||
        item.gstPercent < 0
    );

    // if (invalidItem) {
    //   Alert.alert(
    //     'Validation Error',
    //     'All items must have name, quantity, unit, rate, and GST %'
    //   );
    //   return;
    // }

    onSubmit(formData);
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.header}>
          <ThemedText type="title">Edit Bill Details</ThemedText>
          <ThemedText style={styles.subtitle}>
            Review & correct OCR data below
          </ThemedText>
        </View>

        {geminiLoading && (
          <View style={[styles.statusBox, styles.loadingBox]}>
            <ThemedText style={styles.statusText}>🔄 Gemini AI is parsing your invoice...</ThemedText>
          </View>
        )}

        {geminiError && (
          <View style={[styles.statusBox, styles.errorBox]}>
            <ThemedText style={styles.errorStatusText}>❌ Parse Error: {geminiError}</ThemedText>
          </View>
        )}

        {geminiConfidence !== null && !geminiLoading && (
          <View style={[styles.statusBox, geminiConfidence > 0.7 ? styles.successBox : styles.warningBox]}>
            <ThemedText style={styles.successStatusText}>
              {geminiConfidence > 0.7 ? '✅' : '⚠️'} Gemini Parse: {(geminiConfidence * 100).toFixed(1)}% confidence
              {itemsNeedingManualReview > 0 && ` • ${itemsNeedingManualReview} items need review`}
            </ThemedText>
          </View>
        )}

        <PharmacyDetailsSection
          data={formData}
          onUpdate={updatePharmacyDetails}
        />

        <InvoiceMetadataSection
          data={formData}
          onUpdate={updateInvoiceMetadata}
        />

        <ItemListSection items={formData.items} onUpdate={updateItems} />

        <TaxTotalsSection
          data={formData}
          onUpdateRoundOff={updateRoundOff}
        />

        {ocrText && <OcrReferenceSection ocrText={ocrText} />}

        <View style={styles.actionButtons}>
          <Pressable
            style={[styles.button, styles.submitButton]}
            onPress={handleSubmit}
          >
            <ThemedText style={styles.submitButtonText}>
              Confirm & Save Bill
            </ThemedText>
          </Pressable>

          {onCancel && (
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
            >
              <ThemedText>Cancel</ThemedText>
            </Pressable>
          )}
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 24,
  },
  subtitle: {
    marginTop: 4,
    opacity: 0.7,
  },
  statusBox: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
  },
  loadingBox: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  successBox: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  warningBox: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FF9800',
  },
  errorBox: {
    backgroundColor: '#FFEBEE',
    borderColor: '#F44336',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1976D2',
  },
  successStatusText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2E7D32',
  },
  errorStatusText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#C62828',
  },
  actionButtons: {
    gap: 12,
    marginTop: 24,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButton: {
    backgroundColor: '#007AFF',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#ccc',
  },
  bottomSpacing: {
    height: 20,
  },
});
