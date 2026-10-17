import type { Customer, Debt, DailyArchive, Payment, Transaction } from '@/types/business';
import {
  buildDailyJournalEvents,
  getLocalDateKey,
  type DailyJournalEvent,
} from '@/services/storage';
import { loadCloudDailyArchives } from '@/services/cloudDailyArchives';

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
  spaceId: string,
  storeId: string,
  sources: DailyJournalSources,
  now: Date = new Date(),
): Promise<DailyJournalEvent[]> {
  const cloudArchives = await loadCloudDailyArchives(spaceId, storeId);
  return projectDailyJournalEvents(storeId, sources, cloudArchives, now);
}