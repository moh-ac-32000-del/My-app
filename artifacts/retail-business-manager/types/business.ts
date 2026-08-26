import type { Language } from '@/constants/i18n';

export type AccentColor = 'cyan' | 'violet' | 'amber' | 'mint';

export interface StoreProfile {
  id: string;
  name: string;
  phone: string;
  address: string;
  currency: string;
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