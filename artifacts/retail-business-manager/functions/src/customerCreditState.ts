import { createHash } from 'node:crypto';
import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { canonicalCredit } from '../../data/customerCreditAccounting.js';

export interface CustomerCreditState {
  ref: DocumentReference;
  amount: string;
  revision: number;
  createdAt?: string;
  createdByUserId?: string;
  customerId: string;
  currency: string;
  spaceId: string;
  storeId: string;
}
export async function readCustomerCredit(
  tx: Transaction,
  spaceRef: DocumentReference,
  storeId: string,
  customerId: string,
  currency: string,
): Promise<CustomerCreditState> {
  const key = createHash('sha256')
    .update(JSON.stringify([customerId, currency]))
    .digest('hex');
  const ref = spaceRef.collection('customerCredits').doc(key);
  const snapshot = await tx.get(ref);
  const value = snapshot.data();
  if (!snapshot.exists)
    return { ref, amount: '0.00', revision: 0, customerId, currency, spaceId: spaceRef.id, storeId };
  if (
    value?.id !== key ||
    value?.workspaceId !== spaceRef.id ||
    value?.storeId !== storeId ||
    value?.customerId !== customerId ||
    value?.currency !== currency ||
    value?.version !== 1 ||
    !Number.isSafeInteger(value?.revision) ||
    value?.revision < 1 ||
    value?.revision >= Number.MAX_SAFE_INTEGER ||
    typeof value?.creditExact !== 'string' ||
    typeof value?.createdAt !== 'string' ||
    typeof value?.createdByUserId !== 'string'
  ) {
    throw new HttpsError('data-loss', 'Customer credit state is invalid', { code: 'CUSTOMER_CREDIT_CORRUPTED' });
  }
  try {
    return {
      ref,
      amount: canonicalCredit(value.creditExact),
      revision: value.revision,
      createdAt: value.createdAt,
      createdByUserId: value.createdByUserId,
      customerId,
      currency,
      spaceId: spaceRef.id,
      storeId,
    };
  } catch {
    throw new HttpsError('data-loss', 'Customer credit precision is invalid', { code: 'CUSTOMER_CREDIT_CORRUPTED' });
  }
}

/** The per-customer/currency revision is also the shared transaction serialization boundary.
 * All reads must finish before calling this or staging any linked financial writes.
 */
export function writeCustomerCredit(
  tx: Transaction,
  state: CustomerCreditState,
  amount: string,
  uid: string,
  now: string,
) {
  tx.set(state.ref, {
    id: state.ref.id,
    workspaceId: state.spaceId,
    storeId: state.storeId,
    customerId: state.customerId,
    currency: state.currency,
    version: 1,
    creditExact: canonicalCredit(amount),
    revision: state.revision + 1,
    createdAt: state.createdAt ?? now,
    createdByUserId: state.createdByUserId ?? uid,
    updatedAt: now,
    updatedByUserId: uid,
  });
}
