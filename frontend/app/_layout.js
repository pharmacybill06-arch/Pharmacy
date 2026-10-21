import '../global-polyfills'; // Must be first - sets up global Buffer and process
import { Stack, useRouter, useRootNavigationState } from 'expo-router';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { ToastProvider, useToast } from '@/contexts/ToastContext';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { ProductsProvider } from '../contexts/ProductsContext';
import { InvoiceProvider } from '../contexts/InvoiceContext';
import { PaymentProvider } from '../contexts/PaymentContext';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { useEffect, useSyncExternalStore } from 'react';
import { setPendingShare, getPendingShare, clearPendingShare, subscribePendingShare } from '@/lib/pendingShare';
import { Platform, Modal } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SharedReceiptFlow from '@/components/screens/SharedReceiptFlow';
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
 * Content shared into the app: a UPI receipt screenshot (PhonePe / Google Pay / Paytm)
 * or text.
 *
 * Sharing can re-create the React root (the development client does this when another
 * app hands it an intent), and the router then stays bound to the torn-down root, so
 * navigating from a share fails with "navigate before mounting the Root Layout".
 * So: capture the share into lib/pendingShare (module state survives the remount),
 * and show screenshots in a full-screen modal flow that needs no navigation.
 */
function ShareIntentBridge() {
  const router = useRouter();
  const toast = useToast();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const { user, isLoading: authLoading } = useAuth();
  const navigationReady = !!useRootNavigationState()?.key;
  const pending = useSyncExternalStore(subscribePendingShare, getPendingShare);

  useEffect(() => {
    if (!hasShareIntent) return;
    const image = shareIntent?.files?.find((f) => f?.mimeType?.startsWith('image/'));
    if (image?.path) {
      const uri = /^(file|content):\/\//.test(image.path) ? image.path : `file://${image.path}`;
      console.log('[ShareIntent] Captured shared image:', image.mimeType);
      setPendingShare({ kind: 'image', uri, mimeType: image.mimeType || 'image/jpeg' });
    } else if (shareIntent?.text) {
      console.log('[ShareIntent] Captured shared text');
      setPendingShare({ kind: 'text', text: shareIntent.text });
    }
    resetShareIntent();
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  // Shared text still opens the Payments screen (it reads the text from params)
  useEffect(() => {
    if (pending?.kind !== 'text' || !navigationReady || authLoading || !user?.id) return undefined;
    const timer = setTimeout(() => {
      try {
        router.push({ pathname: '/payments', params: { sharedText: pending.text } });
        clearPendingShare();
      } catch (err) {
        console.log('[ShareIntent] Could not open payments yet:', err?.message);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [pending, navigationReady, authLoading, user?.id, router]);

  const showReceipt = pending?.kind === 'image' && !authLoading && !!user?.id;

  return (
    <Modal
      visible={showReceipt}
      animationType="slide"
      onRequestClose={clearPendingShare}
      statusBarTranslucent
    >
      <SafeAreaProvider>
        {showReceipt && (
          <SharedReceiptFlow
            key={pending.receivedAt}
            userId={user.id}
            imageUri={pending.uri}
            mimeType={pending.mimeType}
            onClose={clearPendingShare}
            onSaved={({ distributor, duplicateWarning }) => {
              clearPendingShare();
              if (duplicateWarning) {
                toast.warning(`Saved for ${distributor.name} — a payment with the same amount and date already exists.`, 'Possible duplicate');
              } else {
                toast.success(`Payment recorded for ${distributor.name}`, 'Saved');
              }
            }}
          />
        )}
      </SafeAreaProvider>
    </Modal>
  );
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
              <ShareIntentBridge />
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
