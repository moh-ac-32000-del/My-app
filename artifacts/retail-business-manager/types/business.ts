import type { Language } from '@/constants/i18n';
import type { AccentColor } from '@/constants/colors';
import type { CurrencyCode } from '@/constants/currencies';

export type { AccentColor };
export type { CurrencyCode };

export interface StoreProfile {
  id: string;
  name: string;
  phone: string;
  address: string;
  currency: CurrencyCode;
  quickCurrencies: CurrencyCode[];
  visibleCurrencies: CurrencyCode[];
  language: Language;
  accent: AccentColor;
  logoUri?: string;
}

export interface DashboardMetrics {
  cashBalance: number;
  todaySales: number;
  todayPurchases: number;
  totalDebts: number;
  customersCount: number;
  productsCount: number;
}

export interface StoreScopedEntity {
  id: string;
  storeId: string;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessEntity extends StoreScopedEntity {
  workspaceId?: string;
  createdByUserId?: string;
}

export interface MoneyValue {
  amount: number;
  currency: CurrencyCode;
}

export interface Customer extends BusinessEntity {
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
}

export type TransactionType = 'cash_in' | 'cash_out';

export interface CashTransactionDraft {
  type: TransactionType;
  amount: number;
  currency: CurrencyCode;
  note?: string;
}

export interface Transaction extends StoreScopedEntity {
  /** Trusted payment adjustment attribution; cash direction/amount remain unchanged. */
  customerId?: string;
  correctionOfPaymentId?: string;
  customerAmendmentId?: string;
  createdByUserId?: string;
  type: TransactionType;
  amount: number;
  currency: CurrencyCode;
  note?: string;
  workspaceId?: string;
  merchantId?: string;
  merchantOperationId?: string;
  amountExact?: string;
}

export type PaymentDirection = 'in' | 'out';
export type PaymentMethod = 'cash' | 'card' | 'bank-transfer' | 'other';

export interface OperationCorrectionMetadata {
  operationDate?: string;
  cancelled?: boolean;
  amendmentRevision?: number;
  customerAmendmentId?: string;
}

export interface Payment extends BusinessEntity, OperationCorrectionMetadata {
  /** Trusted original cash posting; corrections have separate current-period cash entries. */
  cashBaseAmountExact?: string;
  amount: MoneyValue;
  direction: PaymentDirection;
  method: PaymentMethod;
  customerId?: string;
  transactionId?: string;
  paidAt: string;
  note?: string;
  amountExact?: string;
  source?: 'customer-to-merchant';
  merchantId?: string;
  merchantName?: string;
  merchantOperationId?: string;
}

export interface DailyArchive {
  id: string;
  storeId: string;
  date: string;
  closedAt: string;
  closingNumber: number;
  /** Immutable server snapshot; absent on archives created before this field. */
  closingCashBalances?: MoneyValue[];
  closingMode?: 'automatic';
  periodStartAt?: string;
  periodEndAt?: string;
  timeZone?: string;
  snapshot: import('@/services/storage').DailyJournalEvent[];
  /** Read-time status annotations only; never persisted as a replacement snapshot. */
  operationStatuses?: Record<string, 'cancelled' | 'edited'>;
  operationStatusesUnavailable?: true;
}

export interface Debt extends BusinessEntity, OperationCorrectionMetadata {
  customerId: string;
  currency: CurrencyCode;
  amount: number;
  /** Exact remaining amount on trusted new writes; old records keep their original number. */
  amountExact?: string;
  creditAppliedExact?: string;
  merchantOperationId?: string;
  correctionOfMerchantOperationId?: string;
  correctionOfPaymentId?: string;
  note?: string;
  dueDate?: string;
  originalAmount?: number;
  settledAt?: string;
}

export type ReminderStatus = 'pending' | 'completed' | 'dismissed';

export interface Reminder extends BusinessEntity {
  debtId: string;
  remindAt: string;
  status: ReminderStatus;
  note?: string;
  completedAt?: string;
}
