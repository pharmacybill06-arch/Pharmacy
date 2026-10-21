/**
 * Holds content shared into the app until a screen can act on it.
 *
 * On Android, sharing into the app can mount a fresh React root: the instance that
 * received the share is torn down and the new one starts with an empty share-intent
 * state. Module state lives in the JS runtime, which survives that remount, so the
 * share is parked here and picked up by whichever root is mounted and ready.
 */
let pending = null;
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn());
}

/** @param {{ kind: 'image', uri: string, mimeType: string } | { kind: 'text', text: string }} share */
export function setPendingShare(share) {
  pending = { ...share, receivedAt: Date.now() };
  emit();
}

export function getPendingShare() {
  // A share nobody handled within 2 minutes is stale (e.g. user was signed out)
  if (pending && Date.now() - pending.receivedAt > 120000) pending = null;
  return pending;
}

export function clearPendingShare() {
  pending = null;
  emit();
}

export function subscribePendingShare(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
