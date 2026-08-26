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