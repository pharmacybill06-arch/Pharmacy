import { Collapsible } from '@/components/collapsible.js';
import {
    StyleSheet,
    View
} from 'react-native';
import EditableField from '../EditableField';

export default function PharmacyDetailsSection({
  data,
  onUpdate,
}) {
  const handleChange = (field, value) => {
    onUpdate({ [field]: value });
  };

  return (
    <View style={styles.section}>
      <Collapsible title="Pharmacy / Seller Details">
        <View style={styles.fieldGroup}>
          <EditableField
            label="Pharmacy Name *"
            value={data.pharmacyName}
            onChangeText={(value) => handleChange('pharmacyName', value)}
            placeholder="Enter pharmacy name"
          />

          <EditableField
            label="Shop Address *"
            value={data.shopAddress}
            onChangeText={(value) => handleChange('shopAddress', value)}
            placeholder="Enter full address"
            multiline={true}
            numberOfLines={3}
          />

          <EditableField
            label="Phone Number(s)"
            value={data.phoneNumbers}
            onChangeText={(value) => handleChange('phoneNumbers', value)}
            placeholder="e.g., +91-9876543210, +91-9123456789"
          />

          <EditableField
            label="GSTIN"
            value={data.gstin}
            onChangeText={(value) => handleChange('gstin', value)}
            placeholder="18AABCT1234H1Z0"
          />

          <EditableField
            label="Drug License Number (DL No.)"
            value={data.dlNumber}
            onChangeText={(value) => handleChange('dlNumber', value)}
            placeholder="DL-XXX-YYYY-12345"
          />
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
});
