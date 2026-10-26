import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import { loadUiAppearance, saveUiAppearance } from '@/services/preferences';
import { resolveAppearance, type AppearancePreference } from '@/data/appearance';

type Appearance = { preference: AppearancePreference; scheme: 'light' | 'dark'; setPreference: (value: AppearancePreference) => Promise<void> };
const Context = createContext<Appearance | null>(null);
export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<AppearancePreference>('system');
  const system = useColorScheme(), revision = useRef(0), active = useRef(true);
  useEffect(() => {
    active.current = true;
    const initial = revision.current;
    void loadUiAppearance().then(value => { if (active.current && revision.current === initial) setPreference(value); }).catch(() => {});
    return () => { active.current = false; };
  }, []);
  const queue = useRef(Promise.resolve());
  const value = useMemo<Appearance>(() => ({ preference, scheme: resolveAppearance(preference, system),
    setPreference: async next => {
      const selected = ++revision.current;
      const pending = queue.current.catch(() => {}).then(() => saveUiAppearance(next));
      queue.current = pending;
      await pending;
      if (active.current && selected === revision.current) setPreference(next);
    },
  }), [preference, system]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAppearance(): Appearance {
  const value = useContext(Context);
  return value ?? { preference: 'system', scheme: 'dark', setPreference: async () => { throw new Error('appearanceProviderRequired'); } };
}
