import type { Customer, Debt, DailyArchive, Payment, Transaction } from '@/types/business';
import {
  buildDailyJournalEvents,
  getLocalDateKey,
  loadDailyArchives,
  type DailyJournalEvent,
} from '@/services/storage';

export interface DailyJournalSources {
  transactions: Transaction[];
  debts: Debt[];
  payments: Payment[];
  customers: Customer[];
}

export function projectDailyJournalEvents(
  storeId: string,
  sources: DailyJournalSources,
  archives: DailyArchive[],
  now: Date = new Date(),
): DailyJournalEvent[] {
  const archivedEventIds = new Set(
    archives
      .filter((archive) => archive.date === getLocalDateKey(now))
      .flatMap((archive) => archive.snapshot.map((event) => event.id)),
  );

  return buildDailyJournalEvents(
    storeId,
    sources.transactions,
    sources.debts,
    sources.payments,
    sources.customers,
    now,
  ).filter((event) => !archivedEventIds.has(event.id));
}

export async function projectCloudDailyJournalEvents(
  storeId: string,
  sources: DailyJournalSources,
  now: Date = new Date(),
): Promise<DailyJournalEvent[]> {
  const localArchives = await loadDailyArchives(storeId);
  return projectDailyJournalEvents(storeId, sources, localArchives, now);
}