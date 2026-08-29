import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreProfile } from '@/types/business';

const storageValues = vi.hoisted(() => new Map<string, string>());
const writeFailure = vi.hoisted(() => ({ key: null as string | null, remaining: 0 }));
const shareAsyncMock = vi.hoisted(() => vi.fn());
const sharingAvailableMock = vi.hoisted(() => vi.fn(async () => true));
const fileSystemMock = vi.hoisted(() => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
  EncodingType: { UTF8: 'utf8' },
  writeAsStringAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storageValues.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      if (writeFailure.key === key && writeFailure.remaining > 0) {
        writeFailure.remaining -= 1;
        throw new Error('simulatedWriteFailure');
      }
      storageValues.set(key, value);
    },
    removeItem: async (key: string) => {
      storageValues.delete(key);
    },
    getAllKeys: async () => Array.from(storageValues.keys()),
  },
}));
vi.mock('expo-sharing', () => ({
  isAvailableAsync: sharingAvailableMock,
  shareAsync: shareAsyncMock,
}));
vi.mock('expo-file-system/legacy', () => fileSystemMock);
vi.mock('expo-document-picker', () => ({
  getDocumentAsync: vi.fn(),
}));

import {
  LOCAL_BACKUP_FORMAT_VERSION,
  closeDailyArchive,
  createCashTransaction,
  createDebt,
  createLocalBackup,
  createPayment,
  loadCustomers,
  loadDailyArchives,
  loadDebts,
  loadPayments,
  loadTransactions,
  parseLocalBackup,
  restoreLocalBackup,
  saveCustomers,
  saveDebts,
  savePayments,
  saveTransactions,
  serializeLocalBackup,
} from '@/services/storage';
import { shareLocalBackupFile } from '@/services/backupFile';

const CUSTOMERS_KEY = '@retail-business-manager/customers';
const PAYMENTS_KEY = '@retail-business-manager/payments';
const PROFILE_KEY = '@retail-business-manager/store-profile';
const AUTH_KEY = '@retail-business-manager/authenticated';

function storeProfile(storeId: string, name = `Store ${storeId}`): StoreProfile {
  return {
    id: storeId,
    name,
    phone: '+90 555 000 0000',
    address: 'Istanbul',
    currency: 'TRY',
    quickCurrencies: ['TRY', 'USD'],
    visibleCurrencies: ['TRY', 'EUR'],
    language: 'ar',
    accent: 'blue',
  };
}

async function seedStore(storeId: string, suffix: string, date = '2026-08-29') {
  const customer = {
    id: `customer-${suffix}`,
    storeId,
    name: `Customer ${suffix}`,
    phone: `555${suffix}`,
    isActive: true,
    createdAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
  };
  const cashIn = createCashTransaction(storeId, {
    type: 'cash_in',
    amount: 5000,
    currency: 'TRY',
    note: `Opening ${suffix}`,
  }, `${date}T09:00:00.000Z`);
  const debt = createDebt(storeId, customer.id, {
    amount: 1200,
    currency: 'TRY',
  }, `${date}T10:00:00.000Z`);
  const settlementTransaction = createCashTransaction(storeId, {
    type: 'cash_in',
    amount: 200,
    currency: 'TRY',
    note: `payment_${customer.id}`,
  }, `${date}T11:00:00.000Z`);
  const payment = createPayment(storeId, customer.id, {
    amount: 200,
    currency: 'TRY',
    transactionId: settlementTransaction.id,
  }, `${date}T11:00:00.000Z`);

  await saveCustomers(storeId, [customer]);
  await saveTransactions(storeId, [cashIn, settlementTransaction]);
  await saveDebts(storeId, [debt]);
  await savePayments(storeId, [payment]);
  const closing = await closeDailyArchive(storeId, new Date(`${date}T17:00:00.000Z`));
  return { customer, cashIn, debt, settlementTransaction, payment, archive: closing.archive };
}

function snapshotStorage(): Array<[string, string]> {
  return Array.from(storageValues.entries()).sort(([left], [right]) => left.localeCompare(right));
}

describe('local backup and restore', () => {
  beforeEach(() => {
    storageValues.clear();
    writeFailure.key = null;
    writeFailure.remaining = 0;
    shareAsyncMock.mockReset();
    sharingAvailableMock.mockResolvedValue(true);
  });

  it('passes the backup URI as a JSON file attachment, never as a text message', async () => {
    const fileUri = 'file:///data/user/0/host.exp.exponent/cache/store-manager-backup-2026.json';

    await shareLocalBackupFile(fileUri);

    expect(shareAsyncMock).toHaveBeenCalledWith(fileUri, expect.objectContaining({
      mimeType: 'application/json',
      UTI: 'public.json',
    }));
    const options = shareAsyncMock.mock.calls[0][1] as Record<string, unknown>;
    expect(options).not.toHaveProperty('message');
  });

  it('creates a versioned, self-contained backup for the active store only', async () => {
    const active = await seedStore('store-a', 'a');
    await seedStore('store-b', 'b');
    const profile = storeProfile('store-a');

    const backup = await createLocalBackup(profile, true, '2026-08-29T18:00:00.000Z');

    expect(backup).toMatchObject({
      formatVersion: LOCAL_BACKUP_FORMAT_VERSION,
      createdAt: '2026-08-29T18:00:00.000Z',
      storeId: 'store-a',
      storeProfile: profile,
      authenticated: true,
    });
    expect(backup.data.customers).toEqual([active.customer]);
    expect(backup.data.transactions).toHaveLength(2);
    expect(backup.data.debts).toEqual([active.debt]);
    expect(backup.data.payments).toEqual([active.payment]);
    expect(backup.data.dailyArchives).toEqual([active.archive]);
  });

  it('serializes and parses a valid backup without losing data', async () => {
    await seedStore('store-a', 'a');
    const backup = await createLocalBackup(storeProfile('store-a'), true, '2026-08-29T18:00:00.000Z');

    expect(parseLocalBackup(serializeLocalBackup(backup))).toEqual(backup);
  });

  it('rejects malformed JSON before any restore write', () => {
    expect(() => parseLocalBackup('{not-json')).toThrow('backupJsonInvalid');
  });

  it('rejects unsupported backup versions', async () => {
    await seedStore('store-a', 'a');
    const backup = await createLocalBackup(storeProfile('store-a'), true);
    const invalid = { ...backup, formatVersion: 99 };

    expect(() => parseLocalBackup(JSON.stringify(invalid))).toThrow('backupVersionUnsupported');
  });

  it('rejects malformed records', async () => {
    await seedStore('store-a', 'a');
    const backup = await createLocalBackup(storeProfile('store-a'), true);
    const invalid = JSON.parse(JSON.stringify(backup));
    delete invalid.data.customers[0].name;

    expect(() => parseLocalBackup(JSON.stringify(invalid))).toThrow('backupCustomersInvalid');
  });

  it('rejects records belonging to a different store', async () => {
    await seedStore('store-a', 'a');
    const backup = await createLocalBackup(storeProfile('store-a'), true);
    const invalid = JSON.parse(JSON.stringify(backup));
    invalid.data.transactions[0].storeId = 'store-b';

    expect(() => parseLocalBackup(JSON.stringify(invalid))).toThrow('backupTransactionsStoreMismatch');
  });

  it('rejects debts whose customer relationship is missing', async () => {
    await seedStore('store-a', 'a');
    const backup = await createLocalBackup(storeProfile('store-a'), true);
    const invalid = JSON.parse(JSON.stringify(backup));
    invalid.data.debts[0].customerId = 'missing-customer';

    expect(() => parseLocalBackup(JSON.stringify(invalid))).toThrow('backupDebtRelationshipInvalid');
  });

  it('rejects payments whose transaction relationship is missing', async () => {
    await seedStore('store-a', 'a');
    const backup = await createLocalBackup(storeProfile('store-a'), true);
    const invalid = JSON.parse(JSON.stringify(backup));
    invalid.data.payments[0].transactionId = 'missing-transaction';

    expect(() => parseLocalBackup(JSON.stringify(invalid))).toThrow('backupPaymentRelationshipInvalid');
  });

  it('rejects archives whose snapshot references a missing customer', async () => {
    await seedStore('store-a', 'a');
    const backup = await createLocalBackup(storeProfile('store-a'), true);
    const invalid = JSON.parse(JSON.stringify(backup));
    const customerEvent = invalid.data.dailyArchives[0].snapshot.find((event: { customerId?: string }) => event.customerId);
    customerEvent.customerId = 'missing-customer';

    expect(() => parseLocalBackup(JSON.stringify(invalid))).toThrow('backupArchiveRelationshipInvalid');
  });

  it('rejects duplicate archive date and closing-number pairs', async () => {
    await seedStore('store-a', 'a');
    const backup = await createLocalBackup(storeProfile('store-a'), true);
    const invalid = JSON.parse(JSON.stringify(backup));
    invalid.data.dailyArchives.push(invalid.data.dailyArchives[0]);

    expect(() => parseLocalBackup(JSON.stringify(invalid))).toThrow('backupArchivesDuplicate');
  });

  it('rejects a backup for a different active store without changing storage', async () => {
    await seedStore('store-a', 'a');
    await seedStore('store-b', 'b');
    const backup = await createLocalBackup(storeProfile('store-a'), true);
    const before = snapshotStorage();

    await expect(restoreLocalBackup(serializeLocalBackup(backup), 'store-b')).rejects.toThrow('backupStoreMismatch');
    expect(snapshotStorage()).toEqual(before);
  });

  it('replaces only the active store data and preserves every other store record', async () => {
    const originalA = await seedStore('store-a', 'a');
    const originalB = await seedStore('store-b', 'b');
    const backup = await createLocalBackup(storeProfile('store-a', 'Original A'), true);
    await saveCustomers('store-a', [{
      ...originalA.customer,
      name: 'Changed after backup',
      updatedAt: '2026-08-29T19:00:00.000Z',
    }]);
    await saveTransactions('store-a', []);
    await saveDebts('store-a', []);
    await savePayments('store-a', []);

    await restoreLocalBackup(serializeLocalBackup(backup), 'store-a');

    expect(await loadCustomers('store-a')).toEqual([originalA.customer]);
    expect(await loadCustomers('store-b')).toEqual([originalB.customer]);
    expect(await loadTransactions('store-a')).toHaveLength(2);
    expect(await loadTransactions('store-b')).toHaveLength(2);
    expect(await loadDebts('store-b')).toEqual([originalB.debt]);
    expect(await loadPayments('store-b')).toEqual([originalB.payment]);
    expect(await loadDailyArchives('store-b')).toEqual([originalB.archive]);
  });

  it('restores all archive days, multiple closings, profile, and authenticated state exactly', async () => {
    await seedStore('store-a', 'a', '2026-08-29');
    const secondClosingTransaction = createCashTransaction('store-a', {
      type: 'cash_out',
      amount: 100,
      currency: 'TRY',
      note: 'Second closing',
    }, '2026-08-29T18:00:00.000Z');
    await saveTransactions('store-a', [...await loadTransactions('store-a'), secondClosingTransaction]);
    await closeDailyArchive('store-a', new Date('2026-08-29T19:00:00.000Z'));
    const nextDayTransaction = createCashTransaction('store-a', {
      type: 'cash_in',
      amount: 300,
      currency: 'USD',
      note: 'Next day',
    }, '2026-08-30T09:00:00.000Z');
    await saveTransactions('store-a', [...await loadTransactions('store-a'), nextDayTransaction]);
    await closeDailyArchive('store-a', new Date('2026-08-30T17:00:00.000Z'));
    const profile = { ...storeProfile('store-a', 'Archived Store'), language: 'tr' as const, accent: 'gold' as const };
    const backup = await createLocalBackup(profile, false, '2026-08-30T18:00:00.000Z');
    const expectedArchives = backup.data.dailyArchives;

    for (const key of Array.from(storageValues.keys())) {
      if (key.startsWith('@retail-business-manager/daily-archive/store-a:')) {
        storageValues.delete(key);
      }
    }
    storageValues.set(PROFILE_KEY, JSON.stringify(storeProfile('store-a', 'Wrong profile')));
    storageValues.set(AUTH_KEY, 'true');

    await restoreLocalBackup(serializeLocalBackup(backup), 'store-a');

    expect(await loadDailyArchives('store-a')).toEqual(expect.arrayContaining(expectedArchives));
    expect(await loadDailyArchives('store-a')).toHaveLength(3);
    expect((await loadDailyArchives('store-a')).map((archive) => archive.closingNumber).sort()).toEqual([1, 1, 2]);
    expect(JSON.parse(storageValues.get(PROFILE_KEY) ?? 'null')).toEqual(profile);
    expect(storageValues.get(AUTH_KEY)).toBe('false');
  });

  it('rolls back every affected key when a restore write fails', async () => {
    const original = await seedStore('store-a', 'a');
    const backup = await createLocalBackup(storeProfile('store-a', 'Backup profile'), true);
    backup.storeProfile.name = 'Restored profile';
    backup.data.customers[0] = {
      ...original.customer,
      name: 'Restored customer',
      updatedAt: '2026-08-29T20:00:00.000Z',
    };
    const before = snapshotStorage();
    writeFailure.key = PAYMENTS_KEY;
    writeFailure.remaining = 1;

    await expect(restoreLocalBackup(serializeLocalBackup(backup), 'store-a')).rejects.toThrow('simulatedWriteFailure');
    expect(snapshotStorage()).toEqual(before);
  });

  it('refuses to overwrite data when current shared storage is corrupted', async () => {
    await seedStore('store-a', 'a');
    const backup = await createLocalBackup(storeProfile('store-a'), true);
    storageValues.set(CUSTOMERS_KEY, '{broken');
    const before = snapshotStorage();

    await expect(restoreLocalBackup(serializeLocalBackup(backup), 'store-a')).rejects.toThrow('currentStorageDataCorrupted');
    expect(snapshotStorage()).toEqual(before);
  });
});