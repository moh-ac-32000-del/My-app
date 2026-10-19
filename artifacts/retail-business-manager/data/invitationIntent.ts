// Ephemeral navigation intent only: no device persistence and no automatic acceptance.
let pendingToken: string | null = null;
let initialUrlHandled = false;
export function rememberInitialInvitation(value: string) {
  if (initialUrlHandled) return;
  initialUrlHandled = true;
  const token = invitationToken(value);
  if (token) pendingToken = token;
}
export function invitationToken(value: string): string | null {
  const text = value.trim();
  if (/^[a-f0-9]{64}$/.test(text)) return text;
  return text.match(/[#?&]invite=([a-f0-9]{64})(?:&|$)/)?.[1] ?? null;
}
export function rememberInvitation(value: string) {
  pendingToken = invitationToken(value);
}
export function pendingInvitation() {
  return pendingToken;
}
export function clearInvitation() {
  pendingToken = null;
}
export function workspaceInvitationLink(token: string): string {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('invalidInvitationToken');
  return `https://retail-business-manager.web.app/workspaces#invite=${token}`;
}
