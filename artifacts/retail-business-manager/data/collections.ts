export const FIREBASE_COLLECTIONS = {
  users: 'users',
  stores: 'stores',
  sales: 'sales',
  purchases: 'purchases',
  customers: 'customers',
  payments: 'payments',
  expenses: 'expenses',
  cashTransactions: 'cashTransactions',
  products: 'products',
  dailyClosings: 'dailyClosings',
} as const;

export type FirebaseCollection = (typeof FIREBASE_COLLECTIONS)[keyof typeof FIREBASE_COLLECTIONS];

export interface StoreDocument {
  id: string;
  name: string;
  ownerUserIds: string[];
  currency: string;
  language: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpaceDocument {
  spaceId: string;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Every future Firestore document should carry storeId.
 * This keeps one account ready for multiple stores and role-based access.
 */
export type StoreScopedDocument<T> = T & { storeId: string };