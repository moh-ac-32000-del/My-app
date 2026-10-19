import { describe, expect, it } from 'vitest';
import { workspaceCandidates } from '@/data/workspaceSelection';

describe('workspace selection hints', () => {
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
