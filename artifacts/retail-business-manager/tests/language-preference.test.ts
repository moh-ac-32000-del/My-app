import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isRTL, translate } from '@/constants/i18n';

const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
import { loadUiLanguage, saveUiLanguage } from '@/services/preferences';

describe('personal UI language before and after sign-in', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['ar', 'en', 'tr'] as const)('persists %s without Firebase or a workspace', async (language) => {
    storage.setItem.mockResolvedValue(undefined);
    await saveUiLanguage(language);
    expect(storage.setItem).toHaveBeenCalledWith('@retail-business-manager/ui-language', language);
    storage.getItem.mockResolvedValue(language);
    await expect(loadUiLanguage()).resolves.toBe(language);
  });

  it.each([null, '', 'de', '{"storeId":"not-a-preference"}'])(
    'ignores an absent or unsupported stored value %j', async (value) => {
      storage.getItem.mockResolvedValue(value);
      await expect(loadUiLanguage()).resolves.toBeNull();
    },
  );

  it('uses the same built-in dictionaries and direction rules as the application', () => {
    expect(translate('login', 'ar')).toBe('تسجيل الدخول');
    expect(translate('login', 'en')).toBe('Sign in');
    expect(translate('login', 'tr')).toBeTruthy();
    expect(isRTL('ar')).toBe(true);
    expect(isRTL('en')).toBe(false);
    expect(isRTL('tr')).toBe(false);
  });

  it('propagates storage failures instead of claiming the preference was saved', async () => {
    storage.setItem.mockRejectedValueOnce(new Error('storage-unavailable'));
    await expect(saveUiLanguage('en')).rejects.toThrow('storage-unavailable');
  });
});
