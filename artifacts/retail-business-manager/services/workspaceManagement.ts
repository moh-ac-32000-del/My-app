import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp, getFirebaseAuth } from '@/services/firebase';
import type { Space, MembershipRole } from '@/types/space';
export { invitationToken, workspaceInvitationLink } from '@/data/invitationIntent';

export interface WorkspaceOverview {
  space: Space;
  role: MembershipRole;
  members?: Array<{ userId: string; displayName: string; role: MembershipRole; status: string }>;
  invitations?: Array<{ invitationId: string; role: 'editor' | 'viewer'; status: string; expiresAt: string }>;
  limits?: { private: number; shared: number };
  used?: { private: number; shared: number };
}
export type WorkspaceRequest = {
  action: 'quota' | 'create' | 'rename' | 'overview' | 'invite' | 'revoke' | 'accept' | 'role' | 'remove';
  spaceId?: string;
  name?: string;
  mode?: 'private' | 'shared';
  role?: 'editor' | 'viewer';
  userId?: string;
  token?: string;
  invitationId?: string;
  operationId?: string;
};
export type WorkspaceQuota = { limits: { private: number; shared: number }; used: { private: number; shared: number } };
export async function workspaceCommand<T = { spaceId: string }>(input: WorkspaceRequest): Promise<T> {
  if (!getFirebaseAuth().currentUser) throw new Error('firebaseUserIdRequired');
  const callable = httpsCallable<WorkspaceRequest, T>(getFunctions(getFirebaseApp()), 'workspaceCommand');
  return (await callable(input)).data;
}
