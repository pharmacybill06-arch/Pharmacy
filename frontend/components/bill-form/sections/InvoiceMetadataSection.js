import { Collapsible } from '@/components/collapsible.js';
import {
    Pressable,
    StyleSheet,
    View,
    Text,
} from 'react-native';
import EditableField from '../EditableField';

export default function InvoiceMetadataSection({
  data,
  onUpdate,
}) {
  const handleChange = (field, value) => {
    onUpdate({ [field]: value });
  };

  const togglePaymentType = () => {
    const newType = data.paymentType === 'cash' ? 'credit' : 'cash';
    handleChange('paymentType', newType);
  };

  return (
    <View style={styles.section}>
      <Collapsible title="Invoice Metadata">
        <View style={styles.fieldGroup}>
          <EditableField
            label="Invoice Number *"
            value={data.invoiceNumber}
            onChangeText={(value) => handleChange('invoiceNumber', value)}
            placeholder="INV-001"
          />

          <EditableField
            label="Invoice Date *"
            value={data.invoiceDate}
            onChangeText={(value) => handleChange('invoiceDate', value)}
            placeholder="DD/MM/YYYY"
          />

          <EditableField
            label="Due Date"
            value={data.dueDate || ''}
            onChangeText={(value) => handleChange('dueDate', value)}
            placeholder="DD/MM/YYYY (optional)"
          />

          <View style={styles.paymentTypeContainer}>
            <Text style={styles.label}>Payment Type</Text>
            <View style={styles.toggleGroup}>
              <Pressable
                style={[
                  styles.toggleButton,
                  data.paymentType === 'cash' && styles.toggleButtonActive,
                ]}
                onPress={togglePaymentType}
              >
                <Text
                  style={[
                    styles.toggleText,
                    data.paymentType === 'cash' && styles.toggleTextActive,
                  ]}
                >
                  Cash
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.toggleButton,
                  data.paymentType === 'credit' && styles.toggleButtonActive,
                ]}
                onPress={togglePaymentType}
              >
                <Text
                  style={[
                    styles.toggleText,
                    data.paymentType === 'credit' && styles.toggleTextActive,
                  ]}
                >
                  Credit
                </Text>
              </Pressable>
            </View>
          </View>

          {data.paymentType === 'credit' && (
            <EditableField
              label="Current Balance"
              value={data.currentBalanceStr ?? data.currentBalance?.toString() ?? ''}
              onChangeText={(value) => handleChange('currentBalance', value)}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
          )}
        </View>
      </Collapsible>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  fieldGroup: {
    gap: 16,
    paddingTop: 12,
  },
  paymentTypeContainer: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  toggleGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  toggleText: {
    fontSize: 14,
    color: '#666',
  },
  toggleTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
});
