import React, { useState, useRef } from 'react';
import { Pressable, SafeAreaView } from 'react-native';
import BillUploadScreen from '@/components/screens/BillUploadScreen';
import BillFormRedesigned from '@/components/bill-form/BillFormRedesigned';
import Toast from '@/components/ui/Toast';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import { ThemedText } from '@/components/themed-text';
import { billApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { parseSpreadsheetFile, isSpreadsheetFile } from '@/components/bill-form/spreadsheet-parser';

// Lazy-load expo-document-picker so the app doesn't crash if the native module is missing
let DocumentPicker = null;
try {
  DocumentPicker = require('expo-document-picker');
} catch (e) {
  console.warn('[ExploreScreen] expo-document-picker not available:', e.message);
}

let ImageManipulator = null;
try {
  ImageManipulator = require('expo-image-manipulator');
} catch (e) {
  console.warn('[ExploreScreen] expo-image-manipulator not available:', e.message);
}

export default function ExploreScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [currentScreen, setCurrentScreen] = useState('upload'); // 'upload', 'bill-form'
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rawOcrText, setRawOcrText] = useState('');
  const [ocrEngine, setOcrEngine] = useState('vision-ai');
  const [photoUri, setPhotoUri] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedPhotos, setCapturedPhotos] = useState([]); // Multiple camera photos
  const [parsedFileData, setParsedFileData] = useState(null); // For CSV/Excel pre-parsed data
  const [fileOcrText, setFileOcrText] = useState(''); // CSV text for Gemini fallback
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const cameraRef = useRef(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info', title: '' });

  const showToast = (message, type = 'info', title = '') => {
    setToast({ visible: true, message, type, title });
  };

  const hideToast = () => {
    setToast({ ...toast, visible: false });
  };

  // ===== HANDLERS =====
  const prepareImageForScanning = async (assetOrUri) => {
    const uri = typeof assetOrUri === 'string' ? assetOrUri : assetOrUri?.uri;
    const width = typeof assetOrUri === 'string' ? null : assetOrUri?.width;
    const height = typeof assetOrUri === 'string' ? null : assetOrUri?.height;

    if (!uri) {
      throw new Error('Image URI is missing');
    }

    if (!ImageManipulator?.manipulateAsync) {
      console.warn('[BillScan] Image manipulator unavailable; using original image');
      return {
        uri,
        mimeType: typeof assetOrUri === 'string' ? 'image/jpeg' : (assetOrUri?.mimeType || 'image/jpeg'),
      };
    }

    const maxSide = 2000;
    const longestSide = Math.max(width || 0, height || 0);
    const resizeAction = longestSide > maxSide
      ? [{
          resize: width >= height
            ? { width: maxSide }
            : { height: maxSide },
        }]
      : [];

    const normalized = await ImageManipulator.manipulateAsync(
      uri,
      resizeAction,
      {
        compress: 0.9,
        format: ImageManipulator.SaveFormat?.JPEG || 'jpeg',
      }
    );

    console.log(
      '[BillScan] Normalized image:',
      `${width || '?'}x${height || '?'} -> ${normalized.width}x${normalized.height}`,
      normalized.uri
    );

    return {
      uri: normalized.uri,
      mimeType: 'image/jpeg',
    };
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 10,
      });

      if (!result.canceled && result.assets?.length > 0) {
        await processMultipleImages(result.assets);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      showToast('Failed to pick image. Please try again.', 'error', 'Error');
    }
  };

  const handlePickFile = async () => {
    if (!DocumentPicker) {
      showToast(
        'CSV/Excel import requires a development build. Run: npx expo prebuild && npx expo run:android',
        'warning',
        'Native Module Missing'
      );
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'application/csv',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/wps-office.xlsx',
          'application/octet-stream', // fallback for some devices
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const file = result.assets[0];
      console.log('[FilePicker] Picked file:', file.name, 'mime:', file.mimeType, 'uri:', file.uri);

      // Validate it's a spreadsheet
      if (!isSpreadsheetFile(file.mimeType, file.name)) {
        showToast('Please select a CSV or Excel (.xlsx) file', 'warning', 'Invalid File');
        return;
      }

      await processSpreadsheet(file.uri, file.mimeType, file.name);
    } catch (error) {
      console.error('[FilePicker] Error picking file:', error);
      showToast('Failed to pick file. Please try again.', 'error', 'Error');
    }
  };

  const processSpreadsheet = async (fileUri, mimeType, fileName) => {
    setScanning(true);
    try {
      console.log('[Spreadsheet] Processing:', fileName || fileUri);
      const parsedData = await parseSpreadsheetFile(fileUri, mimeType);

      console.log('[Spreadsheet] Parsed items:', parsedData.items?.length, 'Grand total:', parsedData.grandTotal);

      // Set pre-parsed data so BillFormRedesigned skips Gemini OCR
      setParsedFileData(parsedData);
      setFileOcrText(''); // No OCR text needed for spreadsheets
      setRawOcrText('');  // Clear any previous OCR text
      setOcrEngine('spreadsheet-import');
      setCurrentScreen('bill-form');

      showToast(
        `${parsedData.items?.length || 0} items imported from spreadsheet`,
        'success',
        'Import Successful'
      );
    } catch (error) {
      console.error('[Spreadsheet] Parse error:', error);
      showToast(
        error.message || 'Failed to parse the spreadsheet. Ensure it has a header row with column names.',
        'error',
        'Import Failed'
      );
    } finally {
      setScanning(false);
    }
  };

  const handleTakePhoto = async () => {
    try {
      console.log('[Camera] Current permission state:', permission);
      console.log('[Camera] Requesting camera permission...');
      
      // Request permission
      const permissionResult = await requestPermission();
      console.log('[Camera] Permission result:', permissionResult);
      console.log('[Camera] Granted:', permissionResult?.granted);
      console.log('[Camera] Status:', permissionResult?.status);
      
      if (permissionResult?.granted || permissionResult?.status === 'granted') {
        console.log('[Camera] Permission granted, activating camera');
        setCameraActive(true);
      } else {
        console.log('[Camera] Permission denied or not granted');
        console.log('[Camera] Full permission object:', JSON.stringify(permissionResult));
        showToast('Camera permission is needed to scan bills', 'warning', 'Permission Required');
      }
    } catch (error) {
      console.error('[Camera] Error requesting permission:', error);
      showToast('Failed to request camera permission', 'error', 'Permission Error');
    }
  };

  const capturePhoto = async () => {
    console.log('[Camera] Attempting to capture photo...')
    console.log('[Camera] Camera ref exists:', !!cameraRef.current);
    
    if (cameraRef.current) {
      try {
        console.log('[Camera] Taking picture...');
        const photo = await cameraRef.current.takePictureAsync({
          quality: 1,
          skipProcessing: false,
        });
        console.log('[Camera] Photo captured:', photo.uri);
        const preparedImage = await prepareImageForScanning(photo);
        setPhotoUri(preparedImage.uri);
        setCapturedPhotos(prev => [...prev, preparedImage]);
        // Don't close camera — let user take more or press Done
      } catch (error) {
        console.error('[Camera] Error capturing photo:', error);
        showToast('Failed to capture photo. Please try again.', 'error', 'Error');
      }
    } else {
      console.error('[Camera] Camera ref is null!');
      showToast('Camera not ready. Please try again.', 'error', 'Error');
    }
  };

  const handleCameraPhotoDone = async () => {
    const photos = capturedPhotos;
    setCameraActive(false);
    setCapturedPhotos([]);
    if (photos.length === 0) return;
    await processMultipleImages(photos);
  };

  const processMultipleImages = async (assets) => {
    setScanning(true);
    setScanProgress({ current: 0, total: assets.length });

    try {
      const results = [];
      let combinedOcrText = '';
      let lastEngine = 'vision-ai';

      for (let i = 0; i < assets.length; i++) {
        setScanProgress({ current: i + 1, total: assets.length });
        const asset = assets[i];
        const prepared = asset.uri && !asset.width
          ? asset // already prepared (camera path sends {uri, mimeType})
          : await prepareImageForScanning(asset);

        console.log(`[BillScan] Scanning image ${i + 1}/${assets.length}:`, prepared.uri);
        try {
          const result = await billApi.parseBillImage(prepared.uri, prepared.mimeType || 'image/jpeg');
          if (result?.success && result?.data) {
            results.push(result.data);
            combinedOcrText += (result.ocrText || '') + '\n';
            lastEngine = result.method || 'vision-ai';
          }
        } catch (err) {
          console.warn(`[BillScan] Image ${i + 1} failed:`, err.message);
        }
      }

      if (results.length === 0) {
        throw new Error('No bill data could be extracted from the selected images');
      }

      // Merge: use metadata from first result, combine all items
      const merged = { ...results[0] };
      if (results.length > 1) {
        const allItems = results.flatMap((r, idx) =>
          (r.items || []).map((item, j) => ({
            ...item,
            sn: undefined, // will be re-numbered
            _page: idx + 1,
          }))
        ).map((item, idx) => ({ ...item, sn: idx + 1 }));
        merged.items = allItems;
      }

      setPhotoUri(assets[0]?.uri || '');
      setParsedFileData(merged);
      setRawOcrText(combinedOcrText.trim());
      setOcrEngine(lastEngine);
      setCurrentScreen('bill-form');

      if (assets.length > 1) {
        showToast(
          `Scanned ${assets.length} pages — ${merged.items?.length || 0} items found`,
          'success',
          'Scan Complete'
        );
      }
    } catch (error) {
      console.error('[BillScan] Multi-image error:', error);
      setParsedFileData(null);
      setRawOcrText('');
      setCurrentScreen('bill-form');
      showToast(
        error.message || 'Failed to scan bill. You can still enter it manually.',
        'error',
        'Scan Failed'
      );
    } finally {
      setScanning(false);
      setScanProgress({ current: 0, total: 0 });
    }
  };

  const processImage = async (imageUri, mimeType = 'image/jpeg') => {
    setScanning(true);
    setPhotoUri(imageUri);
    
    try {
      console.log('[BillScan] Sending image to backend Vision parser:', imageUri);
      const result = await billApi.parseBillImage(imageUri, mimeType);

      if (result?.success && result?.data) {
        console.log('[BillScan] Backend Vision parsed items:', result.data?.items?.length || 0);
        setParsedFileData(result.data);
        setRawOcrText(result.ocrText || '');
        setOcrEngine(result.method || 'vision-ai');
        setCurrentScreen('bill-form');
      } else {
        throw new Error(result?.error || 'No bill data extracted from image');
      }
    } catch (error) {
      console.error('[BillScan] Backend OCR/Vision error:', error);
      setParsedFileData(null);
      setRawOcrText('');
      setCurrentScreen('bill-form');
      showToast(
        error.message || 'Failed to scan bill. You can still enter it manually.',
        'error',
        'Scan Failed'
      );
    } finally {
      setScanning(false);
    }
  };



  const handleSubmitBill = async (formData) => {
    console.log('Bill Form Submitted:', formData);
    
    // Check if user is authenticated
    if (!user || !user.id) {
      showToast('Please login to save bills', 'error', 'Authentication Required');
      return;
    }
    
    try {
      setSaving(true);
      
      // Save to backend
      const response = await billApi.saveBill(
        user.id,
        formData,
        rawOcrText,
        photoUri,
        ocrEngine
      );
      
      console.log('Bill saved to backend:', response);
      showToast('Expiry items saved successfully!', 'success', 'Expiry Saved');
      
      // Navigate back after a short delay to show the toast
      setTimeout(() => {
        setCurrentScreen('upload');
        setRawOcrText('');
        setPhotoUri('');
        setOcrEngine('vision-ai');
        setParsedFileData(null);
        setFileOcrText('');
        setCapturedPhotos([]);
      }, 1500);
    } catch (error) {
      console.error('Error saving bill:', error);
      showToast(error.message || 'Failed to save bill', 'error', 'Save Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setCurrentScreen('upload');
    setRawOcrText('');
    setPhotoUri('');
    setOcrEngine('vision-ai');
    setCameraActive(false);
    setParsedFileData(null);
    setFileOcrText('');
    setCapturedPhotos([]);
    router.back();
  };

  const handleSaveDraft = async (formData) => {
    console.log('Saving as draft:', formData);
    
    if (!user || !user.id) {
      showToast('Please login to save drafts', 'error', 'Authentication Required');
      return;
    }
    
    try {
      setSaving(true);
      
      const response = await billApi.saveDraft(
        user.id,
        formData,
        rawOcrText,
        photoUri,
        ocrEngine
      );
      
      console.log('Draft saved to backend:', response);
      showToast('Bill saved as draft! You can edit it later from the web app.', 'success', 'Draft Saved');
      
      setTimeout(() => {
        setCurrentScreen('upload');
        setRawOcrText('');
        setPhotoUri('');
        setOcrEngine('vision-ai');
        setParsedFileData(null);
        setFileOcrText('');
        setCapturedPhotos([]);
      }, 1500);
    } catch (error) {
      console.error('Error saving draft:', error);
      showToast(error.message || 'Failed to save draft', 'error', 'Save Failed');
    } finally {
      setSaving(false);
    }
  };

  // ===== RENDER SCREENS =====
  // Camera view should be checked FIRST before other screens
  if (cameraActive) {
    console.log('[Camera] Rendering camera view, cameraActive:', cameraActive);
    console.log('[Camera] Permission state:', permission);
    
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing="back"
          onCameraReady={() => console.log('[Camera] Camera is ready!')}
          onMountError={(error) => {
            console.error('[Camera] Mount error:', error);
            showToast('Camera failed to start', 'error', 'Camera Error');
            setCameraActive(false);
          }}
        >
          {/* Shutter button */}
          <Pressable
            style={{
              position: 'absolute',
              bottom: 40,
              alignSelf: 'center',
              backgroundColor: '#fff',
              borderRadius: 32,
              width: 64,
              height: 64,
              alignItems: 'center',
              justifyContent: 'center',
              elevation: 4,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 4,
            }}
            onPress={capturePhoto}
          >
            <Ionicons name="camera" size={36} color="#4F46E5" />
          </Pressable>

          {/* Done button with photo count — shown after at least 1 photo */}
          {capturedPhotos.length > 0 && (
            <Pressable
              style={{
                position: 'absolute',
                bottom: 48,
                right: 30,
                backgroundColor: '#10B981',
                borderRadius: 24,
                paddingHorizontal: 16,
                paddingVertical: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                elevation: 4,
              }}
              onPress={handleCameraPhotoDone}
            >
              <Ionicons name="checkmark-circle" size={22} color="#fff" />
              <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                Done ({capturedPhotos.length})
              </ThemedText>
            </Pressable>
          )}

          {/* Close button */}
          <Pressable
            style={{
              position: 'absolute',
              top: 50,
              left: 20,
              backgroundColor: 'rgba(0,0,0,0.5)',
              borderRadius: 20,
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onPress={() => {
              setCapturedPhotos([]);
              setCameraActive(false);
            }}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </CameraView>
        <Toast
          visible={toast.visible}
          message={toast.message}
          type={toast.type}
          title={toast.title}
          onHide={hideToast}
          duration={3000}
        />
      </SafeAreaView>
    );
  }
  
  if (currentScreen === 'upload') {
    return (
      <>
        <BillUploadScreen
          onPickImage={handlePickImage}
          onTakePhoto={handleTakePhoto}
          onPickFile={handlePickFile}
          onBack={handleCancel}
        />
        <Toast
          visible={toast.visible}
          message={toast.message}
          type={toast.type}
          title={toast.title}
          onHide={hideToast}
          duration={3000}
        />
        <LoadingOverlay
          visible={scanning}
          message="Scanning Bill"
          submessage={
            scanProgress.total > 1
              ? `Processing image ${scanProgress.current} of ${scanProgress.total}...`
              : 'Uploading image for AI extraction...'
          }
          icon="scan"
        />
      </>
    );
  }

  if (currentScreen === 'bill-form') {
    return (
      <>
        <BillFormRedesigned
          ocrText={rawOcrText || fileOcrText}
          onSubmit={handleSubmitBill}
          onSaveDraft={handleSaveDraft}
          onCancel={handleCancel}
          initialData={parsedFileData}
        />
        <LoadingOverlay
          visible={saving}
          message="Saving Expiry Items"
          submessage="Uploading to server..."
          icon="cloud-upload"
        />
        <Toast
          visible={toast.visible}
          message={toast.message}
          type={toast.type}
          title={toast.title}
          onHide={hideToast}
          duration={3000}
        />
      </>
    );
  }

  return null;
}
