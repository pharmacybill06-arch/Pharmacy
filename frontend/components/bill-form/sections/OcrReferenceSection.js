import { Collapsible } from '@/components/collapsible.js';
import {
    ScrollView,
    StyleSheet,
    View,
    Text,
} from 'react-native';

export default function OcrReferenceSection({
  ocrText,
}) {
  return (
    <View style={styles.section}>
      <Collapsible title="Scanned Bill Text (Reference Only)">
        <View style={styles.ocrContainer}>
          <Text style={styles.ocrLabel}>
            Use this text to manually verify your entries above. This is the raw OCR output and may contain errors.
          </Text>
          <View style={styles.ocrText}>
            <ScrollView nestedScrollEnabled={true}>
              <Text style={styles.ocrContent}>{ocrText}</Text>
            </ScrollView>
          </View>
        </View>
      </Collapsible>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  ocrContainer: {
    paddingTop: 12,
    gap: 12,
  },
  ocrLabel: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
  },
  ocrText: {
    maxHeight: 200,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    padding: 12,
    overflow: 'hidden',
  },
  ocrContent: {
    fontSize: 12,
    color: '#555',
    lineHeight: 18,
  },
});
