import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
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
import BillDetailsScreen from '@/components/screens/BillDetailsScreen';
import Toast from '@/components/ui/Toast';
import { billApi, ledgerApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import ExpiryActionPanel from '@/components/expiry/ExpiryActionPanel';

/**
 * Memoized Expiry Row Component
 * Optimized for list rendering performance
 */
const ExpiryItemRow = React.memo(({ item, onPress }) => {
  const getDistributorName = () => {
    if (item.bill?.distributor?.name) return item.bill.distributor.name;
    if (item.bill?.pharmacyName) return item.bill.pharmacyName;
    return 'Unknown Distributor';
  };

  const formatExpiry = () => {
    if (!item.expiryDate) return 'No expiry';
    if (!item.expiryDateParsed) return item.expiryDate;
    return item.expiryDateParsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getStatusColor = () => {
    if (item.daysUntilExpiry == null) return '#64748B';
    if (item.daysUntilExpiry < 0) return '#DC2626';
    if (item.daysUntilExpiry <= 30) return '#D97706';
    return '#059669';
  };

  const getStatusText = () => {
    if (item.daysUntilExpiry == null) return 'Check date';
    if (item.daysUntilExpiry < 0) return `${Math.abs(item.daysUntilExpiry)}d expired`;
    if (item.daysUntilExpiry === 0) return 'Expires today';
    return `${item.daysUntilExpiry}d left`;
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.expiryRow,
        pressed && styles.expiryRowPressed,
      ]}
      onPress={() => onPress?.(item.bill)}
    >
      <View style={[styles.expiryStatusIcon, { backgroundColor: getStatusColor() + '15' }]}>
        <MaterialIcons name="event-busy" size={22} color={getStatusColor()} />
      </View>
      <View style={styles.expiryRowLeft}>
        <ThemedText style={styles.expiryItemName} numberOfLines={1}>
          {item.name || 'Unnamed item'}
        </ThemedText>
        <ThemedText style={styles.expiryItemMeta} numberOfLines={1}>
          Batch {item.batchNumber || 'N/A'} - Qty {item.quantity || 0} - {getDistributorName()}
        </ThemedText>
      </View>
      <View style={styles.expiryRowRight}>
        <ThemedText style={styles.expiryDateText}>{formatExpiry()}</ThemedText>
        <ThemedText style={[styles.expiryStatusText, { color: getStatusColor() }]}>
          {getStatusText()}
        </ThemedText>
      </View>
    </Pressable>
  );
});

ExpiryItemRow.displayName = 'ExpiryItemRow';

function parseExpiryDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  let match = text.match(/^(\d{1,2})[\/-](\d{2,4})$/);
  if (match) {
    const month = Number(match[1]);
    const year = Number(match[2].length === 2 ? `20${match[2]}` : match[2]);
    if (month >= 1 && month <= 12) return new Date(year, month, 0);
  }

  match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const day = first > 12 ? first : second;
    const month = first > 12 ? second : first;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const STOCK_PAGE_SIZE = 5;

export default function BillsHomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [bills, setBills] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingBill, setEditingBill] = useState(null);
  const [viewingBill, setViewingBill] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info', title: '' });
  const [visibleStockCount, setVisibleStockCount] = useState(STOCK_PAGE_SIZE);
  const [overdueAlert, setOverdueAlert] = useState({ totalOverdue: 0, distributorsWithOverdue: 0 });

  // Only use authenticated user ID; do not fetch with placeholder
  const userId = user?.id;

  const fetchBills = useCallback(async () => {
    if (!userId) return;
    try {
      setIsLoading(true);
      setError(null);
      const response = await billApi.getUserBills(userId);
      setBills(response.bills || []);
      setVisibleStockCount(STOCK_PAGE_SIZE);
    } catch (err) {
      console.error('Error fetching bills:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const expiringItems = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return bills
      .flatMap((bill) =>
        (bill.items || []).map((item) => {
          const expiryDateParsed = parseExpiryDate(item.expiryDate);
          const daysUntilExpiry = expiryDateParsed
            ? Math.ceil((expiryDateParsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            : null;

          return {
            ...item,
            bill,
            expiryDateParsed,
            daysUntilExpiry,
          };
        })
      )
      .filter((item) => item.expiryDate || item.expiryDateParsed)
      .sort((a, b) => {
        if (a.daysUntilExpiry == null) return 1;
        if (b.daysUntilExpiry == null) return -1;
        return a.daysUntilExpiry - b.daysUntilExpiry;
      });
  }, [bills]);

  const visibleStockItems = useMemo(
    () => expiringItems.slice(0, visibleStockCount),
    [expiringItems, visibleStockCount]
  );

  const handleLoadMoreStock = useCallback(() => {
    setVisibleStockCount((count) => Math.min(count + STOCK_PAGE_SIZE, expiringItems.length));
  }, [expiringItems.length]);

  // Refresh bills whenever the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (userId) {
        fetchBills();
        ledgerApi.getOverdueAlert(userId)
          .then(setOverdueAlert)
          .catch((err) => console.log('Could not fetch overdue alert:', err.message));
      }
    }, [userId, fetchBills])
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

  // Straight into Quick Sell — the counter path must never be more than a tap away
  const handleSell = useCallback(() => {
    router.push('/sales?view=sell');
  }, [router]);

  const handleBillPress = useCallback((bill) => {
    // Open bill details — header + per-item quick edit, with a fast one-tap path for
    // the most common correction (a wrong date). "Full Edit" inside drops into the
    // full OCR-review-style form for heavier changes.
    setViewingBill(bill);
  }, []);

  const handleSaveBill = useCallback(async (formData) => {
    try {
      console.log('Saving edited bill:', formData);
      
      // Update bill via API
      await billApi.updateBill(editingBill.id, formData);
      
      // Update the local state
      setBills(prevBills =>
        prevBills.map(bill =>
          bill.id === editingBill.id ? { ...bill, ...formData } : bill
        )
      );
      
      // Close edit mode and show success
      setEditingBill(null);
      showToast('Expiry items have been updated successfully.', 'success', 'Items Updated');
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
    router.push('/explore');
  }, [router]);

  // Bill details — header + per-item quick edit, audit history, fast date-fix path
  if (viewingBill) {
    return (
      <View style={{ flex: 1 }}>
        <BillDetailsScreen
          bill={viewingBill}
          userId={userId}
          onBack={() => setViewingBill(null)}
          onEdit={(bill) => {
            setViewingBill(null);
            setEditingBill(bill);
          }}
          onRefresh={(updatedBill) => {
            setBills((prev) => prev.map((b) => (b.id === updatedBill.id ? updatedBill : b)));
          }}
        />
      </View>
    );
  }

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
                <ThemedText style={styles.appBarTitle}>Expiry Manager</ThemedText>
                <ThemedText style={styles.appBarSubtitle}>Pharmacy Stock Alerts</ThemedText>
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
                Track Expiry{'\n'}Before It Hits
              </ThemedText>
              <ThemedText style={styles.heroDescription}>
                Scan distributor bills and catch batch expiry dates before stock becomes risky.
              </ThemedText>

              {/* Sell — the 2-second counter path, kept above everything else */}
              <Pressable
                style={({ pressed }) => [
                  styles.sellButton,
                  pressed && styles.sellButtonPressed,
                ]}
                onPress={handleSell}
              >
                <View style={styles.scanButtonInner}>
                  <MaterialIcons name="point-of-sale" size={22} color="#4F46E5" />
                  <ThemedText style={styles.sellButtonText}>Sell</ThemedText>
                </View>
                <View style={styles.sellButtonArrow}>
                  <MaterialIcons name="arrow-forward" size={18} color="#FFFFFF" />
                </View>
              </Pressable>

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
                  <ThemedText style={styles.scanButtonText}>Scan For Expiry</ThemedText>
                </View>
                <View style={styles.scanButtonArrow}>
                  <MaterialIcons name="arrow-forward" size={18} color="#4F46E5" />
                </View>
              </Pressable>
            </View>
          </View>

          {/* Overdue distributor dues alert */}
          {overdueAlert.totalOverdue > 0 && (
            <Pressable
              style={({ pressed }) => [styles.overdueAlertCard, pressed && styles.overdueAlertCardPressed]}
              onPress={() => router.push('/ledger')}
            >
              <View style={styles.overdueAlertIcon}>
                <MaterialIcons name="error-outline" size={22} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.overdueAlertText}>
                  ₹{overdueAlert.totalOverdue.toLocaleString('en-IN')} overdue across {overdueAlert.distributorsWithOverdue} distributor{overdueAlert.distributorsWithOverdue !== 1 ? 's' : ''}
                </ThemedText>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#DC2626" />
            </Pressable>
          )}

          {/* Expiry Action Panel — surfaces only batches needing action */}
          <ExpiryActionPanel
            userId={userId}
            onScanPress={handleScanBill}
          />

          {/* Expiring Items Section — full raw list below */}
          <View style={styles.recentBillsSection}>
            {/* Section Header */}
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>All Tracked Stock</ThemedText>
              <Pressable onPress={handleViewAll}>
                <ThemedText style={styles.viewAllButton}>Add stock</ThemedText>
              </Pressable>
            </View>

            {/* Expiry List */}
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <ThemedText style={styles.loadingText}>Loading expiry items...</ThemedText>
              </View>
            ) : error ? (
              <View style={styles.errorContainer}>
                <MaterialIcons name="error-outline" size={48} color="#FF3B30" />
                <ThemedText style={styles.errorText}>{error}</ThemedText>
                <Pressable style={styles.retryButton} onPress={fetchBills}>
                  <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
                </Pressable>
              </View>
            ) : expiringItems.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialIcons name="event-available" size={64} color="#C7C7CC" />
                <ThemedText style={styles.emptyText}>No expiry items yet</ThemedText>
                <ThemedText style={styles.emptySubtext}>Scan a distributor bill to start tracking stock expiry</ThemedText>
              </View>
            ) : (
              <View style={styles.billsList}>
                {visibleStockItems.map((item) => (
                  <ExpiryItemRow
                    key={item.id || `${item.bill.id}-${item.name}-${item.batchNumber}`}
                    item={item}
                    onPress={handleBillPress}
                  />
                ))}
                {visibleStockCount < expiringItems.length && (
                  <Pressable style={styles.loadMoreButton} onPress={handleLoadMoreStock}>
                    <ThemedText style={styles.loadMoreText}>
                      Load More ({expiringItems.length - visibleStockCount} remaining)
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            )}
          </View>

          {/* Quick Actions Section */}
          <View style={styles.quickActionsSection}>
            <ThemedText style={styles.sectionTitle}>Quick Actions</ThemedText>

            {/* Sales */}
            <ThemedText style={styles.quickActionsSubLabel}>Sales</ThemedText>
            <View style={styles.quickActionsGrid}>
              <Pressable
                style={({ pressed }) => [
                  styles.quickActionCard,
                  pressed && styles.quickActionCardPressed,
                ]}
                onPress={() => router.push('/sales')}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#ECFDF5' }]}>
                  <MaterialIcons name="receipt-long" size={22} color="#059669" />
                </View>
                <ThemedText style={styles.quickActionTitle} numberOfLines={1}>Daily Sales</ThemedText>
                <ThemedText style={styles.quickActionSubtitle} numberOfLines={1}>Sale register</ThemedText>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.quickActionCard,
                  pressed && styles.quickActionCardPressed,
                ]}
                onPress={() => router.push('/sales?view=sell')}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#EEF2FF' }]}>
                  <MaterialIcons name="point-of-sale" size={22} color="#4F46E5" />
                </View>
                <ThemedText style={styles.quickActionTitle} numberOfLines={1}>Quick Sell</ThemedText>
                <ThemedText style={styles.quickActionSubtitle} numberOfLines={1}>Record a sale</ThemedText>
              </Pressable>
            </View>

            {/* Inventory */}
            <ThemedText style={styles.quickActionsSubLabel}>Inventory</ThemedText>
            <View style={styles.quickActionsGrid}>
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

              <Pressable
                style={({ pressed }) => [
                  styles.quickActionCard,
                  pressed && styles.quickActionCardPressed,
                ]}
                onPress={() => router.push('/exports')}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#F0FDFA' }]}>
                  <MaterialIcons name="file-download" size={22} color="#0D9488" />
                </View>
                <ThemedText style={styles.quickActionTitle} numberOfLines={1}>Export Data</ThemedText>
                <ThemedText style={styles.quickActionSubtitle} numberOfLines={1}>Excel & CSV</ThemedText>
              </Pressable>
            </View>

            {/* Payments & Care */}
            <ThemedText style={styles.quickActionsSubLabel}>Payments & Care</ThemedText>
            <View style={styles.quickActionsGrid}>
              <Pressable
                style={({ pressed }) => [
                  styles.quickActionCard,
                  pressed && styles.quickActionCardPressed,
                ]}
                onPress={() => router.push('/ledger')}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#FEF2F2' }]}>
                  <MaterialIcons name="account-balance-wallet" size={22} color="#DC2626" />
                </View>
                <ThemedText style={styles.quickActionTitle} numberOfLines={1}>Distributor Dues</ThemedText>
                <ThemedText style={styles.quickActionSubtitle} numberOfLines={1}>Khata & payments</ThemedText>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.quickActionCard,
                  pressed && styles.quickActionCardPressed,
                ]}
                onPress={() => router.push('/payments')}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#F0FDF4' }]}>
                  <MaterialIcons name="payment" size={22} color="#059669" />
                </View>
                <ThemedText style={styles.quickActionTitle} numberOfLines={1}>UPI Payments</ThemedText>
                <ThemedText style={styles.quickActionSubtitle} numberOfLines={1}>Shared receipts</ThemedText>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.quickActionCard,
                  pressed && styles.quickActionCardPressed,
                ]}
                onPress={() => router.push('/patients')}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#FEF2F2' }]}>
                  <MaterialIcons name="medical-services" size={22} color="#DC2626" />
                </View>
                <ThemedText style={styles.quickActionTitle} numberOfLines={1}>Refill Reminders</ThemedText>
                <ThemedText style={styles.quickActionSubtitle} numberOfLines={1}>Medication sync</ThemedText>
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
  sellButton: {
    height: 54,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 6,
    marginBottom: 12,
  },
  sellButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  sellButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#4F46E5',
    letterSpacing: 0.2,
  },
  sellButtonArrow: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
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

  // Overdue Alert Card
  overdueAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 12,
  },
  overdueAlertCardPressed: {
    opacity: 0.8,
  },
  overdueAlertIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overdueAlertText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991B1B',
  },

  // Expiring Items Section Styles
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

  // Expiry List Styles
  billsList: {
    gap: 10,
  },
  loadMoreButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  loadMoreText: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '600',
  },
  expiryRow: {
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
  expiryRowPressed: {
    opacity: 0.8,
    backgroundColor: '#F8FAFC',
    transform: [{ scale: 0.99 }],
  },
  expiryStatusIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  expiryRowLeft: {
    flex: 1,
    gap: 3,
  },
  expiryItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  expiryItemMeta: {
    fontSize: 12,
    fontWeight: '400',
    color: '#94A3B8',
  },
  expiryRowRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  expiryDateText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  expiryStatusText: {
    fontSize: 12,
    fontWeight: '800',
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
  quickActionsSubLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 10,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    gap: 12,
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
