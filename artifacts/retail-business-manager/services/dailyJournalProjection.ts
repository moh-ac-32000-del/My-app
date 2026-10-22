import type { Customer, Debt, DailyArchive, Payment, Transaction } from '@/types/business';
import { buildDailyJournalEvents, getLocalDateKey, type DailyJournalEvent } from '@/services/storage';
import { loadCloudDailyArchives } from '@/services/cloudDailyArchives';
import type { MerchantOperation } from '@/types/merchant';
import { mergeMerchantJournal } from '@/data/merchantJournal';
import type { FinancialWindow } from '@/data/automaticClosing';

export interface DailyJournalSources {
  transactions: Transaction[];
  debts: Debt[];
  payments: Payment[];
  customers: Customer[];
  merchantOperations?: MerchantOperation[];
  spaceId?: string;
}

export function projectDailyJournalEvents(
  storeId: string,
  sources: DailyJournalSources,
  archives: DailyArchive[],
  now: Date = new Date(),
  window?: FinancialWindow,
): DailyJournalEvent[] {
  const archivedEventIds = new Set(
    archives
      .filter((archive) => archive.date === (window?.date ?? getLocalDateKey(now)))
      .flatMap((archive) => archive.snapshot.map((event) => event.id)),
  );

  const legacy = buildDailyJournalEvents(
    storeId,
    sources.transactions,
    sources.debts,
    sources.payments,
    sources.customers,
    now,
    window,
  );
  if (sources.merchantOperations !== undefined) {
    if (!sources.spaceId) throw new Error('journalWorkspaceUnavailable');
    const sameDay = (value: string) =>
      window
        ? value >= window.startAt && value < window.endAt
        : getLocalDateKey(new Date(value)) === getLocalDateKey(now);
    return mergeMerchantJournal(sources.spaceId, storeId, sources.merchantOperations, legacy, {
      transactions: sources.transactions.filter((row) => row.storeId === storeId && sameDay(row.createdAt)),
      debts: sources.debts.filter((row) => row.storeId === storeId && sameDay(row.createdAt)),
      payments: sources.payments.filter((row) => row.storeId === storeId && sameDay(row.paidAt)),
    }).filter((event) => !archivedEventIds.has(event.id));
  }
  return legacy.filter((event) => !archivedEventIds.has(event.id));
}

export async function projectCloudDailyJournalEvents(
  spaceId: string,
  storeId: string,
  sources: DailyJournalSources,
  now: Date = new Date(),
  window?: FinancialWindow,
): Promise<DailyJournalEvent[]> {
  const cloudArchives = await loadCloudDailyArchives(spaceId, storeId);
  return projectDailyJournalEvents(storeId, sources, cloudArchives, now, window);
}
