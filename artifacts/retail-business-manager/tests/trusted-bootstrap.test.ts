import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseApp = vi.hoisted(() => ({ name: 'firebase-app' }));
const functionsInstance = vi.hoisted(() => ({ name: 'functions-instance' }));
const callableMock = vi.hoisted(() => vi.fn());
const httpsCallableMock = vi.hoisted(() => vi.fn());
const getFunctionsMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/firebase', () => ({
  getFirebaseApp: () => firebaseApp,
  isFirebaseConfigured: true,
}));

vi.mock('firebase/functions', () => ({
  getFunctions: getFunctionsMock,
  httpsCallable: httpsCallableMock,
}));

import { bootstrapPrimarySpace } from '@/services/trustedBootstrap';

const bootstrapResponse = {
  outcome: 'created' as const,
  primarySpaceId: 'server-space-1',
  space: {
    spaceId: 'server-space-1',
    name: 'Primary Space',
    mode: 'private' as const,
    status: 'active' as const,
    ownerUserId: 'firebase-user',
    createdAt: '2026-08-31T10:00:00.000Z',
    updatedAt: '2026-08-31T10:00:00.000Z',
  },
  ownerMembership: {},
  operationReceipt: {},
};

describe('trusted primary Space client boundary', () => {
  beforeEach(() => {
    callableMock.mockReset();
    httpsCallableMock.mockReset();
    getFunctionsMock.mockReset();
    getFunctionsMock.mockReturnValue(functionsInstance);
    httpsCallableMock.mockReturnValue(callableMock);
  });

  it('calls the trusted function without sending identity fields and returns its Space', async () => {
    callableMock.mockResolvedValue({ data: bootstrapResponse });

    await expect(bootstrapPrimarySpace()).resolves.toEqual(bootstrapResponse);

    expect(getFunctionsMock).toHaveBeenCalledWith(firebaseApp);
    expect(httpsCallableMock).toHaveBeenCalledWith(
      functionsInstance,
      'bootstrapPrimarySpace',
    );
    expect(callableMock).toHaveBeenCalledWith({});
  });

  it('rejects a malformed server response instead of creating a local fallback identity', async () => {
    callableMock.mockResolvedValue({
      data: {
        ...bootstrapResponse,
        primarySpaceId: 'client-selected-space',
      },
    });

    await expect(bootstrapPrimarySpace()).rejects.toThrow('invalidBootstrapResponse');
  });
});