import { Asset } from 'expo-asset';
import { createCuePlayer } from './cuePlayer';
import { cueSources } from './cueSources';
// Catch browser autoplay rejections too: feedback must never break admission.
export const createScannerCues = () => createCuePlayer({
  setAudioModeAsync: async () => {},
  createAudioPlayer(source) {
    const media = new Audio(Asset.fromModule(source).uri);
    media.preload = 'auto';
    return {
      get volume() { return media.volume; }, set volume(value: number) { media.volume = value; },
      pause: () => media.pause(),
      seekTo: async (seconds: number) => { media.currentTime = seconds; },
      play: () => media.play(),
      remove: () => { media.pause(); media.removeAttribute('src'); media.load(); },
    };
  },
}, cueSources);
