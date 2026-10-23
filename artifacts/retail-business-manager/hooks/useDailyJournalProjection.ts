import { useMemo } from 'react';
import { useCustomers } from '@/context/CustomerContext';
import { useDebts } from '@/context/DebtContext';
import { usePayments } from '@/context/PaymentContext';
import { useStore } from '@/context/StoreContext';
import { isFirebaseConfigured } from '@/services/firebase';
import { type DailyJournalEvent } from '@/services/storage';
import { projectDailyJournalEvents } from '@/services/dailyJournalProjection';
import { useMerchantJournal } from './useMerchantJournal';
import { useJournalArchives } from './useJournalArchives';

interface DailyJournalProjection { events: DailyJournalEvent[]; isLoading: boolean; error: string | null; }

export function useDailyJournalProjection(refreshToken = 0): DailyJournalProjection {
  const store = useStore();
  const customers = useCustomers(), debts = useDebts(), payments = usePayments();
  const merchant = useMerchantJournal(refreshToken);
  const enabled = Boolean(isFirebaseConfigured && store.isReady && store.isAuthenticated &&
    !store.activeSpaceLoading && !store.activeSpaceError && !store.initializationError &&
    store.activeSpaceId && store.workspaceRole && store.profile.id && merchant.window);
  const archives = useJournalArchives(store.activeSpaceId, store.profile.id,
    JSON.stringify([store.sessionKey, store.workspaceRole]), enabled, refreshToken);

  return useMemo(() => {
    if (!isFirebaseConfigured) return { events: [], isLoading: false, error: 'firebaseNotConfigured' };
    const error = store.initializationError ?? store.activeSpaceError ?? store.transactionsError ??
      customers.error ?? debts.error ?? payments.error ?? merchant.error ?? archives.error;
    if (error) return { events: [], isLoading: false, error };
    if (!enabled || store.transactionsLoading || customers.isLoading || debts.isLoading || payments.isLoading ||
      merchant.loading || archives.loading || customers.canonicalSpaceId !== store.activeSpaceId ||
      debts.canonicalSpaceId !== store.activeSpaceId || payments.canonicalSpaceId !== store.activeSpaceId) {
      return { events: [], isLoading: true, error: null };
    }
    try {
      return { events: projectDailyJournalEvents(store.profile.id, {
        transactions: store.transactions, debts: debts.debts, payments: payments.payments, customers: customers.customers,
        merchantOperations: merchant.operations, spaceId: store.activeSpaceId!,
      }, archives.archives, new Date(), merchant.window), isLoading: false, error: null };
    } catch (caught) {
      return { events: [], isLoading: false, error: caught instanceof Error ? caught.message : 'journalLoadFailed' };
    }
  }, [enabled, store.initializationError, store.activeSpaceError, store.transactionsError, store.transactionsLoading,
    store.activeSpaceId, store.profile.id, store.transactions, customers.error, customers.isLoading, customers.canonicalSpaceId,
    customers.customers, debts.error, debts.isLoading, debts.canonicalSpaceId, debts.debts, payments.error, payments.isLoading,
    payments.canonicalSpaceId, payments.payments, merchant.error, merchant.loading, merchant.operations, merchant.key,
    archives.error, archives.loading, archives.archives]);
}
