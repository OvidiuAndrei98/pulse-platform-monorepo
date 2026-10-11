import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { randomUUID } from 'expo-crypto';
import Svg, { Path } from 'react-native-svg';
import { usePreferences } from '../PreferencesProvider';
import { useAuth } from './AuthProvider';
import { REMOTE_API_URL } from '../config.shared';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { googleLoginUrl, GOOGLE_RETURN, readGoogleToken } from './google';
WebBrowser.maybeCompleteAuthSession();
export function GoogleButton({ organizer = false, company, cui, disabled = false, onError }: { organizer?: boolean; company?: string; cui?: string; disabled?: boolean; onError: (value: string) => void }) {
  const { copy } = usePreferences(), { controller } = useAuth(), [busy, setBusy] = useState(false), lock = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; controller.cancelPendingLogin(); if (lock.current) { try { WebBrowser.dismissAuthSession(); } catch {} } }, [controller]);
  const start = async () => {
    if (lock.current || disabled) return;
    if (organizer && (!company?.trim() || !cui?.trim())) { onError(copy('auth.organizerDetailsRequired')); return; }
    lock.current = true; setBusy(true); onError('');
    const revision = generation.current;
    try {
      const previewOrigin = Platform.OS === 'web' ? window.location.origin : undefined;
      if (previewOrigin && !['http://localhost:8081', 'http://127.0.0.1:8081'].includes(previewOrigin)) throw new Error('UNSUPPORTED_PREVIEW_ORIGIN');
      const callback = previewOrigin ? previewOrigin + '/auth/google/callback' : GOOGLE_RETURN;
      const nonce = randomUUID(), url = googleLoginUrl(REMOTE_API_URL, nonce, organizer ? 'organizer' : 'user', company, cui, previewOrigin);
      const result = await WebBrowser.openAuthSessionAsync(url, callback);
      if (revision === generation.current && result.type === 'success') await controller.acceptOAuthToken(readGoogleToken(result.url, nonce, callback));
    } catch { if (revision === generation.current) onError(copy('auth.googleSessionFailed')); }
    finally { lock.current = false; if (revision === generation.current) setBusy(false); }
  };
  return <Pressable testID="google-login" accessibilityRole="button" disabled={disabled || busy} onPress={() => void start()} style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 12, backgroundColor: 'white', opacity: disabled || busy ? .45 : 1 }}>
    {busy ? <ActivityIndicator color={colors.accent} /> : <Svg width={20} height={20} viewBox="0 0 48 48"><Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></Svg>}
    <Text style={{ color: 'black', fontSize: 14, fontWeight: '600' }}>{copy('common.continueWithGoogle')}</Text>
  </Pressable>;
}
