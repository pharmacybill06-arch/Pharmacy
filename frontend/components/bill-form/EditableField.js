import {
    StyleSheet,
    TextInput,
    View,
    Text,
} from 'react-native';

export default function EditableField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  numberOfLines = 1,
  keyboardType = 'default',
  small = false,
}) {
  return (
    <View style={styles.container}>
      <Text style={[styles.label, small && styles.labelSmall]}>
        {label}
      </Text>
      <TextInput
        style={[
          styles.input,
          multiline && styles.multilineInput,
          small && styles.inputSmall,
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
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  labelSmall: {
    fontSize: 13,
    fontWeight: '500',
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
});
