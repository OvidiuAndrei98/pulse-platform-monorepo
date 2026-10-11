import React, {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import { API_URL } from "../config";
import { createHttp, bindSession } from "../data/http";
import { queryClient } from "../data/queries";
import { SessionController } from "./session";
import { sessionStorage } from "./storage";
import { clearNativePayments } from "../checkout/nativePayment";

export const accountApi = createHttp(API_URL);
export const sessionController = new SessionController(
  sessionStorage,
  {
    login: (email, password) =>
      accountApi("/auth/login", {
        method: "POST",
        body: { email, password },
        token: null,
      }),
    me: (token) => accountApi("/users/me", { token, expireSession: false }),
    update: (token, body) =>
      accountApi("/users/me", { method: "PUT", token, body }),
  },
  () => {
    clearNativePayments();
    void queryClient.cancelQueries();
    queryClient.clear();
  },
);
bindSession({
  token: sessionController.getToken,
  expire: sessionController.expire,
});
const Context = createContext<SessionController | null>(null);
export function AuthProvider({ children }: React.PropsWithChildren) {
  useEffect(() => {
    void sessionController.hydrate();
  }, []);
  return (
    <Context.Provider value={sessionController}>{children}</Context.Provider>
  );
}
export function useAuth() {
  const controller = useContext(Context);
  if (!controller) throw new Error("Missing AuthProvider");
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { ...state, controller };
}
