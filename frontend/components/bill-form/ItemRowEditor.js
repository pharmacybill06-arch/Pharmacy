import {
    Pressable,
    ScrollView,
    StyleSheet,
    View,
    Text,
} from 'react-native';
import EditableField from './EditableField';


import { useState, useEffect } from 'react';

export default function ItemRowEditor({
  item,
  onUpdate,
  onRemove,
}) {
  // Maintain local string state for all editable fields
  const [fields, setFields] = useState({
    sn: item.sn?.toString() || '',
    name: item.name || '',
    manufacturer: item.manufacturer || '',
    batchNumber: item.batchNumber || '',
    expiryDate: item.expiryDate || '',
    hsnCode: item.hsnCode || '',
    quantity: item.quantity?.toString() || '',
    freeQuantity: item.freeQuantity?.toString() || '',
    unit: item.unit || '',
    mrp: item.mrp?.toString() || '',
    rate: item.rate?.toString() || '',
    discount: item.discount?.toString() || '',
    sgstPercent: item.sgstPercent?.toString() || '',
    cgstPercent: item.cgstPercent?.toString() || '',
    gstPercent: item.gstPercent?.toString() || '',
  });

  // Sync local state with item prop changes
  useEffect(() => {
    setFields({
      sn: item.sn?.toString() || '',
      name: item.name || '',
      manufacturer: item.manufacturer || '',
      batchNumber: item.batchNumber || '',
      expiryDate: item.expiryDate || '',
      hsnCode: item.hsnCode || '',
      quantity: item.quantity?.toString() || '',
      freeQuantity: item.freeQuantity?.toString() || '',
      unit: item.unit || '',
      mrp: item.mrp?.toString() || '',
      rate: item.rate?.toString() || '',
      discount: item.discount?.toString() || '',
      sgstPercent: item.sgstPercent?.toString() || '',
      cgstPercent: item.cgstPercent?.toString() || '',
      gstPercent: item.gstPercent?.toString() || '',
    });
  }, [item]);

  const handleChange = (field, value) => {
    setFields((prev) => {
      const updated = { ...prev, [field]: value };
      // Prepare object for parent update (convert to number where needed)
      const updatedForParent = {
        ...item,
        ...updated,
        sn: updated.sn === '' ? undefined : parseInt(updated.sn),
        quantity: updated.quantity === '' ? 0 : parseFloat(updated.quantity),
        freeQuantity: updated.freeQuantity === '' ? 0 : parseFloat(updated.freeQuantity),
        mrp: updated.mrp === '' ? 0 : parseFloat(updated.mrp),
        rate: updated.rate === '' ? 0 : parseFloat(updated.rate),
        discount: updated.discount === '' ? 0 : parseFloat(updated.discount),
        sgstPercent: updated.sgstPercent === '' ? 0 : parseFloat(updated.sgstPercent),
        cgstPercent: updated.cgstPercent === '' ? 0 : parseFloat(updated.cgstPercent),
        gstPercent: updated.gstPercent === '' ? 0 : parseFloat(updated.gstPercent),
      };
      // Calculate itemTotal if relevant field changes
      if (["quantity","rate","discount"].includes(field)) {
        const qty = parseFloat(updated.quantity) || 0;
        const rate = parseFloat(updated.rate) || 0;
        const discount = parseFloat(updated.discount) || 0;
        const calculatedTotal = qty * rate - discount;
        updatedForParent.itemTotal = Math.round(calculatedTotal * 100) / 100;
      }
      onUpdate(updatedForParent);
      return updated;
    });
  };

  const calculatePreviewTotal = () => {
    // Always calculate as qty * rate - discount (no GST)
    const subtotal = item.quantity * item.rate;
    const afterDiscount = subtotal - (item.discount || 0);
    return Math.round(afterDiscount * 100) / 100;
  };

  return (
    <View style={styles.expandedContent}>
      {item.needsReview && (
        <View style={styles.reviewBadgeContainer}>
          <Text style={styles.reviewBadgeIcon}>⚠️</Text>
          <View style={styles.reviewBadgeContent}>
            <Text style={styles.reviewBadgeTitle}>Needs Review</Text>
            {item.reviewReason && item.reviewReason.length > 0 && (
              <Text style={styles.reviewBadgeReason}>
                {item.reviewReason[0]}
              </Text>
            )}
          </View>
        </View>
      )}
      
      <ScrollView
        style={styles.scrollContent}
        scrollEnabled={false}
        nestedScrollEnabled={true}
      >
        <View style={styles.threeColumnRow}>
          <View style={[styles.column, {flex: 0.5}]}>
            <EditableField
              label="SN"
              value={fields.sn}
              onChangeText={(value) => handleChange('sn', value)}
              placeholder="1, 2, 3..."
              keyboardType="number-pad"
              small
            />
          </View>
          <View style={[styles.column, {flex: 2}]}>
            <EditableField
              label="Item Name & Packing *"
              value={fields.name}
              onChangeText={(value) => handleChange('name', value)}
              placeholder="Medicine/product name"
              small
            />
          </View>
          <View style={[styles.column, {flex: 1}]}>
            <EditableField
              label="MFR"
              value={fields.manufacturer}
              onChangeText={(value) => handleChange('manufacturer', value)}
              placeholder="Manufacturer"
              small
            />
          </View>
        </View>

        <View style={styles.threeColumnRow}>
          <View style={styles.column}>
            <EditableField
              label="BATCH"
              value={fields.batchNumber}
              onChangeText={(value) => handleChange('batchNumber', value)}
              placeholder="Batch"
              small
            />
          </View>
          <View style={styles.column}>
            <EditableField
              label="EXP"
              value={fields.expiryDate}
              onChangeText={(value) => handleChange('expiryDate', value)}
              placeholder="MM/YY"
              small
            />
          </View>
          <View style={styles.column}>
            <EditableField
              label="HSN"
              value={fields.hsnCode}
              onChangeText={(value) => handleChange('hsnCode', value)}
              placeholder="HSN Code"
              small
            />
          </View>
        </View>

        <View style={styles.threeColumnRow}>
          <View style={[styles.column, {flex: 1}]}>
            <EditableField
              label="QTY *"
              value={fields.quantity}
              onChangeText={(value) => handleChange('quantity', value)}
              placeholder="0"
              keyboardType="number-pad"
              small
            />
          </View>
          <View style={[styles.column, {flex: 1}]}>
            <EditableField
              label="FREE"
              value={fields.freeQuantity}
              onChangeText={(value) => handleChange('freeQuantity', value)}
              placeholder="0"
              keyboardType="number-pad"
              small
            />
          </View>
          <View style={[styles.column, {flex: 1}]}>
            <EditableField
              label="Unit"
              value={fields.unit}
              onChangeText={(value) => handleChange('unit', value)}
              placeholder="tabs"
              small
            />
          </View>
        </View>

        <View style={styles.threeColumnRow}>
          <View style={styles.column}>
            <EditableField
              label="MRP"
              value={fields.mrp}
              onChangeText={(value) => handleChange('mrp', value)}
              placeholder="MRP"
              keyboardType="decimal-pad"
              small
            />
          </View>
          <View style={styles.column}>
            <EditableField
              label="RATE *"
              value={fields.rate}
              onChangeText={(value) => handleChange('rate', value)}
              placeholder="0.00"
              keyboardType="decimal-pad"
              small
            />
          </View>
          <View style={styles.column}>
            <EditableField
              label="DIS"
              value={fields.discount}
              onChangeText={(value) => handleChange('discount', value)}
              placeholder="0.00"
              keyboardType="decimal-pad"
              small
            />
          </View>
        </View>

        <View style={styles.threeColumnRow}>
          <View style={styles.column}>
            <EditableField
              label="SGST %"
              value={fields.sgstPercent}
              onChangeText={(value) => handleChange('sgstPercent', value)}
              placeholder="5"
              keyboardType="decimal-pad"
              small
            />
          </View>
          <View style={styles.column}>
            <EditableField
              label="CGST %"
              value={fields.cgstPercent}
              onChangeText={(value) => handleChange('cgstPercent', value)}
              placeholder="5"
              keyboardType="decimal-pad"
              small
            />
          </View>
          <View style={styles.column}>
            <EditableField
              label="Total GST % *"
              value={fields.gstPercent}
              onChangeText={(value) => handleChange('gstPercent', value)}
              placeholder="10"
              keyboardType="decimal-pad"
              small
            />
          </View>
        </View>

        <View style={styles.calculationPreview}>
          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>
              Qty × Rate:
            </Text>
            <Text style={styles.previewValue}>
              ₹{(parseFloat(fields.quantity) * parseFloat(fields.rate) || 0).toFixed(2)}
            </Text>
          </View>
          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>Discount:</Text>
            <Text style={styles.previewValue}>
              ₹{(parseFloat(fields.discount) || 0).toFixed(2)}
            </Text>
          </View>
          <View style={[styles.previewRow, styles.previewTotal]}>
            <Text style={styles.previewTotalLabel}>
              Item Total (Qty × Rate - Dis):
            </Text>
            <Text style={styles.previewTotalValue}>
              ₹{(() => {
                const subtotal = (parseFloat(fields.quantity) || 0) * (parseFloat(fields.rate) || 0);
                const afterDiscount = subtotal - (parseFloat(fields.discount) || 0);
                return Math.round(afterDiscount * 100) / 100;
              })().toFixed(2)}
            </Text>
          </View>
        </View>

        <Pressable style={styles.removeButton} onPress={onRemove}>
          <Text style={styles.removeButtonText}>
            Remove Item
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  expandedContent: {
    backgroundColor: '#f9f9f9',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  scrollContent: {
    gap: 12,
  },
  threeColumnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  column: {
    flex: 1,
  },
  singleColumnRow: {
    marginTop: 4,
  },
  calculationPreview: {
    backgroundColor: '#fff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    gap: 6,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 12,
    color: '#666',
  },
  previewValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  previewTotal: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingVertical: 6,
    marginVertical: 4,
  },
  previewTotalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  previewTotalValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#007AFF',
  },
  removeButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginVertical: 8,
    borderRadius: 6,
    backgroundColor: '#fff3f3',
    borderWidth: 1,
    borderColor: '#ff6b6b',
    alignItems: 'center',
  },
  removeButtonText: {
    color: '#ff6b6b',
    fontWeight: '600',
    fontSize: 13,
  },
  reviewBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff8e1',
    borderWidth: 1,
    borderColor: '#ffc107',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  reviewBadgeIcon: {
    fontSize: 20,
  },
  reviewBadgeContent: {
    flex: 1,
    gap: 4,
  },
  reviewBadgeTitle: {
    fontWeight: '600',
    fontSize: 13,
    color: '#f57f17',
  },
  reviewBadgeReason: {
    fontSize: 12,
    color: '#e65100',
    marginTop: 2,
  },
});
