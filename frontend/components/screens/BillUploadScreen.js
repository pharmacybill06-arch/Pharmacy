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
              <Ionicons name="document-text" size={48} color="#1D4ED8" />
            </View>
            <ThemedText style={styles.headerTitle}>
              Upload Pharmacy Bill
            </ThemedText>
            <ThemedText style={styles.headerSubtitle}>
              Choose from gallery or take a photo
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
                <Ionicons name="cloud-upload-outline" size={48} color="#1D4ED8" />
              </View>
              <ThemedText style={styles.uploadTitle}>
                Bill Photo
              </ThemedText>
              <ThemedText style={styles.uploadSubtitle}>
                JPG, PNG or PDF formats
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
              <Ionicons name="image" size={24} color="#1D4ED8" />
              <View style={styles.buttonTextContainer}>
                <ThemedText style={styles.galleryButtonTitle}>Choose from Gallery</ThemedText>
                <ThemedText style={styles.galleryButtonSubtitle}>Select existing photo</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#1D4ED8" />
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
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    paddingTop: Platform.OS === 'android' ? 25 : 0,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },

  // Header Section
  headerSection: {
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 8,
  },
  headerIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
  },

  // Upload Card
  uploadCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    marginBottom: 28,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  uploadCardPressed: {
    backgroundColor: '#F3F4F6',
    borderColor: '#93C5FD',
    opacity: 0.9,
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
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  uploadSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
  },
  fileTypeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 8,
  },
  hintText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },

  // Buttons Container
  buttonsContainer: {
    width: '100%',
    marginBottom: 24,
  },
  cameraButton: {
    width: '100%',
    height: 64,
    backgroundColor: '#1D4ED8',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#1D4ED8',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
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
  },
  buttonSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#DBEAFE',
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
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
  },

  // Gallery Button
  galleryButton: {
    width: '100%',
    height: 64,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#BFDBFE',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 16,
  },
  galleryButtonPressed: {
    opacity: 0.7,
    backgroundColor: '#F0F4FF',
  },
  galleryButtonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  galleryButtonSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#93C5FD',
    marginTop: 2,
  },

  // Tips Container
  tipsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  tipsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
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
    color: '#6B7280',
    flex: 1,
    lineHeight: 18,
  },
});
