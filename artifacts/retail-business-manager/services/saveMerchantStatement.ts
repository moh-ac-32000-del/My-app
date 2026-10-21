import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

export type StatementSaveResult = 'saved' | 'shared' | 'print-dialog' | 'cancelled';
export async function saveMerchantStatement(
  html: string,
  mode: 'save' | 'share',
  isCurrent: () => boolean,
  authorize: () => Promise<void>,
): Promise<StatementSaveResult> {
  const assertCurrent = () => {
    if (!isCurrent()) throw new Error('exportScopeChanged');
  };
  assertCurrent();
  await authorize();
  assertCurrent();
  const Print = await import('expo-print');
  let directory: string | null = null;
  if (mode === 'save' && Platform.OS === 'android') {
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    assertCurrent();
    if (!permission.granted) return 'cancelled';
    directory = permission.directoryUri;
    await authorize();
    assertCurrent();
  }
  // Native PDF generation requires the combined APK; unavailable modules fail visibly, never fake success.
  const file = await Print.printToFileAsync({ html, width: 595, height: 842 });
  let destination: string | null = null;
  try {
    assertCurrent();
    if (directory) {
      const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
      await authorize();
      assertCurrent();
      destination = await FileSystem.StorageAccessFramework.createFileAsync(
        directory,
        `My-app-statement-${Date.now()}.pdf`,
        'application/pdf',
      );
      assertCurrent();
      await FileSystem.writeAsStringAsync(destination, base64, { encoding: FileSystem.EncodingType.Base64 });
      if ((await FileSystem.readAsStringAsync(destination, { encoding: FileSystem.EncodingType.Base64 })) !== base64)
        throw new Error('exportWriteFailed');
      assertCurrent();
      return 'saved';
    }
    if (!(await Sharing.isAvailableAsync())) throw new Error('exportSharingUnavailable');
    await authorize();
    assertCurrent();
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    return 'shared';
  } catch (error) {
    if (destination)
      try {
        await FileSystem.StorageAccessFramework.deleteAsync(destination, { idempotent: true });
      } catch {
        /* Original failure remains visible. */
      }
    throw error;
  } finally {
    await FileSystem.deleteAsync(file.uri, { idempotent: true });
  }
}
