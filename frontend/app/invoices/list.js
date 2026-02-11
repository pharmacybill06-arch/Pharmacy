import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput
} from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useInvoice } from '../../contexts/InvoiceContext';

/**
 * InvoicesListScreen
 * Display list of customer invoices with filtering and actions
 */
export default function InvoicesListScreen() {
  const router = useRouter();
  const { userId, apiUrl } = useAuth();
  const { fetchInvoices, deleteInvoice, invoiceList, loading } = useInvoice();
  
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredInvoices, setFilteredInvoices] = useState([]);

  useFocusEffect(
    React.useCallback(() => {
      loadInvoices();
    }, [userId, apiUrl])
  );

  const loadInvoices = async () => {
    try {
      await fetchInvoices(userId, apiUrl);
    } catch (error) {
      Alert.alert('Error', 'Failed to load invoices');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadInvoices();
    } catch (error) {
      Alert.alert('Error', 'Failed to refresh invoices');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredInvoices(invoiceList);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredInvoices(
        invoiceList.filter(
          (invoice) =>
            invoice.customerName?.toLowerCase().includes(query) ||
            invoice.customerPhone?.includes(query)
        )
      );
    }
  }, [searchQuery, invoiceList]);

  const handleDeleteInvoice = (invoiceId, customerName) => {
    Alert.alert(
      'Delete Invoice',
      `Are you sure you want to delete invoice for ${customerName}?\n\nStock will be refunded automatically.`,
      [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              await deleteInvoice(userId, invoiceId, apiUrl);
              Alert.alert('Success', 'Invoice deleted and stock refunded');
              await loadInvoices();
            } catch (error) {
              Alert.alert('Error', error.message);
            }
          },
          style: 'destructive'
        }
      ]
    );
  };

  const renderInvoiceItem = ({ item }) => (
    <TouchableOpacity
      style={styles.invoiceCard}
      onPress={() =>
        router.push({
          pathname: '/invoices/view',
          params: { invoiceId: item.id }
        })
      }
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.iconContainer}>
            <Ionicons name="document-outline" size={24} color={Colors.light.primary} />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.customerName}>{item.customerName}</Text>
            <Text style={styles.invoiceDate}>
              {new Date(item.invoiceDate).toLocaleDateString()}
            </Text>
          </View>
        </View>
        <View style={styles.amountContainer}>
          <Text style={styles.amount}>₹{item.grandTotal?.toFixed(2) || '0.00'}</Text>
          <View
            style={[
              styles.statusBadge,
              item.paymentType === 'cash' ? styles.statusPaid : styles.statusCredit
            ]}
          >
            <Text style={styles.statusText}>
              {item.paymentType === 'cash' ? 'Cash' : 'Credit'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.cardBody}>
        {item.customerPhone && (
          <View style={styles.detailRow}>
            <Ionicons name="call-outline" size={14} color={Colors.light.gray} />
            <Text style={styles.detailText}>{item.customerPhone}</Text>
          </View>
        )}
        <View style={styles.detailRow}>
          <Ionicons name="bag-outline" size={14} color={Colors.light.gray} />
          <Text style={styles.detailText}>{item.items?.length || 0} items</Text>
        </View>
        {item.balanceAmount > 0 && (
          <View style={[styles.detailRow, styles.balanceRow]}>
            <Ionicons name="alert-circle-outline" size={14} color={Colors.light.warning} />
            <Text style={styles.balanceText}>Balance: ₹{item.balanceAmount?.toFixed(2)}</Text>
          </View>
        )}
      </View>

      <View style={styles.cardFooter}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() =>
            router.push({
              pathname: '/invoices/view',
              params: { invoiceId: item.id }
            })
          }
        >
          <Ionicons name="eye-outline" size={16} color={Colors.light.primary} />
          <Text style={styles.actionButtonText}>View</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleDeleteInvoice(item.id, item.customerName)}
        >
          <Ionicons name="trash-outline" size={16} color={Colors.light.danger} />
          <Text style={[styles.actionButtonText, styles.dangerText]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="document-outline" size={64} color={Colors.light.gray} />
      <Text style={styles.emptyTitle}>No Invoices Found</Text>
      <Text style={styles.emptySubtitle}>
        {searchQuery ? 'Try adjusting your search' : 'Create your first invoice'}
      </Text>
      {!searchQuery && (
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push('/invoices/create')}
        >
          <Ionicons name="add-circle" size={24} color={Colors.light.white} />
          <Text style={styles.createButtonText}>Create Invoice</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Invoices',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/invoices/create')}
              style={styles.headerButton}
            >
              <Ionicons name="add-circle" size={24} color={Colors.light.primary} />
            </TouchableOpacity>
          )
        }}
      />

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={Colors.light.gray} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or phone..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={Colors.light.gray}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={Colors.light.gray} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.loadingText}>Loading invoices...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredInvoices}
          keyExtractor={(item) => item.id}
          renderItem={renderInvoiceItem}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          contentContainerStyle={filteredInvoices.length === 0 ? styles.emptyListContainer : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.lightGray
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.light.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.lightGray
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.light.text,
    paddingVertical: 0
  },
  headerButton: {
    paddingRight: 12
  },
  invoiceCard: {
    backgroundColor: Colors.light.white,
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.light.lightGray
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.lightGray
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.primary + '20',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerInfo: {
    flex: 1
  },
  customerName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 2
  },
  invoiceDate: {
    fontSize: 12,
    color: Colors.light.gray
  },
  amountContainer: {
    alignItems: 'flex-end',
    gap: 4
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.primary
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4
  },
  statusPaid: {
    backgroundColor: Colors.light.success + '20'
  },
  statusCredit: {
    backgroundColor: Colors.light.warning + '20'
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.light.text
  },
  cardBody: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  detailText: {
    fontSize: 12,
    color: Colors.light.gray
  },
  balanceRow: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.light.lightGray
  },
  balanceText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.warning
  },
  cardFooter: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.light.lightGray
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: Colors.light.white,
    borderWidth: 1,
    borderColor: Colors.light.lightGray
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.primary
  },
  dangerText: {
    color: Colors.light.danger
  },
  emptyListContainer: {
    flexGrow: 1
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 16
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.light.gray,
    textAlign: 'center'
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: Colors.light.primary,
    borderRadius: 8,
    marginTop: 8
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.white
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16
  },
  loadingText: {
    fontSize: 14,
    color: Colors.light.gray
  }
});