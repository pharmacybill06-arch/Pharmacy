/**
 * Empty shim for Node.js fs module
 * Used by xlsx library in React Native context where fs is not available
 */

module.exports = {
  readFileSync: () => {
    throw new Error('fs.readFileSync is not available in React Native');
  },
  writeFileSync: () => {
    throw new Error('fs.writeFileSync is not available in React Native');
  },
  existsSync: () => false,
  readdirSync: () => [],
  statSync: () => ({
    isDirectory: () => false,
    isFile: () => false,
  }),
  // Add any other fs methods that might be called
};
