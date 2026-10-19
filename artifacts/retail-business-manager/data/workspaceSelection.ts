import type { SpaceDiscoveryResult, MembershipRole } from '../types/space';

/** A UI generation boundary, never an authorization token. JSON avoids identifier delimiter collisions. */
export function workspaceSessionKey(
  uid: string | null | undefined,
  spaceId: string | null,
  role: MembershipRole | null,
  generation: number,
): string {
  return JSON.stringify([uid ?? null, spaceId, role, generation]);
}

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
