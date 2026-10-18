import { XLSX_MIME } from './spreadsheetWorkbook';
import type { SaveExportResult } from './saveSpreadsheet';

export async function saveSpreadsheet(bytes: Uint8Array, name: string, isCurrent: () => boolean): Promise<SaveExportResult> {
  if (!isCurrent()) throw new Error('exportScopeChanged');
  const blob = new Blob([new Uint8Array(bytes).buffer], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url; link.download = name; link.rel = 'noopener'; document.body.appendChild(link);
    link.click();
    return 'download-requested'; // Browser owns the final save/cancel decision.
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
