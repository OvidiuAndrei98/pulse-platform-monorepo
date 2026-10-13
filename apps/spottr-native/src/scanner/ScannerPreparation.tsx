import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Camera, Check, CheckCheck, Database, RefreshCw, ShieldCheck } from 'lucide-react-native';
import { usePreferences } from '../PreferencesProvider';
import { Text } from '../ui/Text';
import { Action, dColors as colors } from '../dashboard/common';
import { ApiError } from '../data/http';
import { isConnectivityError } from './data';
import { PreparationError, type PrepareScanner, type PreparationProgress, type PreparationStep } from './preparation';

export function ScannerPreparation({ prepare, camera, disabled, verified }: { prepare: PrepareScanner; camera(): Promise<boolean>; disabled: boolean; verified: boolean }) {
  const { language } = usePreferences(), ro = language === 'ro';
  const [steps, setSteps] = useState<Partial<Record<PreparationStep, PreparationProgress['status']>>>({});
  const [running, setRunning] = useState(false), [failure, setFailure] = useState(''), [done, setDone] = useState<{ tickets: number; conflicts: number }>();
  const lock = useRef(false), live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { if (!verified) setDone(undefined); }, [verified]);
  const run = async () => {
    if (lock.current) return;
    lock.current = true; setRunning(true); setFailure(''); setDone(undefined); setSteps({});
    try {
      const value = await prepare(camera, value => { if (live.current) setSteps(previous => ({ ...previous, [value.step]: value.status })); });
      if (live.current) setDone(value);
    } catch (error) {
      if (!live.current || error instanceof PreparationError && error.code === 'cancelled') return;
      const code = error instanceof PreparationError ? error.code : '';
      const denied = code === 'access' || error instanceof ApiError && (error.status === 401 || error.status === 403);
      const message = code === 'camera' ? (ro ? 'Permite accesul la cameră din setările telefonului, apoi încearcă din nou.' : 'Allow camera access in your device settings, then try again.')
        : code === 'offline' || isConnectivityError(error) ? (ro ? 'Ai nevoie de internet pentru a verifica accesul și a actualiza pachetul. Datele deja salvate rămân disponibile.' : 'Connect to verify access and update the package. Previously saved data remains available.')
        : denied ? (ro ? 'Contul nu mai are acces la scanarea acestui eveniment. Contactează organizatorul.' : 'This account cannot scan this event. Contact the organizer.')
        : code === 'ended' ? (ro ? 'Evenimentul s-a încheiat. Scanările restante pot fi sincronizate în continuare.' : 'This event has ended. Pending scans can still be synchronized.')
        : code === 'storage' ? (ro ? 'Pachetul nu poate fi confirmat pe acest telefon. Verifică spațiul liber și data telefonului, apoi încearcă din nou.' : 'The package could not be verified on this device. Check free space and the device clock, then retry.')
        : (ro ? 'Pregătirea nu s-a terminat. Scanările salvate sunt păstrate. Încearcă din nou.' : 'Preparation did not finish. Saved scans are preserved. Please try again.');
      setFailure(message);
    } finally { lock.current = false; if (live.current) setRunning(false); }
  };
  const rows = [
    ['camera', Camera, ro ? 'Acces la cameră' : 'Camera permission'],
    ['access', ShieldCheck, ro ? 'Acces la eveniment' : 'Event access'],
    ['sync', RefreshCw, ro ? 'Sincronizarea scanărilor' : 'Synchronize scans'],
    ['package', Database, ro ? 'Pachet salvat pe telefon' : 'Package saved on device'],
  ] as const;
  return <View testID="scanner-preparation" style={{ gap: 12, marginTop: 16 }}>
    <Action testID="scanner-prepare" secondary icon={CheckCheck} title={running ? (ro ? 'Se pregătește…' : 'Preparing…') : (ro ? 'Pregătește scannerul' : 'Prepare scanner')} disabled={disabled || running} onPress={() => { void run(); }} style={{ height: 44, borderRadius: 22 }} />
    {Object.keys(steps).length > 0 && <View style={{ gap: 10, padding: 14, borderRadius: 16, backgroundColor: '#ffffff06' }}>
      {rows.map(([step, Icon, label]) => <View key={step} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {steps[step] === 'checking' && running ? <ActivityIndicator size="small" color={colors.accent} /> : steps[step] === 'done' ? <Check size={16} color="#63d89b" /> : <Icon size={16} color={colors.muted} />}
        <Text style={{ color: steps[step] ? colors.text : colors.muted, fontSize: 12, flexShrink: 1 }}>{label}</Text>
      </View>)}
      {done && <Text testID="scanner-prepared" accessibilityLiveRegion="polite" style={{ color: '#63d89b', fontSize: 13, lineHeight: 19, fontWeight: '600' }}>{ro ? `Scanner pregătit · ${done.tickets} bilete în pachet` : `Scanner ready · ${done.tickets} tickets in package`}</Text>}
      {done && done.conflicts > 0 && <Text style={{ color: '#fde68a', fontSize: 12 }}>{ro ? `${done.conflicts} scanări au conflicte. Verifică lista de mai jos.` : `${done.conflicts} scans have conflicts. Check the list below.`}</Text>}
      {failure ? <Text testID="scanner-preparation-error" accessibilityLiveRegion="assertive" style={{ color: '#fb8989', fontSize: 13, lineHeight: 19 }}>{failure}</Text> : null}
    </View>}
  </View>;
}
