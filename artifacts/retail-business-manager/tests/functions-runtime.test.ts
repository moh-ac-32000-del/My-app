import { describe, expect, it } from 'vitest';
import functionsPackage from '../functions/package.json';
import firebase from '../firebase.json';
import workflow from '../../../.github/workflows/retail-business-manager-ci.yml?raw';
import entrypoint from '../functions/src/index.ts?raw';

describe('supported Functions runtime configuration', () => {
  it('gates one notification schedule and both source wakeups off independently of closing', () => {
    expect(entrypoint).toContain("defineBoolean('NOTIFICATION_DISPATCH_READY', { default: false })");
    for (const name of ['notificationDispatch', 'notificationDebtChanged', 'notificationReminderChanged']) {
      expect(entrypoint).toContain(`export const ${name}`);
    }
    expect((entrypoint.match(/if \(!notificationDispatchReady.value\(\)\) return;/g) ?? []).length).toBe(3);
  });
  it('gates one bounded shared five-minute closing schedule off by default', () => {
    expect(entrypoint).toContain("defineBoolean('AUTOMATIC_CLOSING_READY', { default: false })");
    const schedule = entrypoint.slice(entrypoint.indexOf('export const automaticDailyClosing'), entrypoint.indexOf('export const pushDeviceCommand'));
    expect(schedule).toContain("schedule: '*/5 * * * *'");
    expect(schedule).toContain('maxInstances: 1');
    expect(schedule).toContain('minInstances: 0');
    expect(schedule).toContain('if (!automaticClosingReady.value()) return;');
  });
  it('registers bounded authenticated merchant reference settings', () => {
    expect(entrypoint).toContain("import { merchantSettingsCommandHandler } from './merchantSettingsCommand.js'");
    expect(entrypoint).toMatch(/export const merchantSettingsCommand = onCall\(\{ invoker: 'public', minInstances: 0, maxInstances: 2, timeoutSeconds: 60 \}/);
  });
  it('registers the trusted merchant callable with zero idle instances and a bounded scale cap', () => {
    expect(entrypoint).toContain("import { merchantCommandHandler } from './merchantCommand.js'");
    expect(entrypoint).toMatch(/export const merchantCommand = onCall\(\{ invoker: 'public', minInstances: 0, maxInstances: 2, timeoutSeconds: 60 \}/);
    expect(entrypoint).toContain('merchantCommandHandler(request, { firestore, now: () => new Date().toISOString() })');
  });
  it('deploys the reviewed Node.js 22 runtime without a conflicting Firebase override', () => {
    expect(functionsPackage.engines.node).toBe('22');
    expect(firebase.functions.source).toBe('functions');
    expect([undefined, 'nodejs22']).toContain((firebase.functions as { runtime?: string }).runtime);
  });

  it('runs both application and actual emulator integration CI on the deployed major version', () => {
    const versions = [...workflow.matchAll(/^\s+node-version:\s*['"]?(\d+)['"]?\s*$/gm)].map(match => match[1]);
    expect(versions).toHaveLength(2);
    expect(versions.every(version => version === functionsPackage.engines.node)).toBe(true);
  });

  it('pins Cloud Build dependency installation to the same reviewed pnpm version as CI', () => {
    expect(functionsPackage.engines.pnpm).toBe('10.18.3');
    const versions = [...workflow.matchAll(/^\s+version:\s*['"]?(\d+\.\d+\.\d+)['"]?\s*$/gm)].map(match => match[1]);
    expect(versions).toHaveLength(2);
    expect(versions.every(version => version === functionsPackage.engines.pnpm)).toBe(true);
  });
});
