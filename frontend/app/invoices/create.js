import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { useInvoice } from '../../contexts/InvoiceContext';
import { useAuth } from '../../contexts/AuthContext';
import ProductSearchDropdown from '../../components/invoice/ProductSearchDropdown';
import InvoiceItemsTable from '../../components/invoice/InvoiceItemsTable';

/**
 * CreateInvoiceScreen
 * Main screen for creating customer invoices with stock management
 */
export default function CreateInvoiceScreen() {
  const router = useRouter();
  const { userId, apiUrl } = useAuth();
  const {
    currentInvoice,
    updateCustomer,
    updatePayment,
    addItem,
    removeItem,
    updateItem,
    updateTotals,
    createInvoice,
    resetInvoice,
    loading,
    error: invoiceError
  } = useInvoice();

  const [gstPercent, setGstPercent] = useState('5');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [roundOff, setRoundOff] = useState('0');
  const [saving, setSaving] = useState(false);

  // Handle product selection from dropdown
  const handleProductSelect = useCallback((product) => {
    // Check if product already exists in items
    const existingItem = currentInvoice.items.find(
      (item) => item.productId === product.productId
    );

    if (existingItem) {
      Alert.alert('Product Already Added', `${product.name} is already in the invoice`);
      return;
    }

    // Add new item
    const newItem = {
      productId: product.productId,
      name: product.name,
      manufacturer: product.manufacturer,
      hsnCode: product.hsnCode,
      unit: product.unit,
      mrp: product.mrp,
      rate: product.sellingRate || 0,
      quantity: 1,
      gstPercent: parseFloat(gstPercent),
      discount: 0,
      itemTotal: (product.sellingRate || 0) * 1,
      stock: product.stock,
      minStock: product.minStock
    };

    addItem(newItem);
    recalculateTotals();
  }, [currentInvoice.items, addItem, gstPercent]);

  const handleAddItemManually = () => {
    Alert.prompt(
      'Add Item Manually',
      'Enter product name:',
      [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Search',
          onPress: (text) => {
            console.log('Search for:', text);
          }
        }
      ]
    );
  };

  const recalculateTotals = useCallback(() => {
    const subtotal = currentInvoice.items.reduce(
      (sum, item) => sum + (item.itemTotal || 0),
      0
    );

    const taxAmount = (subtotal * parseFloat(gstPercent)) / 100;
    const cgst = taxAmount / 2;
    const sgst = taxAmount / 2;
    const discount = parseFloat(discountAmount) || 0;
    const roundOffAmount = parseFloat(roundOff) || 0;

    updateTotals(subtotal, cgst, sgst, discount, roundOffAmount);
  }, [currentInvoice.items, gstPercent, discountAmount, roundOff, updateTotals]);

  const handleSaveInvoice = async () => {
    if (!currentInvoice.customerName.trim()) {
      Alert.alert('Invalid Input', 'Please enter customer name');
      return;
    }

    if (currentInvoice.items.length === 0) {
      Alert.alert('Invalid Input', 'Please add at least one item');
      return;
    }

    const insufficientStock = currentInvoice.items.find(
      (item) => item.quantity > item.stock
    );

    if (insufficientStock) {
      Alert.alert(
        'Insufficient Stock',
        `${insufficientStock.name}: Available ${insufficientStock.stock}, Requested ${insufficientStock.quantity}`
      );
      return;
    }

    setSaving(true);
    try {
      const result = await createInvoice(userId, apiUrl);
      
      Alert.alert('Success', 'Invoice created successfully', [
        {
          text: 'View Invoice',
          onPress: () => {
            router.push({
              pathname: '/invoices/view',
              params: { invoiceId: result.invoice.id }
            });
          }
        },
        {
          text: 'Create Another',
          onPress: () => {
            resetInvoice();
            setGstPercent('5');
            setDiscountAmount('0');
            setRoundOff('0');
          }
        },
        {
          text: 'Back to Invoices',
          onPress: () => {
            router.push('/invoices/list');
          }
        }
      ]);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to create invoice');
    } finally {
      setSaving(false);
    }
  };

  const excludeProductIds = currentInvoice.items.map((item) => item.productId);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen
        options={{
          title: 'Create Invoice',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={24} color={Colors.light.primary} />
            </TouchableOpacity>
          )
        }}
      />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Customer Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Details</Text>
          <View style={styles.card}>
            <TextInput
              style={styles.input}
              placeholder="Customer Name *"
              value={currentInvoice.customerName}
              onChangeText={(text) =>
                updateCustomer(text, currentInvoice.customerPhone, currentInvoice.customerAddress)
              }
              placeholderTextColor={Colors.light.gray}
            />

            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              value={currentInvoice.customerPhone}
              onChangeText={(text) =>
                updateCustomer(currentInvoice.customerName, text, currentInvoice.customerAddress)
              }
              keyboardType="phone-pad"
              placeholderTextColor={Colors.light.gray}
            />

            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Address (optional)"
              value={currentInvoice.customerAddress}
              onChangeText={(text) =>
                updateCustomer(currentInvoice.customerName, currentInvoice.customerPhone, text)
              }
              multiline
              numberOfLines={2}
              placeholderTextColor={Colors.light.gray}
            />
          </View>
        </View>

        {/* Invoice Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invoice Details</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Invoice Date</Text>
                <TextInput
                  style={styles.input}
                  value={currentInvoice.invoiceDate}
                  editable={false}
                  placeholderTextColor={Colors.light.gray}
                />
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Payment Type</Text>
                <View style={styles.paymentTypeContainer}>
                  {['cash', 'credit'].map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.paymentTypeButton,
                        currentInvoice.paymentType === type && styles.paymentTypeActive
                      ]}
                      onPress={() => updatePayment(type, currentInvoice.grandTotal)}
                    >
                      <Text
                        style={[
                          styles.paymentTypeText,
                          currentInvoice.paymentType === type && styles.paymentTypeTextActive
                        ]}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Products Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Products</Text>
          <View style={styles.card}>
            <View style={styles.searchSection}>
              <Text style={styles.label}>Select Product</Text>
              <ProductSearchDropdown
                userId={userId}
                apiUrl={apiUrl}
                onProductSelect={handleProductSelect}
                placeholder="Search by name or manufacturer..."
                excludeProductIds={excludeProductIds}
              />
            </View>
          </View>

          <InvoiceItemsTable
            items={currentInvoice.items}
            onAddItem={handleAddItemManually}
            onRemoveItem={removeItem}
            onUpdateItem={updateItem}
            onCalculateTotals={recalculateTotals}
          />
        </View>

        {/* Calculations Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Calculations</Text>
          <View style={styles.card}>
            <View style={styles.calculationRow}>
              <Text style={styles.label}>Subtotal</Text>
              <Text style={styles.value}>₹{currentInvoice.subtotal?.toFixed(2) || '0.00'}</Text>
            </View>

            <View style={styles.calculationRow}>
              <View>
                <Text style={styles.label}>GST Percent</Text>
                <TextInput
                  style={[styles.input, styles.percentInput]}
                  keyboardType="decimal-pad"
                  value={gstPercent}
                  onChangeText={(text) => {
                    setGstPercent(text);
                    recalculateTotals();
                  }}
                  placeholderTextColor={Colors.light.gray}
                />
              </View>
              <View style={styles.taxBreakdown}>
                <View style={styles.taxItem}>
                  <Text style={styles.taxLabel}>CGST</Text>
                  <Text style={styles.taxValue}>₹{(currentInvoice.cgst || 0).toFixed(2)}</Text>
                </View>
                <View style={styles.taxItem}>
                  <Text style={styles.taxLabel}>SGST</Text>
                  <Text style={styles.taxValue}>₹{(currentInvoice.sgst || 0).toFixed(2)}</Text>
                </View>
                <View style={styles.taxItem}>
                  <Text style={[styles.taxLabel, styles.bold]}>Total GST</Text>
                  <Text style={[styles.taxValue, styles.bold]}>
                    ₹{(currentInvoice.totalGst || 0).toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.calculationRow}>
              <Text style={styles.label}>Discount</Text>
              <View style={styles.discountInput}>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={discountAmount}
                  onChangeText={(text) => {
                    setDiscountAmount(text);
                    recalculateTotals();
                  }}
                  placeholderTextColor={Colors.light.gray}
                />
                <Text style={styles.value}>₹{discountAmount || '0'}</Text>
              </View>
            </View>

            <View style={styles.calculationRow}>
              <Text style={styles.label}>Round Off</Text>
              <View style={styles.discountInput}>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={roundOff}
                  onChangeText={(text) => {
                    setRoundOff(text);
                    recalculateTotals();
                  }}
                  placeholderTextColor={Colors.light.gray}
                />
                <Text style={styles.value}>₹{roundOff || '0'}</Text>
              </View>
            </View>

            <View style={[styles.calculationRow, styles.grandTotalRow]}>
              <Text style={[styles.label, styles.bold, styles.largeText]}>Grand Total</Text>
              <Text style={[styles.value, styles.bold, styles.largeText, styles.grandTotalValue]}>
                ₹{currentInvoice.grandTotal?.toFixed(2) || '0.00'}
              </Text>
            </View>
          </View>
        </View>

        {/* Remarks */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Info</Text>
          <View style={styles.card}>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Remarks (optional)"
              value={currentInvoice.remarks}
              onChangeText={(text) => {
                // Update remarks
              }}
              multiline
              numberOfLines={3}
              placeholderTextColor={Colors.light.gray}
            />
          </View>
        </View>

        {/* Error Display */}
        {invoiceError && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color={Colors.light.danger} />
            <Text style={styles.errorText}>{invoiceError}</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => {
              resetInvoice();
              router.back();
            }}
            disabled={saving}
          >
            <Ionicons name="close" size={18} color={Colors.light.primary} />
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.primaryButton, saving && styles.disabledButton]}
            onPress={handleSaveInvoice}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={Colors.light.white} />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color={Colors.light.white} />
                <Text style={styles.primaryButtonText}>Save Invoice</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.spacer} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.lightGray
  },
  scrollView: {
    flex: 1,
    padding: 16
  },
  section: {
    marginBottom: 20
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 12
  },
  card: {
    backgroundColor: Colors.light.white,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.light.lightGray
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.light.gray,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.light.text,
    marginBottom: 12
  },
  multilineInput: {
    textAlignVertical: 'top',
    minHeight: 60
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 6
  },
  row: {
    flexDirection: 'row',
    gap: 12
  },
  halfInput: {
    flex: 1
  },
  paymentTypeContainer: {
    flexDirection: 'row',
    gap: 8
  },
  paymentTypeButton: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.light.gray,
    borderRadius: 6,
    alignItems: 'center'
  },
  paymentTypeActive: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary
  },
  paymentTypeText: {
    fontSize: 12,
    color: Colors.light.text,
    fontWeight: '500'
  },
  paymentTypeTextActive: {
    color: Colors.light.white
  },
  searchSection: {
    marginBottom: 12
  },
  calculationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.lightGray
  },
  grandTotalRow: {
    backgroundColor: Colors.light.lightGray,
    padding: 12,
    marginHorizontal: -16,
    marginBottom: 0,
    marginLeft: -16,
    marginRight: -16,
    borderBottomWidth: 0
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.primary
  },
  grandTotalValue: {
    fontSize: 18,
    color: Colors.light.success
  },
  percentInput: {
    width: 60,
    marginBottom: 0
  },
  taxBreakdown: {
    flex: 1,
    gap: 8
  },
  taxItem: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  taxLabel: {
    fontSize: 11,
    color: Colors.light.gray,
    fontWeight: '500'
  },
  taxValue: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.light.text
  },
  bold: {
    fontWeight: '700'
  },
  largeText: {
    fontSize: 16
  },
  discountInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  errorBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.light.danger + '10',
    borderWidth: 1,
    borderColor: Colors.light.danger,
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center'
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: Colors.light.danger,
    fontWeight: '500'
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1
  },
  primaryButton: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary
  },
  primaryButtonText: {
    color: Colors.light.white,
    fontSize: 14,
    fontWeight: '700'
  },
  secondaryButton: {
    backgroundColor: Colors.light.white,
    borderColor: Colors.light.primary
  },
  secondaryButtonText: {
    color: Colors.light.primary,
    fontSize: 14,
    fontWeight: '700'
  },
  disabledButton: {
    opacity: 0.6
  },
  spacer: {
    height: 20
  }
});