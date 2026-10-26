import { useMemo } from 'react';
import colors from '@/constants/colors';
import { createTheme } from '@/constants/colors';
import { useStore } from '@/context/StoreContext';
import { useAppearance } from '@/context/AppearanceContext';

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 *
 * Uses this application's saved appearance preference and existing accent.
 */
export function useColors() {
  const { scheme } = useAppearance();
  const { profile } = useStore();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  return useMemo(() => ({ ...palette, ...createTheme(profile.accent, scheme), radius: 16 }), [palette, profile.accent, scheme]);
}
