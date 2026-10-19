import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readJson = (path: string) => JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8'));

describe('supported Functions runtime configuration', () => {
  it('deploys the reviewed Node.js 22 runtime without a conflicting Firebase override', () => {
    expect(readJson('functions/package.json').engines.node).toBe('22');
    const firebase = readJson('firebase.json');
    expect(firebase.functions.source).toBe('functions');
    expect([undefined, 'nodejs22']).toContain(firebase.functions.runtime);
  });

  it('runs both application and actual emulator integration CI on the deployed major version', () => {
    const workflow = readFileSync(resolve(process.cwd(), '../../.github/workflows/retail-business-manager-ci.yml'), 'utf8');
    const versions = [...workflow.matchAll(/^\s+node-version:\s*['"]?(\d+)['"]?\s*$/gm)].map(match => match[1]);
    expect(versions).toHaveLength(2);
    expect(versions.every(version => version === readJson('functions/package.json').engines.node)).toBe(true);
  });
});
