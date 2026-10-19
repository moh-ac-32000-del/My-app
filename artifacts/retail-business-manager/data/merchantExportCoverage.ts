import { merchantFromDocument, merchantBalanceFromDocument, merchantOperationFromDocument } from './merchantDocuments';
import type { StoredExportDocument } from '../services/localExportCache';

/** Every trusted financial command increments exactly one currency balance revision and creates
 * exactly one immutable operation. Metadata edits create neither. No cloud count/query is needed.
 * This validates coverage at the received revisions, not a claim of a live/atomic database backup.
 */
export function merchantExportCoverage(
  spaceId: string,
  storeId: string,
  records: {
    merchants: StoredExportDocument[];
    merchantBalances: StoredExportDocument[];
    merchantOperations: StoredExportDocument[];
  },
) {
  const merchants = records.merchants.map((doc) => merchantFromDocument(doc.id, doc.data, spaceId, storeId));
  const balances = records.merchantBalances.map((doc) =>
    merchantBalanceFromDocument(doc.id, doc.data, spaceId, storeId),
  );
  const operations = records.merchantOperations.map((doc) =>
    merchantOperationFromDocument(doc.id, doc.data, spaceId, storeId),
  );
  const ids = new Set(merchants.map((row) => row.id));
  if (ids.size !== merchants.length || new Set(operations.map((row) => row.id)).size !== operations.length)
    throw new Error('exportInvalidData');
  const expected = new Map<string, number>(),
    counts = new Map<string, number>();
  const operationsById = new Map(operations.map((row) => [row.id, row]));
  for (const row of balances) {
    const key = JSON.stringify([row.merchantId, row.currency]);
    if (!ids.has(row.merchantId) || expected.has(key)) throw new Error('exportInvalidData');
    expected.set(key, row.revision);
  }
  for (const row of operations) {
    const key = JSON.stringify([row.merchantId, row.currency]);
    if (!ids.has(row.merchantId) || !expected.has(key)) throw new Error('exportLocalIncomplete');
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (row.reversedByOperationId) {
      const correction = operationsById.get(row.reversedByOperationId);
      if (
        !correction ||
        correction.action !== 'reverse' ||
        correction.reversesOperationId !== row.id ||
        correction.merchantId !== row.merchantId ||
        correction.currency !== row.currency
      )
        throw new Error('exportLocalIncomplete');
    }
    if (row.action === 'reverse') {
      const original = row.reversesOperationId ? operationsById.get(row.reversesOperationId) : undefined;
      if (
        !original ||
        original.action === 'reverse' ||
        original.merchantId !== row.merchantId ||
        original.currency !== row.currency
      )
        throw new Error('exportLocalIncomplete');
    }
  }
  if ([...expected.values()].reduce((sum, value) => sum + value, 0) > 1000) throw new Error('exportTooLarge');
  if ([...expected].some(([key, revision]) => counts.get(key) !== revision)) throw new Error('exportLocalIncomplete');
  return { merchants, balances, operations };
}
