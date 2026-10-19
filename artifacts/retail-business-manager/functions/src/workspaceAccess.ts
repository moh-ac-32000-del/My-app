import { HttpsError } from 'firebase-functions/v2/https';
import {
  canReadWorkspace,
  canWriteWorkspace,
  canManageWorkspace,
} from '../../data/workspaceAccess.js';

/** Call with freshly read canonical member/space documents inside the write transaction. */
export function assertWorkspaceAccess(
  member: unknown,
  action: 'read' | 'write' | 'owner',
  space?: unknown,
  uid = '',
): void {
  const allowed =
    action === 'read'
      ? canReadWorkspace(member)
      : action === 'write'
        ? canWriteWorkspace(member)
        : canManageWorkspace(member, space, uid);
  if (!allowed)
    throw new HttpsError(
      'permission-denied',
      'Workspace role does not allow this operation',
      { code: 'FORBIDDEN' },
    );
}
