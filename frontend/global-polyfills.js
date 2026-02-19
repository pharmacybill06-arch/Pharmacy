/**
 * Global polyfills for Node.js modules required by xlsx in React Native
 * This file should be imported at the app entry point
 */

import { Buffer } from 'buffer';
import process from 'process/browser';

// Inject Buffer and process into global scope
global.Buffer = Buffer;
global.process = process;

// Ensure process.env exists
if (!global.process.env) {
  global.process.env = {};
}

// Set NODE_ENV if not already set
if (!global.process.env.NODE_ENV) {
  global.process.env.NODE_ENV = __DEV__ ? 'development' : 'production';
}

console.log('[Polyfills] Global Buffer and process have been initialized');
