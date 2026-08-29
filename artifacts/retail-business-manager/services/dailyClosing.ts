import { closeDailyArchive, type DailyArchiveCloseResult } from '@/services/storage';

export type DailyClosingStatus = 'created';

type CloseDailyArchive = (storeId: string) => Promise<DailyArchiveCloseResult>;

export async function runDailyClosing(
  storeId: string,
  closeArchive: CloseDailyArchive = closeDailyArchive,
): Promise<DailyClosingStatus> {
  await closeArchive(storeId);
  return 'created';
}