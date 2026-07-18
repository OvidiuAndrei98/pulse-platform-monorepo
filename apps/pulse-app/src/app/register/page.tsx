"use client";

import { useState } from "react";
import Link from "next/link";
import { useDataProvider } from "@/core/DataProviderContext";

type State = "idle" | "loading" | "success" | "error";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const { register, loading, error, user } = useDataProvider();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("loading");
    setErrorMsg("");

    try {
      await register(username, email, password, isOrganizer);
      setState("success");
    } catch (err) {
      setState("error");
      setErrorMsg(
        err instanceof Error ? err.message : "A apărut o eroare neașteptată",
      );
    }
  };

  if (state === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-4 text-5xl">📧</div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
            Cont creat cu succes!
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            Am trimis un link de activare la{" "}
            <strong className="text-zinc-700 dark:text-zinc-300">
              {email}
            </strong>
            . Verifică inbox-ul și folderul de spam.
          </p>
          <Link
            href="/login"
            className="text-sm font-medium text-zinc-900 dark:text-zinc-50 underline underline-offset-4"
          >
            Mergi la Login →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-1">
          Creează cont Pulse
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8">
          Ai deja cont?{" "}
          <Link
            href="/login"
            className="font-medium text-zinc-900 dark:text-zinc-50 underline underline-offset-4"
          >
            Autentifică-te
          </Link>
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Username */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="username"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              required
              minLength={3}
              maxLength={50}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50"
              placeholder="andrei_pulse"
            />
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="reg-email"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Email
            </label>
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50"
              placeholder="tu@exemplu.com"
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="reg-password"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Parolă
            </label>
            <input
              id="reg-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50"
              placeholder="minim 6 caractere"
            />
          </div>

          {/* Organizer toggle */}
          <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 hover:bg-white dark:hover:bg-zinc-900 transition-colors has-[:checked]:border-zinc-900 dark:has-[:checked]:border-zinc-300">
            <input
              type="checkbox"
              checked={isOrganizer}
              onChange={(e) => setIsOrganizer(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-zinc-900 dark:accent-zinc-50"
            />
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                Cont de Organizator
              </p>
              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                PFA sau SRL care organizează evenimente. Vei putea crea și
                gestiona evenimente pe platformă.
              </p>
            </div>
          </label>

          {state === "error" && (
            <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={state === "loading"}
            className="mt-1 rounded-lg bg-zinc-900 dark:bg-zinc-50 px-4 py-2.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {state === "loading" ? "Se creează contul…" : "Creează cont"}
          </button>
        </form>
      </div>
    </div>
  );
}
