import { describe, expect, it } from 'vitest';
import { customerPaymentJournalAmount } from '../data/customerPaymentJournal';
import { buildDailyJournalEvents } from '../services/storage';

describe('corrected payments retain their original drawer posting in the journal', () => {
  it('does not apply a cash difference twice after an edit or cancellation', () => {
    const now = new Date('2026-10-23T12:00:00Z');
    const payment = { id: 'p', storeId: 'store', customerId: 'c', direction: 'in', method: 'cash',
      transactionId: 'cash', amount: { amount: 50, currency: 'TRY' }, cashBaseAmountExact: '80.00',
      paidAt: now.toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() };
    const cash = [ { id: 'cash', type: 'cash_in', amount: 80 }, { id: 'adjust', type: 'cash_out', amount: 30 } ]
      .map(row => ({ ...row, storeId: 'store', currency: 'TRY', createdAt: now.toISOString(), updatedAt: now.toISOString() }));
    const events = buildDailyJournalEvents('store', cash as any, [], [payment] as any, [], now);
    expect(events.filter(event => event.type === 'settlement').map(event => event.amount)).toEqual([80]);
    expect(events.reduce((sum, event) => sum + (event.type === 'cash_out' ? -event.amount : event.amount), 0)).toBe(50);
    const cancelled = buildDailyJournalEvents('store', [...cash, { ...cash[1], id: 'cancel', amount: 50 }] as any,
      [], [{ ...payment, cancelled: true }] as any, [], now);
    expect(cancelled.reduce((sum, event) => sum + (event.type === 'cash_out' ? -event.amount : event.amount), 0)).toBe(0);
    expect(payment.amount.amount).toBe(50);
  });
  it('preserves legacy postings and rejects inconsistent correction metadata', () => {
    expect(customerPaymentJournalAmount({ amount: { amount: 12.345 } })).toBe(12.345);
    expect(customerPaymentJournalAmount({ transactionId: 'cash', cashBaseAmountExact: '12.345' })).toBe(12.345);
    expect(() => customerPaymentJournalAmount({ amount: { amount: 50 }, cashBaseAmountExact: '80.00' })).toThrow();
    expect(() => customerPaymentJournalAmount({ transactionId: 'cash', cashBaseAmountExact: '-80.00' })).toThrow();
  });
});
