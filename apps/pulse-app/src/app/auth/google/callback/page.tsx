"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useDataProvider } from "@/core/DataProviderContext";

export default function GoogleAuthCallbackPage() {
  const router = useRouter();
  const { reloadSession } = useDataProvider();
  const [error, setError] = useState("");

  useEffect(() => {
    const complete = async () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const token = params.get("token");
      const returnTo = params.get("returnTo");
      const safeReturnTo = returnTo?.startsWith("/") && !returnTo.startsWith("//")
        ? returnTo
        : "/users/me";

      if (!token) {
        setError("Sesiunea Google nu a putut fi creată.");
        return;
      }

      localStorage.setItem("pulse_token", token);
      try {
        await reloadSession();
        router.replace(safeReturnTo);
      } catch {
        localStorage.removeItem("pulse_token");
        setError("Contul Google nu a putut fi încărcat.");
      }
    };

    void complete();
  }, [reloadSession, router]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 text-foreground">
      <div className="w-full max-w-sm border border-white/15 bg-[#101311]/90 p-6 text-center shadow-xl">
        {error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : (
          <>
            <LoaderCircle className="mx-auto h-6 w-6 animate-spin text-primary" />
            <p className="mt-3 text-sm font-semibold">Se conectează contul Google...</p>
          </>
        )}
      </div>
    </main>
  );
}
