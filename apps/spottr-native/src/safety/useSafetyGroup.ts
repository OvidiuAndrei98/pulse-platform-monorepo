import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { accountApi, useAuth } from '../auth/AuthProvider';
import { createSafetyApi } from './data';
import { SafetyController } from './controller';

const api = createSafetyApi(accountApi);
export function useSafetyGroup(eventId: string) {
  const auth = useAuth(), focused = useIsFocused(), token = auth.controller.getToken(), viewer = auth.user?.id;
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && (Platform.OS !== 'web' || document.visibilityState !== 'hidden'));
  const controller = useMemo(() => new SafetyController(eventId.toLowerCase(), viewer ?? '', token ?? '', api,
    () => !!viewer && !!token && auth.controller.getToken() === token && auth.controller.getSnapshot().user?.id === viewer), [eventId, viewer, token, auth.controller]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    const update = () => setForeground(AppState.currentState !== 'background' && AppState.currentState !== 'inactive' && (Platform.OS !== 'web' || document.visibilityState !== 'hidden'));
    const subscription = AppState.addEventListener('change', update);
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', update);
    return () => { subscription.remove(); if (Platform.OS === 'web') document.removeEventListener('visibilitychange', update); };
  }, []);
  const active = auth.ready && !!viewer && focused && foreground;
  useEffect(() => { controller.setActive(active); return () => controller.setActive(false); }, [controller, active]);
  useEffect(() => {
    if (!active || state.data?.group?.currentMemberStatus !== 'accepted') return;
    const timer = setInterval(() => { void controller.poll(); }, 8000);
    return () => clearInterval(timer);
  }, [active, state.data?.group?.currentMemberStatus, controller]);
  return { ...state, controller, active, user: auth.user, ready: auth.ready };
}
