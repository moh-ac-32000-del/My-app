import type { MerchantOperation } from '@/types/merchant';

/** Firestore string order is Unicode code-point order, not a user's localized name order. */
function compareText(a: string, b: string) {
  const left = Array.from(a),
    right = Array.from(b);
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = left[index].codePointAt(0)! - right[index].codePointAt(0)!;
    if (difference) return difference;
  }
  return left.length - right.length;
}
const immutable: Array<keyof MerchantOperation> = [
  'workspaceId',
  'storeId',
  'merchantId',
  'action',
  'currency',
  'balanceBeforeExact',
  'balanceAfterExact',
  'cashDeltaExact',
  'createdAt',
  'createdByUserId',
  'amountExact',
  'totalExact',
  'paidExact',
  'customerId',
  'note',
  'source',
  'reversesOperationId',
  'reason',
];

/** Keep page boundaries stable as new head entries arrive. Never net, mutate or recalculate operations. */
export function mergeMerchantHistory(previous: MerchantOperation[], incoming: MerchantOperation[]) {
  const rows = new Map<string, MerchantOperation>();
  let identity: string | null = null;
  for (const row of [...previous, ...incoming]) {
    const scope = JSON.stringify([row.workspaceId, row.storeId, row.merchantId]);
    if (identity !== null && scope !== identity) throw new Error('merchantHistoryScopeMismatch');
    identity = scope;
    const before = rows.get(row.id);
    if (before) {
      if (
        immutable.some((key) => before[key] !== row[key]) ||
        JSON.stringify(before.lines) !== JSON.stringify(row.lines) ||
        (before.reversedByOperationId &&
          row.reversedByOperationId &&
          before.reversedByOperationId !== row.reversedByOperationId)
      ) {
        throw new Error('merchantHistoryChanged');
      }
      rows.set(row.id, {
        ...row,
        ...(before.reversedByOperationId ? { reversedByOperationId: before.reversedByOperationId } : {}),
      });
    } else rows.set(row.id, { ...row });
  }
  // A newly received canonical reversal also updates a previously loaded older statement row.
  for (const row of rows.values()) {
    if (row.action !== 'reverse' || !row.reversesOperationId) continue;
    const original = rows.get(row.reversesOperationId);
    if (!original) continue;
    if (original.reversedByOperationId && original.reversedByOperationId !== row.id)
      throw new Error('merchantHistoryChanged');
    rows.set(original.id, { ...original, reversedByOperationId: row.id });
  }
  return [...rows.values()].sort((a, b) => compareText(b.createdAt, a.createdAt) || compareText(b.id, a.id));
}

/** Session-only display pages. All rows originate in scoped server reads; nothing is persisted. */
export function createMerchantHistorySession() {
  let active = true,
    expanded = false,
    busy = false,
    hasMore = false;
  let operations: MerchantOperation[] = [];
  const view = () => ({ operations, operationsLimited: hasMore, historyLoading: busy });
  return {
    receiveHead(rows: MerchantOperation[], more: boolean) {
      if (!active) return view();
      const combined = mergeMerchantHistory(operations, rows);
      const headIds = new Set(rows.map((row) => row.id));
      operations = expanded ? combined : combined.filter((row) => headIds.has(row.id));
      if (!expanded) hasMore = more;
      return view();
    },
    beginPage() {
      if (!active || busy || !hasMore || !operations.length) return null;
      expanded = true;
      busy = true;
      const row = operations[operations.length - 1];
      return { id: row.id, createdAt: row.createdAt };
    },
    completePage(rows: MerchantOperation[], more: boolean) {
      if (!active) return view();
      operations = mergeMerchantHistory(operations, rows);
      busy = false;
      hasMore = more;
      return view();
    },
    view,
    isActive: () => active,
    stop() {
      active = false;
      busy = false;
      hasMore = false;
      operations = [];
    },
  };
}
