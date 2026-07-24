"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, CheckCircle2, CreditCard, RefreshCw, ShieldCheck } from "lucide-react";
import { useDataProvider } from "@/core/DataProviderContext";

type OrganizerProfile = {
  companyName: string;
  cui: string;
  verificationStatus: "pending" | "approved" | "rejected";
  stripeAccountId?: string;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
};

export default function OrganizerDashboard() {
  const { user } = useDataProvider();
  const [profile, setProfile] = useState<OrganizerProfile>();
  const [loading, setLoading] = useState(true);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [error, setError] = useState("");

  const loadProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      setProfile((await user.getOrganizerProfile()) as OrganizerProfile | undefined);
    } catch {
      setProfile(undefined);
    } finally {
      setLoading(false);
    }
  };

  const refreshStripeStatus = async () => {
    if (!user) return;
    setStripeLoading(true);
    setError("");
    try {
      setProfile((await user.refreshStripeAccountStatus()) as OrganizerProfile);
    } catch {
      setError("Starea platilor nu a putut fi actualizata.");
    } finally {
      setStripeLoading(false);
    }
  };

  const startStripeOnboarding = async () => {
    if (!user) return;
    setStripeLoading(true);
    setError("");
    try {
      const { url } = await user.createStripeAccountLink();
      window.location.assign(url);
    } catch {
      setError("Configurarea Stripe nu a putut fi pornita.");
      setStripeLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const stripeAction = new URLSearchParams(window.location.search).get("stripe");
    if (!stripeAction) return;

    window.history.replaceState({}, "", "/dashboard");
    if (stripeAction === "refresh") {
      void startStripeOnboarding();
      return;
    }
    void refreshStripeStatus();
  }, [user]);

  const companyReady = profile?.verificationStatus === "approved";
  const stripeReady = Boolean(profile?.stripeChargesEnabled && profile?.stripePayoutsEnabled);

  return (
    <main className="min-h-screen pb-20 text-foreground">
      <div className="mx-auto max-w-5xl space-y-6 px-4 pt-7 sm:px-6 sm:pt-9">
        <header className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Organizer</p>
          <h1 className="text-2xl font-bold sm:text-3xl">Contul organizatorului</h1>
          <p className="text-sm text-muted-foreground">Starea firmei si a incasarilor tale.</p>
        </header>

        {loading ? (
          <div className="h-36 animate-pulse rounded-xl border border-white/10 bg-white/5" />
        ) : (
          <section className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className={`grid h-11 w-11 place-items-center rounded-lg ${companyReady ? "bg-primary/15 text-primary" : "bg-amber-400/10 text-amber-300"}`}>
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{profile?.companyName || "Firma nu este configurata"}</p>
                  <p className="text-xs text-muted-foreground">
                    {companyReady ? `CUI ${profile?.cui} - verificat` : "Verificarea firmei este necesara pentru evenimente si bilete."}
                  </p>
                </div>
              </div>
              <Link href="/dashboard/ticket-validation" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-semibold transition hover:bg-white/5">
                <ShieldCheck className="h-4 w-4" />
                {companyReady ? "Vezi verificarile" : "Verifica firma"}
              </Link>
            </div>

            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className={`grid h-11 w-11 place-items-center rounded-lg ${stripeReady ? "bg-primary/15 text-primary" : "bg-white/5 text-muted-foreground"}`}>
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Plati Stripe</p>
                  <p className="text-xs text-muted-foreground">
                    {!companyReady ? "Disponibil dupa aprobarea firmei." : stripeReady ? "Platile si transferurile sunt active." : "Conecteaza Stripe pentru a vinde bilete."}
                  </p>
                </div>
              </div>
              {companyReady && !stripeReady && (
                <div className="flex gap-2">
                  {profile?.stripeAccountId && (
                    <button type="button" onClick={refreshStripeStatus} disabled={stripeLoading} aria-label="Actualizeaza starea Stripe" className="grid h-10 w-10 place-items-center rounded-lg border border-white/15 transition hover:bg-white/5 disabled:opacity-50">
                      <RefreshCw className={`h-4 w-4 ${stripeLoading ? "animate-spin" : ""}`} />
                    </button>
                  )}
                  <button type="button" onClick={startStripeOnboarding} disabled={stripeLoading} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                    <CreditCard className="h-4 w-4" />
                    {profile?.stripeAccountId ? "Continua Stripe" : "Conecteaza Stripe"}
                  </button>
                </div>
              )}
              {stripeReady && <CheckCircle2 className="h-5 w-5 text-primary" />}
            </div>
          </section>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </main>
  );
}
