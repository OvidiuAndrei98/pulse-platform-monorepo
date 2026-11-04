import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { AudioPlayer } from 'expo-audio';

const available = !!requireOptionalNativeModule('ExpoAudio');

export function useDateRibbonSound(enabled: boolean) {
  const playerRef = useRef<AudioPlayer | null>(null), live = useRef(enabled), ready = useRef(false), seeking = useRef(false);
  live.current = enabled;
  useEffect(() => {
    if (!available || !enabled) return;
    // Allocate audio only while the ribbon is open, never during tab/login load.
    let audio: typeof import('expo-audio'), player: AudioPlayer;
    try {
      audio = require('expo-audio');
      player = audio.createAudioPlayer(require('../../assets/audio/date-tick.wav'), { updateInterval: 1000, allowsExternalPlayback: false });
    } catch { return; }
    playerRef.current = player; player.volume = 0.35;
    // Ambient UI audio respects the mute switch and mixes with venue/music audio.
    void audio.setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false })
      .then(() => { if (playerRef.current === player) ready.current = true; }).catch(() => {});
    return () => { ready.current = false; seeking.current = false; playerRef.current = null; player.remove(); };
  }, [enabled]);
  return useCallback(() => {
    const player = playerRef.current;
    if (!player || !live.current || !ready.current || !player.isLoaded || AppState.currentState !== 'active' || seeking.current) return;
    const started = Date.now(); seeking.current = true;
    // One player, no backlog and no simultaneous ticks after a fast flick.
    void player.seekTo(0).then(() => {
      if (playerRef.current === player && live.current && AppState.currentState === 'active' && Date.now() - started < 80) player.play();
    }).catch(() => {}).finally(() => { if (playerRef.current === player) seeking.current = false; });
  }, []);
}
