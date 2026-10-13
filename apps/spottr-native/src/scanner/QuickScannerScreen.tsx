import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { usePreferences } from '../PreferencesProvider';
import { ApiError } from '../data/http';
import { Feedback, IconButton, Loading } from '../ui/common';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { AdmissionGate, type Admission, type ScanSource } from './admission';
import { isConnectivityError, type QuickSession } from './data';
import { scannerApi } from './runtime';
import { ScannerPanel, s } from './ScannerPanel';
import { watchScannerConnection } from './connection';

// Temporary scanner authorization stays in memory and never replaces account auth.
let cachedSession: QuickSession | undefined;
export function QuickScannerScreen({ route }: { route?: { params?: { token?: string } } }) {
  const { copy, language } = usePreferences(), insets = useSafeAreaInsets(), navigation = useNavigation<any>(), focused = useIsFocused();
  const [session, setSession] = useState<QuickSession>(), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<Admission>(), [retry, setRetry] = useState(0);
  const gate = useRef(new AdmissionGate()), revision = useRef(0), suppliedToken = route?.params?.token;
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => watchScannerConnection(setConnected), []);
  useEffect(() => {
    const version = ++revision.current; setLoading(true); setBusy(false); setError(''); setResult(undefined); setSession(undefined); gate.current = new AdmissionGate();
    void (async () => {
      try {
        const result = suppliedToken ? await scannerApi.quickSession(suppliedToken) : cachedSession;
        if (version !== revision.current) return;
        if (!result || Date.parse(result.expiresAt) <= Date.now()) { cachedSession = undefined; setError(copy('scanner.openActiveLink')); return; }
        cachedSession = result; setSession(result);
        // Remove raw access token from navigation state and web URL after exchange.
        if (suppliedToken) navigation.setParams({ token: undefined });
      } catch { if (version === revision.current) { cachedSession = undefined; setError(copy('scanner.invalidLink')); } }
      finally { if (version === revision.current) setLoading(false); }
    })();
    return () => { revision.current++; };
  }, [suppliedToken, retry]);
  useEffect(() => {
    if (!session) return;
    const check = () => { if (Date.parse(session.expiresAt) <= Date.now()) { cachedSession = undefined; setSession(undefined); setError(copy('scanner.sessionUnavailable')); } };
    const timer = setInterval(check, 1000); return () => clearInterval(timer);
  }, [session]);
  const submit = (hash: string, source: ScanSource = 'manual') => {
    if (!session || !focused) return;
    const version = revision.current;
    void gate.current.run(hash, async () => { setBusy(true); setError(''); setResult(undefined); try { return await scannerApi.quickValidate(session, hash); } finally { if (version === revision.current) setBusy(false); } }, source).then(value => { if (version === revision.current && value) setResult(value); }).catch(cause => {
      if (version !== revision.current) return;
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) { cachedSession = undefined; setSession(undefined); }
      setError(isConnectivityError(cause) ? (language === 'ro' ? 'Rezultat neconfirmat. Verifică din nou online înainte de acces.' : 'Unconfirmed result. Verify again online before admitting.') : copy(cause instanceof ApiError && (cause.status === 401 || cause.status === 403) ? 'scanner.sessionUnavailable' : 'validation.invalidTicket'));
    });
  };
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 28, width: '100%', maxWidth: 620, alignSelf: 'center', gap: 20 }}>
      <IconButton label={copy('common.back')} onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Tabs')}><ArrowLeft color="white" size={22} /></IconButton>
      {loading ? <Loading /> : session ? <>
        <View style={s.panel}><Text style={{ color: colors.accent, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5 }}>{session.label}</Text><Text style={[s.heading, { fontSize: 25 }]}>{session.eventTitle}</Text><Text style={s.muted}>{session.locationName}</Text></View>
        <ScannerPanel key={session.sessionToken} eventTitle={session.eventTitle} gateStatus={{ connection: connected === false ? 'offline' : connected ? 'online' : 'checking', quick: true }} active={focused} busy={busy} error={error} result={result} onScan={submit} />
      </> : <Feedback title={copy('scanner.sessionUnavailable')} detail={error || copy('scanner.openActiveLink')} retry={suppliedToken ? () => setRetry(value => value + 1) : undefined} />}
    </ScrollView>
  </View>;
}
