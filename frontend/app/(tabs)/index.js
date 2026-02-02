import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  Image,
  SafeAreaView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import BillFormRedesigned from '@/components/bill-form/BillFormRedesigned';
import Toast from '@/components/ui/Toast';
import { billApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Memoized Recent Bill Row Component
 * Optimized for list rendering performance
 */
const RecentBillRow = React.memo(({ item, onPress }) => {
  // Format the date
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  // Format amount
  const formatAmount = (amount) => {
    if (!amount) return '₹0.00';
    return `₹${parseFloat(amount).toFixed(2)}`;
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.billRow,
        pressed && styles.billRowPressed,
      ]}
      onPress={() => onPress?.(item)}
    >
      <View style={styles.billRowLeft}>
        <ThemedText style={styles.billRowPharmacy}>
          {item.pharmacyName || 'Unknown Pharmacy'}
        </ThemedText>
        <ThemedText style={styles.billRowDate}>
          {item.invoiceNumber || ''} {item.invoiceDate ? '• ' + formatDate(item.invoiceDate) : ''}
        </ThemedText>
      </View>
      <ThemedText style={styles.billRowAmount}>
        {formatAmount(item.grandTotal)}
      </ThemedText>
    </Pressable>
  );
});

RecentBillRow.displayName = 'RecentBillRow';

export default function BillsHomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [recentBills, setRecentBills] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingBill, setEditingBill] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info', title: '' });

  // Only use authenticated user ID; do not fetch with placeholder
  const userId = user?.id;

  // Fetch recent bills on mount, only if userId exists
  useEffect(() => {
    if (userId) {
      fetchRecentBills();
    }
  }, [userId]);

  const fetchRecentBills = async () => {
    if (!userId) return;
    try {
      setIsLoading(true);
      setError(null);
      const response = await billApi.getUserBills(userId);
      // Get the latest 3 bills
      const bills = response.bills || [];
      setRecentBills(bills.slice(0, 3));
    } catch (err) {
      console.error('Error fetching bills:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (message, type = 'info', title = '') => {
    setToast({ visible: true, message, type, title });
  };

  const hideToast = () => {
    setToast({ ...toast, visible: false });
  };

  // Navigation handler for scanning bills
  const handleScanBill = useCallback(() => {
    // Navigate to the explore tab which has the camera/scan functionality
    router.push('/explore');
  }, [router]);

  const handleBillPress = useCallback((bill) => {
    // Open bill in edit mode
    setEditingBill(bill);
  }, []);

  const handleSaveBill = useCallback(async (formData) => {
    try {
      console.log('Saving edited bill:', formData);
      
      // Update bill via API
      await billApi.updateBill(editingBill.id, formData);
      
      // Update the local state
      setRecentBills(prevBills =>
        prevBills.map(bill =>
          bill.id === editingBill.id ? { ...bill, ...formData } : bill
        )
      );
      
      // Close edit mode and show success
      setEditingBill(null);
      showToast('Bill has been updated successfully.', 'success', 'Bill Updated');
    } catch (err) {
      console.error('Error saving bill:', err);
      showToast('Failed to save bill. Please try again.', 'error', 'Error');
    }
  }, [editingBill]);

  const handleCancelEdit = useCallback(() => {
    setEditingBill(null);
  }, []);

  const handleViewAll = useCallback(() => {
    // TODO: Navigate to all bills screen when implemented
    console.log('View all bills');
  }, []);

  // If editing a bill, show the bill form
  if (editingBill) {
    return (
      <View style={{ flex: 1 }}>
        <BillFormRedesigned
          initialData={editingBill}
          onSubmit={handleSaveBill}
          onCancel={handleCancelEdit}
        />
        
        {/* Toast Notifications */}
        <Toast
          visible={toast.visible}
          message={toast.message}
          type={toast.type}
          title={toast.title}
          onHide={hideToast}
          duration={4000}
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ThemedView style={styles.container}>
        {/* Top App Bar with Logo */}
        <View style={styles.appBar}>
          <View style={styles.appBarGradient} />
          <View style={styles.appBarContent}>
            <View style={styles.logoContainer}>
              <View style={styles.logoBadge}>
                <MaterialIcons name="local-pharmacy" size={26} color="#FFFFFF" />
              </View>
              <View style={styles.logoText}>
                <ThemedText style={styles.appBarTitle}>Pharmacy Bills</ThemedText>
                <ThemedText style={styles.appBarSubtitle}>Your Health Records</ThemedText>
              </View>
            </View>
            <TouchableOpacity
              style={styles.profileButton}
              onPress={() => router.push('/profile')}
              activeOpacity={0.7}
            >
              <View style={styles.profileAvatar}>
                <ThemedText style={styles.profileAvatarText}>
                  {(user?.name || user?.phone || 'U').charAt(0).toUpperCase()}
                </ThemedText>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Card */}
          <View style={styles.heroCard}>
            {/* Gradient background with pattern */}
            <View style={styles.heroBackground}>
              <View style={styles.heroGradient} />
              <View style={styles.heroPattern} />
            </View>

            {/* Hero Content */}
            <View style={styles.heroContent}>
              <View style={styles.heroIconContainer}>
                <MaterialIcons name="receipt-long" size={40} color="#1D4ED8" />
              </View>
              <ThemedText style={styles.heroTitle}>
                Simplify Bill Management
              </ThemedText>
              <ThemedText style={styles.heroDescription}>
                Scan, extract & organize your pharmacy bills in seconds
              </ThemedText>
            </View>

            {/* Scan Bill Button */}
            <Pressable
              style={({ pressed }) => [
                styles.scanButton,
                pressed && styles.scanButtonPressed,
              ]}
              onPress={handleScanBill}
            >
              <MaterialIcons name="camera-alt" size={24} color="#FFFFFF" />
              <ThemedText style={styles.scanButtonText}>Scan Bill Now</ThemedText>
            </Pressable>
          </View>

          {/* Recent Bills Section */}
          <View style={styles.recentBillsSection}>
            {/* Section Header */}
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Recent Bills</ThemedText>
              <Pressable onPress={handleViewAll}>
                <ThemedText style={styles.viewAllButton}>View all</ThemedText>
              </Pressable>
            </View>

            {/* Bills List */}
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <ThemedText style={styles.loadingText}>Loading bills...</ThemedText>
              </View>
            ) : error ? (
              <View style={styles.errorContainer}>
                <MaterialIcons name="error-outline" size={48} color="#FF3B30" />
                <ThemedText style={styles.errorText}>{error}</ThemedText>
                <Pressable style={styles.retryButton} onPress={fetchRecentBills}>
                  <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
                </Pressable>
              </View>
            ) : recentBills.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialIcons name="receipt-long" size={64} color="#C7C7CC" />
                <ThemedText style={styles.emptyText}>No bills yet</ThemedText>
                <ThemedText style={styles.emptySubtext}>Scan your first bill to get started</ThemedText>
              </View>
            ) : (
              <View style={styles.billsList}>
                {recentBills.map((bill) => (
                  <RecentBillRow
                    key={bill.id}
                    item={bill}
                    onPress={handleBillPress}
                  />
                ))}
              </View>
            )}
          </View>

          {/* Add bottom padding for FAB */}
          <View style={styles.bottomSpacer} />
        </ScrollView>

 
        
        {/* Toast Notifications */}
        <Toast
          visible={toast.visible}
          message={toast.message}
          type={toast.type}
          title={toast.title}
          onHide={hideToast}
          duration={4000}
        />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1D4ED8', // Match the app bar color
  },
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  
  // App Bar Styles
  appBar: {
    height: Platform.OS === 'android' ? 110 : 80,
    position: 'relative',
    overflow: 'hidden',
  },
  appBarGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1D4ED8',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  appBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'android' ? 40 : 12,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  logoBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  logoText: {
    flex: 1,
  },
  appBarTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  appBarSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
  },
  notificationButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationButtonPressed: {
    opacity: 0.7,
    backgroundColor: '#E5E7EB',
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  profileAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  profileAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1D4ED8',
  },

  // Scroll View Styles
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },

  // Hero Card Styles
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 28,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  heroBackground: {
    height: 160,
    backgroundColor: '#F0F4FF',
    position: 'relative',
    overflow: 'hidden',
  },
  heroGradient: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(29, 78, 216, 0.1)',
  },
  heroPattern: {
    position: 'absolute',
    bottom: -30,
    left: -30,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  heroContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    alignItems: 'center',
  },
  heroIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  heroDescription: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  scanButton: {
    height: 52,
    backgroundColor: '#1D4ED8',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 24,
    marginVertical: 16,
    paddingHorizontal: 20,
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#1D4ED8',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  scanButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  scanButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Recent Bills Section Styles
  recentBillsSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  viewAllButton: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1D4ED8',
  },

  // Bills List Styles
  billsList: {
    gap: 10,
  },
  billRow: {
    minHeight: 64,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  billRowPressed: {
    opacity: 0.7,
    backgroundColor: '#F9FAFB',
  },
  billRowLeft: {
    flex: 1,
    gap: 4,
  },
  billRowPharmacy: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  billRowDate: {
    fontSize: 12,
    fontWeight: '400',
    color: '#6B7280',
  },
  billRowAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1D4ED8',
    marginLeft: 12,
  },

  // Loading, Error, and Empty States
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#1D4ED8',
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },

  // Floating Action Button Styles
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  fabPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.95 }],
  },
  fabText: {
    fontSize: 32,
    fontWeight: '300',
    color: '#FFFFFF',
  },

  // Bottom Spacer
  bottomSpacer: {
    height: 100,
  },
});

/**
 * FIXES APPLIED:
 * 
 * 1. Removed paddingTop from container that was causing white margin
 * 2. Moved SafeAreaView to wrap the entire screen
 * 3. Set SafeAreaView backgroundColor to match app bar (#1D4ED8)
 * 4. Used edges={['top']} prop to only apply safe area to top
 * 5. This creates seamless transition from status bar to app bar
 */