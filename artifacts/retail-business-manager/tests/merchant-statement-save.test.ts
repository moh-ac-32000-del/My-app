import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveMerchantStatement } from '../services/saveMerchantStatement.web';

afterEach(() => vi.unstubAllGlobals());
function popup() {
  const window = { opener: {}, document: { open: vi.fn(), write: vi.fn(), close: vi.fn(), fonts: { ready: Promise.resolve() } },
    focus: vi.fn(), print: vi.fn(), close: vi.fn() };
  vi.stubGlobal('window', { open: vi.fn(() => window) });
  return window;
}
describe('browser merchant PDF output: authorization precedes release of financial content', () => {
  it('returns only print-dialog, never a claim that the user saved a PDF', async () => {
    const page = popup(), authorize = vi.fn(async () => {});
    await expect(saveMerchantStatement('<html>Sanitized public statement</html>', 'save', () => true, authorize)).resolves.toBe('print-dialog');
    expect(authorize).toHaveBeenCalledOnce();
    expect(page.document.write).toHaveBeenCalledWith('<html>Sanitized public statement</html>');
    expect(page.print).toHaveBeenCalledOnce();
    expect(page.opener).toBeNull();
  });
  it('closes the empty popup without exposing content when fresh authorization rejects', async () => {
    const page = popup();
    await expect(saveMerchantStatement('PRIVATE_CONTENT', 'save', () => true, async () => { throw new Error('permission-denied'); })).rejects.toThrow('permission-denied');
    expect(page.document.write).not.toHaveBeenCalled(); expect(page.print).not.toHaveBeenCalled(); expect(page.close).toHaveBeenCalledOnce();
  });
  it('does not print an old workspace after scope changes during authorization', async () => {
    const page = popup(); let current = true;
    await expect(saveMerchantStatement('PRIVATE_CONTENT', 'save', () => current, async () => { current = false; })).rejects.toThrow('exportScopeChanged');
    expect(page.document.write).not.toHaveBeenCalled(); expect(page.close).toHaveBeenCalledOnce();
  });
  it('blocks before opening a window for an already invalid session', async () => {
    const page = popup();
    await expect(saveMerchantStatement('PRIVATE_CONTENT', 'save', () => false, async () => {})).rejects.toThrow('exportScopeChanged');
    expect(page.document.write).not.toHaveBeenCalled(); expect(window.open).not.toHaveBeenCalled();
  });
});
