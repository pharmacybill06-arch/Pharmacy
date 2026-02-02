const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// ✅ Keep alias
config.resolver.alias = {
  "@": path.resolve(__dirname),
};

// ✅ CRITICAL: stop Metro from prioritizing "browser" builds on native
config.resolver.resolverMainFields = ["react-native", "main", "module"];

// ✅ Optional: keep web extensions but DO NOT force them before native ones
// (Expo default config already handles platform extensions properly)

// ✅ Keep requireCycleIgnorePatterns if you want
config.resolver.requireCycleIgnorePatterns = [/(node_modules|\.next)\//];

module.exports = config;
