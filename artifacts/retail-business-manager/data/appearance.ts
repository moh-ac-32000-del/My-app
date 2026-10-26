export type AppearancePreference = 'system' | 'light' | 'dark';
export const normalizeAppearance = (value: unknown): AppearancePreference =>
  value === 'light' || value === 'dark' ? value : 'system';
export const resolveAppearance = (preference: AppearancePreference, system: string | null | undefined): 'light' | 'dark' =>
  preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
