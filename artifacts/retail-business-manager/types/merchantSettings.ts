import type { CurrencyCode } from '../constants/currencies';

export interface MerchantMaterial {
  id: string;
  name: string;
  prices: Partial<Record<CurrencyCode, string>>;
  isActive: boolean;
}
export interface MerchantPaymentMethod {
  id: string;
  name: string;
  isActive: boolean;
}
export interface MerchantSettings {
  revision: number;
  materials: MerchantMaterial[];
  paymentMethods: MerchantPaymentMethod[];
}
export const emptyMerchantSettings = (): MerchantSettings => ({ revision: 0, materials: [], paymentMethods: [] });
