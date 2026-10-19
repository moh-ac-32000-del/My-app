import { describe, expect, it } from 'vitest';
import { createMerchantHistorySession, mergeMerchantHistory } from '@/data/merchantHistory';
import type { MerchantOperation } from '@/types/merchant';

const row = (id: string, createdAt = '2026-10-19T12:00:00.000Z'): MerchantOperation => ({
  id,
  createdAt,
  workspaceId: 's',
  storeId: 'store',
  merchantId: 'm',
  merchantName: 'Merchant',
  action: 'payment',
  currency: 'TRY',
  balanceBeforeExact: '100.00',
  balanceAfterExact: '90.00',
  cashDeltaExact: '-10.00',
  amountExact: '10.00',
  createdByUserId: 'u',
  note: 'Payment',
});
describe('merchant statement history pages', () => {
  it('keeps the initial head bounded until older records are explicitly requested', () => {
    const session = createMerchantHistorySession();
    session.receiveHead([row('2'), row('1')], true);
    expect(session.receiveHead([row('3'), row('2')], true).operations.map((row) => row.id)).toEqual(['3', '2']);
  });
  it('does not lose the boundary row when a new operation arrives while an older page is loading', () => {
    const session = createMerchantHistorySession();
    session.receiveHead([row('3'), row('2')], true);
    expect(session.beginPage()).toEqual({ id: '2', createdAt: row('2').createdAt });
    session.receiveHead([row('4'), row('3')], true);
    expect(session.completePage([row('1')], false).operations.map((row) => row.id)).toEqual(['4', '3', '2', '1']);
    expect(session.beginPage()).toBeNull();
  });
  it('permits only one older-page request at a time', () => {
    const session = createMerchantHistorySession();
    session.receiveHead([row('2')], true);
    expect(session.beginPage()).not.toBeNull();
    expect(session.beginPage()).toBeNull();
    expect(session.view().historyLoading).toBe(true);
    session.completePage([row('1')], true);
    expect(session.view().historyLoading).toBe(false);
    expect(session.beginPage()?.id).toBe('1');
  });
  it('deduplicates overlapping page boundaries without changing amounts', () => {
    const result = mergeMerchantHistory([row('2')], [row('2'), row('1')]);
    expect(result.map((row) => row.id)).toEqual(['2', '1']);
    expect(result[0].amountExact).toBe('10.00');
  });
  it('uses Firestore code-point tie ordering, not localized letter order', () => {
    expect(
      mergeMerchantHistory(
        [],
        ['A', '_', 'a', '\uE000', '😀'].map((id) => row(id)),
      ).map((row) => row.id),
    ).toEqual(['😀', '\uE000', 'a', '_', 'A']);
  });
  it('does not permit a statement from another workspace/store/merchant to be merged', () => {
    expect(() => mergeMerchantHistory([row('2')], [{ ...row('1'), merchantId: 'other' }])).toThrow(
      'merchantHistoryScopeMismatch',
    );
    expect(() => mergeMerchantHistory([row('2')], [{ ...row('1'), workspaceId: 'other' }])).toThrow();
  });
  it('rejects an immutable financial payload changing under the same operation ID', () => {
    expect(() => mergeMerchantHistory([row('2')], [{ ...row('2'), amountExact: '20.00' }])).toThrow(
      'merchantHistoryChanged',
    );
    const session = createMerchantHistorySession();
    session.receiveHead([row('2')], true);
    expect(() => session.receiveHead([{ ...row('2'), cashDeltaExact: '-20.00' }], true)).toThrow();
  });
  it('projects a newly received canonical reversal link onto an already-loaded older row', () => {
    const original = row('original');
    const reverse = {
      ...row('reverse', '2026-10-20T12:00:00.000Z'),
      action: 'reverse' as const,
      reversesOperationId: 'original',
      balanceBeforeExact: '90.00',
      balanceAfterExact: '100.00',
      cashDeltaExact: '10.00',
      note: 'Correction',
    };
    const result = mergeMerchantHistory([original], [reverse]);
    expect(result.find((row) => row.id === 'original')).toMatchObject({
      ...original,
      reversedByOperationId: 'reverse',
    });
    expect(original.reversedByOperationId).toBeUndefined();
  });
  it('does not undo an already-confirmed reversal marker when another snapshot lacks it', () => {
    expect(
      mergeMerchantHistory([{ ...row('original'), reversedByOperationId: 'reverse' }], [row('original')])[0]
        .reversedByOperationId,
    ).toBe('reverse');
    expect(() =>
      mergeMerchantHistory(
        [{ ...row('original'), reversedByOperationId: 'one' }],
        [{ ...row('original'), reversedByOperationId: 'two' }],
      ),
    ).toThrow();
  });
  it('discards late pages after leaving the account or workspace', () => {
    const session = createMerchantHistorySession();
    session.receiveHead([row('2')], true);
    session.beginPage();
    session.stop();
    expect(session.completePage([row('1')], false).operations).toEqual([]);
    expect(session.receiveHead([row('3')], true).operations).toEqual([]);
    expect(session.isActive()).toBe(false);
  });
});
