import { describe, expect, it } from 'vitest';
import { merchantSettingsCommandHandler } from '../functions/src/merchantSettingsCommand';
import { merchantCommandHandler } from '../functions/src/merchantCommand';
import { workspaceBackend, workspaceTestTime } from './fixtures/workspaceBackend';
import { localMerchantDate, merchantOperationDate, validateMerchantSettings } from '../data/merchantSettings';
import { merchantOperationFromDocument } from '../data/merchantDocuments';
import { merchantJournalEvent } from '../data/merchantJournal';
import { journalEventDetails } from '../services/journalPresentation';
import { translate } from '../constants/i18n';
import { mergeMerchantHistory } from '../data/merchantHistory';
const settings = () => ({
  revision: 0,
  materials: [{ id: 'item', name: 'Screens', prices: { TRY: '400.0000', USD: '12.3400' }, isActive: true }],
  paymentMethods: [{ id: 'method', name: 'Bank transfer (label only)', isActive: true }],
});
function setup(role: unknown = 'owner') {
  const backend = workspaceBackend(role);
  backend.docs['spaces/s/merchants/m'] = {
    id: 'm',
    workspaceId: 's',
    storeId: 'store',
    name: 'Merchant',
    isActive: true,
  };
  const save = (data = settings(), operationId = 'settings') =>
    merchantSettingsCommandHandler(
      { auth: { uid: 'u' }, data: { spaceId: 's', storeId: 'store', operationId, settings: data } } as never,
      backend.runtime,
    );
  const payment = (extra = {}) =>
    merchantCommandHandler(
      {
        auth: { uid: 'u' },
        data: {
          action: 'payment',
          spaceId: 's',
          storeId: 'store',
          merchantId: 'm',
          operationId: 'pay',
          currency: 'TRY',
          amountExact: '5000.00',
          source: 'cash',
          operationDate: '2026-10-01',
          paymentMethodId: 'method',
          paymentMethodName: 'Bank transfer (label only)',
          ...extra,
        },
      } as never,
      backend.runtime,
    );
  return { ...backend, save, payment };
}
describe('shared merchant reference settings and documentary dates', () => {
  it('keeps a direct-payment method descriptive, preserves actual recording time, and replays after method rename', async () => {
    const b = setup();
    await b.save();
    const input = {
      auth: { uid: 'u' },
      data: {
        action: 'directPayment',
        spaceId: 's',
        storeId: 'store',
        merchantId: 'm',
        operationId: 'direct-method',
        currency: 'TRY',
        amountExact: '130.00',
        customerId: 'c',
        operationDate: '2026-01-01',
        paymentMethodId: 'method',
        paymentMethodName: 'Bank transfer (label only)',
      },
    };
    await merchantCommandHandler(input as never, b.runtime);
    expect(b.docs['spaces/s/merchantOperations/direct-method']).toMatchObject({
      paymentMethodName: 'Bank transfer (label only)',
      operationDate: '2026-01-01',
      createdAt: workspaceTestTime,
      cashDeltaExact: '0.00',
      source: 'customer-to-merchant',
    });
    expect(Object.keys(b.docs).some((path) => path.startsWith('spaces/s/transactions/'))).toBe(false);
    b.docs['spaces/s/merchantSettings/config'].paymentMethods[0].name = 'Renamed';
    const writes = b.writes.length;
    await expect(merchantCommandHandler(input as never, b.runtime)).resolves.toMatchObject({ outcome: 'replayed' });
    expect(b.writes).toHaveLength(writes);
    await expect(
      merchantCommandHandler({ ...input, data: { ...input.data, operationId: 'new-direct' } } as never, b.runtime),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(b.writes).toHaveLength(writes);
  });
  it.each(['owner', 'editor'])('%s saves shared settings without financial postings', async (role) => {
    const b = setup(role);
    await b.save();
    expect(b.docs['spaces/s/merchantSettings/config']).toMatchObject({
      ...settings(),
      revision: 1,
      version: 1,
      workspaceId: 's',
      storeId: 'store',
    });
    expect(b.writes).toEqual(['spaces/s/merchantSettings/config', 'spaces/s/operationReceipts/settings']);
  });
  it.each(['viewer', 'manager', null])('rejects role %s', async (role) => {
    const b = setup(role);
    await expect(b.save()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(b.writes).toEqual([]);
  });
  it('binds settings receipts to actor, payload and scope; replay does not increase revision', async () => {
    const b = setup();
    await b.save();
    const count = b.writes.length;
    expect(await b.save()).toMatchObject({ outcome: 'replayed', revision: 1 });
    expect(b.writes.length).toBe(count);
    await expect(b.save({ ...settings(), paymentMethods: [] })).rejects.toMatchObject({ code: 'already-exists' });
    b.docs['spaces/s/members/u'].role = 'viewer';
    await expect(b.save()).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('uses expected revisions to prevent silent concurrent overwrite', async () => {
    const b = setup();
    const replies = await Promise.allSettled([b.save(settings(), 'a'), b.save(settings(), 'b')]);
    expect(replies.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect((replies.find((row) => row.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({
      code: 'aborted',
    });
    expect(b.docs['spaces/s/merchantSettings/config'].revision).toBe(1);
  });
  it('rechecks fresh role when a transaction is retried', async () => {
    const b = setup();
    b.retryOnce(() => {
      b.docs['spaces/s/members/u'].role = 'viewer';
    });
    await expect(b.save()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(b.writes).toEqual([]);
  });
  it('blocks corrupt settings and foreign stores rather than overwriting them', async () => {
    const b = setup();
    b.docs['spaces/s/merchantSettings/config'] = {
      ...settings(),
      revision: 1,
      workspaceId: 'other',
      storeId: 'store',
      version: 1,
    };
    await expect(b.save()).rejects.toMatchObject({ code: 'data-loss' });
    expect(b.writes).toEqual([]);
  });
  it.each(['2026-02-30', '2025-02-29', '2026-13-01', '0000-01-01', '2026-1-01', '2026-10-01T00:00:00Z', ''])(
    'rejects invalid documentary date %s',
    (value) => {
      expect(() => merchantOperationDate(value)).toThrow();
    },
  );
  it('defaults to the local calendar day without UTC conversion', () => {
    const local = new Date(2026, 9, 20, 0, 1);
    expect(localMerchantDate(local)).toBe('2026-10-20');
    expect(merchantOperationDate('2024-02-29')).toBe('2024-02-29');
  });
  it('stores method as a snapshot label, deducts exactly 5000 cash and retains actual accounting time', async () => {
    const b = setup();
    await b.save();
    await b.payment();
    const op = b.docs['spaces/s/merchantOperations/pay'];
    expect(op).toMatchObject({
      operationDate: '2026-10-01',
      createdAt: workspaceTestTime,
      paymentMethodName: 'Bank transfer (label only)',
      cashDeltaExact: '-5000.00',
      balanceAfterExact: '-5000.00',
    });
    const cash = Object.entries(b.docs)
      .filter(([path]) => path.startsWith('spaces/s/transactions/'))
      .map(([, row]) => row);
    expect(cash).toHaveLength(1);
    expect(cash[0]).toMatchObject({
      type: 'cash_out',
      amount: 5000,
      merchantName: 'Merchant',
      createdAt: workspaceTestTime,
      operationDate: '2026-10-01',
    });
    // Renaming/disabling reference entries cannot alter old operation details or prevent an exact replay.
    const changed = {
      ...settings(),
      revision: 1,
      paymentMethods: [{ id: 'method', name: 'Renamed', isActive: false }],
    };
    await b.save(changed, 'change');
    await expect(b.payment()).resolves.toMatchObject({ outcome: 'replayed' });
    expect(b.docs['spaces/s/merchantOperations/pay']).toEqual(op);
    await expect(b.payment({ operationId: 'other' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it.each([
    { operationDate: '2026-02-30' },
    { paymentMethodName: 'Forged' },
    { paymentMethodId: 'missing' },
    { source: 'external' },
    { paymentMethodName: undefined },
  ])('rejects invalid method/date metadata %j without posting', async (extra) => {
    const b = setup();
    await b.save();
    const count = b.writes.length;
    await expect(b.payment(extra)).rejects.toBeTruthy();
    expect(b.writes.length).toBe(count);
  });
  it('rejects a changed date/method name under a used operationId', async () => {
    const b = setup();
    await b.save();
    await b.payment();
    await expect(b.payment({ operationDate: '2026-10-02' })).rejects.toMatchObject({ code: 'already-exists' });
    await expect(b.payment({ paymentMethodName: 'Changed' })).rejects.toMatchObject({ code: 'already-exists' });
  });
  it.each(['ar', 'en', 'tr'] as const)(
    'preserves documentary metadata in normalization, archive snapshots and %s presentation',
    async (language) => {
      const b = setup();
      await b.save();
      await b.payment();
      const op = merchantOperationFromDocument('pay', b.docs['spaces/s/merchantOperations/pay'], 's', 'store');
      const event = merchantJournalEvent(op);
      expect(event.occurredAt).toBe(workspaceTestTime);
      expect(event.operationDate).toBe('2026-10-01');
      expect(journalEventDetails(event, language, (key) => translate(key, language)).join('\n')).toContain(
        'Bank transfer (label only)',
      );
      expect(() => mergeMerchantHistory([op], [{ ...op, operationDate: '2026-10-02' }])).toThrow(
        'merchantHistoryChanged',
      );
    },
  );
  it.each([
    { ...settings(), revision: -1 },
    { ...settings(), paymentMethods: [...settings().paymentMethods, ...settings().paymentMethods] },
    { ...settings(), materials: [{ ...settings().materials[0], prices: { TRY: '1.00001' } }] },
    { ...settings(), materials: [{ ...settings().materials[0], prices: { BAD: '1' } }] },
    {
      ...settings(),
      paymentMethods: Array.from({ length: 31 }, (_, i) => ({ id: `m${i}`, name: 'x', isActive: true })),
    },
    { ...settings(), materials: Array.from({ length: 101 }, (_, i) => ({ ...settings().materials[0], id: `i${i}` })) },
  ])('rejects unsafe or unbounded settings', (value) => expect(() => validateMerchantSettings(value)).toThrow());
});
