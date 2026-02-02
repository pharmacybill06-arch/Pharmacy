// Light theme colors only - no theme switching
const LIGHT_COLORS = {
  text: '#11181C',
  background: '#fff',
  tint: '#0a7ea4',
  icon: '#687076',
  tabIconDefault: '#687076',
  tabIconSelected: '#0a7ea4',
};

export function useThemeColor(props, colorName) {
  const colorFromProps = props['light'];
  if (colorFromProps) {
    return colorFromProps;
  }
  return LIGHT_COLORS[colorName] || '#fff';
}
