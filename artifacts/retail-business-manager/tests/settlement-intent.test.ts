import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/services/firebase', () => ({ isFirebaseConfigured: true, getFirebaseApp: () => ({}) }));
vi.mock('firebase/functions', () => ({ getFunctions: () => ({}), httpsCallable: () => state.call }));
import { settleCustomerDebtInCloud } from '@/services/settlementFirestore';

beforeEach(() => {
  state.call.mockReset();
});
const draft = { amount: 130, currency: 'TRY' as const, intentId: 'stable-intent' };
const accepted = (request: Record<string, unknown>) => ({
  data: {
    outcome: 'completed',
    transactionId: request.transactionId,
    paymentId: request.paymentId,
    processedAt: '2026-10-19T12:00:00.000Z',
  },
});
describe('customer cash settlement request identity', () => {
  it('reuses all three record IDs and the full payload after an uncertain response', async () => {
    state.call.mockRejectedValueOnce({ code: 'functions/unavailable' }).mockImplementation(accepted);
    await expect(settleCustomerDebtInCloud('s', 'store', 'c', draft)).rejects.toMatchObject({
      code: 'functions/unavailable',
    });
    const result = await settleCustomerDebtInCloud('s', 'store', 'c', draft);
    expect(state.call.mock.calls[0]).toEqual(state.call.mock.calls[1]);
    expect(state.call.mock.calls[0][0]).toMatchObject({
      operationId: 'customer_settlement_stable-intent',
      transactionId: 'customer_cash_stable-intent',
      paymentId: 'customer_payment_stable-intent',
      amount: 130,
    });
    expect(result.transaction.amount).toBe(130);
    expect(result.transaction.createdAt).toBe('2026-10-19T12:00:00.000Z');
  });
  it('preserves the legacy API without an explicit intent ID', async () => {
    state.call.mockImplementation(accepted);
    await expect(settleCustomerDebtInCloud('s', 'store', 'c', { amount: 10, currency: 'TRY' })).resolves.toMatchObject({
      transaction: { amount: 10 },
      debts: [],
      payments: [],
    });
    expect(state.call.mock.calls[0][0].operationId).toMatch(/^settlement_/);
  });
  it('rejects invalid intent identifiers before sending financial data', async () => {
    await expect(settleCustomerDebtInCloud('s', 'store', 'c', { ...draft, intentId: '../other' })).rejects.toThrow(
      'invalidSettlementIntent',
    );
    expect(state.call).not.toHaveBeenCalled();
  });
  it('does not treat a mismatched server receipt as success', async () => {
    state.call.mockResolvedValue({
      data: {
        outcome: 'completed',
        transactionId: 'other',
        paymentId: 'other',
        processedAt: '2026-10-19T12:00:00.000Z',
      },
    });
    await expect(settleCustomerDebtInCloud('s', 'store', 'c', draft)).rejects.toThrow('invalidSettlementResponse');
  });
});
