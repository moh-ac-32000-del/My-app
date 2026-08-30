import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer, StoreProfile } from '@/types/business';

const storageValues = vi.hoisted(() => new Map<string, string>());

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storageValues.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storageValues.set(key, value);
    },
    removeItem: async (key: string) => {
      storageValues.delete(key);
    },
    getAllKeys: async () => Array.from(storageValues.keys()),
  },
}));

import {
  LOCAL_BACKUP_FORMAT_VERSION,
  SPACE_STORAGE_PREFIX,
  closeDailyArchive,
  createCashTransaction,
  createDebt,
  createLocalBackup,
  createPayment,
  loadCustomers,
  loadDailyArchives,
  loadDebts,
  loadPayments,
  loadStoreProfile,
  loadTransactions,
  restoreLocalBackup,
  saveCustomers,
  saveDebts,
  savePayments,
  saveStoreProfile,
  saveTransactions,
  serializeLocalBackup,
  setActiveSpaceId,
} from '@/services/storage';

const STORE_ID = 'local-store';
const LEGACY_PROFILE_KEY = '@retail-business-manager/store-profile';
const LEGACY_CUSTOMERS_KEY = '@retail-business-manager/customers';
const LEGACY_TRANSACTIONS_KEY = '@retail-business-manager/transactions';
const LEGACY_DEBTS_KEY = '@retail-business-manager/debts';
const LEGACY_PAYMENTS_KEY = '@retail-business-manager/payments';
const LEGACY_ARCHIVE_KEY = '@retail-business-manager/daily-archive/local-store:2026-08-28:000001';

function profile(suffix: string): StoreProfile {
  return {
    id: STORE_ID,
    name: `Store ${suffix}`,
    phone: `555-${suffix}`,
    address: `Address ${suffix}`,
    currency: 'TRY',
    quickCurrencies: ['TRY'],
    visibleCurrencies: ['TRY'],
    language: 'ar',
    accent: 'blue',
  };
}

async function seedSpace(suffix: string, amount: number, date: string) {
  const customer: Customer = {
    id: `customer-${suffix}`,
    storeId: STORE_ID,
    name: `ISOLATION_${suffix}`,
    phone: `555${suffix}`,
    createdAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
    isActive: true,
  };
  const transaction = createCashTransaction(STORE_ID, {
    type: 'cash_in',
    amount,
    currency: 'TRY',
    note: `transaction-${suffix}`,
  }, `${date}T09:00:00.000Z`);
  const debt = createDebt(STORE_ID, customer.id, {
    amount: amount * 5,
    currency: 'TRY',
  }, `${date}T10:00:00.000Z`);
  const payment = createPayment(STORE_ID, customer.id, {
    amount,
    currency: 'TRY',
    transactionId: transaction.id,
  }, `${date}T11:00:00.000Z`);

  await saveStoreProfile(profile(suffix));
  await saveCustomers(STORE_ID, [customer]);
  await saveTransactions(STORE_ID, [transaction]);
  await saveDebts(STORE_ID, [debt]);
  await savePayments(STORE_ID, [payment]);
  const { archive } = await closeDailyArchive(STORE_ID, new Date(`${date}T17:00:00.000Z`));

  return { customer, transaction, debt, payment, archive };
}

function spacePrefix(spaceId: string): string {
  return `${SPACE_STORAGE_PREFIX}${encodeURIComponent(spaceId)}/`;
}

describe('local Space storage isolation', () => {
  beforeEach(() => {
    storageValues.clear();
    setActiveSpaceId(null);
  });

  it('isolates all business data, preserves logout data, and never exposes or deletes legacy local-store data', async () => {
    const legacyProfile = profile('LEGACY');
    const legacyCustomer: Customer = {
      id: 'legacy-customer',
      storeId: STORE_ID,
      name: 'LEGACY_CUSTOMER',
      createdAt: '2026-08-28T08:00:00.000Z',
      updatedAt: '2026-08-28T08:00:00.000Z',
      isActive: true,
    };
    const legacyTransaction = createCashTransaction(STORE_ID, {
      type: 'cash_in',
      amount: 999,
      currency: 'TRY',
    }, '2026-08-28T09:00:00.000Z');
    const legacyDebt = createDebt(
      STORE_ID,
      legacyCustomer.id,
      { amount: 888, currency: 'TRY' },
      '2026-08-28T10:00:00.000Z',
    );
    const legacyPayment = createPayment(
      STORE_ID,
      legacyCustomer.id,
      { amount: 111, currency: 'TRY', transactionId: legacyTransaction.id },
      '2026-08-28T11:00:00.000Z',
    );
    const legacyEntries = new Map<string, string>([
      [LEGACY_PROFILE_KEY, JSON.stringify(legacyProfile)],
      [LEGACY_CUSTOMERS_KEY, JSON.stringify([legacyCustomer])],
      [LEGACY_TRANSACTIONS_KEY, JSON.stringify([legacyTransaction])],
      [LEGACY_DEBTS_KEY, JSON.stringify([legacyDebt])],
      [LEGACY_PAYMENTS_KEY, JSON.stringify([legacyPayment])],
      [LEGACY_ARCHIVE_KEY, JSON.stringify({
        id: 'archive-legacy',
        storeId: STORE_ID,
        date: '2026-08-28',
        closedAt: '2026-08-28T17:00:00.000Z',
        closingNumber: 1,
        snapshot: [],
      })],
    ]);
    legacyEntries.forEach((value, key) => storageValues.set(key, value));

    setActiveSpaceId('space_A');
    await expect(loadStoreProfile()).resolves.toBeNull();
    await expect(loadCustomers(STORE_ID)).resolves.toEqual([]);
    await expect(loadTransactions(STORE_ID)).resolves.toEqual([]);
    await expect(loadDebts(STORE_ID)).resolves.toEqual([]);
    await expect(loadPayments(STORE_ID)).resolves.toEqual([]);
    await expect(loadDailyArchives(STORE_ID)).resolves.toEqual([]);
    const spaceA = await seedSpace('A', 100, '2026-08-29');
    const spaceAKeys = Array.from(storageValues.keys()).filter((key) => key.startsWith(spacePrefix('space_A')));

    setActiveSpaceId(null);
    expect(spaceAKeys).not.toHaveLength(0);
    expect(spaceAKeys.every((key) => storageValues.has(key))).toBe(true);

    setActiveSpaceId('space_B');
    await expect(loadStoreProfile()).resolves.toBeNull();
    await expect(loadCustomers(STORE_ID)).resolves.toEqual([]);
    await expect(loadTransactions(STORE_ID)).resolves.toEqual([]);
    await expect(loadDebts(STORE_ID)).resolves.toEqual([]);
    await expect(loadPayments(STORE_ID)).resolves.toEqual([]);
    await expect(loadDailyArchives(STORE_ID)).resolves.toEqual([]);
    const spaceB = await seedSpace('B', 200, '2026-08-30');

    setActiveSpaceId('space_A');
    await expect(loadStoreProfile()).resolves.toEqual(profile('A'));
    await expect(loadCustomers(STORE_ID)).resolves.toEqual([spaceA.customer]);
    await expect(loadTransactions(STORE_ID)).resolves.toEqual([spaceA.transaction]);
    await expect(loadDebts(STORE_ID)).resolves.toEqual([spaceA.debt]);
    await expect(loadPayments(STORE_ID)).resolves.toEqual([spaceA.payment]);
    await expect(loadDailyArchives(STORE_ID)).resolves.toEqual([spaceA.archive]);
    expect(spaceA.debt.customerId).toBe(spaceA.customer.id);
    expect(spaceA.payment.customerId).toBe(spaceA.customer.id);
    expect(spaceA.payment.transactionId).toBe(spaceA.transaction.id);

    setActiveSpaceId('space_B');
    await expect(loadStoreProfile()).resolves.toEqual(profile('B'));
    await expect(loadCustomers(STORE_ID)).resolves.toEqual([spaceB.customer]);
    await expect(loadTransactions(STORE_ID)).resolves.toEqual([spaceB.transaction]);
    await expect(loadDebts(STORE_ID)).resolves.toEqual([spaceB.debt]);
    await expect(loadPayments(STORE_ID)).resolves.toEqual([spaceB.payment]);
    await expect(loadDailyArchives(STORE_ID)).resolves.toEqual([spaceB.archive]);
    expect(spaceB.debt.customerId).toBe(spaceB.customer.id);
    expect(spaceB.payment.customerId).toBe(spaceB.customer.id);
    expect(spaceB.payment.transactionId).toBe(spaceB.transaction.id);

    legacyEntries.forEach((value, key) => {
      expect(storageValues.get(key)).toBe(value);
    });
  });

  it('backs up only the active Space without changing backup format version', async () => {
    setActiveSpaceId('space_A');
    const spaceA = await seedSpace('A', 100, '2026-08-29');
    const backupA = await createLocalBackup(profile('A'), true, '2026-08-29T18:00:00.000Z');

    setActiveSpaceId('space_B');
    const spaceB = await seedSpace('B', 200, '2026-08-30');
    const backupB = await createLocalBackup(profile('B'), true, '2026-08-30T18:00:00.000Z');

    expect(backupA.formatVersion).toBe(LOCAL_BACKUP_FORMAT_VERSION);
    expect(backupA.data.customers).toEqual([spaceA.customer]);
    expect(backupA.data.transactions).toEqual([spaceA.transaction]);
    expect(backupA.data.debts).toEqual([spaceA.debt]);
    expect(backupA.data.payments).toEqual([spaceA.payment]);
    expect(backupA.data.dailyArchives).toEqual([spaceA.archive]);
    expect(backupB.data.customers).toEqual([spaceB.customer]);
    expect(backupB.data.transactions).toEqual([spaceB.transaction]);
    expect(backupB.data.debts).toEqual([spaceB.debt]);
    expect(backupB.data.payments).toEqual([spaceB.payment]);
    expect(backupB.data.dailyArchives).toEqual([spaceB.archive]);
  });

  it('restores only the active Space and leaves the other Space unchanged', async () => {
    setActiveSpaceId('space_A');
    const originalA = await seedSpace('A', 100, '2026-08-29');
    const backupA = await createLocalBackup(profile('A'), true);

    setActiveSpaceId('space_B');
    const originalB = await seedSpace('B', 200, '2026-08-30');
    const backupB = await createLocalBackup(profile('B'), true);

    setActiveSpaceId('space_A');
    await saveCustomers(STORE_ID, []);
    await saveTransactions(STORE_ID, []);
    await saveDebts(STORE_ID, []);
    await savePayments(STORE_ID, []);
    await restoreLocalBackup(serializeLocalBackup(backupA), STORE_ID);

    await expect(loadCustomers(STORE_ID)).resolves.toEqual([originalA.customer]);
    await expect(loadTransactions(STORE_ID)).resolves.toEqual([originalA.transaction]);
    await expect(loadDebts(STORE_ID)).resolves.toEqual([originalA.debt]);
    await expect(loadPayments(STORE_ID)).resolves.toEqual([originalA.payment]);
    await expect(loadDailyArchives(STORE_ID)).resolves.toEqual([originalA.archive]);

    setActiveSpaceId('space_B');
    await expect(loadCustomers(STORE_ID)).resolves.toEqual([originalB.customer]);
    await expect(loadTransactions(STORE_ID)).resolves.toEqual([originalB.transaction]);
    await expect(loadDebts(STORE_ID)).resolves.toEqual([originalB.debt]);
    await expect(loadPayments(STORE_ID)).resolves.toEqual([originalB.payment]);
    await expect(loadDailyArchives(STORE_ID)).resolves.toEqual([originalB.archive]);

    await saveCustomers(STORE_ID, []);
    await restoreLocalBackup(serializeLocalBackup(backupB), STORE_ID);
    await expect(loadCustomers(STORE_ID)).resolves.toEqual([originalB.customer]);

    setActiveSpaceId('space_A');
    await expect(loadCustomers(STORE_ID)).resolves.toEqual([originalA.customer]);
  });
});
