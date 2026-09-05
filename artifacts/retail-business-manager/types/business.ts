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
  type: TransactionType;
  amount: number;
  currency: CurrencyCode;
  note?: string;
}

export type PaymentDirection = 'in' | 'out';
export type PaymentMethod = 'cash' | 'card' | 'bank-transfer' | 'other';

export interface Payment extends BusinessEntity {
  amount: MoneyValue;
  direction: PaymentDirection;
  method: PaymentMethod;
  customerId?: string;
  transactionId?: string;
  paidAt: string;
  note?: string;
}

export interface DailyArchive {
  id: string;
  storeId: string;
  date: string;
  closedAt: string;
  closingNumber: number;
  snapshot: import('@/services/storage').DailyJournalEvent[];
}

export interface Debt extends BusinessEntity {
  customerId: string;
  currency: CurrencyCode;
  amount: number;
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