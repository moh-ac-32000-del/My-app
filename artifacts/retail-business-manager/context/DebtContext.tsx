import React, { createContext, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import type { Debt } from '@/types/business';
import { getFirebaseAuth, isFirebaseConfigured } from '@/services/firebase';
import {
  deleteDebtDocument,
  reconcileCloudDebtReminders,
  subscribeToDebts,
  updateDebtDocument,
} from '@/services/debtFirestore';
import { loadDebts } from '@/services/storage';
import { useStore } from '@/context/StoreContext';

interface DebtContextValue {
  debts: Debt[];
  canonicalSpaceId: string | null;
  isLoading: boolean;
  error: string | null;
  retryDebts: () => void;
  updateDebt: (debt: Debt) => Promise<void>;
  deleteDebt: (debtId: string) => Promise<void>;
}

const DebtContext = createContext<DebtContextValue | null>(null);

export function DebtProvider({ children }: { children: ReactNode }) {
  const {
    profile,
    isAuthenticated,
    activeSpaceId,
    activeSpaceLoading,
    activeSpaceError,
    retryActiveSpace,
  } = useStore();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [canonicalSpaceId, setCanonicalSpaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const firebaseUid = isFirebaseConfigured && isAuthenticated
    ? getFirebaseAuth().currentUser?.uid ?? null
    : null;

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    setDebts([]);
    setCanonicalSpaceId(null);
    setError(null);

    if (!isFirebaseConfigured) {
      setIsLoading(true);
      void loadDebts(profile.id).then((localDebts) => {
        if (!active) {
          return;
        }
        setDebts(localDebts);
        setIsLoading(false);
      }).catch((loadError) => {
        if (!active) {
          return;
        }
        setIsLoading(false);
        setError(loadError instanceof Error ? loadError.message : 'debtLoadFailed');
      });
      return () => {
        active = false;
      };
    }

    if (!isAuthenticated || !firebaseUid) {
      setIsLoading(false);
      return () => {
        active = false;
      };
    }

    if (activeSpaceError) {
      setIsLoading(false);
      setError(activeSpaceError);
      return () => {
        active = false;
      };
    }

    if (activeSpaceLoading || !activeSpaceId) {
      setIsLoading(true);
      if (!activeSpaceLoading && !activeSpaceId) {
        setIsLoading(false);
        setError('debtWorkspaceUnavailable');
      }
      return () => {
        active = false;
      };
    }

    const spaceId = activeSpaceId;
    setCanonicalSpaceId(spaceId);
    setIsLoading(true);
    unsubscribe = subscribeToDebts(
      spaceId,
      (nextDebts) => {
        if (!active) {
          return;
        }
        setDebts(nextDebts);
        setIsLoading(false);
        setError(null);
        void reconcileCloudDebtReminders(spaceId, profile.id, nextDebts).catch((reconcileError) => {
          if (active) {
            setError(reconcileError instanceof Error ? reconcileError.message : 'debtReminderReconciliationFailed');
          }
        });
      },
      (listenerError) => {
        if (!active) {
          return;
        }
        setIsLoading(false);
        setError(listenerError.message);
      },
    );

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [
    activeSpaceError,
    activeSpaceId,
    activeSpaceLoading,
    firebaseUid,
    isAuthenticated,
    profile.id,
  ]);

  const retryDebts = useCallback(() => {
    retryActiveSpace();
  }, [retryActiveSpace]);

  const updateDebt = useCallback(async (debt: Debt) => {
    if (isFirebaseConfigured) {
      if (!canonicalSpaceId) {
        throw new Error('debtWorkspaceUnavailable');
      }
      await updateDebtDocument(canonicalSpaceId, debt);
      await reconcileCloudDebtReminders(canonicalSpaceId, profile.id);
      return;
    }
    throw new Error('localDebtUpdateUnsupported');
  }, [canonicalSpaceId, profile.id]);

  const deleteDebt = useCallback(async (debtId: string) => {
    if (isFirebaseConfigured) {
      if (!canonicalSpaceId) {
        throw new Error('debtWorkspaceUnavailable');
      }
      await deleteDebtDocument(canonicalSpaceId, debtId);
      await reconcileCloudDebtReminders(canonicalSpaceId, profile.id);
      return;
    }
    throw new Error('localDebtDeleteUnsupported');
  }, [canonicalSpaceId, profile.id]);

  const value = useMemo(
    () => ({
      debts,
      canonicalSpaceId,
      isLoading,
      error,
      retryDebts,
      updateDebt,
      deleteDebt,
    }),
    [canonicalSpaceId, debts, deleteDebt, error, isLoading, retryDebts, updateDebt],
  );

  return <DebtContext.Provider value={value}>{children}</DebtContext.Provider>;
}

export function useDebts(): DebtContextValue {
  const context = React.useContext(DebtContext);
  if (!context) {
    throw new Error('useDebts must be used within a DebtProvider');
  }
  return context;
}