import { describe, expect, it } from 'vitest';
import {
  buildDailyJournalEvents,
  calculateDebtTotals,
  calculateVisibleCurrencyBalances,
  createCashTransaction,
  createDebt,
  createPayment,
  createReminder,
  filterDebtsByCustomer,
  filterPaymentsByCustomer,
  parseLocalizedAmountInput,
  validateCashTransactionDraft,
  validateDebtInput,
  validatePaymentInput,
  validateReminderInput,
} from '@/services/storage';
import type { Customer, Debt, Payment, Transaction } from '@/types/business';

const timestamp = '2026-08-29T15:30:00.000Z';

describe('cloud-shared business logic without local persistence', () => {
  it('validates and constructs cash transaction drafts without saving them locally', () => {
    expect(validateCashTransactionDraft({ storeId: 'store-a', type: 'cash_in', amount: 125, currency: 'TRY' })).toBeNull();
    expect(validateCashTransactionDraft({ storeId: 'store-a', type: 'cash_in', amount: 0, currency: 'TRY' })).toBe('amountInvalid');

    const transaction = createCashTransaction('store-a', {
      type: 'cash_out', amount: 25, currency: 'USD', note: ' supplies ',
    }, timestamp);
    expect(transaction).toMatchObject({
      storeId: 'store-a', type: 'cash_out', amount: 25, currency: 'USD',
      note: 'supplies', createdAt: timestamp, updatedAt: timestamp,
    });
  });

  it('validates debt records and calculates per-currency totals', () => {
    const debt = createDebt('store-a', 'customer-a', { amount: 500, currency: 'USD', dueDate: '2026-09-30' }, timestamp);
    expect(validateDebtInput(debt)).toBeNull();
    expect(validateDebtInput({ ...debt, amount: -1 })).toBe('amountInvalid');

    const second = { ...debt, id: 'debt-b', currency: 'TRY' as const, amount: 200, customerId: 'customer-b' };
    expect(calculateDebtTotals([debt, second])).toMatchObject({ USD: 500, TRY: 200 });
    expect(filterDebtsByCustomer([debt, second], 'customer-a')).toEqual([debt]);
  });

  it('validates and constructs reminders and payments for trusted cloud commands', () => {
    const reminder = createReminder('store-a', 'debt-a', { remindAt: '2026-09-01T09:00:00.000Z' }, timestamp);
    expect(validateReminderInput(reminder)).toBeNull();
    expect(validateReminderInput({ ...reminder, status: 'unknown' })).toBe('reminderStatusInvalid');

    const payment = createPayment('store-a', 'customer-a', { amount: 100, currency: 'TRY', transactionId: 'cash-a' }, timestamp);
    expect(validatePaymentInput(payment)).toBeNull();
    expect(validatePaymentInput({ ...payment, amount: { amount: 0, currency: 'TRY' } })).toBe('amountInvalid');
    expect(filterPaymentsByCustomer([payment], 'customer-a')).toEqual([payment]);
  });

  it('calculates visible currency balances without merging currencies', () => {
    const transactions: Transaction[] = [
      { id: 'in', storeId: 'store-a', type: 'cash_in', amount: 200, currency: 'TRY', createdAt: timestamp, updatedAt: timestamp },
      { id: 'out', storeId: 'store-a', type: 'cash_out', amount: 50, currency: 'TRY', createdAt: timestamp, updatedAt: timestamp },
      { id: 'usd', storeId: 'store-a', type: 'cash_in', amount: 20, currency: 'USD', createdAt: timestamp, updatedAt: timestamp },
    ];
    expect(calculateVisibleCurrencyBalances(transactions, ['TRY', 'USD', 'TRY'])).toEqual([
      { currency: 'TRY', amount: 150 },
      { currency: 'USD', amount: 20 },
    ]);
  });

  it('projects daily journal events and excludes the cash transaction linked to a settlement', () => {
    const customer: Customer = {
      id: 'customer-a', storeId: 'store-a', name: 'Customer A', isActive: true,
      createdAt: timestamp, updatedAt: timestamp,
    };
    const cash: Transaction = {
      id: 'cash-a', storeId: 'store-a', type: 'cash_in', amount: 50, currency: 'TRY',
      createdAt: timestamp, updatedAt: timestamp,
    };
    const settlementCash: Transaction = {
      id: 'settlement-cash', storeId: 'store-a', type: 'cash_in', amount: 100, currency: 'TRY',
      createdAt: timestamp, updatedAt: timestamp,
    };
    const debt: Debt = {
      id: 'debt-a', storeId: 'store-a', customerId: customer.id, amount: 300, currency: 'TRY',
      createdAt: timestamp, updatedAt: timestamp,
    };
    const payment: Payment = {
      id: 'payment-a', storeId: 'store-a', customerId: customer.id, transactionId: settlementCash.id,
      amount: { amount: 100, currency: 'TRY' }, direction: 'in', method: 'cash',
      paidAt: timestamp, createdAt: timestamp, updatedAt: timestamp,
    };

    const events = buildDailyJournalEvents(
      'store-a', [cash, settlementCash], [debt], [payment], [customer], new Date(timestamp),
    );
    expect(events.map((event) => event.id)).toEqual([
      'transaction:cash-a', 'debt:debt-a', 'settlement:payment-a',
    ]);
    expect(events.find((event) => event.id === 'debt:debt-a')?.customerName).toBe('Customer A');
  });

  it('parses amounts according to the selected interface language', () => {
    expect(parseLocalizedAmountInput('1.234,50', 'tr')).toBe(1234.5);
    expect(parseLocalizedAmountInput('1,234.50', 'en')).toBe(1234.5);
    expect(parseLocalizedAmountInput('not a number', 'en')).toBeNull();
  });
});
