import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ExpoRoot } from 'expo-router';
import { AppRegistry } from 'react-native';

SplashScreen.preventAutoHideAsync();

const ctx = require.context('./app');

export function App() {
  const [fontsLoaded, fontError] = useFonts({
    // SpaceMono font is optional - uncomment if you have the font file
    // SpaceMono: require('./assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Skip splash screen even if fonts aren't loaded
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return <ExpoRoot context={ctx} />;
}

export default App;

AppRegistry.registerComponent('main', () => App);
