import { HttpsError } from 'firebase-functions/v2/https';

const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'SYP'] as const;

/** Snapshot cash records only. Debts/payments are not additional cash movements. */
export function closingCashBalances(records: Record<string, unknown>[]): Array<{ currency: string; amount: number }> {
  const totals = new Map<string, number>();
  for (const record of records) {
    if ((record.type !== 'cash_in' && record.type !== 'cash_out')
      || typeof record.amount !== 'number' || !Number.isFinite(record.amount) || record.amount <= 0
      || typeof record.currency !== 'string' || !CURRENCIES.some((code) => code === record.currency)) {
      throw new HttpsError('failed-precondition', 'Invalid cash record; closing balance cannot be captured');
    }
    const amount = (totals.get(record.currency) ?? 0)
      + (record.type === 'cash_in' ? record.amount : -record.amount);
    if (!Number.isFinite(amount)) {
      throw new HttpsError('failed-precondition', 'Closing balance is not finite');
    }
    totals.set(record.currency, amount);
  }
  return CURRENCIES.filter((code) => totals.has(code)).map((currency) => ({ currency, amount: totals.get(currency)! }));
}
