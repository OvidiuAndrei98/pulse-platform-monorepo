import * as SecureStore from "expo-secure-store";
import type { SessionStorage } from "./session";
const key = "spottr-native.session.v1";
export const sessionStorage: SessionStorage = {
  read: () => SecureStore.getItemAsync(key),
  write: (value) =>
    value === null
      ? SecureStore.deleteItemAsync(key)
      : SecureStore.setItemAsync(key, value, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        }),
};
