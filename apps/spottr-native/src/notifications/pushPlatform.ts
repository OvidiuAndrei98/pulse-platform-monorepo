import Constants from 'expo-constants';
import { AppState, Linking, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { NotificationResponse } from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { API_URL } from '../config';
import { accountApi } from '../auth/AuthProvider';
import { parsePushRegistration, PushRegistry, type PushDevice } from './pushRegistry';

export const pushProjectID: string = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? '';
// An older installed binary may load updated JS before the next Xcode build.
// Keep its in-app notifications usable instead of crashing during module import.
const hasModule = !!requireOptionalNativeModule('ExpoPushTokenManager') && !!requireOptionalNativeModule('ExpoNotificationPermissionsModule');
const Notifications: typeof import('expo-notifications') | undefined = hasModule ? require('expo-notifications') : undefined;
export const pushSupported = !!Notifications && /^[a-f\d-]{36}$/i.test(pushProjectID) && Constants.executionEnvironment !== 'storeClient';
let storageKey: Promise<string> | undefined;
const key = () => storageKey ??= Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, API_URL).then(hash => 'spottr.push.' + hash.slice(0, 24));
export const pushRegistry = new PushRegistry({
  read: async () => parsePushRegistration(await SecureStore.getItemAsync(await key())),
  write: async value => value
    ? SecureStore.setItemAsync(await key(), JSON.stringify(value), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY })
    : SecureStore.deleteItemAsync(await key()),
  secret: () => [...Crypto.getRandomBytes(32)].map(byte => byte.toString(16).padStart(2, '0')).join(''),
  register: async (body, identity) => { await accountApi('/notifications/push', { method: 'PUT', body, token: identity.token }); },
  unregister: async body => { await accountApi('/notifications/push/unregister', { method: 'POST', body, token: null }); },
});

export type PushStatus = 'off' | 'on' | 'denied' | 'unavailable' | 'error' | 'busy';
export async function getPushDevice(prompt: boolean, token: string, report: (state: PushStatus) => void): Promise<PushDevice | null> {
  if (!pushSupported || !Notifications) { report('unavailable'); return null; }
  const config = await accountApi<{ enabled: boolean; projectId: string }>('/notifications/push', { token });
  if (!config.enabled || config.projectId !== pushProjectID) { report('unavailable'); return null; }
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('spottr', {
    name: 'SPOTTR', importance: Notifications.AndroidImportance.DEFAULT, lightColor: '#ff0044', sound: 'default',
  });
  let permission = await Notifications.getPermissionsAsync();
  if (prompt && permission.canAskAgain && !permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) {
    report(permission.canAskAgain ? 'off' : 'denied'); return null;
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    Notifications.getExpoPushTokenAsync({ projectId: pushProjectID }),
    new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Push registration timed out')), 25_000); }),
  ]).finally(() => clearTimeout(timeout));
  return { token: result.data, projectId: pushProjectID, platform: Platform.OS as 'ios' | 'android' };
}

export function listenPush(canShow: (data: unknown) => boolean, receive: (data: unknown) => void, tap: (data: unknown) => void) {
  if (!Notifications) return () => {};
  let active = true;
  Notifications.setNotificationHandler({ handleNotification: async notification => {
    const show = canShow(notification.request.content.data);
    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: false, shouldSetBadge: false };
  } });
  const received = Notifications.addNotificationReceivedListener(notification => receive(notification.request.content.data));
  const handle = (response: NotificationResponse | null) => {
    if (!active || !response || response.actionIdentifier !== Notifications!.DEFAULT_ACTION_IDENTIFIER) return;
    tap(response.notification.request.content.data);
    void Notifications!.clearLastNotificationResponseAsync().catch(() => {});
  };
  let receivedResponse = false;
  const response = Notifications.addNotificationResponseReceivedListener(value => { receivedResponse = true; handle(value); });
  void Notifications.getLastNotificationResponseAsync().then(value => { if (!receivedResponse) handle(value); }).catch(() => {});
  return () => { active = false; received.remove(); response.remove(); Notifications.setNotificationHandler(null); };
}
export const openPushSettings = () => Linking.openSettings();
export const clearPresentedPush = () => Notifications?.dismissAllNotificationsAsync().catch(() => {}) ?? Promise.resolve();
export const onPushForeground = (callback: () => void) => {
  const app = AppState.addEventListener('change', state => { if (state === 'active') callback(); });
  const token = Notifications?.addPushTokenListener(callback);
  return () => { app.remove(); token?.remove(); };
};
