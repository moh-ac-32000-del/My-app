import { describe, expect, it } from 'vitest';
import { workspaceCandidates, workspaceSessionKey } from '@/data/workspaceSelection';

describe('workspace selection hints', () => {
  it.each([
    ['another-user', 's', 'owner', 1],
    ['u', 'another-space', 'owner', 1],
    ['u', 's', 'viewer', 1],
    ['u', 's', 'owner', 2],
  ] as const)('invalidates the UI generation when account, space, role or transition changes: %j', (...args) => {
    expect(workspaceSessionKey(args[0], args[1], args[2], args[3])).not.toBe(workspaceSessionKey('u', 's', 'owner', 1));
  });
  it('does not collide when identifiers contain delimiters', () => {
    expect(workspaceSessionKey('a/b', 'c', 'owner', 1)).not.toBe(workspaceSessionKey('a', 'b/c', 'owner', 1));
  });
  it('deduplicates preference, server primary and active discovery candidates', () => {
    expect(
      workspaceCandidates(
        {
          primarySpaceId: 'a',
          lastActiveSpaceId: 'b',
          memberships: [
            { spaceId: 'a', status: 'active' },
            { spaceId: 'c', status: 'active' },
            { spaceId: 'd', status: 'suspended' },
          ] as never,
        },
        'b',
      ),
    ).toEqual(['b', 'a', 'c']);
  });
  it('never derives authorization or roles from discovery hints', () => {
    expect(workspaceCandidates({ primarySpaceId: 'deleted', lastActiveSpaceId: null, memberships: [] })).toEqual([
      'deleted',
    ]);
  });
  it('rejects empty and path-like selectors', () => {
    expect(workspaceCandidates({ primarySpaceId: 'spaces/other', lastActiveSpaceId: '', memberships: [] })).toEqual([]);
  });
});
