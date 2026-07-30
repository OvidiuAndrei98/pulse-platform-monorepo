"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { saveAccessToken } from "@/lib/native/sessionStorage";
import { useDataProvider } from "@/core/DataProviderContext";

export default function GoogleAuthCallbackPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { reloadSession } = useDataProvider();
  const [error, setError] = useState("");
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const complete = async () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const token = params.get("token");
      const returnTo = params.get("returnTo");
      const safeReturnTo = returnTo?.startsWith("/") && !returnTo.startsWith("//")
        ? returnTo
        : "/users/me";

      if (!token) {
        setError(t("auth.googleSessionFailed"));
        return;
      }

      await saveAccessToken(token);
      await reloadSession();
      router.replace(
        getUserRoleFromToken(token) === "organizer" ? "/dashboard" : safeReturnTo,
      );
    };

    void complete();
  }, [reloadSession, router, t]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 text-foreground">
      <div className="w-full max-w-sm border border-white/15 bg-[#101311]/90 p-6 text-center shadow-xl">
        {error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : (
          <>
            <LoaderCircle className="mx-auto h-6 w-6 animate-spin text-primary" />
            <p className="mt-3 text-sm font-semibold">{t("auth.connectingGoogle")}</p>
          </>
        )}
      </div>
    </main>
  );
}

function getUserRoleFromToken(token: string): string | undefined {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return (JSON.parse(decoded) as { role?: string }).role;
  } catch {
    return undefined;
  }
}
