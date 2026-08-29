import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Share } from 'react-native';
import {
  createLocalBackup,
  parseLocalBackup,
  serializeLocalBackup,
  type LocalBackup,
} from '@/services/storage';
import type { StoreProfile } from '@/types/business';

export async function createAndShareLocalBackup(
  profile: StoreProfile,
  authenticated: boolean,
): Promise<{ backup: LocalBackup; fileUri: string }> {
  const backup = await createLocalBackup(profile, authenticated);
  const directory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!directory) {
    throw new Error('backupDirectoryUnavailable');
  }

  const timestamp = backup.createdAt.replace(/[:.]/g, '-');
  const fileUri = `${directory}store-manager-backup-${timestamp}.json`;
  await FileSystem.writeAsStringAsync(fileUri, serializeLocalBackup(backup), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await Share.share({ title: 'Store Manager backup', message: fileUri, url: fileUri });
  return { backup, fileUri };
}

export async function pickLocalBackupFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (result.canceled) {
    return null;
  }

  const uri = result.assets[0]?.uri;
  if (!uri) {
    throw new Error('backupFileInvalid');
  }
  const contents = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  parseLocalBackup(contents);
  return contents;
}