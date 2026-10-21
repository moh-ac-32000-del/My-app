import { merchantExportCoverage } from '../data/merchantExportCoverage';
import { customerCreditFromDocument } from '../data/merchantDocuments';
import { legacyAmountExact } from '../data/customerCreditAccounting';
import { projectCustomerAccounts } from '../data/customerAccountProjection';
import { mergeMerchantJournal, merchantJournalEvent } from '../data/merchantJournal';
import { merchantOperationFromDocument } from '../data/merchantDocuments';
import type { ExportAccountData } from '../types/spreadsheetExport';
import type { LocalExportCollection, LocalExportScope, StoredExportDocument } from './localExportCache';
import type { Debt, Payment, Transaction, DailyArchive } from '../types/business';
import type { DailyJournalEvent } from '../types/journal';

/** Additional exact/linked projections. Base fields have already passed the existing table validator. */
export function projectExportAccounts(
  scope: LocalExportScope,
  records: Record<LocalExportCollection, StoredExportDocument[]>,
): ExportAccountData {
  const result = merchantExportCoverage(scope.spaceId, scope.storeId, records);
  const normalize = <T>(name: LocalExportCollection) =>
    records[name].map(({ id, data }) => {
      if (
        (data.id !== undefined && data.id !== id) ||
        data.storeId !== scope.storeId ||
        (data.workspaceId !== undefined && data.workspaceId !== scope.spaceId)
      )
        throw new Error('exportInvalidData');
      return { ...data, id, workspaceId: scope.spaceId } as T;
    });
  const debts = normalize<Debt>('debts').map((row) => ({
    ...row,
    amountExact: legacyAmountExact(row.amount, row.amountExact),
  }));
  const payments = normalize<Payment>('payments').map((row) => ({
    ...row,
    amountExact: legacyAmountExact(row.amount.amount, row.amountExact),
  }));
  const transactions = normalize<Transaction>('transactions').map((row) => ({
    ...row,
    amountExact: legacyAmountExact(row.amount, row.amountExact),
  }));
  const credits = records.customerCredits.map((doc) =>
    customerCreditFromDocument(doc.id, doc.data, scope.spaceId, scope.storeId),
  );
  projectCustomerAccounts(debts, credits, scope.spaceId, scope.storeId);
  mergeMerchantJournal(scope.spaceId, scope.storeId, result.operations, [], { debts, payments, transactions });
  const archives = normalize<DailyArchive>('dailyArchives').map((archive) => ({
    ...archive,
    snapshot: archive.snapshot.map((event): DailyJournalEvent => {
      if (event.type !== 'merchant') return { ...event };
      const normalized = merchantOperationFromDocument(
        event.sourceId,
        {
          ...event,
          id: event.sourceId,
          workspaceId: scope.spaceId,
          action: event.merchantAction,
          createdAt: event.occurredAt,
          note: event.note ?? '',
          ...(event.merchantAction === 'purchase' ? { totalExact: event.amountExact } : {}),
        },
        scope.spaceId,
        scope.storeId,
      );
      const projected = merchantJournalEvent(normalized);
      if (event.id !== projected.id || event.amount !== projected.amount) throw new Error('exportInvalidData');
      return projected;
    }),
  }));
  return { ...result, credits, debts, payments, transactions, archives };
}
