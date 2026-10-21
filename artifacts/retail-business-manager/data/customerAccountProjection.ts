import { CURRENCY_OPTIONS, isCurrencyCode, type CurrencyCode } from '@/constants/currencies';
import { addCustomerExact, customerBalanceExact } from '@/data/customerCreditAccounting';
import type { Debt } from '@/types/business';
import type { CustomerCredit } from '@/types/merchant';

/** Read projections of current Firestore remaining debt and trusted credit, never old payments again. */
export function projectCustomerAccounts(debts: Debt[], credits: CustomerCredit[], spaceId: string, storeId: string) {
  if (!spaceId.trim() || !storeId.trim()) throw new Error('invalidCustomerAccountScope');
  const groups = new Map<string, { customerId: string; currency: CurrencyCode; debts: Debt[]; credit: string }>();
  const group = (customerId: string, currency: CurrencyCode) => {
    const key = JSON.stringify([customerId, currency]);
    let value = groups.get(key);
    if (!value) {
      value = { customerId, currency, debts: [], credit: '0.00' };
      groups.set(key, value);
    }
    return value;
  };
  const debtIds = new Set<string>();
  for (const debt of debts) {
    if (
      debt.workspaceId !== spaceId ||
      debt.storeId !== storeId ||
      debtIds.has(debt.id) ||
      !debt.customerId?.trim() ||
      !isCurrencyCode(debt.currency)
    )
      throw new Error('invalidCustomerAccountScope');
    debtIds.add(debt.id);
    group(debt.customerId, debt.currency).debts.push(debt);
  }
  const creditKeys = new Set<string>();
  for (const credit of credits) {
    const key = JSON.stringify([credit.customerId, credit.currency]);
    if (
      credit.workspaceId !== spaceId ||
      credit.storeId !== storeId ||
      creditKeys.has(key) ||
      !credit.customerId?.trim() ||
      !isCurrencyCode(credit.currency)
    )
      throw new Error('invalidCustomerCreditScope');
    creditKeys.add(key);
    group(credit.customerId, credit.currency).credit = credit.creditExact;
  }
  const accounts = [...groups.values()].map((value) => ({
    customerId: value.customerId,
    currency: value.currency,
    balanceExact: customerBalanceExact(value.debts, value.credit),
  }));
  const totals = CURRENCY_OPTIONS.flatMap(({ code: currency }) => {
    const matches = accounts.filter((account) => account.currency === currency);
    if (!matches.length) return [];
    let payableExact = '0.00',
      creditExact = '0.00';
    for (const account of matches) {
      if (account.balanceExact.startsWith('-'))
        creditExact = addCustomerExact(creditExact, account.balanceExact.slice(1));
      else payableExact = addCustomerExact(payableExact, account.balanceExact);
    }
    return [{ currency, payableExact, creditExact }];
  });
  return { accounts, totals };
}
