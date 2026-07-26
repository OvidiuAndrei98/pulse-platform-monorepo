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
} from "lucide-react";
import { useDataProvider } from "@/core/DataProviderContext";

type RegistrationState = "idle" | "loading" | "success" | "error";

export default function RegisterPage() {
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
          : "Contul nu a putut fi creat. Incearca din nou.",
      );
    }
  };

  if (state === "success") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-32 pt-16 text-foreground sm:pt-24">
        <span className="grid h-12 w-12 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
          <CircleCheck className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold">Verifica-ti emailul</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Am trimis un link de activare la <span className="font-semibold text-foreground">{email}</span>. Dupa confirmare te poti conecta in cont.
        </p>
        <Link
          href="/login"
          className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
        >
          Mergi la conectare <ArrowRight className="h-4 w-4" />
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-32 pt-12 text-foreground sm:pt-20">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
          <UserRound className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Cont nou
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold">Creeaza-ti profilul</h1>
        </div>
      </div>

      <p className="mt-5 text-sm leading-6 text-muted-foreground">
        Descopera evenimente, pastreaza biletele aproape si conecteaza-te cu oamenii cu care iesi.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-7 border border-white/15 bg-[#101311]/90 p-5 shadow-xl sm:p-6"
      >
        <div className="space-y-4">
          <Field label="Username" icon={UserRound}>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              minLength={3}
              maxLength={50}
              value={username}
              onChange={(inputEvent) => setUsername(inputEvent.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="andrei_pulse"
            />
          </Field>

          <Field label="Email" icon={Mail}>
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
          </Field>

          <Field label="Parola" icon={LockKeyhole}>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(inputEvent) => setPassword(inputEvent.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="Minimum 6 caractere"
            />
          </Field>

          <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition ${isOrganizer ? "border-primary/45 bg-primary/10" : "border-white/15 bg-white/[0.025] hover:border-white/25"}`}>
            <input
              type="checkbox"
              checked={isOrganizer}
              onChange={(inputEvent) => setIsOrganizer(inputEvent.target.checked)}
              className="peer sr-only"
            />
            <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border transition ${isOrganizer ? "border-primary bg-primary text-primary-foreground" : "border-white/25 text-transparent"}`}>
              <Check className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Building2 className="h-4 w-4 text-primary" /> Cont de organizator
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                Pentru firme care publica si vand bilete la evenimente.
              </span>
            </span>
          </label>
        </div>

        {state === "error" && (
          <p className="mt-4 border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={state === "loading" || loading}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === "loading" ? "Se creeaza contul..." : "Creeaza cont"}
          {state !== "loading" && <ArrowRight className="h-4 w-4" />}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        Ai deja cont?{" "}
        <Link href="/login" className="font-semibold text-primary transition hover:text-primary/80">
          Conecteaza-te
        </Link>
      </p>
    </main>
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
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      <span className="flex h-12 items-center gap-3 rounded-lg border border-white/15 bg-white/[0.035] px-3 text-muted-foreground transition focus-within:border-primary/60">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        {children}
      </span>
    </label>
  );
}
