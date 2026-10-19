import {
  LOCAL_EXPORT_COLLECTIONS,
  type StoredExportDocument,
  type LocalExportCollection,
} from '@/services/localExportCache';
import { projectLocalExportSnapshot } from '@/services/localExportProjection';
import { merchantJournalEvent } from '@/data/merchantJournal';
import type { MerchantOperation } from '@/types/merchant';
export const exportTime = '2026-10-19T12:00:00.000Z';
export const exportScope = { uid: 'u', spaceId: 's', storeId: 'store' };
export function merchantExportFixture() {
  const scope = { workspaceId: 's', storeId: 'store' },
    audit = { createdAt: exportTime, updatedAt: exportTime, createdByUserId: 'u', updatedByUserId: 'u' };
  const records = Object.fromEntries(
    LOCAL_EXPORT_COLLECTIONS.map((name) => [name, [] as StoredExportDocument[]]),
  ) as Record<LocalExportCollection, StoredExportDocument[]>;
  const put = (name: LocalExportCollection, id: string, data: Record<string, unknown>) =>
    records[name].push({ id, data: { id, ...scope, ...audit, ...data } });
  put('customers', 'c', {
    name: 'عميل تجريبي',
    phone: '+905000000001',
    isActive: false,
    notes: '=HYPERLINK("https://example.invalid","literal")',
  });
  put('customers', 'c2', { name: 'عميل تجريبي', phone: '+905000000002', isActive: true });
  put('debts', 'd', {
    customerId: 'c',
    currency: 'TRY',
    amount: 0,
    amountExact: '0.00',
    originalAmount: 120.005,
    note: 'مواد مباعة',
  });
  put('debts', 'd2', {
    customerId: 'c2',
    currency: 'USD',
    amount: 1,
    amountExact: '1.0000000000000000001',
    note: 'كسور دقيقة',
  });
  put('customerCredits', 'credit', {
    customerId: 'c',
    currency: 'TRY',
    creditExact: '200.005',
    revision: 1,
    version: 1,
  });
  put('merchants', 'm', { name: 'تاجر تجريبي', phone: '+905000000003', isActive: true });
  put('merchants', 'm2', { name: 'تاجر تجريبي', phone: '+905000000004', isActive: false });
  put('merchantBalances', 'b', { merchantId: 'm', currency: 'TRY', balanceExact: '3370.00', revision: 2, version: 1 });
  put('merchantBalances', 'b2', {
    merchantId: 'm2',
    currency: 'TRY',
    balanceExact: '-300.00',
    revision: 1,
    version: 1,
  });
  const purchase: MerchantOperation = {
    id: 'purchase',
    ...scope,
    merchantId: 'm',
    merchantName: 'تاجر تجريبي',
    action: 'purchase',
    currency: 'TRY',
    balanceBeforeExact: '0.00',
    balanceAfterExact: '3500.00',
    cashDeltaExact: '-1000.00',
    totalExact: '4500.00',
    paidExact: '1000.00',
    source: 'cash',
    transactionId: 'cash',
    note: 'شاشات وبطاريات',
    createdAt: exportTime,
    createdByUserId: 'u',
    lines: [{ name: 'شاشات', quantity: '5', unitPrice: '900', totalExact: '4500.00' }],
  };
  put('merchantOperations', purchase.id, { ...purchase });
  const direct: MerchantOperation = {
    ...purchase,
    id: 'direct',
    action: 'directPayment',
    totalExact: undefined,
    lines: undefined,
    paidExact: undefined,
    transactionId: undefined,
    balanceBeforeExact: '3500.00',
    balanceAfterExact: '3370.00',
    amountExact: '130.00',
    cashDeltaExact: '0.00',
    source: 'customer-to-merchant',
    customerId: 'c',
    customerName: 'عميل تجريبي',
    paymentId: 'direct-payment',
    note: 'دفع مباشر دون صندوق',
  };
  put('merchantOperations', direct.id, { ...direct });
  put('merchantOperations', 'opening', {
    merchantId: 'm2',
    merchantName: 'تاجر تجريبي',
    action: 'opening',
    currency: 'TRY',
    balanceBeforeExact: '0.00',
    balanceAfterExact: '-300.00',
    cashDeltaExact: '0.00',
    note: '',
  });
  put('transactions', 'cash', {
    merchantId: 'm',
    merchantOperationId: 'purchase',
    type: 'cash_out',
    amount: 1000,
    amountExact: '1000.00',
    currency: 'TRY',
    note: 'شراء مواد',
  });
  put('payments', 'direct-payment', {
    customerId: 'c',
    merchantId: 'm',
    merchantName: 'تاجر تجريبي',
    merchantOperationId: 'direct',
    source: 'customer-to-merchant',
    amount: { amount: 130, currency: 'TRY' },
    amountExact: '130.00',
    direction: 'in',
    method: 'other',
    paidAt: exportTime,
    note: 'دفع مباشر دون صندوق',
  });
  put('dailyArchives', 'archive', {
    date: '2026-10-19',
    closedAt: exportTime,
    closingNumber: 1,
    closingCashBalances: [{ currency: 'TRY', amount: -1000 }],
    snapshot: [merchantJournalEvent(purchase), merchantJournalEvent(direct)],
  });
  const capturedAt = Object.fromEntries(LOCAL_EXPORT_COLLECTIONS.map((name) => [name, exportTime])) as Record<
    LocalExportCollection,
    string
  >;
  return {
    records,
    capturedAt,
    snapshot: () => projectLocalExportSnapshot(exportScope, 'متجر تجريبي', records, capturedAt, exportTime),
  };
}
