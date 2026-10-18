import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  platform: { OS: 'android' }, permission: vi.fn(), create: vi.fn(), write: vi.fn(), read: vi.fn(), remove: vi.fn(), available: vi.fn(), share: vi.fn(),
}));
vi.mock('react-native', () => ({ Platform: mocks.platform }));
vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///test-cache/', EncodingType: { Base64: 'base64' },
  StorageAccessFramework: { requestDirectoryPermissionsAsync: mocks.permission, createFileAsync: mocks.create, deleteAsync: mocks.remove },
  writeAsStringAsync: mocks.write, readAsStringAsync: mocks.read, deleteAsync: mocks.remove,
}));
vi.mock('expo-sharing', () => ({ isAvailableAsync: mocks.available, shareAsync: mocks.share }));
import { saveSpreadsheet, toBase64 } from '@/services/saveSpreadsheet';
const bytes = new Uint8Array([80, 75, 1, 2, 255]);
describe('native file export with mocked file APIs (not a device test)', () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.platform.OS = 'android'; mocks.permission.mockResolvedValue({ granted: true, directoryUri: 'content://chosen-folder' });
    mocks.create.mockResolvedValue('content://new-export'); mocks.write.mockResolvedValue(undefined); mocks.read.mockResolvedValue(toBase64(bytes));
    mocks.remove.mockResolvedValue(undefined); mocks.available.mockResolvedValue(true); mocks.share.mockResolvedValue(undefined);
  });
  it.each([0, 1, 2, 3, 4, 12288, 12289, 20000])('encodes %s bytes without Node Buffer or btoa', (length) => {
    const value = Uint8Array.from({ length }, (_, index) => index % 256);
    expect(toBase64(value)).toBe(btoa(Array.from(value, (byte) => String.fromCharCode(byte)).join('')));
  });
  it('creates a new user-chosen Android file and verifies its complete contents before success', async () => {
    await expect(saveSpreadsheet(bytes, 'test.xlsx', () => true)).resolves.toBe('saved');
    expect(mocks.create).toHaveBeenCalledWith('content://chosen-folder', 'test.xlsx', expect.stringContaining('spreadsheetml'));
    expect(mocks.read).toHaveBeenCalledOnce(); expect(mocks.share).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('does not claim success or create a file after the folder chooser is cancelled', async () => {
    mocks.permission.mockResolvedValue({ granted: false });
    await expect(saveSpreadsheet(bytes, 'test.xlsx', () => true)).resolves.toBe('cancelled'); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('rejects stale scope before writes, including after an open folder picker', async () => {
    await expect(saveSpreadsheet(bytes, 'test.xlsx', () => false)).rejects.toThrow('exportScopeChanged');
    let current = true; mocks.permission.mockImplementationOnce(async () => { current = false; return { granted: true, directoryUri: 'content://chosen-folder' }; });
    await expect(saveSpreadsheet(bytes, 'test.xlsx', () => current)).rejects.toThrow('exportScopeChanged'); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('removes only its new incomplete file after failed read-back verification', async () => {
    mocks.read.mockResolvedValueOnce('partial');
    await expect(saveSpreadsheet(bytes, 'test.xlsx', () => true)).rejects.toThrow('exportWriteFailed');
    expect(mocks.remove).toHaveBeenCalledWith('content://new-export', { idempotent: true });
  });
  it('surfaces write failures even if cleanup also fails', async () => {
    mocks.write.mockRejectedValueOnce(new Error('disk full')); mocks.remove.mockRejectedValueOnce(new Error('permission'));
    await expect(saveSpreadsheet(bytes, 'test.xlsx', () => true)).rejects.toThrow('disk full');
  });
  it('reports the iOS share handoff rather than falsely confirming local retention and clears the temporary copy', async () => {
    mocks.platform.OS = 'ios';
    await expect(saveSpreadsheet(bytes, 'test.xlsx', () => true)).resolves.toBe('shared');
    expect(mocks.share).toHaveBeenCalledOnce(); expect(mocks.remove).toHaveBeenCalledWith('file:///test-cache/test.xlsx', { idempotent: true });
  });
});
