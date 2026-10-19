import { describe, expect, it } from 'vitest';
import functionsPackage from '../functions/package.json';
import firebase from '../firebase.json';
import workflow from '../../../.github/workflows/retail-business-manager-ci.yml?raw';

describe('supported Functions runtime configuration', () => {
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
