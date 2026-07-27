"use client";

import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { User } from "@/core/DataProvider";
import { useTranslation } from "react-i18next";

export function PasswordResetRequest({ email }: { email?: string }) {
  const { t } = useTranslation();
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
      setError(cause instanceof Error ? cause.message : t("profile.resetFailed"));
      setState("idle");
    }
  };

  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
          {t("profile.resetHint", { email: email || t("profile.yourAccount") })}
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
        {state === "loading" ? t("profile.sending") : state === "sent" ? t("profile.linkSent") : t("profile.resetPassword")}
      </button>
    </div>
  );
}
