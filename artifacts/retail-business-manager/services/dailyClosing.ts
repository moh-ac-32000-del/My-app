import { closeDailyArchive, type DailyArchiveCloseResult } from '@/services/storage';

export type DailyClosingStatus = 'created' | 'alreadyClosed';

type CloseDailyArchive = (storeId: string) => Promise<DailyArchiveCloseResult>;

export async function runDailyClosing(
  storeId: string,
  closeArchive: CloseDailyArchive = closeDailyArchive,
): Promise<DailyClosingStatus> {
  const result = await closeArchive(storeId);
  return result.created ? 'created' : 'alreadyClosed';
}