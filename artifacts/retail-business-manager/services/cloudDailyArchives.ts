import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { getFirebaseApp, isFirebaseConfigured } from '@/services/firebase';
import type { DailyArchive } from '@/types/business';
import { isCurrencyCode } from '@/constants/currencies';

interface DailyArchiveCommandResponse {
  archives: Array<DailyArchive & { workspaceId: string }>;
  created?: DailyArchive & { workspaceId: string };
  processedAt: string;
}

let functions: Functions | null = null;

export async function loadCloudDailyArchives(spaceId: string, storeId: string): Promise<DailyArchive[]> {
  const data = await send({ action: 'list', spaceId, storeId });
  return data.archives;
}

export async function closeCloudDailyArchive(
  spaceId: string,
  storeId: string,
  now = new Date(),
): Promise<DailyArchive> {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const date = [
    start.getFullYear(),
    String(start.getMonth() + 1).padStart(2, '0'),
    String(start.getDate()).padStart(2, '0'),
  ].join('-');
  const data = await send({
    action: 'close',
    spaceId,
    storeId,
    date,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  });
  if (!data.created) throw new Error('cloudArchiveNotCreated');
  return data.created;
}

async function send(input: {
  action: 'list' | 'close';
  spaceId: string;
  storeId: string;
  date?: string;
  startAt?: string;
  endAt?: string;
}): Promise<DailyArchiveCommandResponse> {
  if (!isFirebaseConfigured) throw new Error('firebaseNotConfigured');
  const spaceId = input.spaceId.trim();
  const storeId = input.storeId.trim();
  if (!spaceId || spaceId.includes('/') || !storeId || storeId.includes('/')) {
    throw new Error('archiveScopeInvalid');
  }
  const callable = httpsCallable<typeof input, DailyArchiveCommandResponse>(
    getFunctionsInstance(),
    'dailyArchiveCommand',
  );
  const result = await callable({ ...input, spaceId, storeId });
  const data = result.data;
  if (!data || !Array.isArray(data.archives)
    || typeof data.processedAt !== 'string'
    || !Number.isFinite(Date.parse(data.processedAt))
    || !data.archives.every((archive) => isValidArchive(archive, spaceId, storeId))
    || (data.created !== undefined && !isValidArchive(data.created, spaceId, storeId))) {
    throw new Error('invalidCloudDailyArchiveResponse');
  }
  return data;
}

function isValidArchive(value: unknown, spaceId: string, storeId: string): value is DailyArchive & { workspaceId: string } {
  if (typeof value !== 'object' || value === null) return false;
  const archive = value as Record<string, unknown>;
  return typeof archive.id === 'string'
    && archive.storeId === storeId
    && archive.workspaceId === spaceId
    && typeof archive.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(archive.date)
    && typeof archive.closedAt === 'string'
    && Number.isFinite(Date.parse(archive.closedAt))
    && typeof archive.closingNumber === 'number'
    && Number.isInteger(archive.closingNumber)
    && validClosingBalances(archive.closingCashBalances)
    && Array.isArray(archive.snapshot)
    && archive.snapshot.every((event) => typeof event === 'object' && event !== null);
}

function validClosingBalances(value: unknown): boolean {
  if (value === undefined) return true; // Legacy archives remain readable.
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  return value.every((entry) => {
    if (typeof entry !== 'object' || entry === null || !isCurrencyCode(entry.currency)
      || typeof entry.amount !== 'number' || !Number.isFinite(entry.amount) || seen.has(entry.currency)) return false;
    seen.add(entry.currency);
    return true;
  });
}

function getFunctionsInstance(): Functions {
  if (!functions) functions = getFunctions(getFirebaseApp());
  return functions;
}
