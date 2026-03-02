import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import Card from '@/components/ui/Card';
import Chip from '@/components/ui/Chip';
import SecondaryButton from '@/components/ui/SecondaryButton';

/**
 * Info Row Component
 */
const InfoRow = ({ icon, label, value }) => {
  if (!value) return null;
  
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color="#64748B" />
      </View>
      <View style={styles.infoContent}>
        <ThemedText style={styles.infoLabel}>{label}</ThemedText>
        <ThemedText style={styles.infoValue}>{value}</ThemedText>
      </View>
    </View>
  );
};

/**
 * Bill Row Component
 */
const BillRow = React.memo(({ item, onPress }) => {
  const formatDate = (dateString) => {
    if (!dateString) return 'No Date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { 
      day: 'numeric', 
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <Pressable
      onPress={() => onPress?.(item)}
      style={({ pressed }) => [
        styles.billRow,
        pressed && styles.billRowPressed,
      ]}
    >
      <View style={styles.billRowLeft}>
        <ThemedText style={styles.billInvoice}>
          {item.invoiceNumber || 'No Invoice #'}
        </ThemedText>
        <ThemedText style={styles.billDate}>
          {formatDate(item.invoiceDate || item.createdAt)}
        </ThemedText>
      </View>
      <View style={styles.billRowRight}>
        <ThemedText style={styles.billAmount}>
          ₹{parseFloat(item.grandTotal || 0).toFixed(2)}
        </ThemedText>
        <Chip
          label={item.paymentType || 'Cash'}
          variant={item.paymentType?.toLowerCase() === 'credit' ? 'credit' : 'default'}
          size="small"
        />
      </View>
    </Pressable>
  );
});

BillRow.displayName = 'BillRow';

/**
 * DistributorDetailScreen
 * Shows distributor details and their bills
 */
export default function DistributorDetailScreen({
  distributor,
  bills = [],
  onBack,
  onEdit,
  onDelete,
  onBillPress,
  onLoadMoreBills,
  loading = false,
  hasMoreBills = false,
}) {
  if (!distributor) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <AppBar title="Distributor" onBack={onBack} />
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4F46E5" />
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const formatAmount = (amount) => {
    if (!amount) return '₹0';
    return `₹${parseFloat(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { 
      day: 'numeric', 
      month: 'short',
      year: 'numeric'
    });
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Distributor',
      `Are you sure you want to delete "${distributor.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: onDelete 
        },
      ]
    );
  };

  const renderBill = useCallback(({ item }) => (
    <BillRow item={item} onPress={onBillPress} />
  ), [onBillPress]);

  const keyExtractor = useCallback((item) => item.id, []);

  const ListHeader = () => (
    <>
      {/* Profile Card */}
      <Card style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <View style={styles.avatarLarge}>
            <ThemedText style={styles.avatarTextLarge}>
              {(distributor.name || 'D').charAt(0).toUpperCase()}
            </ThemedText>
          </View>
          <View style={styles.profileInfo}>
            <ThemedText style={styles.profileName}>{distributor.name}</ThemedText>
            {distributor.gstin && (
              <View style={styles.gstinBadge}>
                <ThemedText style={styles.gstinBadgeText}>
                  GST: {distributor.gstin}
                </ThemedText>
              </View>
            )}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <ThemedText style={styles.statBoxValue}>
              {distributor.totalBills || 0}
            </ThemedText>
            <ThemedText style={styles.statBoxLabel}>Total Bills</ThemedText>
          </View>
          <View style={styles.statBoxDivider} />
          <View style={styles.statBox}>
            <ThemedText style={styles.statBoxValue}>
              {distributor.totalProducts || 0}
            </ThemedText>
            <ThemedText style={styles.statBoxLabel}>Products</ThemedText>
          </View>
          <View style={styles.statBoxDivider} />
          <View style={styles.statBox}>
            <ThemedText style={[styles.statBoxValue, styles.statBoxValueGreen]}>
              {formatAmount(distributor.totalAmount)}
            </ThemedText>
            <ThemedText style={styles.statBoxLabel}>Total Purchase</ThemedText>
          </View>
        </View>
      </Card>

      {/* Contact Details Card */}
      <Card style={styles.detailsCard}>
        <ThemedText style={styles.sectionTitle}>Contact Details</ThemedText>
        
        <InfoRow 
          icon="call-outline" 
          label="Phone" 
          value={distributor.phone} 
        />
        <InfoRow 
          icon="mail-outline" 
          label="Email" 
          value={distributor.email} 
        />
        <InfoRow 
          icon="location-outline" 
          label="Address" 
          value={distributor.address} 
        />
        <InfoRow 
          icon="document-text-outline" 
          label="Drug License" 
          value={distributor.dlNumber} 
        />
        <InfoRow 
          icon="calendar-outline" 
          label="Last Transaction" 
          value={formatDate(distributor.lastTransaction)} 
        />
        
        {distributor.notes && (
          <View style={styles.notesSection}>
            <ThemedText style={styles.notesLabel}>Notes</ThemedText>
            <ThemedText style={styles.notesText}>{distributor.notes}</ThemedText>
          </View>
        )}
      </Card>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <SecondaryButton
          title="Edit"
          icon="create-outline"
          onPress={onEdit}
          style={styles.actionButton}
        />
        <SecondaryButton
          title="Delete"
          icon="trash-outline"
          borderColor="#DC2626"
          textColor="#DC2626"
          onPress={handleDelete}
          style={styles.actionButton}
        />
      </View>

      {/* Bills Section Header */}
      <View style={styles.billsHeader}>
        <ThemedText style={styles.sectionTitle}>Bills History</ThemedText>
        <ThemedText style={styles.billsCount}>{bills.length} bills</ThemedText>
      </View>
    </>
  );

  const ListEmpty = () => (
    <View style={styles.emptyBills}>
      <Ionicons name="receipt-outline" size={48} color="#CBD5E1" />
      <ThemedText style={styles.emptyText}>No bills found</ThemedText>
    </View>
  );

  const ListFooter = () => {
    if (!hasMoreBills) return null;
    
    return (
      <Pressable 
        style={styles.loadMoreButton}
        onPress={onLoadMoreBills}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#4F46E5" />
        ) : (
          <ThemedText style={styles.loadMoreText}>Load More Bills</ThemedText>
        )}
      </Pressable>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <AppBar 
          title="Distributor Details" 
          onBack={onBack}
        />

        <FlatList
          data={bills}
          renderItem={renderBill}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          ListFooterComponent={ListFooter}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  profileCard: {
    padding: 20,
    marginBottom: 16,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
  },
  avatarTextLarge: {
    fontSize: 28,
    fontWeight: '700',
    color: '#4F46E5',
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  gstinBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  gstinBadgeText: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statBoxDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 16,
  },
  statBoxValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4F46E5',
  },
  statBoxValueGreen: {
    color: '#059669',
  },
  statBoxLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  detailsCard: {
    padding: 16,
    marginBottom: 16,
    borderRadius: 18,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoLabel: {
    fontSize: 11,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  infoValue: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
    marginTop: 2,
  },
  notesSection: {
    marginTop: 8,
    padding: 14,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  notesLabel: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
  },
  notesText: {
    fontSize: 14,
    color: '#92400E',
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
  },
  billsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  billsCount: {
    fontSize: 14,
    color: '#64748B',
  },
  billRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.6)',
  },
  billRowPressed: {
    opacity: 0.7,
  },
  billRowLeft: {
    flex: 1,
  },
  billInvoice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  billDate: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  billRowRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  billAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#059669',
  },
  emptyBills: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 12,
  },
  loadMoreButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadMoreText: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '600',
  },
});
