import type { SessionStorage } from "./session";
const key = "spottr-native.session.v1";
export const sessionStorage: SessionStorage = {
  read: async () => localStorage.getItem(key),
  write: async (value) => {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  },
};
