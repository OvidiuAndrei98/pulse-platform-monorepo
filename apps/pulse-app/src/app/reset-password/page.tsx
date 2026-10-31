"use client";

import Link from "next/link";
import { Check, KeyRound, Loader2 } from "lucide-react";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { User } from "@/core/DataProvider";
import { useTranslation } from "react-i18next";
import {ActionButton as UIActionButton} from '@/components/ui/ActionButton';
import {Input as UIInput} from '@/components/ui/Field';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-background" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string>();

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      setError(t("auth.invalidReset"));
      return;
    }
    if (password.length < 8) {
      setError(t("auth.shortPassword"));
      return;
    }
    if (password !== confirmation) {
      setError(t("auth.passwordsMismatch"));
      return;
    }

    setState("saving");
    setError(undefined);
    try {
      await User.resetPassword(token, password);
      setState("saved");
      window.setTimeout(() => router.replace("/login"), 1300);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("auth.passwordResetFailed"));
      setState("idle");
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-32 pt-16 text-foreground sm:pt-24">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary"><KeyRound className="h-5 w-5" /></span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{t("auth.security")}</p>
          <h1 className="mt-0.5 text-2xl font-semibold">{t("auth.choosePassword")}</h1>
        </div>
      </div>
      <p className="mt-5 text-sm leading-6 text-muted-foreground">{t("auth.resetHint")}</p>

      <form onSubmit={submit} className="mt-8 border border-white/15 bg-[#101311]/90 p-5 shadow-xl sm:p-6">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">{t("auth.newPassword")}</span>
            <UIInput type="password" autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required className="h-12 w-full transition" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">{t("auth.confirmPassword")}</span>
            <UIInput type="password" autoComplete="new-password" minLength={8} maxLength={72} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required className="h-12 w-full transition" />
          </label>
        </div>
        {error && <p className="mt-4 border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">{error}</p>}
        <UIActionButton type="submit" disabled={state !== "idle"} className="mt-5 flex h-12 w-full items-center justify-center gap-2 px-4 text-sm font-semibold transition hover:brightness-110 disabled:opacity-50">
          {state === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}
          {state === "saved" && <Check className="h-4 w-4" />}
          {state === "saving" ? t("auth.saving") : state === "saved" ? t("auth.passwordUpdated") : t("auth.updatePassword")}
        </UIActionButton>
      </form>
      <Link href="/login" className="mt-5 text-center text-sm font-semibold text-primary">{t("auth.backToLogin")}</Link>
    </main>
  );
}
