"use client";

import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { ArrowLeft, Check, Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { User } from "@/core/DataProvider";
import {ActionButton as UIActionButton} from '@/components/ui/ActionButton';
import {Input as UIInput} from '@/components/ui/Field';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState("sending");
    setError("");
    try {
      await User.requestPasswordReset(email.trim());
      setState("sent");
    } catch {
      setState("idle");
      setError(t("auth.resetRequestFailed"));
    }
  };

  return (
    <main className="min-h-dvh bg-black px-5 pb-10 pt-[max(1.5rem,calc(var(--native-safe-top)+1rem))] text-white sm:px-7">
      <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-md flex-col">
        <BackLink href="/login" className="inline-flex h-12 w-fit items-center gap-2 rounded-full bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" /> {t("auth.backToLogin")}
        </BackLink>

        <section className="my-auto w-full py-10">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/30">
            <Mail className="h-6 w-6" />
          </span>
          <p className="mt-7 text-xs font-bold uppercase tracking-[0.16em] text-primary">{t("auth.account")}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t("auth.forgotPasswordTitle")}</h1>
          <p className="mt-3 text-sm leading-6 text-white/65">{t("auth.forgotPasswordHint")}</p>

          {state === "sent" ? (
            <div className="mt-8 rounded-2xl border border-primary/25 bg-primary/10 p-4 text-sm text-white/85">
              <div className="flex items-center gap-2 font-semibold text-primary"><Check className="h-4 w-4" /> {t("auth.resetLinkSent")}</div>
              <p className="mt-2 leading-6">{t("auth.resetLinkSentHint", { email })}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-8">
              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/65">{t("auth.email")}</span>
                <span className="ui-input-shell ui-input-shell--brand flex h-16 items-center gap-3 rounded-2xl bg-black/40 px-5 text-white/70 ring-1 ring-white/20 transition focus-within:bg-primary/10 focus-within:text-primary">
                  <Mail className="h-4 w-4 shrink-0" />
                  <UIInput
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(inputEvent) => setEmail(inputEvent.target.value)}
                    placeholder={t("auth.emailPlaceholder")}
                    className="h-full min-w-0 flex-1 bg-transparent text-base font-medium text-white  placeholder:text-white/45" bare
                  />
                </span>
              </label>
              {error && <p role="alert" className="mt-4 rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-100">{error}</p>}
              <UIActionButton type="submit" disabled={state === "sending"} className="mt-6 flex h-14 w-full items-center justify-center gap-2 px-4 text-sm font-semibold shadow-lg shadow-primary/25 transition disabled:opacity-50">
                {state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {state === "sending" ? t("auth.sendingResetLink") : t("auth.sendResetLink")}
              </UIActionButton>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
