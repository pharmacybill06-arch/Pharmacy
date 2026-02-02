import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, View } from 'react-native';


export function Collapsible({ children, title }) {
  const [isOpen, setOpen] = useState(false);

  const toggleCollapsible = useCallback(() => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setOpen(!isOpen);
  }, [isOpen]);

  return (
    <View>
      <Pressable
        style={styles.heading}
        onPress={toggleCollapsible}>
        <Ionicons
          name={isOpen ? 'chevron-down' : 'chevron-forward-outline'}
          size={18}
          color="#11181C"
          style={{ marginRight: 8 }}
        />
        <Text style={styles.title}>{title}</Text>
      </Pressable>
      {isOpen && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
  },
  content: {
    marginLeft: 24,
    marginBottom: 12,
  },
});
