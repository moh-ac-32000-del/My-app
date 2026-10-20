import type { CurrencyCode } from '../constants/currencies';
import type { MerchantOperation } from './merchant';

export type DailyJournalEventType = 'cash_in' | 'cash_out' | 'debt' | 'settlement' | 'merchant';

/** Display/archive snapshot only. Drawer totals continue to use actual cash transactions. */
export interface DailyJournalEvent {
  id: string;
  storeId: string;
  type: DailyJournalEventType;
  amount: number;
  amountExact?: string;
  currency: CurrencyCode;
  customerId?: string;
  customerName?: string;
  note?: string;
  operationDate?: string;
  paymentMethodId?: string;
  paymentMethodName?: string;
  occurredAt: string;
  sourceId: string;
  merchantId?: string;
  merchantName?: string;
  merchantAction?: MerchantOperation['action'];
  cashDeltaExact?: string;
  balanceBeforeExact?: string;
  balanceAfterExact?: string;
  createdByUserId?: string;
  lines?: MerchantOperation['lines'];
  reversesOperationId?: string;
}
