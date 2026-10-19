import React, { createContext, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import type { Payment } from '@/types/business';
import { getFirebaseAuth, isFirebaseConfigured } from '@/services/firebase';
import {
  createPaymentDocument,
  subscribeToPayments,
} from '@/services/paymentFirestore';
import { useStore } from '@/context/StoreContext';

interface PaymentContextValue {
  payments: Payment[];
  canonicalSpaceId: string | null;
  isLoading: boolean;
  error: string | null;
  retryPayments: () => void;
  createPayment: (payment: Payment) => Promise<void>;
}

const PaymentContext = createContext<PaymentContextValue | null>(null);

export function PaymentProvider({ children }: { children: ReactNode }) {
  const {
    profile,
    isAuthenticated,
    activeSpaceId,
    activeSpaceLoading,
    activeSpaceError,
    retryActiveSpace,
    canWriteBusiness,
    assertBusinessAccess,
  } = useStore();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [canonicalSpaceId, setCanonicalSpaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const firebaseUid = isFirebaseConfigured && isAuthenticated
    ? getFirebaseAuth().currentUser?.uid ?? null
    : null;

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    setPayments([]);
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
        setError('paymentWorkspaceUnavailable');
      }
      return () => {
        active = false;
      };
    }

    const spaceId = activeSpaceId;
    setCanonicalSpaceId(spaceId);
    setIsLoading(true);
    unsubscribe = subscribeToPayments(
      spaceId,
      (nextPayments) => {
        if (!active) {
          return;
        }
        setPayments(nextPayments);
        setIsLoading(false);
        setError(null);
      },
      (listenerError) => {
        if (!active) {
          return;
        }
        // Firestore listeners terminate after an error. Clear the previous
        // workspace snapshot so it cannot be mistaken for current cloud data.
        setPayments([]);
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

  const retryPayments = useCallback(() => {
    retryActiveSpace();
  }, [retryActiveSpace]);

  const createPayment = useCallback(async (payment: Payment) => {
    assertBusinessAccess(canonicalSpaceId);
    if (isFirebaseConfigured) {
      if (!canWriteBusiness || !canonicalSpaceId || canonicalSpaceId !== activeSpaceId) {
        throw new Error('paymentWorkspaceUnavailable');
      }
      await createPaymentDocument(canonicalSpaceId, payment);
      return;
    }

    throw new Error('firebaseNotConfigured');
  }, [canonicalSpaceId, profile.id, activeSpaceId, canWriteBusiness, assertBusinessAccess]);

  const value = useMemo(
    () => ({
      payments,
      canonicalSpaceId,
      isLoading,
      error,
      retryPayments,
      createPayment,
    }),
    [canonicalSpaceId, createPayment, error, isLoading, payments, retryPayments],
  );

  return <PaymentContext.Provider value={value}>{children}</PaymentContext.Provider>;
}

export function usePayments(): PaymentContextValue {
  const context = React.useContext(PaymentContext);
  if (!context) {
    throw new Error('usePayments must be used within a PaymentProvider');
  }
  return context;
}
