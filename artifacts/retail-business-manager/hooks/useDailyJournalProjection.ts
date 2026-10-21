import { useEffect, useState } from 'react';
import { useCustomers } from '@/context/CustomerContext';
import { useDebts } from '@/context/DebtContext';
import { usePayments } from '@/context/PaymentContext';
import { useStore } from '@/context/StoreContext';
import { isFirebaseConfigured } from '@/services/firebase';
import { type DailyJournalEvent } from '@/services/storage';
import { projectCloudDailyJournalEvents } from '@/services/dailyJournalProjection';
import { useMerchantJournal } from './useMerchantJournal';

interface DailyJournalProjection {
  events: DailyJournalEvent[];
  isLoading: boolean;
  error: string | null;
}

export function useDailyJournalProjection(refreshToken = 0): DailyJournalProjection {
  const {
    profile,
    isAuthenticated,
    isReady,
    activeSpaceId,
    activeSpaceLoading,
    activeSpaceError,
    initializationError,
    transactions,
    transactionsLoading,
    transactionsError,
    sessionKey,
    workspaceRole,
  } = useStore();
  const merchant = useMerchantJournal(refreshToken);
  const sourceKey = JSON.stringify([sessionKey, activeSpaceId, workspaceRole, profile.id, merchant.key]);
  const [resultKey, setResultKey] = useState('');
  const customers = useCustomers();
  const debts = useDebts();
  const payments = usePayments();
  const [events, setEvents] = useState<DailyJournalEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setResultKey(sourceKey);

    if (!isReady) {
      setEvents([]);
      setIsLoading(true);
      setError(null);
      return () => {
        active = false;
      };
    }

    if (!isFirebaseConfigured) {
      setEvents([]);
      setIsLoading(false);
      setError('firebaseNotConfigured');
      return () => {
        active = false;
      };
    }

    if (!isAuthenticated) {
      setEvents([]);
      setIsLoading(false);
      setError(null);
      return () => {
        active = false;
      };
    }

    const sourceError = initializationError
      ?? activeSpaceError
      ?? transactionsError
      ?? customers.error
      ?? debts.error
      ?? payments.error;
    if (sourceError) {
      setEvents([]);
      setIsLoading(false);
      setError(sourceError);
      return () => {
        active = false;
      };
    }

    const allSourcesReady = Boolean(
      activeSpaceId
      && !activeSpaceLoading
      && !transactionsLoading
      && !customers.isLoading
      && !debts.isLoading
      && !payments.isLoading
      && customers.canonicalSpaceId === activeSpaceId
      && debts.canonicalSpaceId === activeSpaceId
      && payments.canonicalSpaceId === activeSpaceId,
      // Merchant links must be complete before combining independent provider observations.
    );

    if (!allSourcesReady || merchant.loading) {
      setEvents([]);
      setIsLoading(true);
      setError(null);
      return () => {
        active = false;
      };
    }

    setIsLoading(true);
    setError(null);
    if (merchant.error) {
      setEvents([]); setIsLoading(false); setError(merchant.error); setResultKey(sourceKey);
      return () => { active = false; };
    }
    if (!activeSpaceId) throw new Error('journalWorkspaceUnavailable');
    void projectCloudDailyJournalEvents(activeSpaceId, profile.id, {
      transactions,
      debts: debts.debts,
      payments: payments.payments,
      customers: customers.customers,
      merchantOperations: merchant.operations,
      spaceId: activeSpaceId,
    }).then((cloudEvents) => {
      if (!active) {
        return;
      }
      setEvents(cloudEvents);
      setResultKey(sourceKey);
      setIsLoading(false);
    }).catch((projectionError) => {
      if (!active) {
        return;
      }
      setEvents([]);
      setResultKey(sourceKey);
      setIsLoading(false);
      setError(projectionError instanceof Error ? projectionError.message : 'journalLoadFailed');
    });

    return () => {
      active = false;
    };
  }, [
    activeSpaceError,
    activeSpaceId,
    activeSpaceLoading,
    customers.canonicalSpaceId,
    customers.customers,
    customers.error,
    customers.isLoading,
    debts.canonicalSpaceId,
    debts.debts,
    debts.error,
    debts.isLoading,
    initializationError,
    isAuthenticated,
    isReady,
    payments.canonicalSpaceId,
    payments.error,
    payments.isLoading,
    payments.payments,
    profile.id,
    refreshToken,
    transactions,
    transactionsError,
    transactionsLoading,
    merchant.operations,
    merchant.loading,
    merchant.error,
    sourceKey,
  ]);

  const visibleError = initializationError ?? activeSpaceError ?? transactionsError ?? customers.error ?? debts.error ?? payments.error ?? merchant.error;
  if (visibleError) return { events: [], isLoading: false, error: visibleError };
  if (!isReady || !isAuthenticated || activeSpaceLoading || transactionsLoading || customers.isLoading || debts.isLoading
    || payments.isLoading || merchant.loading || customers.canonicalSpaceId !== activeSpaceId
    || debts.canonicalSpaceId !== activeSpaceId || payments.canonicalSpaceId !== activeSpaceId
    || resultKey !== sourceKey) return { events: [], isLoading: true, error: null };
  return { events, isLoading, error };
}
