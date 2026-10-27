import { describe, expect, it, vi } from 'vitest';
import { synchronizedSnapshots } from '@/data/synchronizedSnapshots';
import { exactMoneyEntry, formatExactMoney } from '@/data/exactMoneyPresentation';
import {
  merchantFromDocument,
  merchantBalanceFromDocument,
  merchantOperationFromDocument,
  customerCreditFromDocument,
} from '@/data/merchantDocuments';

describe('synchronized financial snapshots', () => {
  it('waits for all server snapshots and a synchronization barrier', () => {
    const publish = vi.fn();
    const coordinator = synchronizedSnapshots<{ debts: number; credit: number }>(['debts', 'credit'], publish, vi.fn());
    coordinator.receive('debts', 100, false);
    coordinator.sync();
    expect(publish).not.toHaveBeenCalled();
    coordinator.receive('credit', 0, true);
    coordinator.sync();
    expect(publish).not.toHaveBeenCalled();
    coordinator.receive('credit', 0, false);
    coordinator.sync();
    expect(publish).toHaveBeenLastCalledWith({ debts: 100, credit: 0 });
    coordinator.receive('debts', 0, false);
    coordinator.receive('credit', 30, false);
    expect(publish).toHaveBeenCalledTimes(1);
    coordinator.sync();
    expect(publish).toHaveBeenLastCalledWith({ debts: 0, credit: 30 });
    coordinator.sync();
    expect(publish).toHaveBeenCalledTimes(2);
  });
  it('stops stale workspace callbacks and never publishes after an error', () => {
    const publish = vi.fn(),
      fail = vi.fn();
    const coordinator = synchronizedSnapshots<{ data: number }>(['data'], publish, fail);
    coordinator.receive('data', 100, false);
    coordinator.error(new Error('permission-denied'));
    coordinator.receive('data', 200, false);
    coordinator.sync();
    coordinator.error(new Error('again'));
    expect(publish).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledTimes(1);
  });
  it('clears pending values when a subscription is replaced', () => {
    const publish = vi.fn();
    const coordinator = synchronizedSnapshots<{ data: number }>(['data'], publish, vi.fn());
    coordinator.receive('data', 100, false);
    coordinator.stop();
    coordinator.sync();
    expect(publish).not.toHaveBeenCalled();
  });
});

describe('exact localized presentation', () => {
  it.each([
    ['١٢٫٥', 2, '12.50'],
    ['۱۲,۵', 2, '12.50'],
    ['.5', 2, '0.50'],
    ['0002.1', 4, '2.1000'],
    ['0.005', 3, '0.005'],
  ])('parses %s without floating point', (value, places, expected) => {
    expect(exactMoneyEntry(String(value), Number(places))).toBe(expected);
  });
  it.each(['1e3', '1,000.00', '1.001', 'NaN', '-1', ''])('rejects ambiguous or invalid amount %s', (value) => {
    expect(() => exactMoneyEntry(value, 2)).toThrow();
  });
  it('permits signed opening entries only when requested', () => {
    expect(exactMoneyEntry('-12,50', 2, true)).toBe('-12.50');
    expect(exactMoneyEntry('-0', 2, true)).toBe('0.00');
  });
  it('formats large and fractional legacy amounts exactly', () => {
    expect(formatExactMoney('9007199254740993.00', 'USD', 'en')).toBe('$ 9,007,199,254,740,993.00');
    expect(formatExactMoney('-100.005', 'TRY', 'tr')).toBe('₺ −100,005');
    // Language changes labels, never the selected Latin digit system.
    expect(formatExactMoney('1250.50', 'TRY', 'ar')).toContain(
      new Intl.NumberFormat('ar', { minimumFractionDigits: 2, numberingSystem: 'latn' }).format(1250.5),
    );
  });
});

describe('server document boundaries', () => {
  const scope = { id: 'm', workspaceId: 's', storeId: 'store' };
  const time = '2026-10-19T12:00:00.000Z';
  const merchant = {
    ...scope,
    name: 'Merchant',
    phone: '',
    isActive: true,
    createdAt: time,
    updatedAt: time,
    createdByUserId: 'u',
    updatedByUserId: 'u',
  };
  const balance = { ...scope, merchantId: 'm', currency: 'TRY', balanceExact: '-300.00', version: 1, revision: 1 };
  it('preserves signed merchant balances and actor metadata', () => {
    expect(merchantFromDocument('m', merchant, 's', 'store')).toMatchObject({ name: 'Merchant', createdByUserId: 'u' });
    expect(merchantBalanceFromDocument('m', balance, 's', 'store').balanceExact).toBe('-300.00');
  });
  it.each([
    { ...balance, workspaceId: 'other' },
    { ...balance, storeId: 'other' },
    { ...balance, currency: 'INVALID' },
    { ...balance, balanceExact: 100 },
    { ...balance, revision: 0 },
  ])('rejects invalid account projection %j', (value) => {
    expect(() => merchantBalanceFromDocument('m', value, 's', 'store')).toThrow();
  });
  it('retains customer credit fractions instead of rounding them', () => {
    expect(
      customerCreditFromDocument(
        'm',
        { ...scope, customerId: 'c', currency: 'TRY', creditExact: '0.005', revision: 1, version: 1 },
        's',
        'store',
      ).creditExact,
    ).toBe('0.005');
  });
  it('rejects a negative customer credit', () => {
    expect(() =>
      customerCreditFromDocument(
        'm',
        { ...scope, customerId: 'c', currency: 'TRY', creditExact: '-1.00', revision: 1, version: 1 },
        's',
        'store',
      ),
    ).toThrow();
  });
  it('retains immutable operation notes and reversal links', () => {
    expect(
      merchantOperationFromDocument(
        'm',
        {
          ...scope,
          merchantId: 'm',
          merchantName: 'Merchant',
          action: 'payment',
          currency: 'TRY',
          balanceBeforeExact: '100.00',
          balanceAfterExact: '-20.00',
          cashDeltaExact: '-120.00',
          note: 'Goods',
          createdAt: time,
          createdByUserId: 'u',
          reversedByOperationId: 'correction',
        },
        's',
        'store',
      ),
    ).toMatchObject({ note: 'Goods', reversedByOperationId: 'correction', cashDeltaExact: '-120.00' });
  });
});
