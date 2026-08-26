import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import type { AccentColor, StoreProfile } from '@/types/business';
import type { Language } from '@/constants/i18n';

const PROFILE_KEY = '@retail-business-manager/store-profile';
const AUTH_KEY = '@retail-business-manager/authenticated';

const defaultProfile: StoreProfile = {
  id: 'local-store',
  name: 'متجري',
  phone: '',
  address: '',
  currency: 'ر.س',
  language: 'ar',
  accent: 'cyan',
};

interface StoreContextValue {
  profile: StoreProfile;
  isAuthenticated: boolean;
  isReady: boolean;
  saveProfile: (updates: Partial<StoreProfile>) => Promise<void>;
  setAuthenticated: (value: boolean) => Promise<void>;
  resetLocalSession: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<StoreProfile>(defaultProfile);
  const [isAuthenticated, setIsAuthenticatedState] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);

  useEffect(() => {
    async function loadLocalState() {
      try {
        const [storedProfile, storedAuth] = await Promise.all([
          AsyncStorage.getItem(PROFILE_KEY),
          AsyncStorage.getItem(AUTH_KEY),
        ]);
        if (storedProfile) {
          setProfile({ ...defaultProfile, ...JSON.parse(storedProfile) } as StoreProfile);
        }
        setIsAuthenticatedState(storedAuth === 'true');
      } catch {
        setProfile(defaultProfile);
        setIsAuthenticatedState(false);
      } finally {
        setIsReady(true);
      }
    }
    void loadLocalState();
  }, []);

  const saveProfile = async (updates: Partial<StoreProfile>) => {
    const nextProfile = { ...profile, ...updates };
    setProfile(nextProfile);
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
  };

  const setAuthenticated = async (value: boolean) => {
    setIsAuthenticatedState(value);
    await AsyncStorage.setItem(AUTH_KEY, String(value));
  };

  const resetLocalSession = async () => {
    setIsAuthenticatedState(false);
    await AsyncStorage.setItem(AUTH_KEY, 'false');
  };

  const value = useMemo(
    () => ({ profile, isAuthenticated, isReady, saveProfile, setAuthenticated, resetLocalSession }),
    [profile, isAuthenticated, isReady],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within StoreProvider');
  }
  return context;
}

export function useStoreLanguage(): Language {
  return useStore().profile.language;
}

export function useStoreAccent(): AccentColor {
  return useStore().profile.accent;
}