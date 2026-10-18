import { describe, expect, it } from 'vitest';
import app from '../app.json';
import eas from '../eas.json';

describe('My app Android test release', () => {
  it('links the approved team project without changing the Android package', () => {
    expect(app.expo.owner).toBe('majams-team');
    expect(app.expo.extra.eas.projectId).toBe('7cc829f1-b0ee-4dfc-a340-88d1de0b83bc');
    expect(app.expo.android.package).toBe('com.retailbusinessmanager.app');
  });

  it('builds an internal APK with the preview environment and CI-compatible pnpm', () => {
    expect(eas.build.preview.environment).toBe('preview');
    expect(eas.build.preview.distribution).toBe('internal');
    expect(eas.build.preview.android.buildType).toBe('apk');
    expect(eas.build.preview.pnpm).toBe('10.18.3');
    expect(eas.cli.appVersionSource).toBe('local');
  });
});
