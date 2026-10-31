import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { usePreferences } from '../usePreferences';
import { Button } from '../ui/common';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';

const qrSettings = { barcodeTypes: ['qr' as const] };

export function QuickConnectCamera({ active, stopped, onScan }: { active: boolean; stopped: boolean; onScan: (value: string) => void }) {
  const { copy } = usePreferences();
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false), [permissionError, setPermissionError] = useState(false), [attempt, setAttempt] = useState(0);
  const mounted = useRef(true), pending = useRef(false), previousActive = useRef(active);
  const attemptedPermission = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const resumed = active && !previousActive.current;
    previousActive.current = active;
    // Pick up a permission change made in Settings while the app was inactive.
    if (resumed) void refreshPermission().catch(() => { if (mounted.current) setPermissionError(true); });
  }, [active, refreshPermission]);
  const request = useCallback(async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setPermissionError(false);
    try {
      if (permission?.canAskAgain === false) await Linking.openSettings();
      else await requestPermission();
    } catch { if (mounted.current) setPermissionError(true); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }, [permission?.canAskAgain, requestPermission]);
  useEffect(() => {
    if (!active || permission?.status !== 'undetermined' || !permission.canAskAgain || attemptedPermission.current) return;
    attemptedPermission.current = true;
    void request();
  }, [active, permission?.status, permission?.canAskAgain, request]);
  if (active && permission?.granted) return <CameraPreview key={attempt} stopped={stopped} onScan={onScan} onRetry={() => setAttempt(value => value + 1)}/>;
  const waiting = !permission || busy || permission.status === 'undetermined' && permission.canAskAgain && !attemptedPermission.current;
  return <View testID="quick-connect-camera-permission" style={s.hint}>
    {waiting && <ActivityIndicator color={colors.accent} accessibilityLabel={copy('qr.startingCamera')}/>}
    <Text style={s.text}>{copy(waiting ? 'qr.startingCamera' : permissionError || permission?.status === 'denied' ? 'qr.cameraFailed' : 'qr.profileCameraHint')}</Text>
    {!waiting && active && permission && <Button title={copy(permission.canAskAgain ? 'qr.allowCamera' : 'qr.openCameraSettings')}
      onPress={() => void request()}/>}
  </View>;
}

function CameraPreview({ stopped, onScan, onRetry }: { stopped: boolean; onScan: (value: string) => void; onRetry: () => void }) {
  const { copy, t } = usePreferences();
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  const live = useRef(true), cameraReady = useRef(false), cameraFailed = useRef(false), latest = useRef({ stopped, onScan });
  latest.current = { stopped, onScan };
  const cover = useSharedValue(1), coverStyle = useAnimatedStyle(() => ({ opacity: cover.value }));
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; cameraReady.current = false; };
  }, []);
  return <View testID="quick-connect-camera-stage" style={s.stage}>
    {!failed && <CameraView testID="quick-connect-camera" style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={qrSettings}
      onCameraReady={() => {
        if (!live.current || cameraFailed.current) return;
        cameraReady.current = true; setReady(true);
        cover.value = withTiming(0, { duration: 180, reduceMotion: ReduceMotion.System });
      }}
      onBarcodeScanned={result => {
        if (live.current && cameraReady.current && !latest.current.stopped) latest.current.onScan(result.data);
      }}
      onMountError={() => { if (live.current) { cameraFailed.current = true; cameraReady.current = false; setFailed(true); } }}/>}
    {!failed && <Animated.View testID="quick-connect-camera-loading" pointerEvents="none" style={[s.cover, coverStyle]}
      aria-hidden={ready} accessibilityElementsHidden={ready} importantForAccessibility={ready ? 'no-hide-descendants' : 'auto'}>
      <ActivityIndicator animating={!ready} color={colors.accent} accessibilityLabel={copy('qr.startingCamera')}/>
      <Text style={s.text}>{copy('qr.startingCamera')}</Text>
    </Animated.View>}
    {failed && <View testID="quick-connect-camera-error" style={s.hint}>
      <Text accessibilityLiveRegion="polite" style={s.text}>{copy('qr.cameraFailed')}</Text>
      <Button title={t('retry')} onPress={onRetry}/>
    </View>}
  </View>;
}
const s = StyleSheet.create({
  stage: { flex: 1, backgroundColor: '#111' },
  hint: { flex: 1, padding: 20, justifyContent: 'center', gap: 20 },
  text: { color: colors.muted, textAlign: 'center' },
  cover: { ...StyleSheet.absoluteFill, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', gap: 16 },
});
