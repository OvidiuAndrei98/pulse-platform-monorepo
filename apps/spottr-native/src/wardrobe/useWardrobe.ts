import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { accountApi, useAuth } from "../auth/AuthProvider";
import { operatorAccount } from '../../../pulse-app/src/features/wardrobe/flow';
import {
  WardrobeStore,
  type Request,
} from "../../../pulse-app/src/features/wardrobe/model";
export function useWardrobe(staff = false, interval = 5000) {
  const auth = useAuth(),
    focused = useIsFocused();
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (value) =>
      setForeground(value === "active"),
    );
    return () => sub.remove();
  }, []);
  const id = auth.user?.id,
    token = auth.controller.getToken();
  const store = useMemo(
    () =>
      new WardrobeStore(((path, options) =>
        accountApi(path, { ...options, token })) as Request, { personal: !operatorAccount(auth.user?.role), autoSelectFirst:false }),
    [id, token, auth.user?.role],
  );
  const state = useSyncExternalStore(
    store.subscribe,
    store.snapshot,
    store.snapshot,
  );
  useEffect(() => {
    store.start();
    return store.dispose;
  }, [store]);
  useEffect(() => {
    if (!id || !focused || !foreground) return;
    void store.refresh(staff);
    const timer = setInterval(() => void store.refresh(staff), interval);
    return () => clearInterval(timer);
  }, [id, focused, foreground, staff, store, interval]);
  return { store, state, user: auth.user, active: focused && foreground };
}
