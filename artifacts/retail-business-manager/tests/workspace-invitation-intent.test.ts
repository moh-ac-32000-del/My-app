import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearInvitation,
  invitationToken,
  pendingInvitation,
  rememberInvitation,
  rememberInitialInvitation,
  workspaceInvitationLink,
} from '@/data/invitationIntent';
const token = 'a'.repeat(64);
describe('ephemeral invitation navigation', () => {
  beforeEach(clearInvitation);
  it('round-trips a fragment link without a secret HTTP query', () => {
    const url = workspaceInvitationLink(token);
    expect(new URL(url).search).toBe('');
    expect(invitationToken(url)).toBe(token);
  });
  it('accepts the secret code itself', () => expect(invitationToken(token)).toBe(token));
  it.each(['', 'a'.repeat(63), 'https://example.test/#invite=' + token + 'b', 'not-an-invitation'])(
    'rejects malformed input %s',
    (value) => expect(invitationToken(value)).toBeNull(),
  );
  it('retains only an in-memory intent for the explicit accept form after login, then clears it', () => {
    rememberInvitation(workspaceInvitationLink(token));
    expect(pendingInvitation()).toBe(token);
    clearInvitation();
    expect(pendingInvitation()).toBeNull();
  });
  it('does not recapture an already-consumed initial native URL on a later screen mount', () => {
    rememberInitialInvitation(workspaceInvitationLink(token));
    expect(pendingInvitation()).toBe(token);
    clearInvitation();
    rememberInitialInvitation(workspaceInvitationLink(token));
    expect(pendingInvitation()).toBeNull();
    rememberInvitation(token);
    expect(pendingInvitation()).toBe(token);
  });
});
