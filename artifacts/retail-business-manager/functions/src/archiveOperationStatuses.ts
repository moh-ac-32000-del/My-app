import type { DocumentReference, Transaction } from 'firebase-admin/firestore';

type Archive = { id: string; snapshot: Array<{ id: string; type: string; sourceId: string }> };
/** Current display annotations, NOT replacements for immutable snapshot values.
 * Requested for one selected day only; repeated sources across closings read once.
 */
export async function annotateArchiveOperationStatuses<T extends Archive>(tx: Transaction, space: DocumentReference,
  storeId: string, archives: T[]): Promise<Array<T & { operationStatuses?: Record<string, 'cancelled' | 'edited'>; operationStatusesUnavailable?: true }>> {
  const paths = new Map<string, DocumentReference>();
  const source = (event: Archive['snapshot'][number]) => {
    const collection = event.type === 'merchant' ? 'merchantOperations' : event.type === 'debt' ? 'debts' : event.type === 'settlement' ? 'payments' : null;
    if (!collection || typeof event.sourceId !== 'string' || !event.sourceId || event.sourceId.length > 200 || event.sourceId.includes('/')) return null;
    const ref = space.collection(collection).doc(event.sourceId);
    if (!paths.has(ref.path)) paths.set(ref.path, ref);
    return ref.path;
  };
  for (const archive of archives) for (const event of archive.snapshot) source(event);
  // Status decoration must not make an already readable historical archive disappear.
  if (paths.size > 500) return archives.map(archive => ({ ...archive, operationStatusesUnavailable: true as const }));
  const statuses = new Map<string, 'cancelled' | 'edited'>();
  const references = [...paths.values()];
  // One batch RPC, not one RPC per source. The same bounded document reads,
  // authorization transaction and conflict retry still apply.
  const snapshots = references.length ? await tx.getAll(...references) : [];
  snapshots.forEach((snapshot, index) => {
    const ref = references[index], path = ref.path;
    const row = snapshot.data();
    if (!row || row.id !== ref.id || row.workspaceId !== space.id || row.storeId !== storeId) return;
    if (row.cancelled === true || (row.reversedByOperationId && !row.replacementOperationId)) statuses.set(path, 'cancelled');
    else if (row.replacementOperationId || (Number.isSafeInteger(row.amendmentRevision) && row.amendmentRevision > 0)) statuses.set(path, 'edited');
  });
  return archives.map(archive => {
    const entries = archive.snapshot.flatMap(event => { const path = source(event), status = path ? statuses.get(path) : undefined;
      return status ? [[event.id, status] as const] : []; });
    return entries.length ? { ...archive, operationStatuses: Object.fromEntries(entries) } : archive;
  });
}
