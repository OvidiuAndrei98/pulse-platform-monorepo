"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDataProvider } from "@/core/DataProviderContext";
import {
  Building2,
  CheckCircle2,
  Clock,
  Plus,
  BarChart3,
  LogOut,
  User as UserIcon,
  AlertTriangle,
  XCircle,
  CalendarDays,
  ArrowRight,
  ShieldCheck,
  CreditCard,
  RefreshCw,
} from "lucide-react";

interface OrganizerProfile {
  id: string;
  userId: string;
  companyName: string;
  cui: string;
  isVerified: boolean;
  verificationStatus: "pending" | "approved" | "rejected";
  caenCode?: string;
  stripeAccountId?: string;
  stripeChargesEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
  stripeDetailsSubmitted?: boolean;
  createdAt: string;
}

export default function OrganizerDashboard() {
  const { user, logout } = useDataProvider();

  const [profile, setProfile] = useState<OrganizerProfile | undefined>(
    undefined,
  );
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStripeLoading, setIsStripeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cui, setCui] = useState("");
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    async function fetchProfile() {
      try {
        setIsLoadingProfile(true);
        const data = await user?.getOrganizerProfile();
        setProfile(data);
      } catch (err) {
        console.error("Eroare la obținerea profilului organizatorului:", err);
      } finally {
        setIsLoadingProfile(false);
      }
    }

    if (user) {
      fetchProfile();
    }
  }, [user]);

  const handleSubmitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cui || !companyName) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const updatedProfile = await user?.updateOrganizerProfile(
        cui,
        companyName,
      );
      setProfile(updatedProfile);
    } catch (err: any) {
      setError(
        err?.message || "Eroare la verificarea CUI-ului prin serviciul ANAF.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const refreshStripeStatus = async () => {
    if (!user) return;

    setIsStripeLoading(true);
    setError(null);
    try {
      setProfile(await user.refreshStripeAccountStatus());
    } catch (err: any) {
      setError(err?.message || "Starea platilor nu a putut fi actualizata.");
    } finally {
      setIsStripeLoading(false);
    }
  };

  const startStripeOnboarding = async () => {
    if (!user) return;

    setIsStripeLoading(true);
    setError(null);
    try {
      const { url } = await user.createStripeAccountLink();
      window.location.assign(url);
    } catch (err: any) {
      setError(err?.message || "Configurarea Stripe nu a putut fi pornita.");
      setIsStripeLoading(false);
    }
  };

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

  const isApproved = profile?.verificationStatus === "approved";
  const stripeReady = Boolean(profile?.stripeChargesEnabled && profile?.stripePayoutsEnabled);

  return (
    <div className="min-h-screen  text-zinc-100 px-4 py-10 antialiased selection:bg-white/20">
      {/* Background Subtle Ambient Glows */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[0.03] via-transparent to-transparent" />

      <div className="relative mx-auto max-w-5xl space-y-8">
        {/* HEADER SECTION */}
        <header className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-2xl ring-1 ring-white/5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 backdrop-blur-md">
                <Building2 className="h-3 w-3 text-zinc-300" />
                Panou Organizator
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Salut, {user?.properties.username || "Organizator"} 👋
            </h1>
          </div>

          <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
            <Link
              href="/me"
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 text-xs font-semibold text-zinc-300 backdrop-blur-md transition hover:bg-white/10 hover:text-white active:scale-[0.98]"
            >
              <UserIcon className="h-3.5 w-3.5" />
              Profil
            </Link>

            <button
              type="button"
              onClick={logout}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 text-xs font-semibold text-zinc-400 backdrop-blur-md transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 active:scale-[0.98]"
            >
              <LogOut className="h-3.5 w-3.5" />
              Ieșire
            </button>
          </div>
        </header>

        {/* ANAF VERIFICATION / PROFILE STATUS SECTION */}
        <section>
          {isLoadingProfile ? (
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-8 backdrop-blur-2xl ring-1 ring-white/5">
              <div className="flex items-center gap-3 animate-pulse">
                <div className="h-10 w-10 rounded-2xl bg-white/10" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-1/3 rounded-lg bg-white/10" />
                  <div className="h-3 w-1/2 rounded-lg bg-white/5" />
                </div>
              </div>
            </div>
          ) : !profile ? (
            /* Formular Verificare CUI / ANAF cu Amber Glow subtil */
            <div className="group relative overflow-hidden rounded-3xl border border-amber-500/20 bg-amber-500/[0.02] p-6 sm:p-8 backdrop-blur-2xl ring-1 ring-amber-500/10 transition duration-500">
              {/* Glow ambiental ambiental sub card */}
              <div className="absolute -top-24 -left-24 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

              <div className="relative flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-white tracking-wide">
                    Verificare Legală Obligatorie (ANAF)
                  </h2>
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-2xl">
                    Pentru a putea publica evenimente și a încasa bilete pe
                    platformă, introduceți datele firmei (PFA sau SRL). Acestea
                    vor fi verificate automat cu registrul public ANAF.
                  </p>
                </div>
              </div>

              <form
                onSubmit={handleSubmitProfile}
                className="relative mt-6 space-y-4 max-w-xl"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      CUI / CIF Companie
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: 12345678"
                      value={cui}
                      onChange={(e) => setCui(e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none backdrop-blur-md transition focus:border-white/30 focus:bg-white/[0.08]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Nume Companie (RECOM)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: PARTY SRL"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none backdrop-blur-md transition focus:border-white/30 focus:bg-white/[0.08]"
                    />
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-400">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10 px-6 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-md transition duration-200 hover:bg-white/20 active:scale-[0.98] disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Clock className="h-4 w-4 animate-spin" /> Se validează la
                      ANAF...
                    </span>
                  ) : (
                    "Verifică Firma"
                  )}
                </button>
              </form>
            </div>
          ) : (
            /* Status Card cu Glow Difuz bazat pe stare */
            <div
              className={`relative overflow-hidden rounded-3xl border p-6 sm:p-8 backdrop-blur-2xl transition-all duration-300 ${
                isApproved
                  ? "border-emerald-500/20 bg-emerald-500/[0.02] ring-1 ring-emerald-500/10"
                  : profile.verificationStatus === "pending"
                    ? "border-blue-500/20 bg-blue-500/[0.02] ring-1 ring-blue-500/10"
                    : "border-red-500/20 bg-red-500/[0.02] ring-1 ring-red-500/10"
              }`}
            >
              {/* Subtle Status Light Glow */}
              <div
                className={`absolute -top-20 -right-20 h-40 w-40 rounded-full blur-3xl pointer-events-none ${
                  isApproved
                    ? "bg-emerald-500/15"
                    : profile.verificationStatus === "pending"
                      ? "bg-blue-500/15"
                      : "bg-red-500/15"
                }`}
              />

              <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border ${
                      isApproved
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : profile.verificationStatus === "pending"
                          ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                          : "border-red-500/30 bg-red-500/10 text-red-400"
                    }`}
                  >
                    {isApproved && <ShieldCheck className="h-6 w-6" />}
                    {profile.verificationStatus === "pending" && (
                      <Clock className="h-6 w-6" />
                    )}
                    {profile.verificationStatus === "rejected" && (
                      <XCircle className="h-6 w-6" />
                    )}
                  </div>

                  <div className="space-y-0.5">
                    <h3 className="text-lg font-bold text-white tracking-wide">
                      {profile.companyName}
                    </h3>
                    <p className="text-xs text-zinc-400 flex items-center gap-2">
                      <span>
                        CUI:{" "}
                        <strong className="text-zinc-200">{profile.cui}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Registru ANAF:{" "}
                        <span className="text-emerald-400 font-medium">
                          Activ
                        </span>
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                      isApproved
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : profile.verificationStatus === "pending"
                          ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                          : "border-red-500/30 bg-red-500/10 text-red-400"
                    }`}
                  >
                    {isApproved && (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Profil
                        Verificat
                      </>
                    )}
                    {profile.verificationStatus === "pending" && (
                      <>
                        <Clock className="h-3.5 w-3.5 animate-pulse" /> În curs
                        de verificare
                      </>
                    )}
                    {profile.verificationStatus === "rejected" && (
                      <>
                        <XCircle className="h-3.5 w-3.5" /> Cerere Respinsă
                      </>
                    )}
                  </span>
                </div>
              </div>

              {isApproved && (
                <div className="relative mt-5 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <CreditCard className={`h-4 w-4 ${stripeReady ? "text-emerald-400" : "text-amber-400"}`} />
                    <span>
                      {stripeReady
                        ? "Platile si transferurile catre organizator sunt active"
                        : "Configureaza Stripe pentru a putea incasa bilete"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {profile?.stripeAccountId && !stripeReady && (
                      <button
                        type="button"
                        onClick={refreshStripeStatus}
                        disabled={isStripeLoading}
                        aria-label="Actualizeaza starea Stripe"
                        className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${isStripeLoading ? "animate-spin" : ""}`} />
                      </button>
                    )}
                    {!stripeReady && (
                      <button
                        type="button"
                        onClick={startStripeOnboarding}
                        disabled={isStripeLoading}
                        className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
                      >
                        {isStripeLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                        {profile?.stripeAccountId ? "Continua Stripe" : "Conecteaza Stripe"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* QUICK ACTIONS GRID */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 pl-1">
            Acțiuni Rapide
          </h2>

          <div
            className={`grid grid-cols-1 sm:grid-cols-2 gap-4 transition-all duration-300 ${
              !isApproved
                ? "opacity-40 pointer-events-none select-none grayscale"
                : ""
            }`}
          >
            {/* Action 1: Eveniment Nou - Hover Glow Effect */}
            <Link
              href="/organizer/dashboard/events/new"
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-2xl ring-1 ring-white/5 transition duration-300 hover:border-white/20 hover:bg-white/[0.06] active:scale-[0.99]"
            >
              {/* Subtle hover light glow inside card */}
              <div className="absolute -bottom-12 -right-12 h-32 w-32 rounded-full bg-white/5 blur-2xl transition duration-500 group-hover:bg-white/10" />

              <div className="relative flex items-start justify-between">
                <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/5 text-white transition duration-300 group-hover:scale-105 group-hover:bg-white/10">
                  <Plus className="h-6 w-6" />
                </div>
                <ArrowRight className="h-5 w-5 text-zinc-500 transition duration-300 group-hover:translate-x-1 group-hover:text-white" />
              </div>

              <div className="relative mt-6 space-y-1">
                <h3 className="text-base font-bold text-white tracking-wide">
                  Eveniment Nou
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Creează, configurează biletele și publică un eveniment nou pe
                  hartă.
                </p>
              </div>
            </Link>

            {/* Action 2: Statistici (Inactiv Placeholder) */}
            <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-white/[0.01] p-6 backdrop-blur-2xl ring-1 ring-white/5 opacity-60">
              <div className="flex items-start justify-between">
                <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/5 bg-white/5 text-zinc-500">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  În curând
                </span>
              </div>

              <div className="mt-6 space-y-1">
                <h3 className="text-base font-bold text-zinc-400 tracking-wide">
                  Statistici & Vânzări
                </h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Urmărește performanța evenimentelor și numărul de bilete
                  vândute.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* EVENTS LIST SECTION */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 pl-1">
            Evenimentele Tale
          </h2>

          <div
            className={`relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-8 text-center backdrop-blur-2xl ring-1 ring-white/5 transition-all duration-300 ${
              !isApproved
                ? "opacity-40 pointer-events-none select-none grayscale"
                : ""
            }`}
          >
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/5 text-zinc-400 mb-4">
              <CalendarDays className="h-6 w-6" />
            </div>

            <h3 className="text-sm font-semibold text-white">
              Nu ai creat niciun eveniment
            </h3>
            <p className="mt-1 text-xs text-zinc-400 max-w-sm mx-auto">
              După ce profilul este verificat, poți adăuga primul tău eveniment
              direct în aplicație.
            </p>

            {isApproved && (
              <Link
                href="/organizer/dashboard/events/new"
                className="mt-5 inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-xs font-semibold text-white backdrop-blur-md transition duration-200 hover:bg-white/20 active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" />
                Creează Eveniment
              </Link>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
