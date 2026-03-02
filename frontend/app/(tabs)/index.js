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
import { useFocusEffect } from '@react-navigation/native';
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

  // Get distributor name (prefer distributor relation, fallback to pharmacyName)
  const getDistributorName = () => {
    if (item.distributor?.name) return item.distributor.name;
    if (item.pharmacyName) return item.pharmacyName;
    return 'Unknown Distributor';
  };

  // Get initials for avatar
  const getInitials = () => {
    const name = getDistributorName();
    return name.charAt(0).toUpperCase();
  };

  // Get a color based on the name
  const getAvatarColor = () => {
    const colors = ['#4F46E5', '#7C3AED', '#2563EB', '#0891B2', '#059669', '#D97706'];
    const name = getDistributorName();
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.billRow,
        pressed && styles.billRowPressed,
      ]}
      onPress={() => onPress?.(item)}
    >
      <View style={[styles.billRowAvatar, { backgroundColor: getAvatarColor() + '15' }]}>
        <ThemedText style={[styles.billRowAvatarText, { color: getAvatarColor() }]}>
          {getInitials()}
        </ThemedText>
      </View>
      <View style={styles.billRowLeft}>
        <ThemedText style={styles.billRowPharmacy} numberOfLines={1}>
          {getDistributorName()}
        </ThemedText>
        <ThemedText style={styles.billRowDate}>
          {item.invoiceNumber || ''} {item.invoiceDate ? '• ' + formatDate(item.invoiceDate) : ''}
        </ThemedText>
      </View>
      <View style={styles.billRowRight}>
        <ThemedText style={styles.billRowAmount}>
          {formatAmount(item.grandTotal)}
        </ThemedText>
        <MaterialIcons name="chevron-right" size={16} color="#94A3B8" />
      </View>
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

  const fetchRecentBills = useCallback(async () => {
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
  }, [userId]);

  // Refresh bills whenever the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (userId) {
        fetchRecentBills();
      }
    }, [userId, fetchRecentBills])
  );

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
          <View style={styles.appBarPattern1} />
          <View style={styles.appBarPattern2} />
          <View style={styles.appBarContent}>
            <View style={styles.logoContainer}>
              <View style={styles.logoBadge}>
                <MaterialIcons name="local-pharmacy" size={24} color="#FFFFFF" />
              </View>
              <View style={styles.logoText}>
                <ThemedText style={styles.appBarTitle}>Pharma Bills</ThemedText>
                <ThemedText style={styles.appBarSubtitle}>Smart Bill Manager</ThemedText>
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
            {/* Decorative elements */}
            <View style={styles.heroDecoCircle1} />
            <View style={styles.heroDecoCircle2} />
            <View style={styles.heroDecoCircle3} />

            {/* Hero Content */}
            <View style={styles.heroContent}>
              <View style={styles.heroBadge}>
                <MaterialIcons name="auto-awesome" size={14} color="#4F46E5" />
                <ThemedText style={styles.heroBadgeText}>AI-Powered</ThemedText>
              </View>
              <ThemedText style={styles.heroTitle}>
                Simplify Bill{'\n'}Management
              </ThemedText>
              <ThemedText style={styles.heroDescription}>
                Scan, extract & organize your pharmacy bills in seconds with AI
              </ThemedText>

              {/* Scan Bill Button */}
              <Pressable
                style={({ pressed }) => [
                  styles.scanButton,
                  pressed && styles.scanButtonPressed,
                ]}
                onPress={handleScanBill}
              >
                <View style={styles.scanButtonInner}>
                  <MaterialIcons name="document-scanner" size={22} color="#FFFFFF" />
                  <ThemedText style={styles.scanButtonText}>Scan Bill Now</ThemedText>
                </View>
                <View style={styles.scanButtonArrow}>
                  <MaterialIcons name="arrow-forward" size={18} color="#4F46E5" />
                </View>
              </Pressable>
            </View>
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

          {/* Quick Actions Section */}
          <View style={styles.quickActionsSection}>
            <ThemedText style={styles.sectionTitle}>Quick Actions</ThemedText>
            <View style={styles.quickActionsGrid}>
              {/* Products Button */}
              <Pressable
                style={({ pressed }) => [
                  styles.quickActionCard,
                  pressed && styles.quickActionCardPressed,
                ]}
                onPress={() => router.push('/products')}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#EEF2FF' }]}>
                  <MaterialIcons name="inventory-2" size={22} color="#4F46E5" />
                </View>
                <ThemedText style={styles.quickActionTitle} numberOfLines={1}>Products</ThemedText>
                <ThemedText style={styles.quickActionSubtitle} numberOfLines={1}>Manage catalog</ThemedText>
              </Pressable>

              {/* Scan Button */}
              <Pressable
                style={({ pressed }) => [
                  styles.quickActionCard,
                  pressed && styles.quickActionCardPressed,
                ]}
                onPress={handleScanBill}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#ECFDF5' }]}>
                  <MaterialIcons name="qr-code-scanner" size={22} color="#059669" />
                </View>
                <ThemedText style={styles.quickActionTitle} numberOfLines={1}>Scan Bill</ThemedText>
                <ThemedText style={styles.quickActionSubtitle} numberOfLines={1}>Add new bill</ThemedText>
              </Pressable>

              {/* Distributors Button */}
              <Pressable
                style={({ pressed }) => [
                  styles.quickActionCard,
                  pressed && styles.quickActionCardPressed,
                ]}
                onPress={() => router.push('/distributors')}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#FEF3C7' }]}>
                  <MaterialIcons name="business" size={22} color="#D97706" />
                </View>
                <ThemedText style={styles.quickActionTitle} numberOfLines={1}>Distributors</ThemedText>
                <ThemedText style={styles.quickActionSubtitle} numberOfLines={1}>Manage suppliers</ThemedText>
              </Pressable>
            </View>
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
    backgroundColor: '#4F46E5',
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
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
    backgroundColor: '#4F46E5',
  },
  appBarPattern1: {
    position: 'absolute',
    top: -40,
    right: -20,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  appBarPattern2: {
    position: 'absolute',
    bottom: -20,
    left: -30,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  appBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'android' ? 40 : 12,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  logoText: {
    flex: 1,
  },
  appBarTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  appBarSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 1,
    letterSpacing: 0.2,
  },
  profileButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
  },
  profileAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  profileAvatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4F46E5',
  },

  // Scroll View Styles
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },

  // Hero Card Styles
  heroCard: {
    backgroundColor: '#4F46E5',
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 28,
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#4F46E5',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  heroDecoCircle1: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  heroDecoCircle2: {
    position: 'absolute',
    bottom: 20,
    left: -40,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  heroDecoCircle3: {
    position: 'absolute',
    top: 40,
    right: 50,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  heroContent: {
    padding: 24,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    marginBottom: 16,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
    letterSpacing: 0.3,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
    lineHeight: 32,
    letterSpacing: -0.5,
  },
  heroDescription: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 24,
    lineHeight: 20,
  },
  scanButton: {
    height: 54,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  scanButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  scanButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scanButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  scanButtonArrow: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Recent Bills Section Styles
  recentBillsSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  viewAllButton: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
  },

  // Bills List Styles
  billsList: {
    gap: 10,
  },
  billRow: {
    minHeight: 72,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  billRowPressed: {
    opacity: 0.8,
    backgroundColor: '#F8FAFC',
    transform: [{ scale: 0.99 }],
  },
  billRowAvatar: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  billRowAvatarText: {
    fontSize: 18,
    fontWeight: '800',
  },
  billRowLeft: {
    flex: 1,
    gap: 3,
  },
  billRowPharmacy: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  billRowDate: {
    fontSize: 12,
    fontWeight: '400',
    color: '#94A3B8',
  },
  billRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  billRowAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },

  // Loading, Error, and Empty States
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 14,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    backgroundColor: '#4F46E5',
    borderRadius: 12,
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
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
  },

  // Quick Actions Section
  quickActionsSection: {
    marginTop: 8,
    marginBottom: 16,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  quickActionCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
    backgroundColor: '#F8FAFC',
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  quickActionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  quickActionSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Bottom Spacer
  bottomSpacer: {
    height: 100,
  },
});