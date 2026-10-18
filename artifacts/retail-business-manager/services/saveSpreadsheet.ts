import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { XLSX_MIME } from './spreadsheetWorkbook';

export type SaveExportResult = 'saved' | 'shared' | 'download-requested' | 'cancelled';

/** Native implementation; the .web module never imports native file/sharing APIs. */
export async function saveSpreadsheet(bytes: Uint8Array, name: string, isCurrent: () => boolean): Promise<SaveExportResult> {
  const assertCurrent = () => { if (!isCurrent()) throw new Error('exportScopeChanged'); };
  assertCurrent();
  const base64 = toBase64(bytes);
  if (Platform.OS === 'android') {
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    assertCurrent();
    if (!permission.granted) return 'cancelled';
    const uri = await FileSystem.StorageAccessFramework.createFileAsync(permission.directoryUri, name, XLSX_MIME);
    try {
      assertCurrent();
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      const verified = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      if (verified !== base64) throw new Error('exportWriteFailed');
      assertCurrent();
      return 'saved';
    } catch (error) {
      // Only this newly-created file, never an existing user file.
      try { await FileSystem.StorageAccessFramework.deleteAsync(uri, { idempotent: true }); } catch { /* Save error remains visible. */ }
      throw error;
    }
  }
  if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync())) throw new Error('exportSharingUnavailable');
  const uri = FileSystem.cacheDirectory + name;
  try {
    assertCurrent();
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    assertCurrent();
    await Sharing.shareAsync(uri, { mimeType: XLSX_MIME, UTI: 'org.openxmlformats.spreadsheetml.sheet' });
    return 'shared'; // Sharing API does not prove the user retained a copy.
  } finally { await FileSystem.deleteAsync(uri, { idempotent: true }); }
}

export function toBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const chunks: string[] = [];
  for (let start = 0; start < bytes.length; start += 12288) {
    let chunk = '';
    for (let i = start; i < Math.min(start + 12288, bytes.length); i += 3) {
      const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
      chunk += alphabet[a >> 2] + alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)]
        + (b === undefined ? '=' : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)]) + (c === undefined ? '=' : alphabet[c & 63]);
    }
    chunks.push(chunk);
  }
  return chunks.join('');
}
