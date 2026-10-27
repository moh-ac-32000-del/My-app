import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'u', read: vi.fn() }));
vi.mock('../services/firebase', () => ({ getFirebaseApp: () => ({}), getFirebaseAuth: () => ({ currentUser: state.uid ? { uid: state.uid } : null }) }));
vi.mock('firebase/firestore', () => ({ getFirestore: () => ({}), doc: (_db: unknown, path: string) => path, getDocFromServer: state.read }));
import { customerPaymentMethodLabels } from '../services/customerPaymentMethodLabels';
import { clearLocalExportCache, rememberLocalExportCollection } from '../services/localExportCache';
import { customerStatement } from '../data/customerStatement';
import { merchantStatementHtml } from '../services/merchantStatementHtml';
import type { Payment, Customer, Debt } from '../types/business';
const scope = { uid: 'u', spaceId: 's', storeId: 'store' }, at = '2026-10-27T12:00:00Z';
const base = { workspaceId: 's', storeId: 'store', createdAt: at, updatedAt: at, createdByUserId: 'PRIVATE_ACTOR' };
const payment: Payment = { ...base, id: 'p', customerId: 'c', source: 'customer-to-merchant', merchantId: 'm', merchantOperationId: 'op',
  amount: { amount: 30, currency: 'TRY' }, amountExact: '30.00', paidAt: at, direction: 'in', method: 'other' };
const operation = { ...base, id: 'op', action: 'directPayment', merchantId: 'm', merchantName: 'PRIVATE_MERCHANT', customerId: 'c', customerName: 'PRIVATE_CUSTOMER',
  paymentId: 'p', currency: 'TRY', balanceBeforeExact: '100.00', balanceAfterExact: '70.00', cashDeltaExact: '0.00', amountExact: '30.00',
  note: 'PRIVATE_INTERNAL_NOTE', paymentMethodId: 'method', paymentMethodName: 'حوالة خاصة <Bank>' };
const customer: Customer = { ...base, id: 'c', name: 'Customer', isActive: true };
const debt: Debt = { ...base, id: 'd', customerId: 'c', currency: 'TRY', amount: 70, amountExact: '70.00', originalAmount: 100 };
beforeEach(() => { clearLocalExportCache(); state.uid = 'u'; state.read.mockReset().mockResolvedValue({ data: () => operation }); });
describe('historical method label for a customer-to-merchant payment PDF', () => {
  it.each(['ar','en','tr'] as const)('shows the original custom name in %s without merchant/actor provenance', async language => {
    const labels = await customerPaymentMethodLabels(scope,[payment],()=>true);
    const statement = customerStatement({ spaceId: 's', storeId: 'store', customer, debts: [debt], payments: [payment], credits: [], paymentMethodLabels: labels });
    const html = merchantStatementHtml({ statement, language, kind: 'customer', merchantName: customer.name, storeName: 'Store', issuedAt: at });
    expect(html).toContain('حوالة خاصة &lt;Bank&gt;'); expect(html).not.toContain('PRIVATE');
    expect(statement.totals[0]).toMatchObject({ purchases: '100.00', payments: '30.00', closing: '70.00' });
    expect(state.read).toHaveBeenCalledExactlyOnceWith('spaces/s/merchantOperations/op');
  });
  it('reuses an already confirmed linked operation without additional reads', async () => {
    rememberLocalExportCollection('u','s','merchantOperations',[{ id: 'op', data: operation }],true,at,'store');
    expect((await customerPaymentMethodLabels(scope,[payment],()=>true)).get('p')).toBe(operation.paymentMethodName);
    expect(state.read).not.toHaveBeenCalled();
  });
  it('does not use an unconfirmed receipt', async () => {
    rememberLocalExportCollection('u','s','merchantOperations',[{ id: 'op', data: operation }],false,at,'store');
    await customerPaymentMethodLabels(scope,[payment],()=>true); expect(state.read).toHaveBeenCalledOnce();
  });
  it('does not translate a custom label that happens to be a built-in method key', async () => {
    state.read.mockResolvedValue({ data: () => ({ ...operation, paymentMethodName: 'cash' }) });
    const labels = await customerPaymentMethodLabels(scope,[payment],()=>true);
    const statement = customerStatement({ spaceId: 's', storeId: 'store', customer, debts: [debt], payments: [payment], credits: [], paymentMethodLabels: labels });
    expect(merchantStatementHtml({ statement, language: 'ar', kind: 'customer', merchantName: 'Customer', storeName: 'Store', issuedAt: at })).toContain('<td>cash</td>');
  });
  it.each([{ workspaceId: 'other' },{ merchantId: 'other' },{ customerId: 'other' },{ paymentId: 'other' },{ currency: 'USD' },{ action: 'payment' }])('rejects a mismatched linked record %j', async patch => {
    state.read.mockResolvedValue({ data: () => ({ ...operation, ...patch }) });
    await expect(customerPaymentMethodLabels(scope,[payment],()=>true)).rejects.toThrow();
  });
  it('does not guess a method for legacy records without a historical name', async () => {
    const { paymentMethodId: _id, paymentMethodName: _name, ...legacy } = operation;
    state.read.mockResolvedValue({ data: () => legacy });
    expect((await customerPaymentMethodLabels(scope,[payment],()=>true)).size).toBe(0);
  });
  it('does not fetch normal or cancelled payments', async () => {
    expect((await customerPaymentMethodLabels(scope,[{ ...payment, source: undefined },{ ...payment, cancelled: true }],()=>true)).size).toBe(0);
    expect(state.read).not.toHaveBeenCalled();
  });
  it('bounds concurrent reads to four and stops requesting more links after a failure', async () => {
    const waiting: Array<{ resolve: (value: unknown) => void; reject: (reason: unknown) => void; id: string }> = [];
    state.read.mockImplementation(path => new Promise((resolve, reject) => waiting.push({ resolve, reject, id: path.split('/').at(-1) })));
    const payments = Array.from({ length: 8 }, (_, index) => ({ ...payment, id: `p-${index}`, merchantOperationId: `op-${index}` }));
    const pending = customerPaymentMethodLabels(scope,payments,()=>true);
    expect(state.read).toHaveBeenCalledTimes(4);
    waiting[0].reject(new Error('offline'));
    await expect(pending).rejects.toThrow('offline');
    for (const row of waiting.slice(1)) row.resolve({ data: () => ({ ...operation, id: row.id, paymentId: row.id.replace('op-', 'p-') }) });
    await Promise.resolve(); await Promise.resolve();
    expect(state.read).toHaveBeenCalledTimes(4);
  });
  it('refuses more than the export bound before starting any linked reads', async () => {
    await expect(customerPaymentMethodLabels(scope,Array.from({ length: 1001 }, () => payment),()=>true)).rejects.toThrow('exportTooLarge');
    expect(state.read).not.toHaveBeenCalled();
  });
  it('blocks offline, missing, changed-session and invalid-scope reads rather than silently using Other', async () => {
    state.read.mockRejectedValueOnce(new Error('offline'));
    await expect(customerPaymentMethodLabels(scope,[payment],()=>true)).rejects.toThrow('offline');
    state.read.mockResolvedValueOnce({ data: () => undefined }); await expect(customerPaymentMethodLabels(scope,[payment],()=>true)).rejects.toThrow();
    state.read.mockImplementationOnce(async () => { state.uid = 'other'; return { data: () => operation }; });
    await expect(customerPaymentMethodLabels(scope,[payment],()=>true)).rejects.toThrow('exportScopeChanged');
    state.uid = 'u'; await expect(customerPaymentMethodLabels(scope,[{ ...payment, merchantOperationId: 'op/other' }],()=>true)).rejects.toThrow();
    await expect(customerPaymentMethodLabels(scope,[payment],()=>false)).rejects.toThrow('exportScopeChanged');
  });
});
