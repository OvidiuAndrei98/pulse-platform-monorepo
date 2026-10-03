import { Preferences } from "@capacitor/preferences";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { isNativePlatform } from "@/lib/native/platform";

const accessTokenKey = "glow_access_token";
const offlineSessionKey = "glow_offline_session";

let accessToken: string | null = null;
let tokenVersion = 0;
let writes: Promise<unknown> = Promise.resolve();

function persist(write: () => Promise<void> | void): Promise<void> {
  const next = writes.then(write);
  writes = next.catch(() => undefined);
  return next;
}

export function getAccessTokenSync() {
  return accessToken;
}

export async function hydrateAccessToken() {
  const version = tokenVersion;
  await writes;
  const stored = isNativePlatform()
    ? await SecureStorage.getItem(accessTokenKey)
    : window.localStorage.getItem("pulse_token");
  if (version === tokenVersion) accessToken = stored;
  return accessToken;
}

export async function saveAccessToken(value: string) {
  tokenVersion++;
  accessToken = value;
  return persist(async () => {
    if (isNativePlatform()) {
      await SecureStorage.setItem(accessTokenKey, value);
      return;
    }
    window.localStorage.setItem("pulse_token", value);
  });
}

export async function clearAccessToken() {
  tokenVersion++;
  accessToken = null;
  return persist(async () => {
    if (isNativePlatform()) {
      await SecureStorage.removeItem(accessTokenKey);
      return;
    }
    window.localStorage.removeItem("pulse_token");
  });
}

export async function readOfflineSession<T>() {
  await writes;
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
  return persist(async () => {
    if (isNativePlatform()) {
      await Preferences.set({ key: offlineSessionKey, value: serialized });
      return;
    }
    window.localStorage.setItem("pulse_offline_session", serialized);
  });
}

export async function clearOfflineSession() {
  return persist(async () => {
    if (isNativePlatform()) {
      await Preferences.remove({ key: offlineSessionKey });
      return;
    }
    window.localStorage.removeItem("pulse_offline_session");
  });
}
