import { AppState, Platform } from 'react-native';
import { QueryClient, focusManager } from '@tanstack/react-query';

/**
 * Shared data cache — the "show what you have, refresh quietly" behaviour that makes
 * apps like Swiggy and Zomato feel instant.
 *
 * Before this, every screen fetched on focus and replaced its whole content with a
 * spinner while it did, even when the data was already in memory from ten seconds ago.
 * With a cache in front of the API, a screen you have seen before renders immediately
 * from cache and the refetch happens in the background; the spinner is only for a true
 * first load.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data younger than this is served from cache without refetching at all.
      staleTime: 30 * 1000,
      // Keep data around after a screen unmounts, so coming back is instant.
      gcTime: 10 * 60 * 1000,
      // One retry smooths over a flaky counter Wi-Fi without hammering the server.
      retry: 1,
      // Deliberately NOT a global `placeholderData: previous`: across different records
      // that would briefly show distributor A's bills while distributor B loads. Opt in
      // per query where the key is a search term, not an entity.
    },
  },
});

// React Native has no "window focus" event. Treat the app coming back to the
// foreground as focus, so data refreshes when the pharmacist returns to the app.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (status) => {
    focusManager.setFocused(status === 'active');
  });
}

/** Query keys in one place, so invalidation after a mutation can't miss a screen. */
export const queryKeys = {
  bills: (userId) => ['bills', userId],
  bill: (billId) => ['bill', billId],
  distributors: (userId) => ['distributors', userId],
  distributorBills: (distributorId) => ['distributor-bills', distributorId],
  ledgerSummary: (userId) => ['ledger-summary', userId],
};

/**
 * Call after anything that changes a bill — save, edit, delete, date fix — so every
 * screen showing that bill refreshes, rather than only the one where the edit happened.
 */
export function invalidateBillData(userId) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['bills', userId] }),
    queryClient.invalidateQueries({ queryKey: ['bill'] }),
    queryClient.invalidateQueries({ queryKey: ['distributor-bills'] }),
    queryClient.invalidateQueries({ queryKey: ['ledger-summary', userId] }),
  ]);
}
