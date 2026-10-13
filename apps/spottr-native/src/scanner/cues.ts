import { requireOptionalNativeModule } from 'expo';
import { createCuePlayer } from './cuePlayer';
import { cueSources } from './cueSources';
import type { ScannerCue } from './cueType';
export function createScannerCues() {
  if (!requireOptionalNativeModule('ExpoAudio')) return { available: false, play(_kind: ScannerCue) {}, stop() {}, dispose() {} };
  return createCuePlayer(require('expo-audio'), cueSources);
}
