"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useDataProvider } from "@/core/DataProviderContext";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export default function LoginPage() {
  const { login, loading, error, user } = useDataProvider();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    await login(email, password);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-32 pt-16 text-foreground sm:pt-24">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
          <UserRound className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Contul tau
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold">Bine ai revenit</h1>
        </div>
      </div>

      <p className="mt-5 text-sm leading-6 text-muted-foreground">
        Conecteaza-te pentru biletele tale, evenimentele salvate si activitatea prietenilor.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-8 border border-white/15 bg-[#101311]/90 p-5 shadow-xl sm:p-6"
      >
        <GoogleSignInButton returnTo={returnTo || "/users/me"} />
        <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground"><span className="h-px flex-1 bg-white/10" />sau<span className="h-px flex-1 bg-white/10" /></div>
        <div className="space-y-4">
          <label className="block" htmlFor="email">
            <span className="mb-2 block text-sm font-semibold">Email</span>
            <span className="flex h-12 items-center gap-3 rounded-lg border border-white/15 bg-white/[0.035] px-3 text-muted-foreground transition focus-within:border-primary/60">
              <Mail className="h-4 w-4 shrink-0 text-primary" />
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(inputEvent) => setEmail(inputEvent.target.value)}
                className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                placeholder="nume@email.ro"
              />
            </span>
          </label>

          <label className="block" htmlFor="password">
            <span className="mb-2 block text-sm font-semibold">Parola</span>
            <span className="flex h-12 items-center gap-3 rounded-lg border border-white/15 bg-white/[0.035] px-3 text-muted-foreground transition focus-within:border-primary/60">
              <LockKeyhole className="h-4 w-4 shrink-0 text-primary" />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(inputEvent) => setPassword(inputEvent.target.value)}
                className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                placeholder="Introdu parola"
              />
            </span>
          </label>
        </div>

        {error && (
          <p className="mt-4 border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
            {error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Se conecteaza..." : "Conecteaza-te"}
          {!loading && <ArrowRight className="h-4 w-4" />}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        Nu ai inca un cont?{" "}
        <Link href="/register" className="font-semibold text-primary transition hover:text-primary/80">
          Creeaza cont
        </Link>
      </p>
    </main>
  );
}
