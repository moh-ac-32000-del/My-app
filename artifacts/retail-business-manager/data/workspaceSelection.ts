import type { SpaceDiscoveryResult } from '../types/space';

/** Hints determine order only. Every candidate must still pass canonical server authorization. */
export function workspaceCandidates(discovery: SpaceDiscoveryResult, preferred?: string | null): string[] {
  const ids = discovery.memberships
    .filter((m) => m.status === 'active' && typeof m.spaceId === 'string' && m.spaceId.trim())
    .map((m) => m.spaceId.trim());
  return [
    ...new Set(
      [preferred, discovery.lastActiveSpaceId, discovery.primarySpaceId, ...ids].filter(
        (id): id is string => typeof id === 'string' && !!id.trim() && !id.includes('/'),
      ),
    ),
  ].map((id) => id.trim());
}
