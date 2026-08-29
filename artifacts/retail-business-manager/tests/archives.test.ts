import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer, Transaction } from '@/types/business';

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
  calculateVisibleCurrencyBalances,
  closeDailyArchive,
  createCashTransaction,
  createDebt,
  createPayment,
  getLocalDateKey,
  loadDailyArchives,
  loadDailyJournalEvents,
  loadDebts,
  loadPayments,
  loadTransactions,
  saveCustomers,
  saveDebts,
  savePayments,
  saveTransactions,
} from '@/services/storage';

function customer(storeId: string, id: string, name: string): Customer {
  return {
    id,
    storeId,
    name,
    isActive: true,
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-01T08:00:00.000Z',
  };
}

async function saveFourEventDay(storeId: string, customerId: string) {
  const cashIn = createCashTransaction(storeId, {
    type: 'cash_in',
    amount: 5000,
    currency: 'TRY',
    note: 'Opening cash',
  }, '2026-08-29T10:00:00.000Z');
  const cashOut = createCashTransaction(storeId, {
    type: 'cash_out',
    amount: 1000,
    currency: 'TRY',
    note: 'Expense',
  }, '2026-08-29T11:00:00.000Z');
  const credit = createDebt(storeId, customerId, {
    amount: 2000,
    currency: 'TRY',
  }, '2026-08-29T12:00:00.000Z');
  const settlementCashIn = createCashTransaction(storeId, {
    type: 'cash_in',
    amount: 500,
    currency: 'TRY',
    note: `payment_${customerId}`,
  }, '2026-08-29T13:00:00.000Z');
  const settlement = createPayment(storeId, customerId, {
    amount: 500,
    currency: 'TRY',
    transactionId: settlementCashIn.id,
  }, '2026-08-29T13:00:00.000Z');

  await saveTransactions(storeId, [cashIn, cashOut, settlementCashIn]);
  await saveDebts(storeId, [credit]);
  await savePayments(storeId, [settlement]);
  return { cashIn, cashOut, credit, settlementCashIn, settlement };
}

describe('daily archives', () => {
  beforeEach(() => {
    storageValues.clear();
  });

  it('creates, saves, and loads a complete four-event snapshot in newest-first order', async () => {
    const storeId = 'store-a';
    const mohammed = customer(storeId, 'customer-mohammed', 'محمد');
    await saveCustomers(storeId, [mohammed]);
    await saveFourEventDay(storeId, mohammed.id);
    const closedAt = new Date('2026-08-29T17:00:00.000Z');

    const result = await closeDailyArchive(storeId, closedAt);
    const loaded = await loadDailyArchives(storeId);

    expect(result.created).toBe(true);
    expect(result.archive).toMatchObject({
      storeId,
      date: getLocalDateKey(closedAt),
      closedAt: closedAt.toISOString(),
      closingNumber: 1,
    });
    expect(result.archive.snapshot.map(({ type }) => type)).toEqual([
      'settlement',
      'debt',
      'cash_out',
      'cash_in',
    ]);
    expect(result.archive.snapshot).toHaveLength(4);
    expect(result.archive.snapshot.find(({ type }) => type === 'debt')).toMatchObject({
      customerId: mohammed.id,
      customerName: 'محمد',
      amount: 2000,
      currency: 'TRY',
    });
    expect(result.archive.snapshot.find(({ type }) => type === 'settlement')).toMatchObject({
      customerId: mohammed.id,
      customerName: 'محمد',
      amount: 500,
      currency: 'TRY',
    });
    expect(loaded).toEqual([result.archive]);
  });

  it('keeps a historical snapshot unchanged after next-day transactions are added', async () => {
    const storeId = 'store-a';
    const mohammed = customer(storeId, 'customer-mohammed', 'محمد');
    await saveCustomers(storeId, [mohammed]);
    const firstDay = await saveFourEventDay(storeId, mohammed.id);
    const firstClose = await closeDailyArchive(storeId, new Date('2026-08-29T17:00:00.000Z'));
    const originalSnapshot = JSON.parse(JSON.stringify(firstClose.archive.snapshot)) as unknown;

    const nextDayTransaction = createCashTransaction(storeId, {
      type: 'cash_in',
      amount: 9000,
      currency: 'TRY',
    }, '2026-08-30T09:00:00.000Z');
    await saveTransactions(storeId, [
      firstDay.cashIn,
      firstDay.cashOut,
      firstDay.settlementCashIn,
      nextDayTransaction,
    ]);

    const loaded = await loadDailyArchives(storeId);
    expect(loaded[0]?.snapshot).toEqual(originalSnapshot);
    expect(loaded[0]?.snapshot.some(({ sourceId }) => sourceId === nextDayTransaction.id)).toBe(false);
  });

  it('isolates archives by store', async () => {
    const customerA = customer('store-a', 'customer-a', 'A');
    const customerB = customer('store-b', 'customer-b', 'B');
    await saveCustomers('store-a', [customerA]);
    await saveCustomers('store-b', [customerB]);
    await saveFourEventDay('store-a', customerA.id);
    await saveFourEventDay('store-b', customerB.id);

    await closeDailyArchive('store-a', new Date('2026-08-29T17:00:00.000Z'));
    await closeDailyArchive('store-b', new Date('2026-08-29T18:00:00.000Z'));

    const archivesA = await loadDailyArchives('store-a');
    const archivesB = await loadDailyArchives('store-b');
    expect(archivesA).toHaveLength(1);
    expect(archivesB).toHaveLength(1);
    expect(archivesA.every(({ storeId }) => storeId === 'store-a')).toBe(true);
    expect(archivesB.every(({ storeId }) => storeId === 'store-b')).toBe(true);
  });

  it('archives only new events across repeated same-day closings without changing cash boxes or the midnight boundary', async () => {
    const storeId = 'store-a';
    const mohammed = customer(storeId, 'customer-mohammed', 'محمد');
    const at = (day: number, hour: number, minute = 0) => new Date(2026, 7, day, hour, minute);
    const priorUsd = createCashTransaction(storeId, {
      type: 'cash_in',
      amount: 250,
      currency: 'USD',
    }, at(28, 12).toISOString());
    const priorEur = createCashTransaction(storeId, {
      type: 'cash_in',
      amount: 400,
      currency: 'EUR',
    }, at(28, 12, 5).toISOString());
    const firstCashIn = createCashTransaction(storeId, {
      type: 'cash_in',
      amount: 1000,
      currency: 'TRY',
    }, at(29, 10).toISOString());
    const firstCashOut = createCashTransaction(storeId, {
      type: 'cash_out',
      amount: 200,
      currency: 'TRY',
    }, at(29, 11).toISOString());

    await saveCustomers(storeId, [mohammed]);
    await saveTransactions(storeId, [priorUsd, priorEur, firstCashIn, firstCashOut]);
    const balancesBeforeFirstClose = calculateVisibleCurrencyBalances(
      await loadTransactions(storeId),
      ['TRY', 'USD', 'EUR'],
    );
    const sourceBeforeFirstClose = await loadTransactions(storeId);

    const firstClose = await closeDailyArchive(storeId, at(29, 14));

    expect(firstClose.archive).toMatchObject({
      date: getLocalDateKey(at(29, 14)),
      closingNumber: 1,
    });
    expect(firstClose.archive.snapshot.map(({ sourceId }) => sourceId).sort()).toEqual(
      [firstCashIn.id, firstCashOut.id].sort(),
    );
    expect(await loadDailyJournalEvents(storeId, at(29, 14, 1))).toEqual([]);
    expect(await loadTransactions(storeId)).toEqual(sourceBeforeFirstClose);
    expect(calculateVisibleCurrencyBalances(await loadTransactions(storeId), ['TRY', 'USD', 'EUR']))
      .toEqual(balancesBeforeFirstClose);
    expect(balancesBeforeFirstClose).toEqual([
      { currency: 'TRY', amount: 800 },
      { currency: 'USD', amount: 250 },
      { currency: 'EUR', amount: 400 },
    ]);

    const laterCashIn = createCashTransaction(storeId, {
      type: 'cash_in',
      amount: 500,
      currency: 'TRY',
    }, at(29, 16).toISOString());
    const laterDebt = createDebt(storeId, mohammed.id, {
      amount: 300,
      currency: 'TRY',
    }, at(29, 16, 30).toISOString());
    await saveTransactions(storeId, [priorUsd, priorEur, firstCashIn, firstCashOut, laterCashIn]);
    await saveDebts(storeId, [laterDebt]);

    const journalAfterFirstClose = await loadDailyJournalEvents(storeId, at(29, 17));
    expect(journalAfterFirstClose.map(({ type }) => type)).toEqual(['debt', 'cash_in']);
    expect(journalAfterFirstClose.map(({ sourceId }) => sourceId).sort()).toEqual(
      [laterCashIn.id, laterDebt.id].sort(),
    );
    expect(firstClose.archive.snapshot.some(({ sourceId }) => sourceId === laterCashIn.id)).toBe(false);
    const firstSnapshot = JSON.parse(JSON.stringify(firstClose.archive.snapshot)) as unknown;
    const transactionsBeforeSecondClose = await loadTransactions(storeId);
    const debtsBeforeSecondClose = await loadDebts(storeId);

    const secondClose = await closeDailyArchive(storeId, at(29, 18));

    expect(secondClose.archive.closingNumber).toBe(2);
    expect(secondClose.archive.id).not.toBe(firstClose.archive.id);
    expect(secondClose.archive.snapshot.map(({ sourceId }) => sourceId).sort()).toEqual(
      [laterCashIn.id, laterDebt.id].sort(),
    );
    expect(await loadDailyJournalEvents(storeId, at(29, 18, 1))).toEqual([]);
    expect(await loadTransactions(storeId)).toEqual(transactionsBeforeSecondClose);
    expect(await loadDebts(storeId)).toEqual(debtsBeforeSecondClose);

    const settlementCashIn = createCashTransaction(storeId, {
      type: 'cash_in',
      amount: 100,
      currency: 'TRY',
    }, at(29, 20).toISOString());
    const settlement = createPayment(storeId, mohammed.id, {
      amount: 100,
      currency: 'TRY',
      transactionId: settlementCashIn.id,
    }, at(29, 20).toISOString());
    await saveTransactions(storeId, [
      priorUsd,
      priorEur,
      firstCashIn,
      firstCashOut,
      laterCashIn,
      settlementCashIn,
    ]);
    await savePayments(storeId, [settlement]);
    expect((await loadDailyJournalEvents(storeId, at(29, 21))).map(({ type }) => type))
      .toEqual(['settlement']);
    const balancesBeforeThirdClose = calculateVisibleCurrencyBalances(
      await loadTransactions(storeId),
      ['TRY', 'USD', 'EUR'],
    );
    const paymentsBeforeThirdClose = await loadPayments(storeId);

    const thirdClose = await closeDailyArchive(storeId, at(29, 22));
    const sameDayArchives = (await loadDailyArchives(storeId))
      .filter(({ date }) => date === getLocalDateKey(at(29, 22)));

    expect(sameDayArchives.map(({ closingNumber }) => closingNumber)).toEqual([1, 2, 3]);
    expect(thirdClose.archive.snapshot).toHaveLength(1);
    expect(thirdClose.archive.snapshot[0]).toMatchObject({
      type: 'settlement',
      sourceId: settlement.id,
      customerName: 'محمد',
      amount: 100,
      currency: 'TRY',
    });
    expect(sameDayArchives[0]?.snapshot).toEqual(firstSnapshot);
    expect(await loadPayments(storeId)).toEqual(paymentsBeforeThirdClose);
    expect(calculateVisibleCurrencyBalances(await loadTransactions(storeId), ['TRY', 'USD', 'EUR']))
      .toEqual(balancesBeforeThirdClose);

    const nextDayCashIn = createCashTransaction(storeId, {
      type: 'cash_in',
      amount: 700,
      currency: 'TRY',
    }, at(30, 0).toISOString());
    await saveTransactions(storeId, [
      priorUsd,
      priorEur,
      firstCashIn,
      firstCashOut,
      laterCashIn,
      settlementCashIn,
      nextDayCashIn,
    ]);
    const nextDayJournal = await loadDailyJournalEvents(storeId, at(30, 0, 1));
    expect(nextDayJournal).toHaveLength(1);
    expect(nextDayJournal[0]?.sourceId).toBe(nextDayCashIn.id);
    expect(getLocalDateKey(new Date(nextDayJournal[0]?.occurredAt ?? ''))).toBe(getLocalDateKey(at(30, 0)));
    expect(sameDayArchives.flatMap(({ snapshot }) => snapshot)
      .some(({ sourceId }) => sourceId === nextDayCashIn.id)).toBe(false);
  });

  it('skips corrupted archive JSON without crashing or altering valid archives', async () => {
    const storeId = 'store-a';
    await closeDailyArchive(storeId, new Date('2026-08-29T17:00:00.000Z'));
    await closeDailyArchive(storeId, new Date('2026-08-30T17:00:00.000Z'));
    const archiveKeys = Array.from(storageValues.keys()).filter((key) => key.includes('daily-archive'));
    const corruptedKey = archiveKeys.find((key) => key.includes(':2026-08-29:'));
    const validKey = archiveKeys.find((key) => key.includes(':2026-08-30:'));
    expect(corruptedKey).toBeDefined();
    expect(validKey).toBeDefined();
    const validRawBefore = storageValues.get(validKey as string);
    storageValues.set(corruptedKey as string, '{not-valid-json');

    await expect(loadDailyArchives(storeId)).resolves.toHaveLength(1);
    expect(storageValues.get(corruptedKey as string)).toBe('{not-valid-json');
    expect(storageValues.get(validKey as string)).toBe(validRawBefore);
  });
});