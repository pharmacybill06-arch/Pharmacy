import {
    StyleSheet,
    TextInput,
    View,
    Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function EditableField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  numberOfLines = 1,
  keyboardType = 'default',
  small = false,
  uncertain = false,  // flag: AI wasn't confident about this field
}) {
  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, small && styles.labelSmall]}>
          {label}
        </Text>
        {uncertain && (
          <Ionicons name="alert-circle" size={12} color="#D97706" style={styles.uncertainIcon} />
        )}
      </View>
      <TextInput
        style={[
          styles.input,
          multiline && styles.multilineInput,
          small && styles.inputSmall,
          uncertain && styles.inputUncertain,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#ccc"
        multiline={multiline}
        numberOfLines={numberOfLines}
        keyboardType={keyboardType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  labelSmall: {
    fontSize: 13,
    fontWeight: '500',
  },
  uncertainIcon: {
    marginTop: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  inputSmall: {
    paddingVertical: 8,
    fontSize: 13,
  },
  multilineInput: {
    textAlignVertical: 'top',
    minHeight: 80,
  },
  inputUncertain: {
    borderColor: '#D97706',
    borderWidth: 2,
    backgroundColor: '#FFFBEB',
  },
});
