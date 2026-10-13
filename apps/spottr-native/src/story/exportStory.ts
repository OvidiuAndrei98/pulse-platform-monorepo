import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { randomUUID } from 'expo-crypto';

export async function prepareStoryImage(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1080 } }], { base64: true, format: ImageManipulator.SaveFormat.JPEG, compress: 0.9 });
  try {
    if (!result.base64) throw new Error('Missing image');
    return 'data:image/jpeg;base64,' + result.base64;
  } finally { await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {}); }
}
export async function exportStory(base64: string, active: () => boolean) {
  if (!FileSystem.cacheDirectory || !await Sharing.isAvailableAsync()) throw new Error('Sharing unavailable');
  const uri = FileSystem.cacheDirectory + 'spottr-story-' + randomUUID() + '.png';
  try {
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    if (active()) await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'SPOTTR' });
  } finally { await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}); }
}
