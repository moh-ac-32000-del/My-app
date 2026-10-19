import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp, getFirebaseAuth } from '@/services/firebase';
import type { Space, MembershipRole } from '@/types/space';

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

/** Accept a shared link or the secret code itself; never persist it to device storage. */
export function invitationToken(value: string): string | null {
  const text = value.trim();
  if (/^[a-f0-9]{64}$/.test(text)) return text;
  const match = text.match(/[#?&]invite=([a-f0-9]{64})(?:&|$)/);
  return match?.[1] ?? null;
}
export function workspaceInvitationLink(token: string): string {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('invalidInvitationToken');
  // Fragment is not sent to Hosting in the HTTP request.
  return `https://retail-business-manager.web.app/workspaces#invite=${token}`;
}
