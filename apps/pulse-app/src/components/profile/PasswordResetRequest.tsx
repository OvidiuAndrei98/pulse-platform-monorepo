"use client";

import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { User } from "@/core/DataProvider";

export function PasswordResetRequest({ email }: { email?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "sent">("idle");
  const [error, setError] = useState<string>();

  const send = async () => {
    if (!email) return;
    setState("loading");
    setError(undefined);
    try {
      await User.requestPasswordReset(email);
      setState("sent");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Linkul nu a putut fi trimis.");
      setState("idle");
    }
  };

  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
          Iti trimitem un link securizat de resetare direct pe adresa <strong className="text-foreground">{email || "contului tau"}</strong>.
        </p>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>
      <button
        type="button"
        onClick={() => void send()}
        disabled={!email || state === "loading" || state === "sent"}
        className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-xs font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-60 sm:w-auto"
      >
        {state === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
        {state === "sent" && <Check className="h-4 w-4" />}
        {state === "loading" ? "Se trimite..." : state === "sent" ? "Link trimis" : "Reseteaza parola"}
      </button>
    </div>
  );
}
