import '../global-polyfills'; // Must be first - sets up global Buffer and process
import { Stack, useRouter } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import { ProductsProvider } from '../contexts/ProductsContext';
import { InvoiceProvider } from '../contexts/InvoiceContext';
import { PaymentProvider } from '../contexts/PaymentContext';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { useEffect } from 'react';
import 'react-native-reanimated';

export const unstable_settings = {
  anchor: '(tabs)',
};

/**
 * Handle incoming share intents from UPI apps (Google Pay, PhonePe, etc.)
 * Uses expo-share-intent to receive shared text/images from Android share sheet.
 */
function ShareIntentHandler() {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (hasShareIntent && shareIntent?.text) {
      console.log('[ShareIntent] Received shared text:', shareIntent.text.substring(0, 100));
      router.push({
        pathname: '/payments',
        params: { sharedText: shareIntent.text },
      });
      // Reset so it doesn't re-trigger
      resetShareIntent();
    }
  }, [hasShareIntent, shareIntent]);

  return null;
}

export default function RootLayout() {
  useEffect(() => {
    // Prevent double renders in Strict Mode
    return () => {};
  }, []);

  return (
    <ShareIntentProvider options={{ debug: __DEV__, resetOnBackground: true }}>
      <AuthProvider>
        <ProductsProvider>
          <InvoiceProvider>
            <PaymentProvider>
              <ShareIntentHandler />
              <Stack
                screenOptions={{
                  animationEnabled: true,
                }}>
                <Stack.Screen name="auth" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="products" options={{ headerShown: false, title: 'Products' }} />
                <Stack.Screen name="distributors" options={{ headerShown: false }} />
                <Stack.Screen name="payments" options={{ headerShown: false, title: 'Payments' }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
                <Stack.Screen name="profile" options={{ headerShown: false }} />
              </Stack>
            </PaymentProvider>
          </InvoiceProvider>
        </ProductsProvider>
      </AuthProvider>
    </ShareIntentProvider>
  );
}
