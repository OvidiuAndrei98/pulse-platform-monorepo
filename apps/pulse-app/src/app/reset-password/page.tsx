"use client";

import Link from "next/link";
import { Check, KeyRound, Loader2 } from "lucide-react";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { User } from "@/core/DataProvider";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-background" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
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
      setError("Linkul de resetare este invalid sau incomplet.");
      return;
    }
    if (password.length < 6) {
      setError("Parola trebuie sa aiba cel putin 6 caractere.");
      return;
    }
    if (password !== confirmation) {
      setError("Parolele nu coincid.");
      return;
    }

    setState("saving");
    setError(undefined);
    try {
      await User.resetPassword(token, password);
      setState("saved");
      window.setTimeout(() => router.replace("/login"), 1300);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Parola nu a putut fi resetata.");
      setState("idle");
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-32 pt-16 text-foreground sm:pt-24">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary"><KeyRound className="h-5 w-5" /></span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Securitatea contului</p>
          <h1 className="mt-0.5 text-2xl font-semibold">Alege o parola noua</h1>
        </div>
      </div>
      <p className="mt-5 text-sm leading-6 text-muted-foreground">Alege o parola noua pentru contul tau Pulse.</p>

      <form onSubmit={submit} className="mt-8 border border-white/15 bg-[#101311]/90 p-5 shadow-xl sm:p-6">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">Parola noua</span>
            <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required className="h-12 w-full rounded-lg border border-white/15 bg-white/[0.035] px-3 text-sm outline-none transition focus:border-primary/60" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">Confirma parola</span>
            <input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required className="h-12 w-full rounded-lg border border-white/15 bg-white/[0.035] px-3 text-sm outline-none transition focus:border-primary/60" />
          </label>
        </div>
        {error && <p className="mt-4 border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={state !== "idle"} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
          {state === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}
          {state === "saved" && <Check className="h-4 w-4" />}
          {state === "saving" ? "Se salveaza..." : state === "saved" ? "Parola actualizata" : "Actualizeaza parola"}
        </button>
      </form>
      <Link href="/login" className="mt-5 text-center text-sm font-semibold text-primary">Inapoi la conectare</Link>
    </main>
  );
}
