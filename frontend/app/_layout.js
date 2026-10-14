import '../global-polyfills'; // Must be first - sets up global Buffer and process
import { Stack, useRouter } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { ProductsProvider } from '../contexts/ProductsContext';
import { InvoiceProvider } from '../contexts/InvoiceContext';
import { PaymentProvider } from '../contexts/PaymentContext';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import 'react-native-reanimated';

/**
 * Navigate to Refill Reminders when a low-stock push notification is tapped
 * (whether the app was foregrounded, backgrounded, or launched from a kill state).
 */
function NotificationTapHandler() {
  const router = useRouter();

  useEffect(() => {
    // Push notifications only exist on a device. On web these APIs throw, and the
    // un-caught rejection surfaced as a red error overlay on every load.
    if (Platform.OS === 'web') return undefined;

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response?.notification.request.content.data?.type === 'low_stock_reminder') {
          router.push('/patients');
        }
      })
      .catch((err) => console.warn('[Notifications] Could not read launch notification:', err?.message));

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.notification.request.content.data?.type === 'low_stock_reminder') {
        router.push('/patients');
      }
    });
    return () => subscription.remove();
  }, []);

  return null;
}

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
    <QueryClientProvider client={queryClient}>
    <ShareIntentProvider options={{ debug: __DEV__, resetOnBackground: true }}>
      <AuthProvider>
        <ToastProvider>
        <ProductsProvider>
          <InvoiceProvider>
            <PaymentProvider>
              <ShareIntentHandler />
              <NotificationTapHandler />
              <Stack
                screenOptions={{
                  animationEnabled: true,
                }}>
                <Stack.Screen name="auth" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="products" options={{ headerShown: false, title: 'Products' }} />
                <Stack.Screen name="distributors" options={{ headerShown: false }} />
                <Stack.Screen name="bills" options={{ headerShown: false, title: 'All Bills' }} />
                <Stack.Screen name="payments" options={{ headerShown: false, title: 'Payments' }} />
                <Stack.Screen name="ledger" options={{ headerShown: false, title: 'Distributor Payments' }} />
                <Stack.Screen name="sales" options={{ headerShown: false, title: 'Daily Sales' }} />
                <Stack.Screen name="exports" options={{ headerShown: false, title: 'Export Data' }} />
                <Stack.Screen name="patients" options={{ headerShown: false }} />
                <Stack.Screen name="invoices" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
                <Stack.Screen name="profile" options={{ headerShown: false }} />
              </Stack>
            </PaymentProvider>
          </InvoiceProvider>
        </ProductsProvider>
        </ToastProvider>
      </AuthProvider>
    </ShareIntentProvider>
    </QueryClientProvider>
  );
}
