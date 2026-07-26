"use client";

import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useDataProvider } from "@/core/DataProviderContext";

const AGREEMENT_VERSION = "2026-07-27";

export function AgreementAcceptance() {
  const { user, loading } = useDataProvider();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const accept = async () => {
    if (!user || !accepted) return;
    setSubmitting(true);
    setMessage("");
    try {
      await user.acceptOrganizerAgreement(AGREEMENT_VERSION);
      const returnTo = searchParams.get("returnTo");
      router.push(returnTo?.startsWith("/") ? returnTo : "/dashboard");
    } catch {
      setMessage("Completeaza mai intai datele firmei in sectiunea de verificare. Acordul va fi inregistrat odata cu cererea de verificare.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="mt-8 h-24 animate-pulse border border-white/10 bg-white/[0.03]" />;

  if (!user) {
    return <section className="mt-8 border border-primary/25 bg-primary/[0.04] p-5"><p className="text-sm text-muted-foreground">Conecteaza-te cu un cont de organizator pentru a accepta acordul.</p><Link href="/login" className="mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Conecteaza-te</Link></section>;
  }

  return <section className="mt-8 border border-primary/25 bg-primary/[0.04] p-5 sm:p-6">
    <div className="flex items-start gap-3">
      <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
      <div><h2 className="text-base font-semibold">Accepta acordul</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Acceptarea este salvata cu versiunea documentului, data si adresa IP. Este necesara inainte de conectarea Stripe si vanzarea de bilete.</p></div>
    </div>
    <label className="mt-5 flex cursor-pointer items-start gap-3 border border-white/10 bg-black/10 p-3 text-sm leading-6 text-muted-foreground">
      <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]" />
      <span>Confirm ca am dreptul sa reprezint organizatorul si accept Acordul pentru organizatori, versiunea {AGREEMENT_VERSION}.</span>
    </label>
    {message && <p className="mt-3 text-sm text-amber-200">{message}</p>}
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" disabled={!accepted || submitting} onClick={accept} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Accept acordul
      </button>
      <Link href="/dashboard/ticket-validation" className="inline-flex h-11 items-center justify-center rounded-lg border border-white/15 px-4 text-sm font-semibold transition hover:bg-white/5">Mergi la verificarea firmei</Link>
    </div>
  </section>;
}
