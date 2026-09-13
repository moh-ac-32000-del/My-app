import React, { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { CashTransactionDraft, Debt, StoreProfile, Transaction } from '@/types/business';
import type { SpaceIdentity } from '@/types/space';
import { isRTL, normalizeLanguage, translate, type Language, type TranslationKey } from '@/constants/i18n';
import { DEFAULT_CURRENCY, normalizeCurrency, normalizeQuickCurrencies, type CurrencyCode } from '@/constants/currencies';
import { normalizeAccent, type AccentColor } from '@/constants/colors';
import { isFirebaseConfigured } from '@/services/firebase';
import { signOutFromFirebase, subscribeToFirebaseAuth } from '@/services/firebaseAuth';
import { getOrCreateSpaceIdentity } from '@/services/spaceIdentity';
import { discoverUserSpaces, validateUserSpaceMembership } from '@/services/firestore';
import { bootstrapPrimarySpace } from '@/services/trustedBootstrap';
import { createDebtDocument } from '@/services/debtFirestore';
import { createTransactionDocument, subscribeToTransactions } from '@/services/transactionFirestore';
import type { Space } from '@/types/space';
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
  setActiveSpaceId,
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
  activeSpaceId: string | null;
  activeSpaceLoading: boolean;
  activeSpaceError: string | null;
  retryActiveSpace: () => void;
  initializationError: string | null;
  retryInitialization: () => void;
  spaceIdentity: SpaceIdentity | null;
  cloudSpace: Space | null;
  transactions: Transaction[];
  journalRevision: number;
  addTransaction: (draft: CashTransactionDraft) => Promise<Transaction>;
  addCustomerDebt: (customerId: string, draft: { amount: number; currency: CurrencyCode; dueDate?: string }) => Promise<Debt>;
  settleCustomerDebt: (customerId: string, draft: SettlementDraft) => Promise<SettlementResult>;
  saveProfile: (updates: Partial<StoreProfile>) => Promise<void>;
  toggleQuickCurrency: (code: CurrencyCode) => Promise<void>;
  setAuthenticated: (value: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  restoreFromLocalBackup: (contents: string) => Promise<LocalBackup>;
  resetLocalSession: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export async function initializePostAuthLocalSession(
  user: User,
  isCurrentTransition: () => boolean,
  callbacks: {
    onProfile: (profile: StoreProfile) => void;
    onSpaceIdentity: (identity: SpaceIdentity | null) => void;
    onReady: () => void;
    onError: (message: string | null) => void;
  },
): Promise<void> {
  let identity: SpaceIdentity | null = null;
  if (!isCurrentTransition()) {
    return;
  }
  callbacks.onError(null);

  try {
    try {
      identity = await getOrCreateSpaceIdentity(user.uid);
    } catch {
      identity = null;
    }
    if (!isCurrentTransition()) {
      return;
    }
    callbacks.onSpaceIdentity(identity);

    const storedProfile = await loadStoreProfile();
    if (!isCurrentTransition()) {
      return;
    }
    const normalizedProfile = normalizeStoredStoreProfile(storedProfile, defaultProfile);
    await saveStoreProfile(normalizedProfile);
    if (!isCurrentTransition()) {
      return;
    }

    callbacks.onProfile(normalizedProfile);
    callbacks.onReady();
  } catch (error) {
    if (!isCurrentTransition()) {
      return;
    }
    callbacks.onSpaceIdentity(null);
    callbacks.onError(error instanceof Error ? error.message : 'postAuthInitializationFailed');
    callbacks.onReady();
  }
}

export function isFirebaseSessionAuthenticated(user: User | null): boolean {
  return user !== null;
}

export function clearFirebaseAuthSession(callbacks: {
  onFirebaseUser: (user: null) => void;
  onSpaceIdentity: (identity: null) => void;
  onCloudSpace: (space: null) => void;
  onActiveSpaceId: (spaceId: null) => void;
  onInitializationError: (error: null) => void;
  onFirebaseReady: () => void;
}): void {
  callbacks.onFirebaseUser(null);
  callbacks.onSpaceIdentity(null);
  callbacks.onCloudSpace(null);
  callbacks.onActiveSpaceId(null);
  callbacks.onInitializationError(null);
  callbacks.onFirebaseReady();
}

export async function resolveActiveSpaceForUser(uid: string): Promise<string | null> {
  const discovery = await discoverUserSpaces(uid);
  const activeMemberships = discovery.memberships.filter(
    (membership) => membership.status === 'active' && membership.spaceId.trim(),
  );
  if (activeMemberships.length > 1) {
    throw new Error('multipleWorkspacesUnsupported');
  }

  let resolvedSpaceId = discovery.primarySpaceId?.trim() || null;
  if (!resolvedSpaceId) {
    const bootstrapResult = await bootstrapPrimarySpace();
    resolvedSpaceId = bootstrapResult.primarySpaceId.trim();
  }
  if (!resolvedSpaceId) {
    return null;
  }

  const isValidMembership = await validateUserSpaceMembership(uid, resolvedSpaceId);
  if (!isValidMembership) {
    throw new Error('activeWorkspaceMembershipMissing');
  }
  return resolvedSpaceId;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<StoreProfile>(defaultProfile);
  const [localIsAuthenticated, setLocalIsAuthenticatedState] = useState<boolean>(false);
  const [isLocalReady, setIsLocalReady] = useState<boolean>(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [spaceIdentity, setSpaceIdentity] = useState<SpaceIdentity | null>(null);
  const [cloudSpace, setCloudSpace] = useState<Space | null>(null);
  const [activeSpaceId, setActiveSpaceIdState] = useState<string | null>(null);
  const [activeSpaceLoading, setActiveSpaceLoading] = useState<boolean>(isFirebaseConfigured);
  const [activeSpaceError, setActiveSpaceError] = useState<string | null>(null);
  const [isFirebaseReady, setIsFirebaseReady] = useState<boolean>(!isFirebaseConfigured);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [journalRevision, setJournalRevision] = useState<number>(0);
  const profileRef = useRef<StoreProfile>(defaultProfile);
  const transactionsRef = useRef<Transaction[]>([]);
  const transactionLoadPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const profileWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const authTransitionRef = useRef<number>(0);
  const firebaseUserRef = useRef<User | null>(null);
  const initializationInFlightRef = useRef<number | null>(null);

  useEffect(() => {
    async function loadLocalState() {
      try {
        const [storedAuth, storedLanguage] = await Promise.all([
          loadAuthenticatedState(),
          loadLegacyLanguage(),
        ]);
        const storedProfile = isFirebaseConfigured ? null : await loadStoreProfile();
        const normalizedProfile = normalizeStoredStoreProfile(storedProfile, defaultProfile, storedLanguage);
        profileRef.current = normalizedProfile;
        setProfile(normalizedProfile);
        await Promise.all([
          ...(isFirebaseConfigured ? [] : [saveStoreProfile(normalizedProfile)]),
          clearLegacyLanguage(),
        ]);
        setLocalIsAuthenticatedState(storedAuth);
      } catch {
        profileRef.current = defaultProfile;
        setProfile(defaultProfile);
        setLocalIsAuthenticatedState(false);
      } finally {
        setIsLocalReady(true);
      }
    }
    void loadLocalState();
  }, []);

  const startPostAuthLocalInitialization = React.useCallback((user: User, transition: number) => {
    if (initializationInFlightRef.current === transition) {
      return;
    }
    initializationInFlightRef.current = transition;
    setInitializationError(null);
    setIsFirebaseReady(false);
    setActiveSpaceLoading(true);
    setActiveSpaceError(null);
    setActiveSpaceIdState(null);
    setActiveSpaceId(null);

    void (async () => {
      try {
        const resolvedSpaceId = await resolveActiveSpaceForUser(user.uid);
        if (authTransitionRef.current !== transition || firebaseUserRef.current !== user) {
          return;
        }
        transactionsRef.current = [];
        transactionLoadPromiseRef.current = Promise.resolve();
        setTransactions([]);
        setActiveSpaceIdState(resolvedSpaceId);
        setActiveSpaceId(resolvedSpaceId);
        setActiveSpaceLoading(resolvedSpaceId === null);
      } catch (error) {
        if (authTransitionRef.current !== transition || firebaseUserRef.current !== user) {
          return;
        }
        setActiveSpaceIdState(null);
        setActiveSpaceId(null);
        setActiveSpaceError(error instanceof Error ? error.message : 'activeWorkspaceUnavailable');
        setActiveSpaceLoading(false);
      }
      await initializePostAuthLocalSession(
        user,
        () => authTransitionRef.current === transition && firebaseUserRef.current === user,
        {
          onProfile: (normalizedProfile) => {
            profileRef.current = normalizedProfile;
            setProfile(normalizedProfile);
          },
          onSpaceIdentity: setSpaceIdentity,
          onReady: () => setIsFirebaseReady(true),
          onError: setInitializationError,
        },
      );
      if (initializationInFlightRef.current === transition) {
        initializationInFlightRef.current = null;
      }
    })();
  }, []);

  const retryInitialization = React.useCallback(() => {
    const user = firebaseUserRef.current;
    if (!user) {
      return;
    }
    startPostAuthLocalInitialization(user, authTransitionRef.current);
  }, [startPostAuthLocalInitialization]);
  const retryActiveSpace = retryInitialization;

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return;
    }

    setActiveSpaceId(null);
    setActiveSpaceIdState(null);
    setActiveSpaceLoading(false);
    setActiveSpaceError(null);
    setIsFirebaseReady(false);

    return subscribeToFirebaseAuth(
      (user) => {
        const transition = authTransitionRef.current + 1;
        authTransitionRef.current = transition;
        firebaseUserRef.current = user;
        setFirebaseUser(user);
        setSpaceIdentity(null);
        setCloudSpace(null);
        setInitializationError(null);
        setIsFirebaseReady(false);
        setActiveSpaceId(null);
        setActiveSpaceIdState(null);
        setActiveSpaceLoading(Boolean(user));
        setActiveSpaceError(null);
        profileRef.current = defaultProfile;
        transactionsRef.current = [];
        transactionLoadPromiseRef.current = Promise.resolve();
        setProfile(defaultProfile);
        setTransactions([]);
        if (!user) {
          initializationInFlightRef.current = null;
          setActiveSpaceLoading(false);
          setIsFirebaseReady(true);
          return;
        }

        startPostAuthLocalInitialization(user, transition);
      },
      () => {
        authTransitionRef.current += 1;
        firebaseUserRef.current = null;
        initializationInFlightRef.current = null;
        clearFirebaseAuthSession({
          onFirebaseUser: setFirebaseUser,
          onSpaceIdentity: setSpaceIdentity,
          onCloudSpace: setCloudSpace,
          onActiveSpaceId: setActiveSpaceId,
          onInitializationError: setInitializationError,
          onFirebaseReady: () => setIsFirebaseReady(true),
        });
        setActiveSpaceIdState(null);
        setActiveSpaceLoading(false);
        setActiveSpaceError(null);
        profileRef.current = defaultProfile;
        transactionsRef.current = [];
        transactionLoadPromiseRef.current = Promise.resolve();
        setProfile(defaultProfile);
        setTransactions([]);
      },
    );
  }, [startPostAuthLocalInitialization]);

  const isReady = isLocalReady && isFirebaseReady;
  const isAuthenticated = isFirebaseConfigured
    ? isFirebaseSessionAuthenticated(firebaseUser)
    : localIsAuthenticated;

  useEffect(() => {
    let isActive = true;
    let unsubscribe: (() => void) | undefined;

    if (!isReady || initializationError || (isFirebaseConfigured && !activeSpaceId)) {
      return () => {
        isActive = false;
      };
    }

    transactionsRef.current = [];
    setTransactions([]);

    if (isFirebaseConfigured) {
      if (!isAuthenticated || !activeSpaceId) {
        transactionLoadPromiseRef.current = Promise.resolve();
        return () => {
          isActive = false;
        };
      }

      const cloudLoadPromise = new Promise<void>((resolve, reject) => {
        let hasReceivedInitialSnapshot = false;
        unsubscribe = subscribeToTransactions(
          activeSpaceId,
          (loadedTransactions) => {
            if (!isActive) {
              return;
            }
            transactionsRef.current = loadedTransactions;
            setTransactions(loadedTransactions);
            if (!hasReceivedInitialSnapshot) {
              hasReceivedInitialSnapshot = true;
              resolve();
            }
          },
          (error) => {
            if (!isActive) {
              return;
            }
            setInitializationError(error.message);
            if (!hasReceivedInitialSnapshot) {
              hasReceivedInitialSnapshot = true;
              reject(error);
            }
          },
        );
      });
      transactionLoadPromiseRef.current = cloudLoadPromise;
      void cloudLoadPromise.catch(() => undefined);

      return () => {
        isActive = false;
        unsubscribe?.();
      };
    }

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
  }, [activeSpaceId, initializationError, isAuthenticated, isReady, profile.id, spaceIdentity?.spaceId]);

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

    if (isFirebaseConfigured) {
      if (!activeSpaceId) {
        throw new Error('transactionWorkspaceUnavailable');
      }
      await createTransactionDocument(activeSpaceId, transaction);
      const nextTransactions = [transaction, ...transactionsRef.current];
      transactionsRef.current = nextTransactions;
      setTransactions(nextTransactions);
      setJournalRevision((current) => current + 1);
      return transaction;
    }

    const nextTransactions = [transaction, ...transactionsRef.current];
    await saveTransactions(profileRef.current.id, nextTransactions);
    transactionsRef.current = nextTransactions;
    setTransactions(nextTransactions);
    setJournalRevision((current) => current + 1);
    return transaction;
  };

  const addCustomerDebt = async (
    customerId: string,
    draft: { amount: number; currency: CurrencyCode; dueDate?: string },
  ): Promise<Debt> => {
    const storeId = profileRef.current.id;
    const debt = createDebt(storeId, customerId, draft);
    if (isFirebaseConfigured) {
      if (!activeSpaceId) {
        throw new Error('debtWorkspaceUnavailable');
      }
      await createDebtDocument(activeSpaceId, debt);
      setJournalRevision((current) => current + 1);
      return debt;
    }
    const currentDebts = await loadDebts(storeId);
    await saveDebts(storeId, [...currentDebts, debt]);
    setJournalRevision((current) => current + 1);
    return debt;
  };

  const settleCustomerDebt = async (customerId: string, draft: SettlementDraft): Promise<SettlementResult> => {
    await transactionLoadPromiseRef.current;
    if (isFirebaseConfigured) {
      throw new Error('cloudDebtSettlementUnsupported');
    }
    const result = await persistCustomerSettlement(profileRef.current.id, customerId, draft);
    const nextTransactions = await loadTransactions(profileRef.current.id);
    transactionsRef.current = nextTransactions;
    setTransactions(nextTransactions);
    setJournalRevision((current) => current + 1);
    return result;
  };

  const setAuthenticated = async (value: boolean) => {
    setLocalIsAuthenticatedState(value);
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
    setLocalIsAuthenticatedState(restored.authenticated);
    setJournalRevision((current) => current + 1);
    return restored;
  };

  const resetLocalSession = async () => {
    setLocalIsAuthenticatedState(false);
    await saveAuthenticatedState(false);
  };

  const signOut = async () => {
    if (isFirebaseConfigured) {
      await signOutFromFirebase();
      return;
    }
    await resetLocalSession();
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
      activeSpaceId,
      activeSpaceLoading,
      activeSpaceError,
      retryActiveSpace,
      initializationError,
      retryInitialization,
      spaceIdentity,
      cloudSpace,
      transactions,
      journalRevision,
      addTransaction,
      addCustomerDebt,
      settleCustomerDebt,
      saveProfile,
      toggleQuickCurrency,
      setAuthenticated,
      signOut,
      restoreFromLocalBackup,
      resetLocalSession,
    }),
    [
      activeSpaceError,
      activeSpaceId,
      activeSpaceLoading,
      cloudSpace,
      initializationError,
      isAuthenticated,
      isReady,
      journalRevision,
      language,
      profile,
      retryActiveSpace,
      retryInitialization,
      rtl,
      spaceIdentity,
      transactions,
    ],
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