"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Check,
  CircleCheck,
  LockKeyhole,
  Mail,
  UserRound,
  X,
} from "lucide-react";
import { useDataProvider } from "@/core/DataProviderContext";
import { useTranslation } from "react-i18next";

type RegistrationState = "idle" | "loading" | "success" | "error";

export default function RegisterPage() {
  const { t } = useTranslation();
  const { register, loading } = useDataProvider();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [state, setState] = useState<RegistrationState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState("loading");
    setErrorMessage("");

    try {
      await register(username, email, password, isOrganizer);
      setState("success");
    } catch (error) {
      setState("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t("auth.registrationFailed"),
      );
    }
  };

  if (state === "success") {
    return (
      <AuthScene backLabel={t("common.back")}>
        <span className="grid h-14 w-14 place-items-center rounded-full bg-white text-primary shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
          <CircleCheck className="h-7 w-7" />
        </span>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white">{t("auth.activationTitle")}</h1>
        <p className="mt-3 text-sm leading-6 text-white/75">
          {t("auth.activationText", { email })}
        </p>
        <Link
          href="/login"
          className="mt-7 inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:bg-primary/90"
        >
          {t("auth.goToLogin")} <ArrowRight className="h-4 w-4" />
        </Link>
      </AuthScene>
    );
  }

  return (
    <AuthScene backLabel={t("common.back")}>
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-black shadow-[0_12px_32px_rgba(0,0,0,0.22)]">
          <UserRound className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {t("auth.newAccount")}
          </p>
          <h1 className="mt-0.5 text-3xl font-semibold tracking-tight text-white">{t("auth.createProfile")}</h1>
        </div>
      </div>

      <p className="mt-5 text-sm leading-6 text-white/75">
        {t("auth.registerHint")}
      </p>

      <form onSubmit={handleSubmit} className="mt-9">
        <div className="space-y-5">
          <Field label={t("auth.username")} icon={UserRound}>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              minLength={3}
              maxLength={50}
              value={username}
              onChange={(inputEvent) => setUsername(inputEvent.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent text-base font-medium text-white outline-none placeholder:text-white/45"
              placeholder={t("auth.usernamePlaceholder")}
            />
          </Field>

          <Field label={t("auth.email")} icon={Mail}>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(inputEvent) => setEmail(inputEvent.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent text-base font-medium text-white outline-none placeholder:text-white/45"
              placeholder={t("auth.emailPlaceholder")}
            />
          </Field>

          <Field label={t("auth.password")} icon={LockKeyhole}>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(inputEvent) => setPassword(inputEvent.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent text-base font-medium text-white outline-none placeholder:text-white/45"
              placeholder={t("auth.minCharacters")}
            />
          </Field>

          <label className={`flex cursor-pointer items-start gap-3 rounded-2xl p-4 backdrop-blur-md transition ${isOrganizer ? "bg-primary/20 ring-1 ring-primary/60" : "bg-black/35 ring-1 ring-white/15 hover:bg-black/50"}`}>
            <input
              type="checkbox"
              checked={isOrganizer}
              onChange={(inputEvent) => setIsOrganizer(inputEvent.target.checked)}
              className="peer sr-only"
            />
            <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md transition ${isOrganizer ? "bg-primary text-primary-foreground" : "bg-white/15 text-transparent"}`}>
              <Check className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                <Building2 className="h-4 w-4 text-primary" /> {t("auth.organizerAccount")}
              </span>
              <span className="mt-1 block text-xs leading-5 text-white/65">
                {t("auth.organizerHint")}
              </span>
            </span>
          </label>
        </div>

        {state === "error" && (
          <p className="mt-5 rounded-2xl bg-red-500/20 px-4 py-3 text-sm text-red-100 backdrop-blur-md">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={state === "loading" || loading}
          className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === "loading" ? t("auth.creatingAccount") : t("auth.createAccount")}
          {state !== "loading" && <ArrowRight className="h-4 w-4" />}
        </button>
        <p className="mt-4 text-center text-[11px] leading-5 text-white/60">{t("auth.termsPrefix")} <Link href="/legal/terms" className="text-primary hover:underline">{t("auth.terms")}</Link> {t("auth.and")} <Link href="/legal/privacy" className="text-primary hover:underline">{t("auth.privacy")}</Link>.</p>
      </form>

      <p className="mt-7 text-center text-sm text-white/70">
        {t("auth.haveAccount")}{" "}
        <Link href="/login" className="font-semibold text-primary transition hover:text-primary/80">
          {t("auth.signIn")}
        </Link>
      </p>
    </AuthScene>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: typeof UserRound;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/65">{label}</span>
      <span className="flex h-16 items-center gap-3 rounded-2xl bg-black/40 px-5 text-white/70 ring-1 ring-white/20 backdrop-blur-md transition focus-within:bg-primary/10 focus-within:text-primary focus-within:ring-2 focus-within:ring-primary focus-within:shadow-lg focus-within:shadow-primary/25">
        <Icon className="h-4 w-4 shrink-0" />
        {children}
      </span>
    </label>
  );
}

function AuthScene({
  children,
  backLabel,
}: {
  children: React.ReactNode;
  backLabel: string;
}) {
  return (
    <main className="relative min-h-dvh overflow-y-auto bg-black text-white">
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[max(2rem,calc(var(--native-safe-bottom)+1.5rem))] pt-[max(1.5rem,calc(var(--native-safe-top)+1rem))] sm:px-7 md:mx-0 md:w-1/2 md:max-w-none md:px-16 md:py-10 lg:px-24">
        <Link
          href="/"
          aria-label={backLabel}
          className="grid h-12 w-12 place-items-center rounded-full bg-black/35 text-white backdrop-blur-md transition hover:bg-black/55"
        >
          <X className="h-6 w-6" />
        </Link>
        <div className="my-auto w-full py-8">{children}</div>
      </div>
    </main>
  );
}
