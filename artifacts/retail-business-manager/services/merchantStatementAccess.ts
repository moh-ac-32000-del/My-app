import { httpsCallable, getFunctions } from 'firebase/functions';
import { getFirebaseApp } from './firebase';
import { createOperationId } from './operationId';
import { isCurrencyCode } from '../constants/currencies';
import type { StatementProof } from '../data/merchantStatement';

export async function authorizeMerchantStatement(
  spaceId: string,
  storeId: string,
  merchantId: string,
): Promise<StatementProof[]> {
  const response = await httpsCallable<Record<string, string>, Record<string, unknown>>(
    getFunctions(getFirebaseApp()),
    'merchantCommand',
  )({
    action: 'statement',
    spaceId,
    storeId,
    merchantId,
    operationId: createOperationId(),
  });
  const value = response.data;
  if (value?.outcome !== 'authorized' || value.merchantId !== merchantId || !Array.isArray(value.balances))
    throw new Error('invalidStatementAuthorization');
  return value.balances.map((row) => {
    if (
      !row ||
      !isCurrencyCode(row.currency) ||
      !Number.isSafeInteger(row.revision) ||
      row.revision < 1 ||
      typeof row.balanceExact !== 'string' ||
      !/^-?(0|[1-9]\d*)\.\d{2}$/.test(row.balanceExact)
    )
      throw new Error('invalidStatementAuthorization');
    return { currency: row.currency, revision: row.revision, balanceExact: row.balanceExact };
  });
}
