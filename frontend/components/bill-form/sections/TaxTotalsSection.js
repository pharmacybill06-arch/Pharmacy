import { Collapsible } from '@/components/collapsible.js';
import {
    StyleSheet,
    View,
    Text,
} from 'react-native';
import EditableField from '../EditableField';

export default function TaxTotalsSection({
  data,
  onUpdateRoundOff,
}) {
  return (
    <View style={styles.section}>
      <Collapsible title="Tax & Totals (Auto-calculated)">
        <View style={styles.totalsContainer}>
          <View style={styles.totalRow}>
            <Text style={styles.label}>Subtotal:</Text>
            <Text style={styles.value}>
              ₹{data.subtotal.toFixed(2)}
            </Text>
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.label}>Discount (%):</Text>
            <Text style={styles.value}>
              {data.discount ? `${data.discount}%` : '0%'}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.label}>Discount Amount:</Text>
            <Text style={styles.value}>
              ₹{data.discountAmount ? data.discountAmount.toFixed(2) : '0.00'}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.label}>CGST (50%):</Text>
            <Text style={styles.value}>
              ₹{data.cgst.toFixed(2)}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.label}>SGST (50%):</Text>
            <Text style={styles.value}>
              ₹{data.sgst.toFixed(2)}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.label}>Total GST:</Text>
            <Text style={styles.value}>
              ₹{data.totalGst.toFixed(2)}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.roundOffContainer}>
            <EditableField
              label="Round-off (optional)"
              value={data.roundOffStr ?? data.roundOff?.toString() ?? ''}
              onChangeText={(value) => {
                if (typeof onUpdateRoundOff === 'function') {
                  onUpdateRoundOff(value);
                }
              }}
              placeholder="0.00"
              keyboardType="decimal-pad"
              small
            />
            <Text style={styles.roundOffHint}>
              Add or subtract to round grand total
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>
              Grand Total:
            </Text>
            <Text style={styles.grandTotalValue}>
              ₹{data.grandTotal.toFixed(2)}
            </Text>
          </View>

          <Text style={styles.infoText}>
            All totals are automatically calculated based on your items. Edit items above to update these values.
          </Text>
        </View>
      </Collapsible>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  totalsContainer: {
    paddingTop: 12,
    gap: 4,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  label: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 8,
  },
  roundOffContainer: {
    gap: 6,
    marginVertical: 4,
  },
  roundOffHint: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 2,
    borderTopColor: '#007AFF',
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#007AFF',
  },
  infoText: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    fontStyle: 'italic',
  },
});
