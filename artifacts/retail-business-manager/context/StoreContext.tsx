import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import type { StoreProfile } from '@/types/business';
import { isRTL, normalizeLanguage, translate, type Language, type TranslationKey } from '@/constants/i18n';
import { DEFAULT_CURRENCY, normalizeCurrency } from '@/constants/currencies';
import { normalizeAccent, type AccentColor } from '@/constants/colors';

const PROFILE_KEY = '@retail-business-manager/store-profile';
const AUTH_KEY = '@retail-business-manager/authenticated';
const LEGACY_LANGUAGE_KEY = '@retail-business-manager/language';

const defaultProfile: StoreProfile = {
  id: 'local-store',
  name: '',
  phone: '',
  address: '',
  currency: DEFAULT_CURRENCY,
  language: 'ar',
  accent: 'blue',
};

interface StoreContextValue {
  profile: StoreProfile;
  language: Language;
  isRTL: boolean;
  direction: 'rtl' | 'ltr';
  t: (key: TranslationKey) => string;
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
        const [storedProfile, storedAuth, storedLanguage] = await Promise.all([
          AsyncStorage.getItem(PROFILE_KEY),
          AsyncStorage.getItem(AUTH_KEY),
          AsyncStorage.getItem(LEGACY_LANGUAGE_KEY),
        ]);
        if (storedProfile) {
          const savedProfile = JSON.parse(storedProfile) as Partial<StoreProfile>;
          const savedLanguage = normalizeLanguage(savedProfile.language ?? storedLanguage);
          const savedName = ['متجري', 'My store', 'Mağazam'].includes(savedProfile.name ?? '') ? '' : savedProfile.name;
          const normalizedProfile: StoreProfile = {
            ...defaultProfile,
            ...savedProfile,
            name: savedName ?? defaultProfile.name,
            currency: normalizeCurrency(savedProfile.currency),
            accent: normalizeAccent(savedProfile.accent),
            language: savedLanguage,
          };
          setProfile(normalizedProfile);
          await Promise.all([
            AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(normalizedProfile)),
            AsyncStorage.removeItem(LEGACY_LANGUAGE_KEY),
          ]);
        } else {
          const savedLanguage = normalizeLanguage(storedLanguage);
          const initialProfile = { ...defaultProfile, language: savedLanguage };
          setProfile(initialProfile);
          await Promise.all([
            AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(initialProfile)),
            AsyncStorage.removeItem(LEGACY_LANGUAGE_KEY),
          ]);
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
    const nextProfile: StoreProfile = {
      ...profile,
      ...updates,
      language: normalizeLanguage(updates.language ?? profile.language),
    };
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

  const language = profile.language;
  const rtl = isRTL(language);
  const value = useMemo(
    () => ({
      profile,
      language,
      isRTL: rtl,
      direction: (rtl ? 'rtl' : 'ltr') as 'rtl' | 'ltr',
      t: (key: TranslationKey) => translate(key, language),
      isAuthenticated,
      isReady,
      saveProfile,
      setAuthenticated,
      resetLocalSession,
    }),
    [profile, language, rtl, isAuthenticated, isReady],
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