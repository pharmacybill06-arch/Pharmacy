/**
 * expo-router hook for links the OS opens the app with.
 *
 * expo-share-intent delivers a share as the deep link `myapp://dataUrl=<key>`, which
 * is not a route. Open the home screen instead; the share itself is read from the
 * native module by ShareIntentBridge in app/_layout.js.
 */
export function redirectSystemPath({ path }) {
  try {
    if (path && path.includes('dataUrl=')) return '/';
    return path;
  } catch {
    return '/';
  }
}
