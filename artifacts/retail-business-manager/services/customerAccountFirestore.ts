import { collection, getFirestore, onSnapshot, onSnapshotsInSync } from 'firebase/firestore';
import { getFirebaseApp, isFirebaseConfigured } from '@/services/firebase';
import { workspaceDocumentPath } from '@/data/firestoreWorkspace';
import { synchronizedSnapshots } from '@/data/synchronizedSnapshots';
import { customerCreditFromDocument } from '@/data/merchantDocuments';
import { projectCustomerAccounts } from '@/data/customerAccountProjection';
import { normalizeDebtDocument } from '@/services/debtFirestore';
import { observeForLocalExport } from '@/services/localExportObservation';
import type { Debt } from '@/types/business';
import type { CustomerCredit } from '@/types/merchant';

export interface CustomerAccountSnapshot {
  debts: Debt[];
  credits: CustomerCredit[];
}
/** The existing debt provider observes both parts of a customer account as one coherent view. */
export function subscribeCustomerAccounts(
  spaceId: string,
  storeId: string,
  publish: (value: CustomerAccountSnapshot) => void,
  fail: (error: Error) => void,
) {
  if (!isFirebaseConfigured) throw new Error('firebaseNotConfigured');
  const root = workspaceDocumentPath(spaceId);
  const db = getFirestore(getFirebaseApp());
  const subscriptions: Array<() => void> = [];
  let stopped = false;
  const exportObservation = observeForLocalExport(spaceId, 'debts');
  const creditExport = observeForLocalExport(spaceId, 'customerCredits');
  const coordinator = synchronizedSnapshots<CustomerAccountSnapshot & Record<string, unknown>>(
    ['debts', 'credits'],
    (value) => {
      projectCustomerAccounts(value.debts, value.credits, spaceId, storeId);
      creditExport.receive({ docs: value.credits.map((row) => ({ id: row.id, data: () => row as unknown as Record<string, unknown> })), metadata: { fromCache: false, hasPendingWrites: false } });
      publish(value);
    },
    (error) => {
      stopped = true;
      exportObservation.invalidate();
      creditExport.invalidate();
      queueMicrotask(() => subscriptions.forEach((stop) => stop()));
      fail(error);
    },
  );
  try {
    subscriptions.push(
      onSnapshot(
        collection(db, `${root}/debts`),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (stopped) return;
          try {
            const debts = snapshot.docs
              .map((doc) => {
                const debt = normalizeDebtDocument(doc.id, doc.data(), spaceId);
                if (!debt || debt.storeId !== storeId) throw new Error('invalidCustomerDebtDocument');
                return debt;
              })
              .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
            exportObservation.receive(snapshot);
            coordinator.receive('debts', debts, snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites);
          } catch {
            coordinator.error(new Error('invalidCustomerDebtDocument'));
          }
        },
        (error) => coordinator.error(error),
      ),
    );
    subscriptions.push(
      onSnapshot(
        collection(db, `${root}/customerCredits`),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (stopped) return;
          try {
            const credits = snapshot.docs.map((doc) =>
              customerCreditFromDocument(doc.id, doc.data(), spaceId, storeId),
            );
            coordinator.receive('credits', credits, snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites);
          } catch {
            coordinator.error(new Error('invalidCustomerCreditDocument'));
          }
        },
        (error) => coordinator.error(error),
      ),
    );
    subscriptions.push(onSnapshotsInSync(db, () => coordinator.sync()));
  } catch (error) {
    stopped = true;
    coordinator.stop();
    subscriptions.forEach((stop) => stop());
    exportObservation.invalidate();
    creditExport.invalidate();
    throw error;
  }
  return () => {
    stopped = true;
    coordinator.stop();
    subscriptions.forEach((stop) => stop());
  };
}
