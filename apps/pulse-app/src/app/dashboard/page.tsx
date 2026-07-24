"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, Calendar, CheckCircle2, CreditCard, LogOut, MapPin, Plus, QrCode, RefreshCw } from "lucide-react";
import { User } from "@/core/DataProvider";
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
  const { user, logout } = useDataProvider();
  const { events, eventsLoading } = User.useOrganizerEvents(user);
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
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Organizer</p>
            <h1 className="text-2xl font-bold sm:text-3xl">Contul organizatorului</h1>
            <p className="text-sm text-muted-foreground">Starea firmei, a incasarilor si a evenimentelor tale.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/events/new" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
              <Plus className="h-4 w-4" />
              Event nou
            </Link>
            <button type="button" onClick={logout} aria-label="Deconectare" title="Deconectare" className="grid h-11 w-11 place-items-center rounded-lg border border-white/15 text-muted-foreground transition hover:bg-white/5 hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
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
                <QrCode className="h-4 w-4" />
                Validare bilete
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

        <section className="border-t border-white/10 pt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="text-lg font-semibold">Ultimele evenimente</h2><p className="mt-1 text-sm text-muted-foreground">Acces rapid la evenimentele create recent.</p></div>
            <Link href="/dashboard/events" className="text-xs font-semibold text-primary transition hover:opacity-80">Vezi toate</Link>
          </div>
          {eventsLoading ? (
            <div className="grid gap-3 sm:grid-cols-2"><div className="h-24 animate-pulse rounded-lg border border-white/10 bg-white/5" /><div className="h-24 animate-pulse rounded-lg border border-white/10 bg-white/5" /></div>
          ) : events.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {events.slice(0, 4).map((event) => (
                <Link key={event.id} href={`/dashboard/events/${event.id}`} className="group flex min-w-0 items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 transition hover:border-white/20 hover:bg-white/[0.06]">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-white/5">{event.bannerUrl && <img src={event.bannerUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />}</div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold group-hover:text-primary">{event.title}</p><p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground"><Calendar className="h-3 w-3 shrink-0" />{new Date(event.startTime).toLocaleDateString("ro-RO", { day: "numeric", month: "short" })}</p><p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" />{event.locationName}</p></div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-white/15 p-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">Nu ai creat niciun eveniment inca.</p><Link href="/dashboard/events/new" className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/35 px-3 text-xs font-semibold text-primary transition hover:bg-primary/10"><Plus className="h-3.5 w-3.5" />Adauga eveniment</Link></div>
          )}
        </section>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </main>
  );
}
