import {
  collection,
  getFirestore,
  onSnapshot,
  onSnapshotsInSync,
  query,
  where,
  orderBy,
  limit,
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
import type { MerchantDraftCommand, MerchantSnapshot } from '@/types/merchant';

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
    },
    (error) => {
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
            limit(101),
          ),
          { includeMetadataChanges: true },
          (snapshot) => {
            try {
              coordinator.receive(
                'operations',
                snapshot.docs
                  .slice(0, 100)
                  .map((doc) => merchantOperationFromDocument(doc.id, doc.data(), spaceId, storeId)),
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
