import type { CurrencyCode } from '@/constants/currencies';

export interface Merchant {
  id: string;
  workspaceId: string;
  storeId: string;
  name: string;
  phone: string;
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
  createdAt: string;
  createdByUserId: string;
  amountExact?: string;
  totalExact?: string;
  paidExact?: string;
  source?: string;
  customerId?: string;
  customerName?: string;
  reversedByOperationId?: string;
  reversesOperationId?: string;
  reason?: string;
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
export type MerchantDraftCommand = { operationId: string; merchantId: string } & (
  | { action: 'save'; name: string; phone: string; isActive: boolean }
  | (Financial & { action: 'opening'; amountExact: string })
  | (Financial & {
      action: 'purchase';
      lines: Array<{ name: string; quantity: string; unitPrice: string }>;
      paidExact: string;
      source: 'cash' | 'external';
    })
  | (Financial & { action: 'payment'; amountExact: string; source: 'cash' | 'external' })
  | (Financial & { action: 'directPayment'; amountExact: string; customerId: string })
  | { action: 'reverse'; currency: CurrencyCode; targetOperationId: string; reason: string }
);
