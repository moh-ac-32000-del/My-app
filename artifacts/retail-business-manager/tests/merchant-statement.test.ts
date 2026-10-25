import { describe, expect, it } from 'vitest';
import { merchantStatement } from '../data/merchantStatement';
import { merchantStatementHtml } from '../services/merchantStatementHtml';
import { merchantStatementText } from '../constants/merchantStatementText';
import type { MerchantOperation } from '../types/merchant';

function operation(value: Partial<MerchantOperation>): MerchantOperation {
  return {
    id: 'purchase',
    workspaceId: 's',
    storeId: 'store',
    merchantId: 'm',
    merchantName: 'Test supplier',
    action: 'purchase',
    currency: 'TRY',
    balanceBeforeExact: '100.00',
    balanceAfterExact: '380.00',
    cashDeltaExact: '-20.00',
    note: 'SECRET_PRIVATE_NOTE',
    createdAt: '2026-10-02T12:00:00.000Z',
    createdByUserId: 'SECRET_EMPLOYEE',
    totalExact: '300.00',
    paidExact: '20.00',
    lines: [{ name: 'Screens', quantity: '3', unitPrice: '100', totalExact: '300.00' }],
    ...value,
  };
}
const operations = () => [
  operation({
    id: 'opening',
    action: 'opening',
    createdAt: '2026-10-01T12:00:00.000Z',
    balanceBeforeExact: '0.00',
    balanceAfterExact: '100.00',
    cashDeltaExact: '0.00',
    amountExact: '100.00',
  }),
  operation({ reversedByOperationId: 'reverse', operationDate: '2026-01-01' }),
  operation({
    id: 'direct',
    action: 'directPayment',
    createdAt: '2026-10-03T12:00:00.000Z',
    balanceBeforeExact: '380.00',
    balanceAfterExact: '350.00',
    cashDeltaExact: '0.00',
    amountExact: '30.00',
    customerId: 'SECRET_CUSTOMER_ID',
    customerName: 'SECRET_CUSTOMER_NAME',
    paymentMethodName: 'Transfer',
  }),
  operation({
    id: 'reverse',
    action: 'reverse',
    createdAt: '2026-10-04T12:00:00.000Z',
    balanceBeforeExact: '350.00',
    balanceAfterExact: '70.00',
    cashDeltaExact: '20.00',
    amountExact: '300.00',
    reversesOperationId: 'purchase',
    reversedAction: 'purchase',
    reason: 'SECRET_CORRECTION_REASON',
  }),
];
const input = () => ({
  spaceId: 's',
  storeId: 'store',
  merchantId: 'm',
  operations: operations(),
  proof: [{ currency: 'TRY' as const, revision: 4, balanceExact: '70.00' }],
});

describe('merchant-facing statement: completeness, privacy and exact period accounting', () => {
  it('uses actual recording dates and period-end balances, not the latest current balance or edited document date', () => {
    const value = merchantStatement({ ...input(), from: '2026-10-02', to: '2026-10-03' });
    expect(value.totals).toEqual([
      {
        currency: 'TRY',
        opening: '100.00',
        purchases: '300.00',
        payments: '50.00',
        adjustments: '0.00',
        closing: '350.00',
      },
    ]);
    expect(value.rows[0]).toMatchObject({ date: '2026-01-01', recordedDate: '2026-10-02', description: 'Screens' });
    expect(value.rows.map((row) => row.kind)).toEqual(['purchase', 'payment', 'payment']);
    expect(value.rows.at(-1)).toMatchObject({ kind: 'payment', method: 'Transfer', amount: '30.00' });
  });
  it('hides a cancelled original and its internal offset without exposing private provenance', () => {
    const value = merchantStatement(input());
    expect(value.totals[0]).toMatchObject({
      purchases: '0.00',
      payments: '30.00',
      adjustments: '100.00',
      closing: '70.00',
    });
    expect(value.rows.map(row => row.kind)).toEqual(['opening', 'payment']);
    expect(value.rows.every(row => !row.corrected)).toBe(true);
    expect(JSON.stringify(value)).not.toContain('SECRET');
    expect(JSON.stringify(value)).not.toContain('directPayment');
    expect(JSON.stringify(value)).not.toContain('customer');
  });
  it('never exports a partial statement or mixed-space/currency record', () => {
    expect(() => merchantStatement({ ...input(), operations: operations().slice(1) })).toThrow(
      'merchantStatementIncomplete',
    );
    expect(() => merchantStatement({ ...input(), operations: [...operations(), operations()[0]] })).toThrow(
      'merchantStatementIncomplete',
    );
    expect(() =>
      merchantStatement({
        ...input(),
        operations: operations().map((row, index) => (index ? row : { ...row, workspaceId: 'other' })),
      }),
    ).toThrow('merchantStatementIncomplete');
    expect(() =>
      merchantStatement({ ...input(), proof: [{ currency: 'TRY', revision: 4, balanceExact: '71.00' }] }),
    ).toThrow('merchantStatementIncomplete');
    expect(() => merchantStatement({ ...input(), proof: [] })).toThrow('merchantStatementIncomplete');
    expect(() => merchantStatement({ ...input(), from: '2026-02-30' })).toThrow();
    expect(() => merchantStatement({ ...input(), from: '2026-10-04', to: '2026-10-01' })).toThrow(
      'merchantStatementPeriod',
    );
  });
  it('fails closed on broken correction links even outside the requested period', () => {
    const broken = operations().map((row) =>
      row.id === 'purchase' ? { ...row, reversedByOperationId: undefined } : row,
    );
    expect(() => merchantStatement({ ...input(), operations: broken, to: '2026-09-30' })).toThrow(
      'merchantStatementIncomplete',
    );
  });
  it('keeps different currencies independent and empty periods explicit', () => {
    const value = merchantStatement({
      ...input(),
      operations: [
        ...operations(),
        operation({
          id: 'usd',
          currency: 'USD',
          action: 'opening',
          balanceBeforeExact: '0.00',
          balanceAfterExact: '-5.00',
          amountExact: '-5.00',
          cashDeltaExact: '0.00',
        }),
      ],
      proof: [...input().proof, { currency: 'USD', revision: 1, balanceExact: '-5.00' }],
      from: '2026-11-01',
    });
    expect(value.rows).toHaveLength(0);
    expect(value.totals.map((row) => [row.currency, row.opening, row.closing])).toEqual([
      ['TRY', '70.00', '70.00'],
      ['USD', '-5.00', '-5.00'],
    ]);
  });
  it.each(['ar', 'tr', 'en'] as const)('renders escaped, self-contained, paginated public HTML in %s', (language) => {
    const statement = merchantStatement(input());
    const html = merchantStatementHtml({
      statement,
      language,
      merchantName: '<script>SECRET_ESCAPE</script>',
      storeName: 'My app',
      issuedAt: '2026-10-20T12:00:00Z',
    });
    expect(html).toContain(merchantStatementText[language].payments);
    expect(html).toContain(`dir="${language === 'ar' ? 'rtl' : 'ltr'}"`);
    expect(html).toContain('&lt;script&gt;SECRET_ESCAPE&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('SECRET_CUSTOMER');
    expect(html).not.toContain('SECRET_EMPLOYEE');
    expect(html).not.toContain('SECRET_PRIVATE_NOTE');
    expect(html).not.toContain('SECRET_CORRECTION_REASON');
    expect(html).toContain('<thead>');
    expect(html).toContain('class="payment"');
    expect(html).not.toMatch(/src=|href=/);
    const pages = (html.match(/<article class="page">/g) ?? []).length;
    expect(pages).toBeGreaterThanOrEqual(1);
    expect(html).toContain(`${merchantStatementText[language].page} <span dir="ltr">1 / ${pages}</span>`);
  });
});
