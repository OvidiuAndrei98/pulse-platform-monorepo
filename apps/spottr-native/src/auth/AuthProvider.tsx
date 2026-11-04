import React, {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import { API_URL } from "../config";
import { createHttp, bindSession } from "../data/http";
import { queryClient } from "../data/queries";
import { clearAccountQueries } from '../data/sessionQueries';
import { SessionController, type AccountState, type SessionState } from "./session";
import { sessionStorage } from "./storage";
import { clearNativePayments } from "../checkout/nativePayment";
import { purchaseCompletion } from "../checkout/purchaseCompletion";
import { ticketCache } from "../data/ticketStorage";

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
    const previousAccount = sessionController.getSnapshot().user?.id;
    if (previousAccount) void ticketCache.remove(previousAccount).catch(() => {});
    clearNativePayments();
    purchaseCompletion.clear();
    clearAccountQueries(queryClient);
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
export function useAuth(): SessionState & { controller: SessionController };
export function useAuth(scope: 'account'): AccountState & { controller: SessionController };
export function useAuth(scope?: 'account') {
  const controller = useContext(Context);
  if (!controller) throw new Error("Missing AuthProvider");
  const state = useSyncExternalStore(
    controller.subscribe,
    scope === 'account' ? controller.getAccountSnapshot : controller.getSnapshot,
    scope === 'account' ? controller.getAccountSnapshot : controller.getSnapshot,
  );
  return { ...state, controller };
}
