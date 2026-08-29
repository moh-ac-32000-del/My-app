import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/types/business';

const storedValues = vi.hoisted(() => new Map<string, string>());

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storedValues.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storedValues.set(key, value);
    },
  },
}));

import { filterCustomers } from '@/components/customer-utils';
import { loadCustomers, saveCustomers } from '@/services/storage';

const customer: Customer = {
  id: 'customer-1',
  storeId: 'store-1',
  name: 'أحمد علي',
  phone: '+905001234567',
  address: 'Istanbul',
  notes: 'VIP',
  createdAt: '2026-08-29T10:00:00.000Z',
  updatedAt: '2026-08-29T10:00:00.000Z',
  isActive: true,
};

describe('customers', () => {
  beforeEach(() => {
    storedValues.clear();
  });

  it('adds and loads a customer from the customer storage key', async () => {
    await saveCustomers('store-1', [customer]);

    await expect(loadCustomers('store-1')).resolves.toEqual([customer]);
  });

  it('updates a customer without changing its stable id', async () => {
    const updated = { ...customer, name: 'أحمد محمد', updatedAt: '2026-08-29T11:00:00.000Z' };
    await saveCustomers('store-1', [customer]);
    await saveCustomers('store-1', [updated]);

    await expect(loadCustomers('store-1')).resolves.toEqual([updated]);
    expect(updated.id).toBe(customer.id);
  });

  it('searches customers by name or phone', () => {
    expect(filterCustomers([customer], 'أحمد')).toEqual([customer]);
    expect(filterCustomers([customer], '5001234567')).toEqual([customer]);
    expect(filterCustomers([customer], 'nobody')).toEqual([]);
  });

  it('rejects a customer without a name', async () => {
    storedValues.set(
      '@retail-business-manager/customers',
      JSON.stringify([{ ...customer, name: '   ' }]),
    );

    await expect(loadCustomers('store-1')).resolves.toEqual([]);
  });

  it('keeps valid customers when another stored record is invalid', async () => {
    storedValues.set(
      '@retail-business-manager/customers',
      JSON.stringify([customer, { id: 'broken', storeId: 'store-1', name: 42 }]),
    );

    await expect(loadCustomers('store-1')).resolves.toEqual([customer]);
  });

  it('returns an empty list for corrupted customer JSON', async () => {
    storedValues.set('@retail-business-manager/customers', '{not-json');

    await expect(loadCustomers('store-1')).resolves.toEqual([]);
  });

  it('preserves customers that belong to another store during updates and deletes', async () => {
    const otherStoreCustomer: Customer = {
      ...customer,
      id: 'customer-2',
      storeId: 'store-2',
      name: 'Other store customer',
    };
    storedValues.set(
      '@retail-business-manager/customers',
      JSON.stringify([customer, otherStoreCustomer]),
    );

    await saveCustomers('store-1', []);

    await expect(loadCustomers('store-1')).resolves.toEqual([]);
    await expect(loadCustomers('store-2')).resolves.toEqual([otherStoreCustomer]);
  });
});