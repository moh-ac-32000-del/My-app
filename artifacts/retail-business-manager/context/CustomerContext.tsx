import React, { createContext, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import type { Customer } from '@/types/business';
import { getFirebaseAuth, isFirebaseConfigured } from '@/services/firebase';
import {
  createCustomerDocument,
  softDeleteCustomerDocument,
  subscribeToCustomers,
  updateCustomerDocument,
} from '@/services/customerFirestore';
import { useStore } from '@/context/StoreContext';

interface CustomerContextValue {
  customers: Customer[];
  canonicalSpaceId: string | null;
  isLoading: boolean;
  error: string | null;
  retryCustomers: () => void;
  createCustomer: (customer: Customer) => Promise<void>;
  updateCustomer: (customer: Customer) => Promise<void>;
  softDeleteCustomer: (customer: Customer) => Promise<void>;
}

const CustomerContext = createContext<CustomerContextValue | null>(null);

export function CustomerProvider({ children }: { children: ReactNode }) {
  const {
    isAuthenticated,
    activeSpaceId,
    activeSpaceLoading,
    activeSpaceError,
    retryActiveSpace,
  } = useStore();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [canonicalSpaceId, setCanonicalSpaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const firebaseUid = isFirebaseConfigured && isAuthenticated
    ? getFirebaseAuth().currentUser?.uid ?? null
    : null;

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    setCustomers([]);
    setCanonicalSpaceId(null);
    setError(null);

    if (!isFirebaseConfigured) {
      setIsLoading(false);
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
      return () => {
        active = false;
      };
    }

    setCanonicalSpaceId(activeSpaceId);
    setIsLoading(true);
    unsubscribe = subscribeToCustomers(
      activeSpaceId,
      (nextCustomers) => {
        if (!active) {
          return;
        }
        setCustomers(nextCustomers);
        setIsLoading(false);
        setError(null);
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
    retryActiveSpace,
  ]);

  const retryCustomers = useCallback(() => {
    retryActiveSpace();
  }, [retryActiveSpace]);

  const createCustomer = useCallback(async (customer: Customer) => {
    if (!canonicalSpaceId) {
      throw new Error('customerWorkspaceUnavailable');
    }
    await createCustomerDocument(canonicalSpaceId, customer);
  }, [canonicalSpaceId]);

  const updateCustomer = useCallback(async (customer: Customer) => {
    if (!canonicalSpaceId) {
      throw new Error('customerWorkspaceUnavailable');
    }
    await updateCustomerDocument(canonicalSpaceId, customer);
  }, [canonicalSpaceId]);

  const softDeleteCustomer = useCallback(async (customer: Customer) => {
    if (!canonicalSpaceId) {
      throw new Error('customerWorkspaceUnavailable');
    }
    await softDeleteCustomerDocument(canonicalSpaceId, customer);
  }, [canonicalSpaceId]);

  const value = useMemo(
    () => ({
      customers,
      canonicalSpaceId,
      isLoading,
      error,
      retryCustomers,
      createCustomer,
      updateCustomer,
      softDeleteCustomer,
    }),
    [
      canonicalSpaceId,
      createCustomer,
      customers,
      error,
      isLoading,
      retryCustomers,
      softDeleteCustomer,
      updateCustomer,
    ],
  );

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}

export function useCustomers(): CustomerContextValue {
  const context = React.useContext(CustomerContext);
  if (!context) {
    throw new Error('useCustomers must be used within a CustomerProvider');
  }
  return context;
}