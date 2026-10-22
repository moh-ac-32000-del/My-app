import { describe, expect, it } from 'vitest';
import type { Customer, Debt, Payment, Transaction } from '@/types/business';
import { projectCloudDailyJournalEvents, projectDailyJournalEvents } from '@/services/dailyJournalProjection';
import { loadCloudDailyArchives } from '@/services/cloudDailyArchives';
import { beforeEach, vi } from 'vitest';

vi.mock('@/services/cloudDailyArchives', () => ({ loadCloudDailyArchives: vi.fn() }));

const now = new Date('2026-09-13T12:00:00.000Z');

const customer: Customer = {
  id: 'customer-A',
  storeId: 'store-A',
  name: 'Customer A',
  isActive: true,
  createdAt: '2026-09-13T08:00:00.000Z',
  updatedAt: '2026-09-13T08:00:00.000Z',
};

const transaction: Transaction = {
  id: 'transaction-A',
  storeId: 'store-A',
  type: 'cash_in',
  amount: 100,
  currency: 'TRY',
  createdAt: '2026-09-13T09:00:00.000Z',
  updatedAt: '2026-09-13T09:00:00.000Z',
};

const debt: Debt = {
  id: 'debt-A',
  storeId: 'store-A',
  workspaceId: 'space-A',
  createdByUserId: 'user-A',
  customerId: customer.id,
  amount: 75,
  originalAmount: 75,
  currency: 'TRY',
  createdAt: '2026-09-13T10:00:00.000Z',
  updatedAt: '2026-09-13T10:00:00.000Z',
};

const payment: Payment = {
  id: 'payment-A',
  storeId: 'store-A',
  workspaceId: 'space-A',
  createdByUserId: 'user-A',
  amount: { amount: 50, currency: 'TRY' },
  direction: 'in',
  method: 'cash',
  customerId: customer.id,
  transactionId: 'transaction-settlement',
  paidAt: '2026-09-13T11:00:00.000Z',
  createdAt: '2026-09-13T11:00:00.000Z',
  updatedAt: '2026-09-13T11:00:00.000Z',
};

describe('Cloud Daily Journal projection', () => {
  beforeEach(() => vi.clearAllMocks());
  it('projects Cloud sources with existing semantics and newest-first ordering', () => {
    const settlementTransaction: Transaction = {
      ...transaction,
      id: 'transaction-settlement',
      amount: 50,
      createdAt: '2026-09-13T11:00:00.000Z',
      updatedAt: '2026-09-13T11:00:00.000Z',
    };

    expect(projectDailyJournalEvents(
      'store-A',
      {
        transactions: [transaction, settlementTransaction],
        debts: [debt],
        payments: [payment],
        customers: [customer],
      },
      [],
      now,
    )).toEqual([
      {
        id: 'settlement:payment-A',
        storeId: 'store-A',
        type: 'settlement',
        amount: 50,
        currency: 'TRY',
        customerId: 'customer-A',
        customerName: 'Customer A',
        occurredAt: '2026-09-13T11:00:00.000Z',
        sourceId: 'payment-A',
        createdByUserId: 'user-A',
      },
      {
        id: 'debt:debt-A',
        storeId: 'store-A',
        type: 'debt',
        amount: 75,
        currency: 'TRY',
        customerId: 'customer-A',
        customerName: 'Customer A',
        occurredAt: '2026-09-13T10:00:00.000Z',
        sourceId: 'debt-A',
        createdByUserId: 'user-A',
      },
      {
        id: 'transaction:transaction-A',
        storeId: 'store-A',
        type: 'cash_in',
        amount: 100,
        currency: 'TRY',
        occurredAt: '2026-09-13T09:00:00.000Z',
        sourceId: 'transaction-A',
      },
    ]);
  });

  it('suppresses events already present in the current local archive snapshot', () => {
    expect(projectDailyJournalEvents(
      'store-A',
      { transactions: [transaction], debts: [], payments: [], customers: [] },
      [{
        id: 'archive:store-A:2026-09-13:1',
        storeId: 'store-A',
        date: '2026-09-13',
        closedAt: '2026-09-13T11:30:00.000Z',
        closingNumber: 1,
        snapshot: [{
          id: 'transaction:transaction-A',
          storeId: 'store-A',
          type: 'cash_in',
          amount: 100,
          currency: 'TRY',
          occurredAt: '2026-09-13T09:00:00.000Z',
          sourceId: 'transaction-A',
        }],
      }],
      now,
    )).toEqual([]);
  });

  it('loads archived event IDs from Firestore rather than local archive storage', async () => {
    vi.mocked(loadCloudDailyArchives).mockResolvedValue([{
      id: '2026-09-13_000001',
      storeId: 'store-A',
      date: '2026-09-13',
      closedAt: '2026-09-13T11:30:00.000Z',
      closingNumber: 1,
      snapshot: [{
        id: 'transaction:transaction-A',
        storeId: 'store-A',
        type: 'cash_in',
        amount: 100,
        currency: 'TRY',
        occurredAt: '2026-09-13T09:00:00.000Z',
        sourceId: 'transaction-A',
      }],
    }]);
    await expect(projectCloudDailyJournalEvents('space-A', 'store-A', {
      transactions: [transaction], debts: [], payments: [], customers: [],
    }, now)).resolves.toEqual([]);
    expect(loadCloudDailyArchives).toHaveBeenCalledWith('space-A', 'store-A');
  });
  });
