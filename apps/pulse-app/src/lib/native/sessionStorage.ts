import { Preferences } from "@capacitor/preferences";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { isNativePlatform } from "@/lib/native/platform";

const accessTokenKey = "glow_access_token";
const offlineSessionKey = "glow_offline_session";

let accessToken: string | null = null;

export function getAccessTokenSync() {
  return accessToken;
}

export async function hydrateAccessToken() {
  if (isNativePlatform()) {
    accessToken = await SecureStorage.getItem(accessTokenKey);
    return accessToken;
  }

  accessToken = window.localStorage.getItem("pulse_token");
  return accessToken;
}

export async function saveAccessToken(value: string) {
  accessToken = value;
  if (isNativePlatform()) {
    await SecureStorage.setItem(accessTokenKey, value);
    return;
  }
  window.localStorage.setItem("pulse_token", value);
}

export async function clearAccessToken() {
  accessToken = null;
  if (isNativePlatform()) {
    await SecureStorage.removeItem(accessTokenKey);
    return;
  }
  window.localStorage.removeItem("pulse_token");
}

export async function readOfflineSession<T>() {
  const value = isNativePlatform()
    ? (await Preferences.get({ key: offlineSessionKey })).value
    : window.localStorage.getItem("pulse_offline_session");
  if (!value) return undefined;

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

export async function saveOfflineSession(value: unknown) {
  const serialized = JSON.stringify(value);
  if (isNativePlatform()) {
    await Preferences.set({ key: offlineSessionKey, value: serialized });
    return;
  }
  window.localStorage.setItem("pulse_offline_session", serialized);
}

export async function clearOfflineSession() {
  if (isNativePlatform()) {
    await Preferences.remove({ key: offlineSessionKey });
    return;
  }
  window.localStorage.removeItem("pulse_offline_session");
}
