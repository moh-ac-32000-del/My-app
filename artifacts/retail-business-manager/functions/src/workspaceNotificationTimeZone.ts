import { automaticClosingPolicy, closingTransitionAt } from '../../data/automaticClosing.js';
import { closingSettings } from '../../data/workspaceClosing.js';

/** Called only after canonical workspace authorization. Never uses the handset zone.
 * Invalid workspace metadata fails closed instead of sending at an invented time. */
export function workspaceNotificationTimeZone(space: Record<string, any>, now: string): string {
  return space.automaticClosing === undefined
    ? closingSettings(space.closingSettings).timeZone
    : closingTransitionAt(automaticClosingPolicy(space.automaticClosing), now).timeZone;
}
