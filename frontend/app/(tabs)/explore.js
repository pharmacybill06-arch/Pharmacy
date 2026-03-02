import React, { useState, useRef } from 'react';
import { Pressable, View, SafeAreaView, StyleSheet } from 'react-native';
import BillUploadScreen from '@/components/screens/BillUploadScreen';
import BillFormRedesigned from '@/components/bill-form/BillFormRedesigned';
import Toast from '@/components/ui/Toast';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import { billApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { Ionicons } from '@expo/vector-icons';
import { parseSpreadsheetFile, isSpreadsheetFile } from '@/components/bill-form/spreadsheet-parser';

// Lazy-load expo-document-picker so the app doesn't crash if the native module is missing
let DocumentPicker = null;
try {
  DocumentPicker = require('expo-document-picker');
} catch (e) {
  console.warn('[ExploreScreen] expo-document-picker not available:', e.message);
}

const SPREADSHEET_SUPPORT_ENABLED = !!DocumentPicker;

export default function ExploreScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [currentScreen, setCurrentScreen] = useState('upload'); // 'upload', 'bill-form'
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rawOcrText, setRawOcrText] = useState('');
  const [photoUri, setPhotoUri] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [parsedFileData, setParsedFileData] = useState(null); // For CSV/Excel pre-parsed data
  const [fileOcrText, setFileOcrText] = useState(''); // CSV text for Gemini fallback
  const cameraRef = useRef(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info', title: '' });

  const showToast = (message, type = 'info', title = '') => {
    setToast({ visible: true, message, type, title });
  };

  const hideToast = () => {
    setToast({ ...toast, visible: false });
  };

  // ===== HANDLERS =====
  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets[0]) {
        await processImage(result.assets[0].uri);
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
        setPhotoUri(photo.uri);
        setCameraActive(false);
        await processImage(photo.uri);
      } catch (error) {
        console.error('[Camera] Error capturing photo:', error);
        showToast('Failed to capture photo. Please try again.', 'error', 'Error');
      }
    } else {
      console.error('[Camera] Camera ref is null!');
      showToast('Camera not ready. Please try again.', 'error', 'Error');
    }
  };

  const processImage = async (imageUri) => {
    setScanning(true);
    setPhotoUri(imageUri);
    
    try {
      const result = await TextRecognition.recognize(imageUri);

      if (result && result.text) {
        console.log('ML Kit Result:', result);
        console.log('Extracted text length:', result.text.length, 'characters');
        
        setRawOcrText(result.text);  
        
        // Navigate directly to bill-form screen (parsing will happen there)
        // The BillFormRedesigned component will handle Gemini parsing with loading UX
        setCurrentScreen('bill-form');
      } else {
        console.log('No text found in image');
        // Even if no text found, navigate to bill form so user can enter manually
        setRawOcrText('');
        setCurrentScreen('bill-form');
      }
    } catch (error) {
      console.error('ML Kit OCR Error:', error);
      showToast('Failed to extract text from image', 'error', 'OCR Error');
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
        photoUri
      );
      
      console.log('Bill saved to backend:', response);
      showToast('Your bill has been saved successfully!', 'success', 'Bill Saved');
      
      // Navigate back after a short delay to show the toast
      setTimeout(() => {
        setCurrentScreen('upload');
        setRawOcrText('');
        setPhotoUri('');
        setParsedFileData(null);
        setFileOcrText('');
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
    setCameraActive(false);
    setParsedFileData(null);
    setFileOcrText('');
    router.back();
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
          onCameraReady={() => {
            console.log('[Camera] Camera is ready!');
          }}
          onMountError={(error) => {
            console.error('[Camera] Mount error:', error);
            showToast('Camera failed to start', 'error', 'Camera Error');
            setCameraActive(false);
          }}
        >
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
              console.log('[Camera] Close button pressed');
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
      </>
    );
  }

  if (currentScreen === 'bill-form') {
    return (
      <>
        <BillFormRedesigned
          ocrText={rawOcrText || fileOcrText}
          onSubmit={handleSubmitBill}
          onCancel={handleCancel}
          initialData={parsedFileData}
        />
        <LoadingOverlay
          visible={saving}
          message="Saving Bill"
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