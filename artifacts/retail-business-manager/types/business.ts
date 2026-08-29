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

export type TransactionType = 'sale' | 'purchase' | 'cash-in' | 'cash-out' | 'adjustment';
export type TransactionStatus = 'draft' | 'posted' | 'cancelled';

export interface Transaction extends BusinessEntity {
  type: TransactionType;
  status: TransactionStatus;
  total: MoneyValue;
  customerId?: string;
  occurredAt: string;
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

export type DebtStatus = 'open' | 'partially-paid' | 'paid' | 'cancelled';

export interface Debt extends BusinessEntity {
  customerId: string;
  transactionId?: string;
  originalAmount: MoneyValue;
  remainingAmount: MoneyValue;
  status: DebtStatus;
  dueAt?: string;
  note?: string;
}

export type ReminderStatus = 'pending' | 'completed' | 'dismissed';

export interface Reminder extends BusinessEntity {
  title: string;
  remindAt: string;
  status: ReminderStatus;
  customerId?: string;
  debtId?: string;
  note?: string;
  completedAt?: string;
}