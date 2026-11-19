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


/**
 * Destructive lifecycle jobs set this field on the canonical target document.
 * Call only with the target snapshot read in the same Firestore transaction as
 * the financial write. Missing fields remain compatible with legacy records;
 * malformed or non-active values fail closed.
 */
export function assertLifecycleTargetWritable(
  target: unknown,
  kind: 'customer' | 'merchant' | 'debt',
): void {
  if (target === null || typeof target !== 'object' || Array.isArray(target)) return;
  const value = (target as Record<string, unknown>).lifecycleStatus;
  if (value === undefined || value === 'active') return;
  if (value === 'deleting' || value === 'archiving' || value === 'deleted' || value === 'archived') {
    throw new HttpsError('failed-precondition', `${kind} is in a destructive lifecycle transition`, {
      code: `${kind.toUpperCase()}_LIFECYCLE_LOCKED`,
    });
  }
  throw new HttpsError('failed-precondition', `${kind} lifecycle state is invalid`, {
    code: 'LIFECYCLE_STATE_INVALID',
  });
}
