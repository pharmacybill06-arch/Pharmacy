import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import { useEffect } from 'react';
import 'react-native-reanimated';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  useEffect(() => {
    // Prevent double renders in Strict Mode
    return () => {};
  }, []);

  return (
    <AuthProvider>
      <Stack
        screenOptions={{
          animationEnabled: true,
        }}>
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
    </AuthProvider>
  );
}
