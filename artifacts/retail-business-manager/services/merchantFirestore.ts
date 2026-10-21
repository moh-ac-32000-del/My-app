import {
  collection,
  getFirestore,
  onSnapshot,
  onSnapshotsInSync,
  query,
  where,
  orderBy,
  limit,
  documentId,
  startAfter,
  getDocsFromServer,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp, isFirebaseConfigured } from '@/services/firebase';
import { workspaceDocumentPath } from '@/data/firestoreWorkspace';
import {
  merchantFromDocument,
  merchantBalanceFromDocument,
  merchantOperationFromDocument,
} from '@/data/merchantDocuments';
import { synchronizedSnapshots } from '@/data/synchronizedSnapshots';
import type { MerchantDraftCommand, MerchantSnapshot, MerchantOperation } from '@/types/merchant';
import { observeForLocalExport } from './localExportObservation';

/** Scoped Firestore observations, never an alternate local ledger or a cross-space collection scan. */
export function subscribeMerchantAccounts(
  spaceId: string,
  storeId: string,
  publish: (value: MerchantSnapshot) => void,
  fail: (error: Error) => void,
  merchantId?: string,
): () => void {
  if (!isFirebaseConfigured) throw new Error('firebaseNotConfigured');
  const root = workspaceDocumentPath(spaceId);
  if (!storeId.trim()) throw new Error('merchantStoreUnavailable');
  const db = getFirestore(getFirebaseApp());
  const subscriptions: Array<() => void> = [];
  const merchantExport = observeForLocalExport(spaceId, 'merchants');
  const balanceExport = observeForLocalExport(spaceId, 'merchantBalances');
  const operationExport = observeForLocalExport(spaceId, 'merchantOperations');
  let operationExportHead: Parameters<typeof operationExport.merchantOperations>[0] | null = null;
  const observed = (rows: Array<{ id: string }>) => ({ docs: rows.map((row) => ({ id: row.id, data: () => row as unknown as Record<string, unknown> })), metadata: { fromCache: false, hasPendingWrites: false } });
  const coordinator = synchronizedSnapshots<MerchantSnapshot & Record<string, unknown>>(
    ['merchants', 'balances', 'operations', 'operationsLimited'],
    (value) => {
      const ids = new Set(value.merchants.map((merchant) => merchant.id));
      const seen = new Set<string>();
      for (const balance of value.balances) {
        const key = JSON.stringify([balance.merchantId, balance.currency]);
        if (!ids.has(balance.merchantId) || seen.has(key)) throw new Error('invalidCloudMerchantDocument');
        seen.add(key);
      }
      if (value.operations.some((operation) => !ids.has(operation.merchantId) || operation.merchantId !== merchantId)) {
        throw new Error('invalidCloudMerchantDocument');
      }
      publish(value);
      merchantExport.receive(observed(value.merchants));
      balanceExport.receive(observed(value.balances));
      if (merchantId && operationExportHead) operationExport.merchantOperations(operationExportHead, storeId);
    },
    (error) => {
      merchantExport.invalidate(); balanceExport.invalidate(); operationExport.invalidate();
      queueMicrotask(() => subscriptions.forEach((unsubscribe) => unsubscribe()));
      fail(error);
    },
  );
  if (merchantId !== undefined && (!merchantId.trim() || merchantId.includes('/')))
    throw new Error('invalidMerchantId');
  try {
    subscriptions.push(
      onSnapshot(
        collection(db, `${root}/merchants`),
        { includeMetadataChanges: true },
        (snapshot) => {
          try {
            coordinator.receive(
              'merchants',
              snapshot.docs.map((doc) => merchantFromDocument(doc.id, doc.data(), spaceId, storeId)),
              snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites,
            );
          } catch {
            coordinator.error(new Error('invalidCloudMerchantDocument'));
          }
        },
        (error) => coordinator.error(error),
      ),
    );
    subscriptions.push(
      onSnapshot(
        collection(db, `${root}/merchantBalances`),
        { includeMetadataChanges: true },
        (snapshot) => {
          try {
            coordinator.receive(
              'balances',
              snapshot.docs.map((doc) => merchantBalanceFromDocument(doc.id, doc.data(), spaceId, storeId)),
              snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites,
            );
          } catch {
            coordinator.error(new Error('invalidCloudMerchantDocument'));
          }
        },
        (error) => coordinator.error(error),
      ),
    );
    if (merchantId)
      subscriptions.push(
        onSnapshot(
          query(
            collection(db, `${root}/merchantOperations`),
            where('merchantId', '==', merchantId),
            orderBy('createdAt', 'desc'),
            orderBy(documentId(), 'desc'),
            limit(101),
          ),
          { includeMetadataChanges: true },
          (snapshot) => {
            try {
              const received = snapshot.docs.map((doc) => merchantOperationFromDocument(doc.id, doc.data(), spaceId, storeId));
              if (received.some((row) => row.merchantId !== merchantId)) throw new Error('merchantHistoryScopeMismatch');
              operationExportHead = snapshot;
              coordinator.receive(
                'operations',
                received.slice(0, 100),
                snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites,
              );
              coordinator.receive(
                'operationsLimited',
                snapshot.docs.length > 100,
                snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites,
              );
            } catch {
              coordinator.error(new Error('invalidCloudMerchantDocument'));
            }
          },
          (error) => coordinator.error(error),
        ),
      );
    else {
      coordinator.receive('operations', [], false);
      coordinator.receive('operationsLimited', false, false);
    }
    subscriptions.push(onSnapshotsInSync(db, () => coordinator.sync()));
  } catch (error) {
    coordinator.stop();
    subscriptions.forEach((unsubscribe) => unsubscribe());
    throw error;
  }
  return () => {
    coordinator.stop();
    subscriptions.forEach((unsubscribe) => unsubscribe());
  };
}

/** Explicit user-requested historical page. No polling, local authority or all-history scan. */
export async function loadMerchantHistoryPage(
  spaceId: string,
  storeId: string,
  merchantId: string,
  cursor: Pick<MerchantOperation, 'id' | 'createdAt'>,
) {
  if (!isFirebaseConfigured) throw new Error('firebaseNotConfigured');
  const root = workspaceDocumentPath(spaceId);
  if (
    !storeId.trim() ||
    !merchantId.trim() ||
    merchantId.includes('/') ||
    !cursor.id ||
    cursor.id.includes('/') ||
    !Number.isFinite(Date.parse(cursor.createdAt))
  )
    throw new Error('invalidMerchantHistoryCursor');
  const pageExport = observeForLocalExport(spaceId, 'merchantOperations');
  const snapshot = await getDocsFromServer(
    query(
      collection(getFirestore(getFirebaseApp()), `${root}/merchantOperations`),
      where('merchantId', '==', merchantId),
      orderBy('createdAt', 'desc'),
      orderBy(documentId(), 'desc'),
      startAfter(cursor.createdAt, cursor.id),
      limit(101),
    ),
  );
  if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites)
    throw new Error('merchantHistoryNotServerConfirmed');
  const received = snapshot.docs.map((doc) => merchantOperationFromDocument(doc.id, doc.data(), spaceId, storeId));
  const operations = received.slice(0, 100);
  if (received.some((operation) => operation.merchantId !== merchantId))
    throw new Error('merchantHistoryScopeMismatch');
  pageExport.merchantOperations({
    docs: snapshot.docs, metadata: snapshot.metadata,
  }, storeId);
  return { operations, hasMore: snapshot.docs.length > 100 };
}

export async function sendMerchantCommand(spaceId: string, storeId: string, command: MerchantDraftCommand) {
  if (!isFirebaseConfigured) throw new Error('firebaseNotConfigured');
  workspaceDocumentPath(spaceId);
  if (!storeId.trim()) throw new Error('merchantStoreUnavailable');
  const response = await httpsCallable<Record<string, unknown>, Record<string, unknown>>(
    getFunctions(getFirebaseApp()),
    'merchantCommand',
  )({ ...command, spaceId, storeId });
  const result = response.data;
  if (
    !result ||
    !['created', 'updated', 'completed', 'replayed'].includes(String(result.outcome)) ||
    result.merchantId !== command.merchantId ||
    typeof result.processedAt !== 'string' ||
    !Number.isFinite(Date.parse(result.processedAt))
  )
    throw new Error('invalidMerchantCommandResponse');
  if (
    command.action !== 'save' &&
    (result.operationId !== command.operationId ||
      typeof result.balanceExact !== 'string' ||
      !/^-?(0|[1-9]\d*)\.\d{2}$/.test(result.balanceExact) ||
      typeof result.cashDeltaExact !== 'string' ||
      !/^-?(0|[1-9]\d*)\.\d{2}$/.test(result.cashDeltaExact))
  ) {
    throw new Error('invalidMerchantCommandResponse');
  }
  return result;
}
