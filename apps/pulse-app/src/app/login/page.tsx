"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, LockKeyhole, Mail, Moon, X } from "lucide-react";
import { useDataProvider } from "@/core/DataProviderContext";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { useTranslation } from "react-i18next";
import { ApiError } from "@packages/api-client/src/Client";

export default function LoginPage() {
  const { t } = useTranslation();
  const { login, loading, user } = useDataProvider();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [returnTo] = useState(() => {
    if (typeof window === "undefined") return "";
    const value = new URLSearchParams(window.location.search).get("returnTo") || "";
    return value.startsWith("/") && !value.startsWith("//") ? value : "";
  });

  useEffect(() => {
    if (!loading && user) {
      if (returnTo) {
        router.replace(returnTo);
      } else if (user.properties.role === "admin") {
        router.replace("/admin");
      } else if (user.properties.role === "organizer") {
        router.replace("/dashboard");
      } else {
        router.replace("/users/me");
      }
    }
  }, [loading, router, user]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError("");
    try {
      await login(email, password);
    } catch (cause) {
      const message =
        cause instanceof ApiError && cause.status === 401
          ? t("auth.invalidCredentials")
          : cause instanceof ApiError && cause.status === 403
            ? t("auth.accountInactive")
            : t("common.loginFailed");
      setLoginError(message);
    }
  };

  return (
    <main className="relative min-h-dvh overflow-hidden bg-black text-white">
      {!showEmailForm && (
        <>
          <Image
            src="/party-event.png"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center md:!left-auto md:!right-0 md:!w-1/2"
          />
          <div className="absolute inset-0 bg-black/45 md:left-auto md:right-0 md:w-1/2" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.2)_0%,rgba(0,0,0,0.08)_36%,rgba(0,0,0,0.88)_100%)] md:left-auto md:right-0 md:w-1/2" />
        </>
      )}
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[max(2rem,calc(var(--native-safe-bottom)+1.5rem))] pt-[max(1.5rem,calc(var(--native-safe-top)+1rem))] sm:px-7 md:mx-0 md:w-1/2 md:max-w-none md:px-16 md:py-10 lg:px-24">
        {showEmailForm ? (
          <button
            type="button"
            onClick={() => setShowEmailForm(false)}
            className="inline-flex h-12 w-fit items-center gap-2 rounded-full bg-black/35 px-4 text-sm font-medium text-white backdrop-blur-md transition hover:bg-black/55"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("common.back")}
          </button>
        ) : (
          <Link
            href="/"
            aria-label={t("common.back")}
            className="grid h-12 w-12 place-items-center rounded-full bg-black/35 text-white backdrop-blur-md transition hover:bg-black/55"
          >
            <X className="h-6 w-6" />
          </Link>
        )}

        <section className={`flex flex-1 flex-col items-center justify-center pb-10 text-center md:items-start md:text-left md:pb-0 ${showEmailForm ? "hidden" : ""}`}>
          <span className="mb-5 grid h-16 w-16 place-items-center rounded-full bg-white text-black shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
            <Moon className="h-9 w-9 fill-current" />
          </span>
          <p className="text-5xl font-semibold tracking-[-0.06em]">Glow</p>
          <p className="mt-3 text-lg font-medium text-white/90">{t("auth.tagline")}</p>
          <p className="mt-9 max-w-[16rem] text-balance text-xl font-medium leading-tight text-white/90 md:max-w-xs">
            {t("auth.loginHero")}
          </p>
        </section>

      <form
        onSubmit={handleSubmit}
        className={showEmailForm ? "my-auto w-full" : "mt-9"}
      >
        {!showEmailForm && (
          <>
            <GoogleSignInButton returnTo={returnTo || "/users/me"} variant="light" />
            <button
              type="button"
              onClick={() => setShowEmailForm(true)}
              className="mt-3 flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:bg-primary/90"
            >
              <Mail className="h-5 w-5" />
              {t("auth.continueWithEmail")}
            </button>
          </>
        )}
        <div className={`space-y-5 ${showEmailForm ? "" : "hidden"}`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("auth.account")}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t("auth.welcomeBack")}</h1>
          </div>
          <label className="block" htmlFor="email">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/65">{t("auth.email")}</span>
            <span className="flex h-16 items-center gap-3 rounded-2xl bg-black/40 px-5 text-white/70 ring-1 ring-white/20 backdrop-blur-md transition focus-within:bg-primary/10 focus-within:text-primary focus-within:ring-2 focus-within:ring-primary focus-within:shadow-lg focus-within:shadow-primary/25">
              <Mail className="h-4 w-4 shrink-0" />
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
            </span>
          </label>

          <label className="block" htmlFor="password">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/65">{t("auth.password")}</span>
            <span className="flex h-16 items-center gap-3 rounded-2xl bg-black/40 px-5 text-white/70 ring-1 ring-white/20 backdrop-blur-md transition focus-within:bg-primary/10 focus-within:text-primary focus-within:ring-2 focus-within:ring-primary focus-within:shadow-lg focus-within:shadow-primary/25">
              <LockKeyhole className="h-4 w-4 shrink-0" />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(inputEvent) => setPassword(inputEvent.target.value)}
                className="h-full min-w-0 flex-1 bg-transparent text-base font-medium text-white outline-none placeholder:text-white/45"
                placeholder={t("auth.passwordPlaceholder")}
              />
            </span>
          </label>
        </div>

        {showEmailForm && loginError && (
          <p role="alert" className="mt-5 rounded-2xl bg-red-500/20 px-4 py-3 text-sm text-red-100 backdrop-blur-md">
            {loginError}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`mt-6 h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 ${showEmailForm ? "flex" : "hidden"}`}
        >
          {loading ? t("auth.signingIn") : t("auth.signIn")}
          {!loading && <ArrowRight className="h-4 w-4" />}
        </button>
      </form>

      <p className="mt-7 text-center text-sm text-white/70">
        {t("auth.noAccount")}{" "}
        <Link href="/register" className="font-semibold text-primary transition hover:text-primary/80">
          {t("auth.createAccount")}
        </Link>
      </p>
      </div>
    </main>
  );
}
