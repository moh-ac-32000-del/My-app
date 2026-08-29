import { describe, expect, it } from 'vitest';
import { translate } from '@/constants/i18n';
import { buildArchiveShareMessage } from '@/services/archiveSharing';
import type { DailyArchive } from '@/types/business';

const archiveOne: DailyArchive = {
  id: 'archive:store-a:2026-08-29:1',
  storeId: 'store-a',
  date: '2026-08-29',
  closedAt: '2026-08-29T14:00:00.000Z',
  closingNumber: 1,
  snapshot: [
    {
      id: 'transaction:opening',
      storeId: 'store-a',
      type: 'cash_in',
      amount: 1000,
      currency: 'TRY',
      note: 'Opening',
      occurredAt: '2026-08-29T10:00:00.000Z',
      sourceId: 'opening',
    },
  ],
};

const archiveTwo: DailyArchive = {
  id: 'archive:store-a:2026-08-29:2',
  storeId: 'store-a',
  date: '2026-08-29',
  closedAt: '2026-08-29T18:00:00.000Z',
  closingNumber: 2,
  snapshot: [
    {
      id: 'transaction:cash-in-two',
      storeId: 'store-a',
      type: 'cash_in',
      amount: 500,
      currency: 'TRY',
      occurredAt: '2026-08-29T16:00:00.000Z',
      sourceId: 'cash-in-two',
    },
    {
      id: 'transaction:cash-out-two',
      storeId: 'store-a',
      type: 'cash_out',
      amount: 200,
      currency: 'USD',
      note: 'Supplier payment',
      occurredAt: '2026-08-29T16:05:00.000Z',
      sourceId: 'cash-out-two',
    },
    {
      id: 'debt:customer-debt-two',
      storeId: 'store-a',
      type: 'debt',
      amount: 300,
      currency: 'EUR',
      customerId: 'customer-mohammed',
      customerName: 'Mohammed',
      occurredAt: '2026-08-29T16:10:00.000Z',
      sourceId: 'customer-debt-two',
    },
    {
      id: 'settlement:customer-settlement-two',
      storeId: 'store-a',
      type: 'settlement',
      amount: 100,
      currency: 'TRY',
      customerId: 'customer-mohammed',
      customerName: 'Mohammed',
      note: 'Partial payment',
      occurredAt: '2026-08-29T17:00:00.000Z',
      sourceId: 'customer-settlement-two',
    },
  ],
};

const t = (key: Parameters<typeof translate>[0]) => translate(key, 'en');

describe('archive sharing', () => {
  it('shares only the selected closing snapshot with all event details and independent currencies', () => {
    const before = JSON.stringify(archiveTwo);
    const message = buildArchiveShareMessage(archiveTwo, 'Acme Electronics', 'en', t);

    expect(message).toContain('Acme Electronics');
    expect(message).toContain('Close cash #2');
    expect(message).toContain('Cash in');
    expect(message).toContain('Cash out');
    expect(message).toContain('Debt — Mohammed');
    expect(message).toContain('Settlement from Mohammed');
    expect(message).toContain('(TRY)');
    expect(message).toContain('(USD)');
    expect(message).toContain('(EUR)');
    expect(message).toContain('Supplier payment');
    expect(message).toContain('Partial payment');
    expect(message).not.toContain('Opening');
    expect(message).not.toContain('Close cash #1');
    expect(message).not.toContain('TRY + USD');
    expect(JSON.stringify(archiveTwo)).toBe(before);
  });

  it('uses one archive at a time and does not mutate the selected archive', () => {
    const archiveOneBefore = JSON.stringify(archiveOne);
    const message = buildArchiveShareMessage(archiveOne, '', 'en', t);

    expect(message).toContain('Close cash #1');
    expect(message).toContain('Cash in');
    expect(message).toContain('(TRY)');
    expect(message).not.toContain('Close cash #2');
    expect(JSON.stringify(archiveOne)).toBe(archiveOneBefore);
  });
});