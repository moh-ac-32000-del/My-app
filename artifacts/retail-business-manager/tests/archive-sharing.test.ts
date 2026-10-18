import { describe, expect, it } from 'vitest';
import { translate } from '@/constants/i18n';
import { formatMoney } from '@/constants/currencies';
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
  it.each(['ar', 'en', 'tr'] as const)('shares only the saved closing balance in %s, not daily net or current cash', (language) => {
    const localized = (key: Parameters<typeof translate>[0]) => translate(key, language);
    const selected: DailyArchive = {
      ...archiveTwo,
      closingCashBalances: [{ currency: 'TRY', amount: 750 }, { currency: 'USD', amount: -20 }, { currency: 'EUR', amount: 0 }],
    };
    const before = JSON.stringify(selected);
    const message = buildArchiveShareMessage(selected, 'My shop', language, localized);
    expect(message).toContain(localized('cashBalanceAtClosing'));
    expect(message).toContain(`• ${formatMoney(750, 'TRY', language)} (TRY)`);
    expect(message).toContain(`• ${formatMoney(-20, 'USD', language)} (USD)`);
    expect(message).toContain(`• ${formatMoney(0, 'EUR', language)} (EUR)`);
    expect(message).not.toContain(localized('closingBalanceUnavailable'));
    expect(JSON.stringify(selected)).toBe(before);
  });

  it('explains missing legacy balances without inferring them from event amounts', () => {
    const message = buildArchiveShareMessage(archiveOne, '', 'en', t);
    expect(message).toContain(t('closingBalanceUnavailable'));
    expect(message).not.toContain(`• ${formatMoney(1000, 'TRY', 'en')}`);
  });

  it('distinguishes a saved empty cash snapshot from an unavailable legacy balance', () => {
    const message = buildArchiveShareMessage({ ...archiveOne, snapshot: [], closingCashBalances: [] }, '', 'en', t);
    expect(message).toContain(t('closingNoCashMovements'));
    expect(message).not.toContain(t('closingBalanceUnavailable'));
  });
  it.each(['ar', 'en', 'tr'] as const)('labels selected-closing scope and operation icons in %s', (language) => {
    const localized = (key: Parameters<typeof translate>[0]) => translate(key, language);
    const message = buildArchiveShareMessage(archiveTwo, 'My shop', language, localized);
    expect(message).toContain(localized('shareSelectedClosingOnly'));
    expect(message).toContain(`📥 ${localized('cashIn')}`);
    expect(message).toContain(`📤 ${localized('cashOut')}`);
    expect(message).toContain(`📝 ${localized('archiveDebt')}`);
    expect(message).toContain(`✅ ${localized('settlementFrom')}`);
    expect(message).not.toContain('Opening');
  });
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
