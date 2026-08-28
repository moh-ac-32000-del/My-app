import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { StoreProfile } from '@/types/business';
import { isRTL, normalizeLanguage, translate, type Language, type TranslationKey } from '@/constants/i18n';
import { DEFAULT_CURRENCY, normalizeCurrency, normalizeQuickCurrencies, type CurrencyCode } from '@/constants/currencies';
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
  quickCurrencies: [DEFAULT_CURRENCY],
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
  toggleQuickCurrency: (code: CurrencyCode) => Promise<void>;
  setAuthenticated: (value: boolean) => Promise<void>;
  resetLocalSession: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<StoreProfile>(defaultProfile);
  const [isAuthenticated, setIsAuthenticatedState] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const profileRef = useRef<StoreProfile>(defaultProfile);
  const profileWriteQueueRef = useRef<Promise<void>>(Promise.resolve());

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
          const normalizedCurrency = normalizeCurrency(savedProfile.currency);
          const savedLanguage = normalizeLanguage(savedProfile.language ?? storedLanguage);
          const savedName = ['متجري', 'My store', 'Mağazam'].includes(savedProfile.name ?? '') ? '' : savedProfile.name;
          const normalizedProfile: StoreProfile = {
            ...defaultProfile,
            ...savedProfile,
            name: savedName ?? defaultProfile.name,
            currency: normalizedCurrency,
            quickCurrencies: normalizeQuickCurrencies(savedProfile.quickCurrencies, [normalizedCurrency]),
            accent: normalizeAccent(savedProfile.accent),
            language: savedLanguage,
          };
          profileRef.current = normalizedProfile;
          setProfile(normalizedProfile);
          await Promise.all([
            AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(normalizedProfile)),
            AsyncStorage.removeItem(LEGACY_LANGUAGE_KEY),
          ]);
        } else {
          const savedLanguage = normalizeLanguage(storedLanguage);
          const initialProfile = { ...defaultProfile, language: savedLanguage };
          profileRef.current = initialProfile;
          setProfile(initialProfile);
          await Promise.all([
            AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(initialProfile)),
            AsyncStorage.removeItem(LEGACY_LANGUAGE_KEY),
          ]);
        }
        setIsAuthenticatedState(storedAuth === 'true');
      } catch {
        profileRef.current = defaultProfile;
        setProfile(defaultProfile);
        setIsAuthenticatedState(false);
      } finally {
        setIsReady(true);
      }
    }
    void loadLocalState();
  }, []);

  const saveProfile = async (updates: Partial<StoreProfile>) => {
    const currentProfile = profileRef.current;
    const nextProfile: StoreProfile = {
      ...currentProfile,
      ...updates,
      currency: normalizeCurrency(updates.currency ?? currentProfile.currency),
      quickCurrencies: updates.quickCurrencies === undefined
        ? currentProfile.quickCurrencies
        : normalizeQuickCurrencies(updates.quickCurrencies, []),
      language: normalizeLanguage(updates.language ?? currentProfile.language),
    };
    profileRef.current = nextProfile;
    setProfile(nextProfile);
    profileWriteQueueRef.current = profileWriteQueueRef.current
      .catch(() => undefined)
      .then(() => AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile)));
    await profileWriteQueueRef.current;
  };

  const toggleQuickCurrency = async (code: CurrencyCode) => {
    const currentCurrencies = profileRef.current.quickCurrencies;
    const nextCurrencies = currentCurrencies.includes(code)
      ? currentCurrencies.filter((item) => item !== code)
      : [...currentCurrencies, code];
    await saveProfile({ quickCurrencies: nextCurrencies });
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
      toggleQuickCurrency,
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