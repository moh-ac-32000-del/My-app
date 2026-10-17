import React, { createContext, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import type { Debt } from '@/types/business';
import { getFirebaseAuth, isFirebaseConfigured } from '@/services/firebase';
import {
  subscribeToDebts,
  updateDebtDocument,
} from '@/services/debtFirestore';
import { useStore } from '@/context/StoreContext';

interface DebtContextValue {
  debts: Debt[];
  canonicalSpaceId: string | null;
  isLoading: boolean;
  error: string | null;
  retryDebts: () => void;
  updateDebt: (debt: Debt) => Promise<void>;
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
      setIsLoading(false);
      setError('firebaseNotConfigured');
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
      },
      (listenerError) => {
        if (!active) {
          return;
        }
        // Firestore listeners terminate after an error. Clear the previous
        // workspace snapshot so it cannot be mistaken for current cloud data.
        setDebts([]);
        setCanonicalSpaceId(null);
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
      return;
    }
    throw new Error('localDebtUpdateUnsupported');
  }, [canonicalSpaceId, profile.id]);

  const value = useMemo(
    () => ({
      debts,
      canonicalSpaceId,
      isLoading,
      error,
      retryDebts,
      updateDebt,
    }),
    [canonicalSpaceId, debts, error, isLoading, retryDebts, updateDebt],
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