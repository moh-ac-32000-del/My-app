import { describe, expect, it } from 'vitest';
import { workspaceBackend } from './fixtures/workspaceBackend';
import { workspaceCommandHandler } from '@/functions/src/workspaceCommand';
import { closeAutomaticPeriod, dispatchAutomaticClosings } from '@/functions/src/automaticClosing';
import { createCashTransactionHandler } from '@/functions/src/createCashTransaction';
import { createPaymentHandler } from '@/functions/src/createPayment';
import { trustedDebtCommandHandler } from '@/functions/src/trustedDebtCommand';
import { dailyArchiveCommandHandler } from '@/functions/src/dailyArchiveCommand';
import { automaticClosingPolicy, nextClosingAt } from '@/data/automaticClosing';

function setup(role = 'owner') {
  const f = workspaceBackend(role);
  delete f.docs['spaces/s/debts/d'];
  let now = '2026-10-21T12:00:00.000Z';
  const runtime = { firestore: f.db as never, now: () => now, automaticClosingReady: true };
  const command = (action: string, fields = {}) =>
    workspaceCommandHandler({ auth: { uid: 'u' }, data: { action, spaceId: 's', ...fields } } as never, runtime);
  const enable = () => command('enableClosing', { legacyTimeZone: 'Europe/Istanbul' });
  const cash = (id: string, amount: number, createdAt: string, type = 'cash_in', currency = 'TRY') => {
    f.docs[`spaces/s/transactions/${id}`] = {
      id,
      workspaceId: 's',
      storeId: 'store',
      type,
      amount,
      currency,
      note: `Note ${id}`,
      createdAt,
      updatedAt: createdAt,
    };
  };
  return {
    ...f,
    runtime,
    command,
    enable,
    cash,
    now: (value: string) => {
      now = value;
    },
  };
}

describe('trusted automatic closing, never a new cash movement', () => {
  it.each(['editor', 'viewer', 'manager'])('blocks %s activation and honors deployment readiness', async (role) => {
    const f = setup(role);
    await expect(f.enable()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(f.writes).toEqual([]);
    f.docs['spaces/s/members/u'].role = 'owner';
    f.runtime.automaticClosingReady = false;
    await expect(f.enable()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(f.writes).toEqual([]);
  });
  it('requires an explicit legacy zone and rejects a changed activation replay', async () => {
    const f = setup();
    await expect(f.command('enableClosing')).rejects.toMatchObject({ code: 'invalid-argument' });
    await f.enable();
    const count = f.writes.length;
    await f.enable();
    expect(f.writes).toHaveLength(count);
    await expect(f.command('enableClosing', { legacyTimeZone: 'UTC' })).rejects.toMatchObject({
      code: 'already-exists',
    });
  });
  it('preserves prior manual closings, adds only remaining events and captures historical period-end cash', async () => {
    const f = setup();
    f.cash('opening', 100, '2026-10-19T10:00:00.000Z');
    f.cash('old', 30, '2026-10-20T10:00:00.000Z');
    f.cash('new', 5, '2026-10-20T15:00:00.000Z', 'cash_out');
    f.cash('today', 999, '2026-10-21T10:00:00.000Z');
    const archive = (date: string, number: number, sourceId: string, balance: number) => ({
      id: `${date}_${String(number).padStart(6, '0')}`,
      date,
      workspaceId: 's',
      storeId: 'store',
      closingNumber: number,
      closedAt: `${date}T16:00:00.000Z`,
      closingCashBalances: [{ currency: 'TRY', amount: balance }],
      snapshot: [
        { id: `transaction:${sourceId}`, storeId: 'store', type: 'cash_in', amount: balance, currency: 'TRY' },
      ],
    });
    for (const row of [archive('2026-10-19', 1, 'opening', 100), archive('2026-10-20', 4, 'old', 130)])
      f.docs[`spaces/s/dailyArchives/${row.id}`] = row;
    const originals = structuredClone(f.docs);
    await f.enable();
    expect(f.docs['spaces/s'].automaticClosing.cursorAt).toBe('2026-10-19T21:00:00.000Z');
    expect(await closeAutomaticPeriod(f.runtime, 's')).toBe('closed');
    const saved = f.docs['spaces/s/dailyArchives/2026-10-20_000005'];
    expect(saved).toMatchObject({
      date: '2026-10-20',
      closingMode: 'automatic',
      timeZone: 'Europe/Istanbul',
      periodStartAt: '2026-10-19T21:00:00.000Z',
      periodEndAt: '2026-10-20T21:00:00.000Z',
      closingCashBalances: [{ currency: 'TRY', amount: 125 }],
    });
    expect(saved.snapshot.map((row: any) => row.id)).toEqual(['transaction:new']);
    expect(saved.snapshot[0].note).toBe('Note new');
    expect(saved.closedByUserId).toBeUndefined();
    expect(await closeAutomaticPeriod(f.runtime, 's')).toBe('not-due');
    for (const path of Object.keys(originals).filter((path) => path !== 'spaces/s'))
      expect(f.docs[path]).toEqual(originals[path]);
    expect(f.writes.every((path) => path === 'spaces/s' || /dailyArchives|dailyClosingCounters/.test(path))).toBe(true);
  });
  it('processes backlog days separately and concurrent dispatcher retries create one snapshot per period', async () => {
    const f = setup();
    f.cash('one', 10, '2026-10-19T10:00:00.000Z');
    f.cash('two', 20, '2026-10-20T10:00:00.000Z');
    await f.enable();
    await Promise.all([closeAutomaticPeriod(f.runtime, 's'), closeAutomaticPeriod(f.runtime, 's')]);
    const rows = Object.entries(f.docs)
      .filter(([path]) => path.includes('/dailyArchives/'))
      .map(([, row]) => row);
    expect(rows.map((row) => row.date).sort()).toEqual(['2026-10-19', '2026-10-20']);
    expect(rows.map((row) => row.snapshot.length)).toEqual([1, 1]);
    expect(rows.map((row) => row.closingCashBalances[0].amount)).toEqual([10, 30]);
    expect(await closeAutomaticPeriod(f.runtime, 's')).toBe('not-due');
  });
  it('does not create an empty archive for an idle day and rejects legacy manual closing after activation', async () => {
    const f = setup();
    await f.enable();
    f.now('2026-10-21T21:00:00.000Z');
    expect(await closeAutomaticPeriod(f.runtime, 's')).toBe('empty');
    expect(Object.keys(f.docs).some((path) => path.includes('/dailyArchives/'))).toBe(false);
    await expect(
      dailyArchiveCommandHandler(
        {
          auth: { uid: 'u' },
          data: {
            action: 'close',
            spaceId: 's',
            storeId: 'store',
            date: '2026-10-21',
            startAt: '2026-10-20T21:00:00.000Z',
            endAt: '2026-10-21T21:00:00.000Z',
          },
        } as never,
        f.runtime,
      ),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('rejects oversized activation without changing any financial data or activating partially', async () => {
    const f = setup();
    for (let i = 0; i < 501; i++) f.cash(`old${i}`, 1, '2026-10-20T10:00:00.000Z');
    await expect(f.enable()).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(f.writes).toEqual([]);
    expect(f.docs['spaces/s'].automaticClosing).toBeUndefined();
  });
  it('pauses after three failed periods without advancing the cursor or writing a partial archive', async () => {
    const f = setup();
    f.cash('one', 1, '2026-10-20T10:00:00.000Z');
    await f.enable();
    const cursor = f.docs['spaces/s'].automaticClosing.cursorAt;
    for (let i = 0; i < 501; i++) f.cash(`bad${i}`, 1, '2026-10-20T11:00:00.000Z');
    for (let attempt = 0; attempt < 3; attempt++) {
      f.now(`2026-10-21T12:${String(attempt * 5).padStart(2, '0')}:00.000Z`);
      expect((await dispatchAutomaticClosings(f.runtime)).failed).toBe(1);
      expect(f.docs['spaces/s'].automaticClosing.cursorAt).toBe(cursor);
    }
    expect(f.docs['spaces/s'].automaticClosing.failures).toBe(3);
    expect((await dispatchAutomaticClosings(f.runtime)).inspected).toBe(0);
    expect(Object.keys(f.docs).some((path) => path.includes('/dailyArchives/'))).toBe(false);
    await f.command('retryClosing');
    expect(f.docs['spaces/s'].automaticClosing.failures).toBe(0);
  });
  it('never archives a new-day cash/debt/payment into a previous day, preserving documentary client dates separately', async () => {
    const f = setup();
    await f.enable();
    f.now('2026-10-21T21:00:01.000Z');
    await closeAutomaticPeriod(f.runtime, 's');
    const scope = {
      spaceId: 's',
      storeId: 'store',
      operationId: 'new-cash',
      transactionId: 'new-cash',
      type: 'cash_in',
      amount: 5,
      currency: 'TRY',
    };
    await createCashTransactionHandler({ auth: { uid: 'u' }, data: scope } as never, f.runtime);
    await trustedDebtCommandHandler(
      {
        auth: { uid: 'u' },
        data: {
          action: 'create',
          spaceId: 's',
          storeId: 'store',
          debtId: 'new',
          customerId: 'c',
          operationId: 'new-debt',
          amount: 10,
          currency: 'TRY',
          createdAt: '2026-10-20T10:00:00.000Z',
        },
      } as never,
      f.runtime,
    );
    await createPaymentHandler(
      {
        auth: { uid: 'u' },
        data: {
          spaceId: 's',
          storeId: 'store',
          paymentId: 'new',
          operationId: 'new-payment',
          direction: 'in',
          method: 'cash',
          customerId: 'c',
          amount: { amount: 2, currency: 'TRY' },
          paidAt: '2026-10-20T10:00:00.000Z',
        },
      } as never,
      f.runtime,
    );
    expect(f.docs['spaces/s/debts/new']).toMatchObject({
      createdAt: '2026-10-21T21:00:01.000Z',
      documentaryCreatedAt: '2026-10-20T10:00:00.000Z',
    });
    expect(f.docs['spaces/s/payments/new']).toMatchObject({
      paidAt: '2026-10-21T21:00:01.000Z',
      documentaryPaidAt: '2026-10-20T10:00:00.000Z',
    });
    expect(await closeAutomaticPeriod(f.runtime, 's')).toBe('not-due');
    f.now('2026-10-22T21:00:00.000Z');
    await closeAutomaticPeriod(f.runtime, 's');
    expect(f.docs['spaces/s/dailyArchives/2026-10-22_000001'].snapshot.map((row: any) => row.id).sort()).toEqual([
      'debt:new',
      'settlement:new',
      'transaction:new-cash',
    ]);
  });
  it('fails a stale server posting clock after the closing barrier, without a local/partial financial record', async () => {
    const f = setup();
    await f.enable();
    f.now('2026-10-21T21:00:00.000Z');
    await closeAutomaticPeriod(f.runtime, 's');
    const before = f.writes.length;
    f.now('2026-10-21T20:59:59.000Z');
    await expect(
      createCashTransactionHandler(
        {
          auth: { uid: 'u' },
          data: {
            spaceId: 's',
            storeId: 'store',
            operationId: 'stale',
            transactionId: 'stale',
            type: 'cash_in',
            amount: 10,
            currency: 'TRY',
          },
        } as never,
        f.runtime,
      ),
    ).rejects.toBeDefined();
    expect(f.writes).toHaveLength(before);
    expect(f.docs['spaces/s/transactions/stale']).toBeUndefined();
  });
  it('rejects a new payment linked to a prior-day cash row even before that day has been closed', async () => {
    const f = setup();
    await f.enable();
    f.cash('prior', 2, '2026-10-21T20:00:00.000Z');
    f.now('2026-10-21T21:00:01.000Z');
    const before = f.writes.length;
    await expect(
      createPaymentHandler(
        {
          auth: { uid: 'u' },
          data: {
            spaceId: 's',
            storeId: 'store',
            paymentId: 'late',
            operationId: 'late',
            transactionId: 'prior',
            amount: { amount: 2, currency: 'TRY' },
            customerId: 'c',
            direction: 'in',
            method: 'cash',
            paidAt: '2026-10-21T20:00:00.000Z',
          },
        } as never,
        f.runtime,
      ),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(f.writes).toHaveLength(before);
  });
  it('uses a future transition for settings edits and retains all historical periods/carry', async () => {
    const f = setup();
    await f.enable();
    const before = automaticClosingPolicy(f.docs['spaces/s'].automaticClosing);
    await f.command('closingSettings', {
      closingSettings: { timeZone: 'America/New_York', executionTime: '17:00', expectedRevision: 0 },
    });
    const saved = automaticClosingPolicy(f.docs['spaces/s'].automaticClosing);
    expect(saved.cursorAt).toBe(before.cursorAt);
    expect(saved.cashBalances).toEqual(before.cashBalances);
    expect(saved.transitions.at(-1)).toEqual({
      from: '2026-10-21T21:00:00.000Z',
      timeZone: 'America/New_York',
      executionTime: '17:00',
    });
    expect(f.docs['spaces/s'].autoClosingNextAt).toBe(nextClosingAt(saved));
  });
});
