import React, { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { CashTransactionDraft, Debt, StoreProfile, Transaction } from '@/types/business';
import { isRTL, normalizeLanguage, translate, type Language, type TranslationKey } from '@/constants/i18n';
import { DEFAULT_CURRENCY, normalizeCurrency, normalizeQuickCurrencies, type CurrencyCode } from '@/constants/currencies';
import { normalizeAccent, type AccentColor } from '@/constants/colors';
import { isFirebaseConfigured } from '@/services/firebase';
import { signOutFromFirebase, subscribeToFirebaseAuth } from '@/services/firebaseAuth';
import { discoverUserSpaces, validateUserSpaceMembership } from '@/services/firestore';
import { bootstrapPrimarySpace } from '@/services/trustedBootstrap';
import { createDebtDocument } from '@/services/debtFirestore';
import { subscribeToTransactions } from '@/services/transactionFirestore';
import { createTrustedCashTransaction } from '@/services/trustedTransactionFirestore';
import { settleCustomerDebtInCloud } from '@/services/settlementFirestore';
import { getOrCreateCloudStoreProfile, updateCloudStoreProfile } from '@/services/cloudStoreProfile';
import type { Space } from '@/types/space';
import {
  createCashTransaction,
  createDebt,
  type SettlementDraft,
  type SettlementResult,
} from '@/services/storage';

const defaultProfile: StoreProfile = {
  id: '',
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
  cloudSpace: Space | null;
  transactions: Transaction[];
  transactionsLoading: boolean;
  transactionsError: string | null;
  journalRevision: number;
  addTransaction: (draft: CashTransactionDraft) => Promise<Transaction>;
  addCustomerDebt: (customerId: string, draft: { amount: number; currency: CurrencyCode; dueDate?: string }) => Promise<Debt>;
  settleCustomerDebt: (customerId: string, draft: SettlementDraft) => Promise<SettlementResult>;
  saveProfile: (updates: Partial<StoreProfile>) => Promise<void>;
  toggleQuickCurrency: (code: CurrencyCode) => Promise<void>;
  signOut: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export async function initializePostAuthCloudSession(
  user: User,
  isCurrentTransition: () => boolean,
  callbacks: {
    onProfile: (profile: StoreProfile) => void;
    onReady: () => void;
    onError: (message: string | null) => void;
  },
  activeSpaceId: string | null = null,
): Promise<void> {
  if (!isCurrentTransition()) {
    return;
  }
  callbacks.onError(null);

  try {
    if (!isFirebaseConfigured) {
      throw new Error('firebaseNotConfigured');
    }
    if (!activeSpaceId) {
      throw new Error('cloudSpaceUnavailable');
    }
    const normalizedProfile = await getOrCreateCloudStoreProfile(activeSpaceId, defaultProfile);
    if (!isCurrentTransition()) {
      return;
    }

    callbacks.onProfile(normalizedProfile);
    callbacks.onReady();
  } catch (error) {
    if (!isCurrentTransition()) {
      return;
    }
    callbacks.onError(error instanceof Error ? error.message : 'postAuthInitializationFailed');
    callbacks.onReady();
  }
}

export function isFirebaseSessionAuthenticated(user: User | null): boolean {
  return user !== null;
}

export function clearFirebaseAuthSession(callbacks: {
  onFirebaseUser: (user: null) => void;
  onCloudSpace: (space: null) => void;
  onActiveSpaceId: (spaceId: null) => void;
  onInitializationError: (error: null) => void;
  onFirebaseReady: () => void;
}): void {
  callbacks.onFirebaseUser(null);
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
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [cloudSpace, setCloudSpace] = useState<Space | null>(null);
  const [activeSpaceId, setActiveSpaceIdState] = useState<string | null>(null);
  const [activeSpaceLoading, setActiveSpaceLoading] = useState<boolean>(isFirebaseConfigured);
  const [activeSpaceError, setActiveSpaceError] = useState<string | null>(null);
  const [isFirebaseReady, setIsFirebaseReady] = useState<boolean>(!isFirebaseConfigured);
  const [initializationError, setInitializationError] = useState<string | null>(isFirebaseConfigured ? null : 'firebaseNotConfigured');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState<boolean>(isFirebaseConfigured);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [journalRevision, setJournalRevision] = useState<number>(0);
  const profileRef = useRef<StoreProfile>(defaultProfile);
  const transactionsRef = useRef<Transaction[]>([]);
  const transactionLoadPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const profileWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const authTransitionRef = useRef<number>(0);
  const firebaseUserRef = useRef<User | null>(null);
  const initializationInFlightRef = useRef<number | null>(null);

  const startPostAuthCloudInitialization = React.useCallback((user: User, transition: number) => {
    if (initializationInFlightRef.current === transition) {
      return;
    }
    initializationInFlightRef.current = transition;
    setInitializationError(null);
    setIsFirebaseReady(false);
    setActiveSpaceLoading(true);
    setActiveSpaceError(null);
    setActiveSpaceIdState(null);

    void (async () => {
      let resolvedSpaceId: string | null = null;
      try {
        resolvedSpaceId = await resolveActiveSpaceForUser(user.uid);
        if (authTransitionRef.current !== transition || firebaseUserRef.current !== user) {
          return;
        }
        transactionsRef.current = [];
        transactionLoadPromiseRef.current = Promise.resolve();
        setTransactions([]);
        setActiveSpaceIdState(resolvedSpaceId);
        setActiveSpaceLoading(resolvedSpaceId === null);
      } catch (error) {
        if (authTransitionRef.current !== transition || firebaseUserRef.current !== user) {
          return;
        }
        setActiveSpaceIdState(null);
        setActiveSpaceError(error instanceof Error ? error.message : 'activeWorkspaceUnavailable');
        setActiveSpaceLoading(false);
      }
      await initializePostAuthCloudSession(
        user,
        () => authTransitionRef.current === transition && firebaseUserRef.current === user,
        {
          onProfile: (normalizedProfile) => {
            profileRef.current = normalizedProfile;
            setProfile(normalizedProfile);
          },
          onReady: () => setIsFirebaseReady(true),
          onError: setInitializationError,
        },
        resolvedSpaceId,
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
    startPostAuthCloudInitialization(user, authTransitionRef.current);
  }, [startPostAuthCloudInitialization]);
  const retryActiveSpace = retryInitialization;

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return;
    }

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
        setCloudSpace(null);
        setInitializationError(null);
        setIsFirebaseReady(false);
        setActiveSpaceIdState(null);
        setActiveSpaceLoading(Boolean(user));
        setActiveSpaceError(null);
        profileRef.current = defaultProfile;
        transactionsRef.current = [];
        transactionLoadPromiseRef.current = Promise.resolve();
         setTransactionsLoading(Boolean(user));
         setTransactionsError(null);
        setProfile(defaultProfile);
        setTransactions([]);
        if (!user) {
          initializationInFlightRef.current = null;
          setActiveSpaceLoading(false);
          setIsFirebaseReady(true);
          return;
        }

        startPostAuthCloudInitialization(user, transition);
      },
      () => {
        authTransitionRef.current += 1;
        firebaseUserRef.current = null;
        initializationInFlightRef.current = null;
        clearFirebaseAuthSession({
          onFirebaseUser: setFirebaseUser,
          onCloudSpace: setCloudSpace,
          onActiveSpaceId: setActiveSpaceIdState,
          onInitializationError: setInitializationError,
          onFirebaseReady: () => setIsFirebaseReady(true),
        });
        setActiveSpaceIdState(null);
        setActiveSpaceLoading(false);
        setActiveSpaceError(null);
        profileRef.current = defaultProfile;
        transactionsRef.current = [];
        transactionLoadPromiseRef.current = Promise.resolve();
         setTransactionsLoading(false);
         setTransactionsError(null);
        setProfile(defaultProfile);
        setTransactions([]);
      },
    );
  }, [startPostAuthCloudInitialization]);

  const isReady = isFirebaseReady;
  const isAuthenticated = isFirebaseConfigured && isFirebaseSessionAuthenticated(firebaseUser);

  useEffect(() => {
    let isActive = true;
    let unsubscribe: (() => void) | undefined;

    if (!isReady || initializationError || (isFirebaseConfigured && !activeSpaceId)) {
      setTransactionsLoading(isFirebaseConfigured && isAuthenticated);
      return () => {
        isActive = false;
      };
    }

    if (!isFirebaseConfigured) {
      transactionsRef.current = [];
      setTransactions([]);
      setTransactionsLoading(false);
      setTransactionsError('firebaseNotConfigured');
      transactionLoadPromiseRef.current = Promise.resolve();
      return () => {
        isActive = false;
      };
    }

    transactionsRef.current = [];
    setTransactions([]);
    setTransactionsLoading(true);
    setTransactionsError(null);

    if (isFirebaseConfigured) {
      if (!isAuthenticated || !activeSpaceId) {
        transactionLoadPromiseRef.current = Promise.resolve();
        setTransactionsLoading(false);
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
            setTransactionsLoading(false);
            setTransactionsError(null);
            if (!hasReceivedInitialSnapshot) {
              hasReceivedInitialSnapshot = true;
              resolve();
            }
          },
          (error) => {
            if (!isActive) {
              return;
            }
            setTransactionsLoading(false);
            setTransactionsError(error.message);
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

    transactionLoadPromiseRef.current = Promise.resolve();
    setTransactionsLoading(false);
    setTransactionsError('firebaseNotConfigured');
    return () => {
      isActive = false;
    };
  }, [activeSpaceId, initializationError, isAuthenticated, isReady, profile.id]);

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
    const queuedWrite = profileWriteQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (isFirebaseConfigured) {
          if (!activeSpaceId) {
            throw new Error('cloudSpaceUnavailable');
          }
          const savedProfile = await updateCloudStoreProfile(activeSpaceId, nextProfile);
          if (profileRef.current === nextProfile) {
            profileRef.current = savedProfile;
            setProfile(savedProfile);
          }
          return;
        }
        throw new Error('firebaseNotConfigured');
      });
    profileWriteQueueRef.current = queuedWrite;
    try {
      await queuedWrite;
    } catch (error) {
      if (profileRef.current === nextProfile) {
        profileRef.current = currentProfile;
        setProfile(currentProfile);
      }
      throw error;
    }
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
    if (!isFirebaseConfigured) {
      throw new Error('firebaseNotConfigured');
    }
    if (!activeSpaceId) {
      throw new Error('transactionWorkspaceUnavailable');
    }
    const transaction = createCashTransaction(profileRef.current.id, draft);
    await createTrustedCashTransaction(activeSpaceId, transaction);
    const nextTransactions = [transaction, ...transactionsRef.current];
    transactionsRef.current = nextTransactions;
    setTransactions(nextTransactions);
    setJournalRevision((current) => current + 1);
    return transaction;
  };

  const addCustomerDebt = async (
    customerId: string,
    draft: { amount: number; currency: CurrencyCode; dueDate?: string },
  ): Promise<Debt> => {
    if (!isFirebaseConfigured) {
      throw new Error('firebaseNotConfigured');
    }
    if (!activeSpaceId) {
      throw new Error('debtWorkspaceUnavailable');
    }
    const debt = createDebt(profileRef.current.id, customerId, draft);
    await createDebtDocument(activeSpaceId, debt);
    setJournalRevision((current) => current + 1);
    return debt;
  };

  const settleCustomerDebt = async (customerId: string, draft: SettlementDraft): Promise<SettlementResult> => {
    await transactionLoadPromiseRef.current;
    if (!isFirebaseConfigured) {
      throw new Error('firebaseNotConfigured');
    }
    if (!activeSpaceId) {
      throw new Error('debtWorkspaceUnavailable');
    }
    const result = await settleCustomerDebtInCloud(
      activeSpaceId,
      profileRef.current.id,
      customerId,
      draft,
    );
    const nextTransactions = [result.transaction, ...transactionsRef.current.filter(
      (transaction) => transaction.id !== result.transaction.id,
    )].sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
    transactionsRef.current = nextTransactions;
    setTransactions(nextTransactions);
    setJournalRevision((current) => current + 1);
    return result;
  };

  const signOut = async () => {
    if (!isFirebaseConfigured) throw new Error('firebaseNotConfigured');
    await signOutFromFirebase();
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
      cloudSpace,
      transactions,
       transactionsLoading,
       transactionsError,
      journalRevision,
      addTransaction,
      addCustomerDebt,
      settleCustomerDebt,
      saveProfile,
      toggleQuickCurrency,
      signOut,
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
      transactions,
       transactionsError,
       transactionsLoading,
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