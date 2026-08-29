import React, { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CashTransactionDraft, Debt, StoreProfile, Transaction } from '@/types/business';
import { isRTL, normalizeLanguage, translate, type Language, type TranslationKey } from '@/constants/i18n';
import { DEFAULT_CURRENCY, normalizeCurrency, normalizeQuickCurrencies, type CurrencyCode } from '@/constants/currencies';
import { normalizeAccent, type AccentColor } from '@/constants/colors';
import {
  clearLegacyLanguage,
  loadAuthenticatedState,
  loadLegacyLanguage,
  loadStoreProfile,
  normalizeStoredStoreProfile,
  restoreLocalBackup,
  saveAuthenticatedState,
  saveStoreProfile,
  createCashTransaction,
  createDebt,
  loadDebts,
  loadTransactions,
  saveDebts,
  saveTransactions,
  settleCustomerDebt as persistCustomerSettlement,
  type SettlementDraft,
  type SettlementResult,
  type LocalBackup,
} from '@/services/storage';

const defaultProfile: StoreProfile = {
  id: 'local-store',
  name: '',
  phone: '',
  address: '',
  currency: DEFAULT_CURRENCY,
  quickCurrencies: [DEFAULT_CURRENCY],
  visibleCurrencies: [DEFAULT_CURRENCY],
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
  transactions: Transaction[];
  journalRevision: number;
  addTransaction: (draft: CashTransactionDraft) => Promise<Transaction>;
  addCustomerDebt: (customerId: string, draft: { amount: number; currency: CurrencyCode }) => Promise<Debt>;
  settleCustomerDebt: (customerId: string, draft: SettlementDraft) => Promise<SettlementResult>;
  saveProfile: (updates: Partial<StoreProfile>) => Promise<void>;
  toggleQuickCurrency: (code: CurrencyCode) => Promise<void>;
  setAuthenticated: (value: boolean) => Promise<void>;
  restoreFromLocalBackup: (contents: string) => Promise<LocalBackup>;
  resetLocalSession: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<StoreProfile>(defaultProfile);
  const [isAuthenticated, setIsAuthenticatedState] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [journalRevision, setJournalRevision] = useState<number>(0);
  const profileRef = useRef<StoreProfile>(defaultProfile);
  const transactionsRef = useRef<Transaction[]>([]);
  const transactionLoadPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const profileWriteQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    async function loadLocalState() {
      try {
        const [storedProfile, storedAuth, storedLanguage] = await Promise.all([
          loadStoreProfile(),
          loadAuthenticatedState(),
          loadLegacyLanguage(),
        ]);
        const normalizedProfile = normalizeStoredStoreProfile(storedProfile, defaultProfile, storedLanguage);
        profileRef.current = normalizedProfile;
        setProfile(normalizedProfile);
        await Promise.all([saveStoreProfile(normalizedProfile), clearLegacyLanguage()]);
        setIsAuthenticatedState(storedAuth);
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

  useEffect(() => {
    if (!isReady) {
      return;
    }

    let isActive = true;
    const loadPromise = loadTransactions(profile.id).then((loadedTransactions) => {
      if (!isActive) {
        return;
      }
      transactionsRef.current = loadedTransactions;
      setTransactions(loadedTransactions);
    });
    transactionLoadPromiseRef.current = loadPromise;

    return () => {
      isActive = false;
    };
  }, [isReady, profile.id]);

  const saveProfile = async (updates: Partial<StoreProfile>) => {
    const currentProfile = profileRef.current;
    const nextProfile: StoreProfile = {
      ...currentProfile,
      ...updates,
      currency: normalizeCurrency(updates.currency ?? currentProfile.currency),
      quickCurrencies: updates.quickCurrencies === undefined
        ? currentProfile.quickCurrencies
        : normalizeQuickCurrencies(updates.quickCurrencies, []),
      visibleCurrencies: updates.visibleCurrencies === undefined
        ? currentProfile.visibleCurrencies
        : normalizeQuickCurrencies(updates.visibleCurrencies, []),
      language: normalizeLanguage(updates.language ?? currentProfile.language),
    };
    profileRef.current = nextProfile;
    setProfile(nextProfile);
    profileWriteQueueRef.current = profileWriteQueueRef.current
      .catch(() => undefined)
      .then(() => saveStoreProfile(nextProfile));
    await profileWriteQueueRef.current;
  };

  const toggleQuickCurrency = async (code: CurrencyCode) => {
    const currentCurrencies = profileRef.current.quickCurrencies;
    const nextCurrencies = currentCurrencies.includes(code)
      ? currentCurrencies.filter((item) => item !== code)
      : [...currentCurrencies, code];
    await saveProfile({ quickCurrencies: nextCurrencies });
  };

  const addTransaction = async (draft: CashTransactionDraft): Promise<Transaction> => {
    await transactionLoadPromiseRef.current;
    const transaction = createCashTransaction(profileRef.current.id, draft);
    const nextTransactions = [transaction, ...transactionsRef.current];
    await saveTransactions(profileRef.current.id, nextTransactions);
    transactionsRef.current = nextTransactions;
    setTransactions(nextTransactions);
    setJournalRevision((current) => current + 1);
    return transaction;
  };

  const addCustomerDebt = async (
    customerId: string,
    draft: { amount: number; currency: CurrencyCode },
  ): Promise<Debt> => {
    const storeId = profileRef.current.id;
    const debt = createDebt(storeId, customerId, draft);
    const currentDebts = await loadDebts(storeId);
    await saveDebts(storeId, [...currentDebts, debt]);
    setJournalRevision((current) => current + 1);
    return debt;
  };

  const settleCustomerDebt = async (customerId: string, draft: SettlementDraft): Promise<SettlementResult> => {
    await transactionLoadPromiseRef.current;
    const result = await persistCustomerSettlement(profileRef.current.id, customerId, draft);
    const nextTransactions = await loadTransactions(profileRef.current.id);
    transactionsRef.current = nextTransactions;
    setTransactions(nextTransactions);
    setJournalRevision((current) => current + 1);
    return result;
  };

  const setAuthenticated = async (value: boolean) => {
    setIsAuthenticatedState(value);
    await saveAuthenticatedState(value);
  };

  const restoreFromLocalBackup = async (contents: string): Promise<LocalBackup> => {
    await profileWriteQueueRef.current.catch(() => undefined);
    await transactionLoadPromiseRef.current.catch(() => undefined);
    const restored = await restoreLocalBackup(contents, profileRef.current.id);
    const nextProfile = restored.storeProfile;
    const nextTransactions = await loadTransactions(restored.storeId);

    profileRef.current = nextProfile;
    transactionsRef.current = nextTransactions;
    setProfile(nextProfile);
    setTransactions(nextTransactions);
    setIsAuthenticatedState(restored.authenticated);
    setJournalRevision((current) => current + 1);
    return restored;
  };

  const resetLocalSession = async () => {
    setIsAuthenticatedState(false);
    await saveAuthenticatedState(false);
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
      transactions,
      journalRevision,
      addTransaction,
      addCustomerDebt,
      settleCustomerDebt,
      saveProfile,
      toggleQuickCurrency,
      setAuthenticated,
      restoreFromLocalBackup,
      resetLocalSession,
    }),
    [profile, language, rtl, isAuthenticated, isReady, transactions, journalRevision],
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