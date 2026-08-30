import { beforeEach, describe, expect, it, vi } from 'vitest';

const storedValues = vi.hoisted(() => new Map<string, string>());

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storedValues.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storedValues.set(key, value);
    },
  },
}));

import {
  getOrCreateSpaceIdentity,
  getSpaceIdentityStorageKey,
} from '@/services/spaceIdentity';

describe('Space Identity', () => {
  beforeEach(() => {
    storedValues.clear();
  });

  it('gives different Firebase accounts different Space IDs', async () => {
    const first = await getOrCreateSpaceIdentity('firebase-user-a');
    const second = await getOrCreateSpaceIdentity('firebase-user-b');

    expect(first.uid).toBe('firebase-user-a');
    expect(second.uid).toBe('firebase-user-b');
    expect(first.spaceId).not.toBe(second.spaceId);
    expect(first.spaceId).not.toBe('local-store');
    expect(second.spaceId).not.toBe('local-store');
  });

  it('restores the same Space ID for the same Firebase account', async () => {
    const first = await getOrCreateSpaceIdentity('firebase-user-a');
    const restored = await getOrCreateSpaceIdentity('firebase-user-a');

    expect(restored).toEqual(first);
    expect(storedValues.get(getSpaceIdentityStorageKey('firebase-user-a'))).toBe(JSON.stringify(first));
  });

  it('replaces an invalid local-store identity without using local-store globally', async () => {
    const key = getSpaceIdentityStorageKey('firebase-user-a');
    storedValues.set(key, JSON.stringify({
      uid: 'firebase-user-a',
      spaceId: 'local-store',
      createdAt: '2026-08-30T00:00:00.000Z',
    }));

    const identity = await getOrCreateSpaceIdentity('firebase-user-a');

    expect(identity.spaceId).not.toBe('local-store');
    expect(identity.uid).toBe('firebase-user-a');
  });

  it('only adds the identity key and preserves local business and backup data', async () => {
    const existingEntries = {
      '@retail-business-manager/store-profile': '{"id":"local-store"}',
      '@retail-business-manager/authenticated': 'true',
      '@retail-business-manager/customers': '[{"id":"customer-1"}]',
      '@retail-business-manager/transactions': '[{"id":"transaction-1"}]',
      '@retail-business-manager/debts': '[{"id":"debt-1"}]',
      '@retail-business-manager/payments': '[{"id":"payment-1"}]',
      '@retail-business-manager/daily-archive/local-store:2026-08-30:000001': '{"id":"archive-1"}',
      '@retail-business-manager/backup-sentinel': '{"version":1}',
    };
    for (const [key, value] of Object.entries(existingEntries)) {
      storedValues.set(key, value);
    }

    const identity = await getOrCreateSpaceIdentity('firebase-user-a');

    expect(storedValues.size).toBe(Object.keys(existingEntries).length + 1);
    for (const [key, value] of Object.entries(existingEntries)) {
      expect(storedValues.get(key)).toBe(value);
    }
    expect(storedValues.get(getSpaceIdentityStorageKey('firebase-user-a'))).toBe(JSON.stringify(identity));
  });
});