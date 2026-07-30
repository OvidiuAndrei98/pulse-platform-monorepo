"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { isNativePlatform } from "@/lib/native/platform";
import { routeForPlatform } from "@/lib/native/navigation";
import { saveAccessToken } from "@/lib/native/sessionStorage";

function roleFromToken(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    return (JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { role?: string }).role;
  } catch {
    return undefined;
  }
}

export function NativeAppBridge() {
  useEffect(() => {
    if (!isNativePlatform()) return;

    const listener = App.addListener("appUrlOpen", async ({ url }) => {
      const target = new URL(url);
      if (target.protocol === "glow:" && target.hostname === "auth" && target.pathname === "/google/callback") {
        const params = new URLSearchParams(target.hash.slice(1));
        const token = params.get("token");
        if (!token) return;

        await saveAccessToken(token);
        await Browser.close();
        const returnTo = params.get("returnTo") || "/users/me";
        window.location.replace(routeForPlatform(roleFromToken(token) === "organizer" ? "/dashboard" : returnTo));
        return;
      }

      if (target.protocol === "https:" && target.hostname === "pulse-app.code-lab.ro") {
        await Browser.close();
        window.location.assign(routeForPlatform(`${target.pathname}${target.search}${target.hash}`));
      }
    });

    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, []);

  return null;
}
