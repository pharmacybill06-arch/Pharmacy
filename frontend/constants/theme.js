import { Platform } from 'react-native';

const tintColorLight = '#4F46E5'; // Indigo-600 — richer primary
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#0F172A',
    background: '#fff',
    tint: tintColorLight,
    icon: '#64748B',
    tabIconDefault: '#64748B',
    tabIconSelected: tintColorLight,
    gray: '#64748B',
    warning: '#F59E0B',
    danger: '#EF4444',
    success: '#10B981',
    primary: tintColorLight,
    primaryLight: '#EEF2FF',
    primaryDark: '#3730A3',
    white: '#fff',
    lightGray: '#F1F5F9',
    border: '#E2E8F0',
    card: '#FFFFFF',
    surface: '#F8FAFC',
    accent: '#06B6D4',
    accentLight: '#ECFEFF',
  },
  dark: {
    text: '#F1F5F9',
    background: '#0F172A',
    tint: tintColorDark,
    icon: '#94A3B8',
    tabIconDefault: '#94A3B8',
    tabIconSelected: tintColorDark,
    gray: '#94A3B8',
    warning: '#F59E0B',
    danger: '#EF4444',
    success: '#10B981',
    primary: tintColorDark,
    primaryLight: '#1E293B',
    primaryDark: '#E0E7FF',
    white: '#0F172A',
    lightGray: '#1E293B',
    border: '#334155',
    card: '#1E293B',
    surface: '#0F172A',
    accent: '#06B6D4',
    accentLight: '#164E63',
  },
  // Shared gradient stops & accent palettes
  gradients: {
    primary: ['#4F46E5', '#7C3AED'],        // Indigo → Violet
    auth: ['#6366F1', '#8B5CF6', '#A78BFA'], // Rich purple spectrum
    hero: ['#4F46E5', '#2563EB'],            // Indigo → Blue
    success: ['#10B981', '#34D399'],
    warm: ['#F59E0B', '#F97316'],
    cool: ['#06B6D4', '#3B82F6'],
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 999,
};

export const Shadows = Platform.select({
  ios: {
    sm: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
    md: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 },
    lg: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24 },
    colored: (color) => ({ shadowColor: color, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14 }),
  },
  default: {
    sm: { elevation: 2 },
    md: { elevation: 4 },
    lg: { elevation: 8 },
    colored: () => ({ elevation: 6 }),
  },
});

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
