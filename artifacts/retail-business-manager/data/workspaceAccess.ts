import type { MembershipRole } from '../types/space';

/** One shared role policy. Discovery hints, local preferences and unknown legacy roles grant nothing. */
export function activeWorkspaceRole(member: unknown): MembershipRole | null {
  if (!member || typeof member !== 'object' || Array.isArray(member))
    return null;
  const value = member as Record<string, unknown>;
  if (value.status !== 'active') return null;
  return value.role === 'owner' ||
    value.role === 'editor' ||
    value.role === 'viewer'
    ? value.role
    : null;
}
export function canReadWorkspace(member: unknown): boolean {
  return activeWorkspaceRole(member) !== null;
}
export function canWriteWorkspace(member: unknown): boolean {
  const role = activeWorkspaceRole(member);
  return role === 'owner' || role === 'editor';
}
export function canManageWorkspace(
  member: unknown,
  space: unknown,
  uid: string,
): boolean {
  return (
    activeWorkspaceRole(member) === 'owner' &&
    !!space &&
    typeof space === 'object' &&
    (space as Record<string, unknown>).ownerUserId === uid
  );
}

/** Read-only transition assessment. Never automatically promote admin/manager/cashier to editor. */
export function assessMembershipRoleTransition(
  member: unknown,
  space: unknown,
  uid: string,
): 'unchanged' | 'review-required' {
  const role = activeWorkspaceRole(member);
  if (!role) return 'review-required';
  const owner =
    !!space &&
    typeof space === 'object' &&
    (space as Record<string, unknown>).ownerUserId === uid;
  return owner === (role === 'owner') ? 'unchanged' : 'review-required';
}
