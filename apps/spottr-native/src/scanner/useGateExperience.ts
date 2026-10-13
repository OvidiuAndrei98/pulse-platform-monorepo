import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { activateKeepAwakeAsync, deactivateKeepAwake, isAvailableAsync } from 'expo-keep-awake';
import { haptic } from '../ui/haptics';
import type { Admission } from './admission';
import { createScannerCues } from './cues';
import { scannerCue } from './cueType';
import { holdScannerAwake } from './keepAwake';

const key = 'spottr-native.scanner-feedback.v1';
let writes = Promise.resolve();
export function useGateExperience({ visible, active, result, error, busy }: { visible: boolean; active: boolean; result?: Admission; error: string; busy: boolean }) {
  const [settings, setSettings] = useState({ sound: true, vibration: true });
  const [awake, setAwake] = useState(false), [soundAvailable, setSoundAvailable] = useState(true);
  const cues = useRef<ReturnType<typeof createScannerCues> | null>(null), touched = useRef(false);
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const seen = useRef<{ result?: Admission; error: string }>({ result, error });
  useEffect(() => {
    const player = createScannerCues(); cues.current = player; setSoundAvailable(player.available);
    let live = true;
    void AsyncStorage.getItem(key).then(value => {
      if (!live || touched.current || !value) return;
      const saved = JSON.parse(value);
      if (typeof saved?.sound === 'boolean' && typeof saved?.vibration === 'boolean') setSettings(saved);
    }).catch(() => {});
    return () => { live = false; player.dispose(); cues.current = null; };
  }, []);
  useEffect(() => {
    setAwake(false);
    if (!visible || !active) return;
    return holdScannerAwake({
      activate: async tag => { if (!await isAvailableAsync()) throw Error('WAKE_LOCK_UNAVAILABLE'); await activateKeepAwakeAsync(tag); },
      deactivate: deactivateKeepAwake,
    }, setAwake);
  }, [visible, active]);
  useEffect(() => { if (!active) cues.current?.stop(); }, [active]);
  useEffect(() => {
    if (!result && !error) { seen.current = { result, error }; return; }
    if (busy) return;
    if (seen.current.result === result && seen.current.error === error) return;
    seen.current = { result, error };
    if (!active) return;
    const kind = scannerCue(result, error);
    if (!kind) return;
    if (settingsRef.current.sound) cues.current?.play(kind);
    if (settingsRef.current.vibration) haptic(kind === 'success' ? 'success' : kind === 'duplicate' ? 'warning' : 'error');
  }, [result, error, active, busy]);
  const toggle = (name: keyof typeof settings) => {
    touched.current = true;
    const next = { ...settingsRef.current, [name]: !settingsRef.current[name] };
    settingsRef.current = next; setSettings(next);
    if (name === 'sound' && !next.sound) cues.current?.stop();
    writes = writes.catch(() => {}).then(() => AsyncStorage.setItem(key, JSON.stringify(next))).catch(() => {});
  };
  return { settings, toggle, awake, soundAvailable };
}
