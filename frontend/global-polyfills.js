/**
 * Global polyfills for Node.js modules required by xlsx in React Native
 * This file should be imported at the app entry point
 */

import { Buffer } from 'buffer';
import process from 'process/browser';

// Only polyfill where there is no real Node runtime. When Expo renders the web build on
// the server, this file runs INSIDE the Metro dev server's own Node process; replacing
// Node's genuine `process` there with the browser shim (which has no `hrtime`) crashed
// Metro with "process.hrtime is not a function" and cut off every phone connected to it.
const isRealNode = typeof global.process?.versions?.node === 'string';

if (!isRealNode) {
  // Keep any env the platform already set rather than wiping it with the shim's.
  const existingEnv = global.process?.env;
  global.process = process;
  global.process.env = { ...(process.env || {}), ...(existingEnv || {}) };
}

if (!global.Buffer) {
  global.Buffer = Buffer;
}

// Ensure process.env exists
if (!global.process.env) {
  global.process.env = {};
}

// Set NODE_ENV if not already set
if (!global.process.env.NODE_ENV) {
  global.process.env.NODE_ENV = __DEV__ ? 'development' : 'production';
}

console.log('[Polyfills] Global Buffer and process have been initialized');
