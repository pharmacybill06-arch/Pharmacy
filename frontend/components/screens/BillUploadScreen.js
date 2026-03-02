import React from 'react';
import { View, StyleSheet, SafeAreaView, ScrollView, Pressable, Platform } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';

/**
 * BillUploadScreen
 * Allows user to upload bill via gallery or camera
 * IMPORTANT: Keep existing upload/scan handlers exactly the same
 */
export default function BillUploadScreen({
  onPickImage,
  onTakePhoto,
  onPickFile,
  onBack,
}) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <AppBar
          title="Upload Bill"
          onBack={onBack}
        />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Section */}
          <View style={styles.headerSection}>
            <View style={styles.headerIconContainer}>
              <Ionicons name="document-text" size={48} color="#4F46E5" />
            </View>
            <ThemedText style={styles.headerTitle}>
              Upload Pharmacy Bill
            </ThemedText>
            <ThemedText style={styles.headerSubtitle}>
              Choose from gallery, take a photo, or import a file
            </ThemedText>
          </View>

          {/* Main Upload Card with Visual Elements */}
          <Pressable
            style={({ pressed }) => [
              styles.uploadCard,
              pressed && styles.uploadCardPressed,
            ]}
            onPress={() => {
              console.log('[BillUploadScreen] Upload card pressed - opening gallery');
              onPickImage();
            }}
          >
            <View style={styles.uploadCardContent}>
              <View style={styles.uploadIconContainer}>
                <Ionicons name="cloud-upload-outline" size={48} color="#4F46E5" />
              </View>
              <ThemedText style={styles.uploadTitle}>
                Bill Photo
              </ThemedText>
              <ThemedText style={styles.uploadSubtitle}>
                JPG, PNG, CSV or Excel formats
              </ThemedText>
              <View style={styles.fileTypeHint}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <ThemedText style={styles.hintText}>High quality photos work best</ThemedText>
              </View>
            </View>
          </Pressable>

          {/* CTA Buttons */}
          <View style={styles.buttonsContainer}>
            <Pressable
              style={({ pressed }) => [
                styles.cameraButton,
                pressed && styles.cameraButtonPressed,
              ]}
              onPress={() => {
                console.log('[BillUploadScreen] Take Photo button pressed');
                onTakePhoto();
              }}
            >
              <Ionicons name="camera" size={24} color="#FFFFFF" />
              <View style={styles.buttonTextContainer}>
                <ThemedText style={styles.buttonTitle}>Take Photo</ThemedText>
                <ThemedText style={styles.buttonSubtitle}>Use your camera</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
            </Pressable>
            
            <View style={styles.dividerContainer}>
              <View style={styles.divider} />
              <ThemedText style={styles.dividerText}>OR</ThemedText>
              <View style={styles.divider} />
            </View>
            
            <Pressable
              style={({ pressed }) => [
                styles.galleryButton,
                pressed && styles.galleryButtonPressed,
              ]}
              onPress={onPickImage}
            >
              <Ionicons name="image" size={24} color="#4F46E5" />
              <View style={styles.buttonTextContainer}>
                <ThemedText style={styles.galleryButtonTitle}>Choose from Gallery</ThemedText>
                <ThemedText style={styles.galleryButtonSubtitle}>Select existing photo</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#4F46E5" />
            </Pressable>

            <View style={styles.dividerContainer}>
              <View style={styles.divider} />
              <ThemedText style={styles.dividerText}>OR</ThemedText>
              <View style={styles.divider} />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.fileButton,
                pressed && styles.fileButtonPressed,
              ]}
              onPress={onPickFile}
            >
              <Ionicons name="document-attach" size={24} color="#059669" />
              <View style={styles.buttonTextContainer}>
                <ThemedText style={styles.fileButtonTitle}>Import CSV / Excel</ThemedText>
                <ThemedText style={styles.fileButtonSubtitle}>Upload .csv or .xlsx file</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#059669" />
            </Pressable>
          </View>

          {/* Helper Text with Tips */}
          <View style={styles.tipsContainer}>
            <ThemedText style={styles.tipsTitle}>📸 Tips for Better Results:</ThemedText>
            <View style={styles.tipItem}>
              <View style={styles.tipBullet} />
              <ThemedText style={styles.tipText}>Ensure good lighting to avoid shadows</ThemedText>
            </View>
            <View style={styles.tipItem}>
              <View style={styles.tipBullet} />
              <ThemedText style={styles.tipText}>Position the bill flat and fill the frame</ThemedText>
            </View>
            <View style={styles.tipItem}>
              <View style={styles.tipBullet} />
              <ThemedText style={styles.tipText}>Keep all text clearly visible and readable</ThemedText>
            </View>
            <View style={styles.tipItem}>
              <View style={styles.tipBullet} />
              <ThemedText style={styles.tipText}>For CSV/Excel, ensure a header row with column names</ThemedText>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingTop: Platform.OS === 'android' ? 25 : 0,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
  },

  // Header Section
  headerSection: {
    alignItems: 'center',
    marginBottom: 28,
    paddingTop: 8,
  },
  headerIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Upload Card
  uploadCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#C7D2FE',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    marginBottom: 28,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  uploadCardPressed: {
    backgroundColor: '#EEF2FF',
    borderColor: '#818CF8',
    transform: [{ scale: 0.98 }],
  },
  uploadCardContent: {
    alignItems: 'center',
    width: '100%',
  },
  uploadIconContainer: {
    marginBottom: 16,
  },
  uploadTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  uploadSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 12,
  },
  fileTypeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  hintText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#047857',
  },

  // Buttons Container
  buttonsContainer: {
    width: '100%',
    marginBottom: 24,
  },
  cameraButton: {
    width: '100%',
    height: 66,
    backgroundColor: '#4F46E5',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#4F46E5',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 14,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  cameraButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonTextContainer: {
    flex: 1,
  },
  buttonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  buttonSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },

  // Divider
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 12,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },

  // Gallery Button
  galleryButton: {
    width: '100%',
    height: 66,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 16,
  },
  galleryButtonPressed: {
    backgroundColor: '#EEF2FF',
    transform: [{ scale: 0.98 }],
  },
  galleryButtonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4F46E5',
  },
  galleryButtonSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#A5B4FC',
    marginTop: 2,
  },

  // File Button (CSV/Excel)
  fileButton: {
    width: '100%',
    height: 66,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 16,
  },
  fileButtonPressed: {
    backgroundColor: '#ECFDF5',
    transform: [{ scale: 0.98 }],
  },
  fileButtonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#059669',
  },
  fileButtonSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6EE7B7',
    marginTop: 2,
  },

  // Tips Container
  tipsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    borderWidth: 1,
    borderTopColor: '#FEF3C7',
    borderRightColor: '#FEF3C7',
    borderBottomColor: '#FEF3C7',
  },
  tipsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 14,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  tipBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
    marginTop: 6,
    flexShrink: 0,
  },
  tipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    flex: 1,
    lineHeight: 18,
  },
});
