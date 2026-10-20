import type { StatementSaveResult } from './saveMerchantStatement';

/** Browser Save as PDF is user-controlled; opening print is not proof of a downloaded file. */
export async function saveMerchantStatement(
  html: string,
  _mode: 'save' | 'share',
  isCurrent: () => boolean,
  authorize: () => Promise<void>,
): Promise<StatementSaveResult> {
  if (!isCurrent()) throw new Error('exportScopeChanged');
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('exportPopupBlocked');
  try {
    popup.opener = null;
    await authorize();
    if (!isCurrent()) throw new Error('exportScopeChanged');
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    await popup.document.fonts.ready;
    if (!isCurrent()) throw new Error('exportScopeChanged');
    popup.focus();
    popup.print();
    return 'print-dialog';
  } catch (error) {
    popup.close();
    throw error;
  }
}
