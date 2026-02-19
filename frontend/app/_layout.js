import '../global-polyfills'; // Must be first - sets up global Buffer and process
import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import { ProductsProvider } from '../contexts/ProductsContext';
import { InvoiceProvider } from '../contexts/InvoiceContext';
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
      <ProductsProvider>
        <InvoiceProvider>
          <Stack
            screenOptions={{
              animationEnabled: true,
            }}>
            <Stack.Screen name="auth" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="products" options={{ headerShown: false, title: 'Products' }} />
            <Stack.Screen name="distributors" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            <Stack.Screen name="profile" options={{ headerShown: false }} />
          </Stack>
        </InvoiceProvider>
      </ProductsProvider>
    </AuthProvider>
  );
}
