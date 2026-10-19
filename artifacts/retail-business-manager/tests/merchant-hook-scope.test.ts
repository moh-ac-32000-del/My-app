import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ role: 'owner', send: vi.fn(), assert: vi.fn() }));
vi.mock('@/services/merchantFirestore', () => ({ sendMerchantCommand: state.send, subscribeMerchantAccounts: vi.fn() }));
vi.mock('@/context/StoreContext', () => ({ useStore: () => ({
  profile: { id: 'store' }, activeSpaceId: 's', sessionKey: 'session', isAuthenticated: true, isReady: true,
  activeSpaceLoading: false, activeSpaceError: null, workspaceRole: state.role,
  canWriteBusiness: state.role === 'owner' || state.role === 'editor', assertBusinessAccess: state.assert,
}) }));
import { useMerchantAccounts } from '@/hooks/useMerchantAccounts';
import type { MerchantDraftCommand } from '@/types/merchant';

function capture(merchantId: string) {
  let value: ReturnType<typeof useMerchantAccounts> | undefined;
  function Probe() { value = useMerchantAccounts(merchantId); return null; }
  renderToStaticMarkup(React.createElement(Probe));
  return value!;
}
const payment: MerchantDraftCommand = { action: 'payment', merchantId: 'm', operationId: 'operation', currency: 'TRY', amountExact: '10.00', source: 'cash' };
beforeEach(() => { state.role = 'owner'; state.send.mockReset(); state.assert.mockReset(); });
describe('merchant command hook scope', () => {
  it('rejects a stale form for another merchant before any network call', async () => {
    await expect(capture('another').command(payment)).rejects.toThrow('merchantScopeChanged');
    expect(state.send).not.toHaveBeenCalled();
  });
  it('does not send financial commands from a viewer', async () => {
    state.role = 'viewer';
    await expect(capture('m').command(payment)).rejects.toThrow('workspaceReadOnly');
    expect(state.send).not.toHaveBeenCalled();
  });
  it('requires canonical business access before sending and after acknowledgement', async () => {
    state.send.mockResolvedValue({ outcome: 'completed' });
    await capture('m').command(payment);
    expect(state.assert.mock.calls).toEqual([['s', 'session'], ['s', 'session']]);
    expect(state.send).toHaveBeenCalledWith('s', 'store', payment);
  });
  it('does not send a command when session authorization is no longer valid', async () => {
    state.assert.mockImplementationOnce(() => { throw new Error('workspaceSessionChanged'); });
    await expect(capture('m').command(payment)).rejects.toThrow('workspaceSessionChanged');
    expect(state.send).not.toHaveBeenCalled();
  });
});
