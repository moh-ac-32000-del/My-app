import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreProfile } from '@/types/business';

const storedValues = vi.hoisted(() => new Map<string, string>());

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storedValues.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storedValues.set(key, value);
    },
    removeItem: async (key: string) => {
      storedValues.delete(key);
    },
  },
}));

import {
  loadAuthenticatedState,
  loadStoreProfile,
  normalizeStoredStoreProfile,
  saveAuthenticatedState,
  saveStoreProfile,
} from '@/services/storage';

const profile: StoreProfile = {
  id: 'store-1',
  name: 'متجر الاختبار',
  phone: '+905001234567',
  address: 'Istanbul',
  currency: 'TRY',
  quickCurrencies: ['TRY', 'USD'],
  language: 'tr',
  accent: 'violet',
};

describe('storage', () => {
  beforeEach(() => {
    storedValues.clear();
  });

  it('saves and loads a store profile without losing valid data', async () => {
    await saveStoreProfile(profile);

    await expect(loadStoreProfile()).resolves.toEqual(profile);
  });

  it('saves and loads the current authenticated state', async () => {
    await saveAuthenticatedState(true);

    await expect(loadAuthenticatedState()).resolves.toBe(true);
  });

  it('returns null for corrupted profile JSON', async () => {
    storedValues.set('@retail-business-manager/store-profile', '{not-json');

    await expect(loadStoreProfile()).resolves.toBeNull();
  });

  it('keeps valid fields and safely defaults invalid profile fields', () => {
    const normalized = normalizeStoredStoreProfile(
      {
        id: 'store-2',
        name: 'Valid name',
        phone: 123,
        address: 'Valid address',
        currency: 'not-a-currency',
        quickCurrencies: ['USD', 'USD', 'not-a-currency'],
        language: 'not-a-language',
        accent: 'not-an-accent',
      },
      profile,
    );

    expect(normalized).toEqual({
      ...profile,
      id: 'store-2',
      name: 'Valid name',
      phone: profile.phone,
      address: 'Valid address',
      currency: profile.currency,
      quickCurrencies: ['USD'],
      language: 'ar',
      accent: 'blue',
    });
  });
});