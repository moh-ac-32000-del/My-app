import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getFirebaseApp, getFirebaseAuth } from './firebase';
import { readConfirmedCollection, type LocalExportScope } from './localExportCache';
import { merchantOperationFromDocument } from '../data/merchantDocuments';
import { workspaceDocumentPath } from '../data/firestoreWorkspace';
import type { Payment } from '../types/business';

/** Read only explicit linked operations missing from confirmed session receipts.
 * Method names are historical labels, never today's merchant-settings names.
 * Do not copy merchant/customer/actor identities into the public statement.
 */
export async function customerPaymentMethodLabels(scope: LocalExportScope, payments: Payment[], isCurrent: () => boolean): Promise<Map<string, string>> {
  const root = workspaceDocumentPath(scope.spaceId), result = new Map<string, string>();
  const guard = () => {
    if (!isCurrent() || !scope.uid || getFirebaseAuth().currentUser?.uid !== scope.uid || !scope.storeId || scope.storeId.includes('/')) throw new Error('exportScopeChanged');
  };
  guard();
  const linked = payments.filter(payment => !payment.cancelled && payment.source === 'customer-to-merchant');
  if (linked.length > 1000) throw new Error('exportTooLarge');
  if (!linked.length) return result;
  const received = new Map((readConfirmedCollection(scope, 'merchantOperations') ?? []).map(row => [row.id, row.data]));
  let index = 0, stopped = false;
  await Promise.all(Array.from({ length: Math.min(4, linked.length) }, async () => {
    try {
      while (!stopped && index < linked.length) {
        const payment = linked[index++];
        guard();
        const id = payment.merchantOperationId;
        if (!id || id.includes('/') || payment.storeId !== scope.storeId || payment.workspaceId !== scope.spaceId || !payment.merchantId || !payment.customerId) throw new Error('customerStatementIncomplete');
        const cached = received.get(id);
        const value = cached ?? (await getDocFromServer(doc(getFirestore(getFirebaseApp()), `${root}/merchantOperations/${id}`))).data();
        guard();
        const operation = merchantOperationFromDocument(id, value, scope.spaceId, scope.storeId);
        if (operation.action !== 'directPayment' || operation.paymentId !== payment.id || operation.customerId !== payment.customerId
          || operation.merchantId !== payment.merchantId || operation.currency !== payment.amount.currency) throw new Error('customerStatementIncomplete');
        if (operation.paymentMethodName !== undefined) result.set(payment.id, operation.paymentMethodName);
      }
    } catch (error) { stopped = true; throw error; }
  }));
  guard();
  return result;
}
