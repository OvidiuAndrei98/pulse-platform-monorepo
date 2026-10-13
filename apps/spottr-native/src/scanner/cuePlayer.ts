import type { ScannerCue } from './cueType';
type Player = { volume: number; pause(): void; seekTo(seconds: number): Promise<void>; play(): void | Promise<void>; remove(): void };
export function createCuePlayer(audio: { setAudioModeAsync(options: object): Promise<void>; createAudioPlayer(source: number, options: object): Player }, sources: Record<ScannerCue, number>) {
  const players = new Map<ScannerCue, Player>();
  let revision = 0, disposed = false, configured: Promise<void> | undefined;
  const stop = () => { revision++; for (const player of players.values()) { try { player.pause(); } catch {} } };
  return {
    available: true,
    play(kind: ScannerCue) {
      if (disposed) return;
      stop(); const version = revision;
      void (async () => {
        // Respect silent mode and mix quietly with other audio. No microphone,
        // background playback, media controls or persistent audio session.
        configured ??= audio.setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false });
        await configured;
        if (disposed || version !== revision) return;
        let player = players.get(kind);
        if (!player) { player = audio.createAudioPlayer(sources[kind], { keepAudioSessionActive: false }); player.volume = 0.65; players.set(kind, player); }
        await player.seekTo(0);
        if (!disposed && version === revision) await player.play();
      })().catch(() => { configured = undefined; });
    },
    stop,
    dispose() { disposed = true; stop(); for (const player of players.values()) { try { player.remove(); } catch {} } players.clear(); },
  };
}
