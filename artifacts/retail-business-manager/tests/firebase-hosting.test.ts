import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));

describe('Firebase test release packaging', () => {
  it('publishes only the generated export, including pnpm-nested font and image assets', () => {
    expect(config.hosting.public).toBe('dist');
    // Expo exports assets under assets/__node_modules/.pnpm/.../node_modules/.
    // Blanket dot-directory or node_modules ignores silently omit all of them.
    expect(config.hosting.ignore).toEqual(['firebase.json']);
  });

  it('preserves direct navigation into the single-page application', () => {
    expect(config.hosting.rewrites).toEqual([{ source: '**', destination: '/index.html' }]);
  });
});
