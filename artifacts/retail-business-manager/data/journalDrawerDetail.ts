import { addCustomerExact, legacyAmountExact, subtractCustomerExact } from './customerCreditAccounting';
import type { DailyJournalEvent } from '../types/journal';
type Row = { id: string; data: Record<string, unknown> };
/** Display only. Requires the caller's complete confirmed cash collection, never a partial journal/day. */
export function journalDrawerDetail(spaceId: string, event: DailyJournalEvent, transactions: Row[], payments: Row[] | null) {
  try {
    let sourceId: string | undefined;
    if (event.type === 'cash_in' || event.type === 'cash_out') sourceId = event.sourceId;
    if (event.type === 'settlement') {
      if (!payments) return null;
      const linked = payments.filter(row => row.id === event.sourceId && row.data.storeId === event.storeId);
      if (linked.length !== 1) return null;
      if (linked[0].data.workspaceId !== undefined && linked[0].data.workspaceId !== spaceId) return null;
      sourceId = typeof linked[0].data.transactionId === 'string' ? linked[0].data.transactionId : undefined;
    }
    if (new Set(transactions.map(row => row.id)).size !== transactions.length) return null;
    const rows = transactions.map(row => {
      const value = row.data;
      if (value.id !== row.id || value.storeId !== event.storeId ||
        (value.workspaceId !== undefined && value.workspaceId !== spaceId) ||
        !['cash_in', 'cash_out'].includes(value.type as string) || typeof value.createdAt !== 'string' ||
        !Number.isFinite(Date.parse(value.createdAt))) throw new Error('invalidCashHistory');
      const amount = legacyAmountExact(value.amount as number, value.amountExact as string | undefined);
      if (amount.startsWith('-')) throw new Error('invalidCashHistory');
      return { id: row.id, time: Date.parse(value.createdAt), currency: value.currency,
        merchantOperationId: value.merchantOperationId,
        delta: value.type === 'cash_out' ? subtractCustomerExact('0.00', amount) : amount };
    }).filter(row => row.currency === event.currency);
    if (event.type === 'merchant') {
      const linked = rows.filter(row => row.merchantOperationId === event.sourceId);
      if (linked.length > 1) return null;
      sourceId = linked[0]?.id;
      if (!sourceId && event.cashDeltaExact !== '0.00') return null;
    }
    const source = sourceId ? rows.find(row => row.id === sourceId) : undefined;
    if (sourceId && !source) return null;
    const at = source?.time ?? Date.parse(event.occurredAt);
    if (!Number.isFinite(at)) return null;
    // IDs do not prove intra-millisecond order. Never guess between simultaneous cash postings.
    if (rows.some(row => row.time === at && row.id !== sourceId)) return null;
    const before = rows.filter(row => row.time < at).reduce((sum, row) => addCustomerExact(sum, row.delta), '0.00');
    const effect = source?.delta ?? '0.00';
    return { before, effect, after: addCustomerExact(before, effect) };
  } catch { return null; }
}
