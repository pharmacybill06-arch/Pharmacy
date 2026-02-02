import { StatusBar } from 'expo-status-bar';
import { Platform, View, Text } from 'react-native';


export default function ModalScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold' }}>Modal</Text>
      <Text>This modal demonstrates a full screen modal presentation.</Text>

      <StatusBar barStyle={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </View>
  );
}
