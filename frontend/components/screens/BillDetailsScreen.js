import React from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '@/components/ui/AppBar';
import Card from '@/components/ui/Card';
import Chip from '@/components/ui/Chip';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';

/**
 * Item Row Component
 */
const ItemRow = ({ item }) => (
  <View style={styles.itemRow}>
    <View style={styles.itemLeft}>
      <ThemedText style={styles.itemName}>{item.itemName}</ThemedText>
      <ThemedText style={styles.itemMeta}>
        {item.quantity} × ₹{item.rate}
      </ThemedText>
    </View>
    <ThemedText style={styles.itemTotal}>₹{item.itemTotal}</ThemedText>
  </View>
);

/**
 * Total Row Component
 */
const TotalRow = ({ label, value, isGrandTotal = false }) => (
  <View style={styles.totalRow}>
    <ThemedText
      style={[styles.totalLabel, isGrandTotal && styles.grandTotalLabel]}
    >
      {label}
    </ThemedText>
    <ThemedText
      style={[styles.totalValue, isGrandTotal && styles.grandTotalValue]}
    >
      ₹{value}
    </ThemedText>
  </View>
);

/**
 * BillDetailsScreen
 * Shows complete bill information with breakdown
 * IMPORTANT: Keep existing navigation logic
 */
export default function BillDetailsScreen({
  bill,
  onBack,
  onShare,
  onExportPdf,
  onEdit,
}) {
  if (!bill) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <AppBar title="Bill Details" onBack={onBack} />
          <View style={styles.emptyContainer}>
            <ThemedText style={styles.emptyText}>No bill data</ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const getPaymentVariant = (type) => {
    if (type?.toLowerCase() === 'credit') return 'credit';
    if (type?.toLowerCase() === 'cash') return 'cash';
    return 'default';
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <AppBar
          title="Bill Details"
          onBack={onBack}
          rightIcon="share-outline"
          onRightPress={onShare}
        />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary Card */}
          <Card style={styles.summaryCard}>
            <ThemedText style={styles.amountLarge}>
              ₹{bill.grandTotal || bill.totalAmount || '0'}
            </ThemedText>
            <View style={styles.paymentTypeContainer}>
              <Chip
                label={bill.paymentType || 'Cash'}
                variant={getPaymentVariant(bill.paymentType)}
              />
            </View>
            
            <View style={styles.summaryDivider} />
            
            <View style={styles.summaryInfo}>
              <View style={styles.summaryRow}>
                <Ionicons name="storefront-outline" size={16} color="#64748B" />
                <ThemedText style={styles.summaryLabel}>
                  {bill.pharmacyName || 'Unknown Pharmacy'}
                </ThemedText>
              </View>
              
              <View style={styles.summaryRow}>
                <Ionicons name="receipt-outline" size={16} color="#64748B" />
                <ThemedText style={styles.summaryMeta}>
                  Invoice #{bill.invoiceNumber || 'N/A'}
                </ThemedText>
              </View>
              
              <View style={styles.summaryRow}>
                <Ionicons name="calendar-outline" size={16} color="#64748B" />
                <ThemedText style={styles.summaryMeta}>
                  {bill.invoiceDate || 'No date'}
                </ThemedText>
              </View>
            </View>
          </Card>

          {/* Items Breakdown Card */}
          {bill.items && bill.items.length > 0 && (
            <Card style={styles.itemsCard}>
              <View style={styles.cardHeaderRow}>
                <Ionicons name="list-outline" size={20} color="#4F46E5" />
                <ThemedText style={styles.cardTitle}>Items</ThemedText>
              </View>
              
              <View style={styles.itemsList}>
                {bill.items.map((item, index) => (
                  <ItemRow key={index} item={item} />
                ))}
              </View>
            </Card>
          )}

          {/* Totals Card */}
          <Card style={styles.totalsCard}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="calculator-outline" size={20} color="#4F46E5" />
              <ThemedText style={styles.cardTitle}>Totals</ThemedText>
            </View>
            
            <View style={styles.totalsBreakdown}>
              <TotalRow label="Subtotal" value={bill.subtotal || 0} />
              {bill.discount > 0 && (
                <TotalRow label="Discount" value={bill.discount} />
              )}
              {bill.cgst > 0 && <TotalRow label="CGST" value={bill.cgst} />}
              {bill.sgst > 0 && <TotalRow label="SGST" value={bill.sgst} />}
              {bill.roundOff !== 0 && (
                <TotalRow label="Round Off" value={bill.roundOff} />
              )}
              
              <View style={styles.grandTotalDivider} />
              
              <TotalRow
                label="Grand Total"
                value={bill.grandTotal || 0}
                isGrandTotal
              />
            </View>
          </Card>

          {/* Bottom Spacer for Sticky Actions */}
          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Sticky Bottom Actions */}
        <View style={styles.stickyActions}>
          <PrimaryButton
            title="Export PDF"
            icon="download-outline"
            onPress={onExportPdf}
          />
          
          <View style={styles.buttonSpacer} />
          
          <SecondaryButton
            title="Edit"
            icon="create-outline"
            onPress={onEdit}
          />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 160,
  },
  summaryCard: {
    marginBottom: 16,
    alignItems: 'center',
  },
  amountLarge: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 12,
  },
  paymentTypeContainer: {
    marginBottom: 16,
  },
  summaryDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#E2E8F0',
    marginBottom: 16,
  },
  summaryInfo: {
    width: '100%',
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  summaryMeta: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  itemsCard: {
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  itemsList: {
    gap: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemLeft: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  totalsCard: {
    marginBottom: 16,
  },
  totalsBreakdown: {
    gap: 10,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  grandTotalDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  grandTotalValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  bottomSpacer: {
    height: 20,
  },
  stickyActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  buttonSpacer: {
    height: 10,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
  },
});
