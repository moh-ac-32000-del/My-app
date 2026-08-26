import { useColorScheme } from 'react-native';
import colors from '@/constants/colors';
import { createTheme } from '@/constants/colors';
import { useStore } from '@/context/StoreContext';

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 *
 * Falls back to the light palette when no dark key is defined in
 * constants/colors.ts (the scaffold ships light-only by default).
 * When a sibling web artifact's dark tokens are synced into a `dark`
 * key, this hook will automatically switch palettes based on the
 * device's appearance setting.
 */
export function useColors() {
  const scheme = useColorScheme();
  const { profile } = useStore();
  // The surface system stays dark in every appearance mode; only the accent
  // tone is user-configurable.
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const theme = createTheme(profile.accent);
  return { ...palette, ...theme, radius: colors.radius };
}
