"use client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useDataProvider } from "@/core/DataProviderContext";
import { apiRoot } from "@/core/apiRoot";
import { apiFetch } from "@/lib/native/apiFetch";
import { WardrobeStore, type Request } from "./model";
import { operatorAccount } from './flow';

export function useWardrobe(staff = false, interval = 5000) {
  const { user, getToken } = useDataProvider();
  const id = user?.properties.id;
  const store = useMemo(() => {
    const request: Request = async (path, options = {}) => {
      const token = getToken();
      if (!token) throw new Error("UNAUTHORIZED");
      const timeout = AbortSignal.timeout(15000);
      const response = await apiFetch(apiRoot.replace(/\/$/, "") + path, {
        method: options.method ?? "GET",
        body: options.body ? JSON.stringify(options.body) : undefined,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        signal: options.signal
          ? AbortSignal.any([options.signal, timeout])
          : timeout,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        // Keep HTTP auth status even for localized/non-JSON error responses.
        throw Object.assign(new Error(
          typeof result?.error === "string" ? result.error : "WARDROBE_UNAVAILABLE",
        ), { status: response.status });
      }
      return response.json();
    };
    return new WardrobeStore(request,{personal:!operatorAccount(user?.properties.role),autoSelectFirst:false});
  }, [id, getToken, user?.properties.role]);
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
    if (!id) return;
    const refresh = () => {
      if (document.visibilityState !== "hidden") void store.refresh(staff);
    };
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") void store.refresh(staff, { background: true });
    }, interval);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [id, store, staff, interval]);
  // Session-specific instances cannot publish into the next account's state.
  return { store, state, user };
}
