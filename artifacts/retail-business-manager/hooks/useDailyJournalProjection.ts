import { useEffect, useState } from 'react';
import { useCustomers } from '@/context/CustomerContext';
import { useDebts } from '@/context/DebtContext';
import { usePayments } from '@/context/PaymentContext';
import { useStore } from '@/context/StoreContext';
import { isFirebaseConfigured } from '@/services/firebase';
import { loadDailyJournalEvents, type DailyJournalEvent } from '@/services/storage';
import { projectCloudDailyJournalEvents } from '@/services/dailyJournalProjection';

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
    journalRevision,
  } = useStore();
  const customers = useCustomers();
  const debts = useDebts();
  const payments = usePayments();
  const [events, setEvents] = useState<DailyJournalEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!isReady) {
      setEvents([]);
      setIsLoading(true);
      setError(null);
      return () => {
        active = false;
      };
    }

    if (!isFirebaseConfigured) {
      setIsLoading(true);
      setError(null);
      void loadDailyJournalEvents(profile.id).then((localEvents) => {
        if (!active) {
          return;
        }
        setEvents(localEvents);
        setIsLoading(false);
      }).catch((loadError) => {
        if (!active) {
          return;
        }
        setEvents([]);
        setIsLoading(false);
        setError(loadError instanceof Error ? loadError.message : 'journalLoadFailed');
      });
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
    );

    if (!allSourcesReady) {
      setEvents([]);
      setIsLoading(true);
      setError(null);
      return () => {
        active = false;
      };
    }

    setIsLoading(true);
    setError(null);
    void projectCloudDailyJournalEvents(profile.id, {
      transactions,
      debts: debts.debts,
      payments: payments.payments,
      customers: customers.customers,
    }).then((cloudEvents) => {
      if (!active) {
        return;
      }
      setEvents(cloudEvents);
      setIsLoading(false);
    }).catch((projectionError) => {
      if (!active) {
        return;
      }
      setEvents([]);
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
    journalRevision,
    payments.canonicalSpaceId,
    payments.error,
    payments.isLoading,
    payments.payments,
    profile.id,
    refreshToken,
    transactions,
    transactionsError,
    transactionsLoading,
  ]);

  return { events, isLoading, error };
}