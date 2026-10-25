export type AccentColor = 'silver' | 'white' | 'gold' | 'blue' | 'violet' | 'green';

export interface ThemeColors {
  text: string;
  tint: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  success: string;
  warning: string;
  overlay: string;
  glass: string;
  glassStrong: string;
  glow: string;
}

const darkGlassBase: ThemeColors = {
  text: '#F6F8FB',
  tint: '#69C7FF',
  background: '#070A0E',
  foreground: '#F6F8FB',
  card: '#10161E',
  cardForeground: '#F6F8FB',
  primary: '#69C7FF',
  primaryForeground: '#071015',
  secondary: '#17212C',
  secondaryForeground: '#D7E1E8',
  muted: '#121A23',
  mutedForeground: '#8897A5',
  accent: '#182A35',
  accentForeground: '#C4EEFF',
  destructive: '#FF6B7A',
  destructiveForeground: '#22070C',
  border: '#263541',
  input: '#1C2934',
  success: '#65D8A6',
  warning: '#F2C86B',
  overlay: 'rgba(21, 31, 41, 0.76)',
  glass: 'rgba(19, 28, 37, 0.78)',
  glassStrong: 'rgba(24, 36, 47, 0.92)',
  glow: 'rgba(105, 199, 255, 0.16)',
};

const lightBase: ThemeColors = {
  ...darkGlassBase,
  text: '#18202B', foreground: '#18202B', background: '#F4F5F7',
  card: '#FFFFFF', cardForeground: '#18202B', secondary: '#E9EDF2', secondaryForeground: '#334155',
  muted: '#EDF0F4', mutedForeground: '#566375', border: '#D7DDE5', input: '#FFFFFF',
  destructive: '#B42338', destructiveForeground: '#FFFFFF', success: '#176846', warning: '#805700',
  overlay: 'rgba(16, 24, 40, 0.45)', glass: '#FFFFFF', glassStrong: '#FFFFFF', glow: 'transparent',
};

// Every existing accent remains selectable. Light variants preserve contrast on white.
const lightAccents: Record<AccentColor, string> = {
  silver: '#475569', white: '#334155', gold: '#805B08', blue: '#076AA6', violet: '#6542BD', green: '#176846',
};

const accentTones: Record<AccentColor, Pick<ThemeColors, 'primary' | 'primaryForeground' | 'tint' | 'accent' | 'accentForeground' | 'glow'>> = {
  silver: {
    primary: '#C6D0DA',
    primaryForeground: '#0B1117',
    tint: '#C6D0DA',
    accent: '#26323D',
    accentForeground: '#E6EDF3',
    glow: 'rgba(198, 208, 218, 0.14)',
  },
  white: {
    primary: '#F4F7FA',
    primaryForeground: '#0B1117',
    tint: '#F4F7FA',
    accent: '#29343F',
    accentForeground: '#FFFFFF',
    glow: 'rgba(244, 247, 250, 0.11)',
  },
  gold: {
    primary: '#E5C46A',
    primaryForeground: '#1D1707',
    tint: '#E5C46A',
    accent: '#3A3020',
    accentForeground: '#F4E5B0',
    glow: 'rgba(229, 196, 106, 0.15)',
  },
  blue: {
    primary: '#69C7FF',
    primaryForeground: '#071015',
    tint: '#69C7FF',
    accent: '#182F3E',
    accentForeground: '#C4EEFF',
    glow: 'rgba(105, 199, 255, 0.16)',
  },
  violet: {
    primary: '#A99BFF',
    primaryForeground: '#100B21',
    tint: '#A99BFF',
    accent: '#2B2946',
    accentForeground: '#DED9FF',
    glow: 'rgba(169, 155, 255, 0.15)',
  },
  green: {
    primary: '#72D5A5',
    primaryForeground: '#071910',
    tint: '#72D5A5',
    accent: '#1C382D',
    accentForeground: '#C3F2DA',
    glow: 'rgba(114, 213, 165, 0.15)',
  },
};

export const accentOptions: Array<{ key: AccentColor; color: string }> = [
  { key: 'silver', color: accentTones.silver.primary },
  { key: 'white', color: accentTones.white.primary },
  { key: 'gold', color: accentTones.gold.primary },
  { key: 'blue', color: accentTones.blue.primary },
  { key: 'violet', color: accentTones.violet.primary },
  { key: 'green', color: accentTones.green.primary },
];

export function normalizeAccent(value: unknown): AccentColor {
  if (value === 'silver' || value === 'white' || value === 'gold' || value === 'blue' || value === 'violet' || value === 'green') {
    return value;
  }
  const legacyAccentMap: Record<string, AccentColor> = {
    cyan: 'blue',
    amber: 'gold',
    mint: 'green',
  };
  return typeof value === 'string' ? legacyAccentMap[value] ?? 'blue' : 'blue';
}

export function createTheme(accent: AccentColor = 'blue', appearance: 'light' | 'dark' = 'dark'): ThemeColors & { radius: number } {
  return {
    ...(appearance === 'light' ? lightBase : darkGlassBase),
    ...(accentTones[accent] ?? accentTones.blue),
    ...(appearance === 'light' ? { primary: lightAccents[accent] ?? lightAccents.blue,
      tint: lightAccents[accent] ?? lightAccents.blue, primaryForeground: '#FFFFFF',
      accent: '#E9EDF4', accentForeground: lightAccents[accent] ?? lightAccents.blue, glow: 'transparent' } : {}),
    radius: 16,
  };
}

const colors = {
  light: createTheme('blue', 'light'),
  dark: createTheme('blue'),
  radius: 22,
};

export default colors;
