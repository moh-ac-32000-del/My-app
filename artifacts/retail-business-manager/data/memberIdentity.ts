/** Display metadata only. Never use a name or color as an authorization identity. */
export function memberDisplayName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('invalidMemberName');
  const name = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!name || [...name].length > 40 || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value))
    throw new Error('invalidMemberName');
  return name;
}

export function memberColor(spaceId: string, userId: string): string {
  let hash = 2166136261;
  for (const char of `${spaceId}/${userId}`) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619) >>> 0;
  return `hsl(${(hash % 36000) / 100}, 70%, 72%)`;
}
