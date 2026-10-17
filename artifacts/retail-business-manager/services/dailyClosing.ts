import { closeCloudDailyArchive } from '@/services/cloudDailyArchives';

export type DailyClosingStatus = 'created';

export async function runDailyClosing(
  spaceId: string,
  storeId: string,
): Promise<DailyClosingStatus> {
  if (!spaceId.trim() || !storeId.trim()) throw new Error('archiveWorkspaceUnavailable');
  await closeCloudDailyArchive(spaceId, storeId);
  return 'created';
}
