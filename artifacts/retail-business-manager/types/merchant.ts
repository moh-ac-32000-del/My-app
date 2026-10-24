import type { CurrencyCode } from '@/constants/currencies';

export interface Merchant {
  id: string;
  workspaceId: string;
  storeId: string;
  name: string;
  phone: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  createdByUserId: string;
  updatedAt: string;
  updatedByUserId: string;
}
export interface MerchantBalance {
  id: string;
  workspaceId: string;
  storeId: string;
  merchantId: string;
  currency: CurrencyCode;
  balanceExact: string;
  revision: number;
  version: 1;
}
export interface MerchantOperation {
  id: string;
  workspaceId: string;
  storeId: string;
  merchantId: string;
  merchantName: string;
  action: 'opening' | 'purchase' | 'payment' | 'directPayment' | 'reverse';
  currency: CurrencyCode;
  balanceBeforeExact: string;
  balanceAfterExact: string;
  cashDeltaExact: string;
  note: string;
  operationDate?: string;
  paymentMethodId?: string;
  paymentMethodName?: string;
  createdAt: string;
  createdByUserId: string;
  amountExact?: string;
  totalExact?: string;
  paidExact?: string;
  source?: string;
  customerId?: string;
  customerName?: string;
  reversedByOperationId?: string;
  cancelled?: boolean;
  replacementOperationId?: string;
  replacesOperationId?: string;
  reversesOperationId?: string;
  reason?: string;
  transactionId?: string;
  paymentId?: string;
  debtId?: string;
  customerChargeExact?: string;
  reversedAction?: 'opening' | 'purchase' | 'payment' | 'directPayment';
  lines?: Array<{ name: string; quantity: string; unitPrice: string; totalExact: string }>;
}
export interface CustomerCredit {
  id: string;
  workspaceId: string;
  storeId: string;
  customerId: string;
  currency: CurrencyCode;
  creditExact: string;
  revision: number;
  version: 1;
}
export interface MerchantSnapshot {
  merchants: Merchant[];
  balances: MerchantBalance[];
  operations: MerchantOperation[];
  operationsLimited: boolean;
}
type Financial = { currency: CurrencyCode; note?: string };
export type MerchantDraftCommand = { operationId: string; merchantId: string; replacesOperationId?: string } & (
  | {
      action: 'save';
      name: string;
      phone: string;
      address?: string;
      notes?: string;
      isActive: boolean;
      openingBalances?: Array<{ currency: CurrencyCode; amountExact: string }>;
    }
  | (Financial & { action: 'opening'; amountExact: string })
  | (Financial & {
      action: 'purchase';
      lines: Array<{ name: string; quantity: string; unitPrice: string }>;
      paidExact: string;
      source: 'cash' | 'external';
      operationDate?: string;
      separateLines?: true;
    })
  | (Financial & {
      action: 'payment';
      amountExact: string;
      source: 'cash' | 'external';
      operationDate?: string;
      paymentMethodId?: string;
      paymentMethodName?: string;
    })
  | (Financial & {
      action: 'directPayment';
      amountExact: string;
      customerId: string;
      operationDate?: string;
      paymentMethodId?: string;
      paymentMethodName?: string;
    })
  | { action: 'reverse'; currency: CurrencyCode; targetOperationId: string; reason: string; cancelled?: true }
);
