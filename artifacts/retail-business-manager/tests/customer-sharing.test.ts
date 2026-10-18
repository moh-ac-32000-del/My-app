import { describe, expect, it } from 'vitest';
import { formatMoney } from '@/constants/currencies';
import { translate, type Language } from '@/constants/i18n';
import { buildCustomerStatement } from '@/services/customerSharing';
import type { Customer, Debt } from '@/types/business';

const now = new Date('2026-10-18T12:00:00.000Z');
const customer: Customer = {
  id: 'customer-a', storeId: 'store-a', name: 'Test customer',
  phone: '+123456789', isActive: true, createdAt: now.toISOString(), updatedAt: now.toISOString(),
};
const debt: Debt = {
  id: 'debt-a', storeId: 'store-a', customerId: customer.id,
  currency: 'TRY', amount: 70, originalAmount: 100,
  createdAt: now.toISOString(), updatedAt: now.toISOString(),
};

describe('customer sharing', () => {
  it.each<Language>(['ar', 'en', 'tr'])('formats remaining debt in %s without changing financial values', (language) => {
    const debts: Debt[] = [debt, { ...debt, id: 'debt-b', currency: 'USD', amount: 20 }];
    const before = JSON.stringify({ customer, debts });
    const t = (key: Parameters<typeof translate>[0]) => translate(key, language);
    const message = buildCustomerStatement(customer, debts, language, t, '  My shop  ', now);
    expect(message).toContain(`💰 ${t('statementOutstanding')}:`);
    expect(message).toContain(`• ${formatMoney(70, 'TRY', language)} (TRY)`);
    expect(message).toContain(`• ${formatMoney(20, 'USD', language)} (USD)`);
    expect(message).toContain(t('shareSeparateCurrencies'));
    expect(message).toContain('🏪 My shop');
    expect(message).toContain('👤');
    expect(message).toContain(customer.name);
    expect(message).toContain(customer.phone);
    expect(message).not.toContain(formatMoney(100, 'TRY', language));
    expect(JSON.stringify({ customer, debts })).toBe(before);
  });

  it('reports paid-off debt as no outstanding balance, not missing records', () => {
    const t = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    const message = buildCustomerStatement({ ...customer, phone: undefined }, [{ ...debt, amount: 0 }], 'en', t, '', now);
    expect(message).toContain(`✅ ${t('statementNoOutstanding')}`);
    expect(message).not.toContain(t('statementNoDebtData'));
    expect(message).not.toContain('🏪');
    expect(message).not.toContain('📞');
    expect(message).not.toContain('(TRY)');
    expect(message).not.toContain('undefined');
  });
});
