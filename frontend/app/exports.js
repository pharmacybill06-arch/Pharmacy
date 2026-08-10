import React, { useState, useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useAuth } from '@/contexts/AuthContext';
import { DistributorProvider, useDistributors } from '@/contexts/DistributorContext';
import { exportApi } from '@/services/api';
import ExportScreen from '@/components/screens/ExportScreen';
import Toast from '@/components/ui/Toast';

/**
 * Export Data.
 *
 * The backend generates the workbook and streams it back; here it is written to the
 * app cache and handed to the native share sheet, which is how a pharmacist actually
 * gets it to their accountant or their own desktop (usually via WhatsApp).
 */
function ExportScreenContent() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;

  const { distributors, fetchDistributors } = useDistributors();
  const [isGenerating, setIsGenerating] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info', title: '' });

  const showToast = useCallback(
    (message, type = 'info', title = '') => setToast({ visible: true, message, type, title }),
    []
  );
  const hideToast = useCallback(() => setToast((t) => ({ ...t, visible: false })), []);

  useEffect(() => {
    if (userId) fetchDistributors(userId);
  }, [userId, fetchDistributors]);

  const handlePreview = useCallback(async (type, filters) => {
    if (!userId) return null;
    try {
      return await exportApi.preview(userId, type, filters);
    } catch (error) {
      // A preview failure should not block the screen; the row count just stays unknown
      console.log('[Export] Preview failed:', error.message);
      return { rowCount: 0, summary: error.message };
    }
  }, [userId]);

  const handleGenerate = useCallback(async (type, filters, format) => {
    if (!userId) return;
    try {
      setIsGenerating(true);

      const { base64, fileName, mimeType, rowCount } = await exportApi.generate(
        userId, type, filters, format
      );

      // Write to cache so the OS share sheet has a real file:// URI to attach
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!(await Sharing.isAvailableAsync())) {
        showToast(`Saved to ${fileName}, but sharing is not available on this device.`, 'warning', 'Saved');
        return;
      }

      await Sharing.shareAsync(fileUri, {
        mimeType,
        dialogTitle: `Share ${fileName}`,
        // Lets Gmail and other mail clients attach it with the right type
        UTI: format === 'csv' ? 'public.comma-separated-values-text' : 'org.openxmlformats.spreadsheetml.sheet',
      });

      showToast(`${rowCount} row${rowCount === 1 ? '' : 's'} exported`, 'success', fileName);
    } catch (error) {
      console.error('[Export] Generation failed:', error);
      if (error.code === 'NO_DATA') {
        showToast('No data in this range. Try a wider date range.', 'warning', 'Nothing to export');
      } else if (error.code === 'ROW_LIMIT') {
        showToast(error.message, 'warning', 'Too many rows');
      } else {
        showToast(error.message || 'Failed to generate export', 'error', 'Export Failed');
      }
    } finally {
      setIsGenerating(false);
    }
  }, [userId, showToast]);

  return (
    <View style={{ flex: 1 }}>
      <ExportScreen
        distributors={distributors}
        onBack={() => router.back()}
        onPreview={handlePreview}
        onGenerate={handleGenerate}
        isGenerating={isGenerating}
      />
      <Toast {...toast} onHide={hideToast} />
    </View>
  );
}

export default function ExportsScreen() {
  return (
    <DistributorProvider>
      <ExportScreenContent />
    </DistributorProvider>
  );
}
