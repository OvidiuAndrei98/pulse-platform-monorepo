"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, Calendar, CheckCircle2, CreditCard, ExternalLink, MapPin, Plus, QrCode, RefreshCw } from "lucide-react";
import { OrganizerProfile, User } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { formatEventDateShort } from "@/features/events/dateFormat";
import { useTranslation } from "react-i18next";
import { routeForPlatform } from "@/lib/native/navigation";
import { useEventDetails } from "@/components/EventDetailsSheet";

export default function OrganizerDashboard() {
  const { user } = useDataProvider();
  const { close: closeEventDetails } = useEventDetails();
  const { t } = useTranslation();
  const { events, eventsLoading } = User.useOrganizerEvents(user);
  const [profile, setProfile] = useState<OrganizerProfile>();
  const [loading, setLoading] = useState(true);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [error, setError] = useState("");

  const loadProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      setProfile(await user.getOrganizerProfile());
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
      setProfile(await user.refreshStripeAccountStatus());
    } catch {
      setError(t("dashboard.paymentsStatusFailed"));
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
      setError(t("dashboard.stripeSetupFailed"));
      setStripeLoading(false);
    }
  };

  const openStripeDashboard = async () => {
    if (!user) return;
    setStripeLoading(true);
    setError("");
    try {
      const { url } = await user.createStripeDashboardLoginLink();
      window.location.assign(url);
    } catch {
      setError(t("dashboard.stripeDashboardFailed"));
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
  const agreementCurrent = profile?.organizerAgreementVersion === "2026-07-27";

  return (
    <main className="min-h-screen text-foreground">
      <div className="mx-auto max-w-5xl space-y-6 px-4 pt-7 sm:px-6 sm:pt-9">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">{t("dashboardNav.organizer")}</p>
            <h1 className="text-2xl font-bold sm:text-3xl">{t("dashboard.account")}</h1>
            <p className="text-sm text-muted-foreground">{t("dashboard.overview")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/events/new" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
              <Plus className="h-4 w-4" />
              {t("dashboardNav.newEvent")}
            </Link>
          </div>
        </header>

        {loading ? (
          <div className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
            <div className="flex items-center gap-3 p-5"><div className="h-11 w-11 animate-pulse bg-white/[0.08]" /><div className="flex-1 space-y-2"><div className="h-3 w-32 animate-pulse bg-white/[0.1]" /><div className="h-3 w-56 animate-pulse bg-white/[0.06]" /></div></div>
            <div className="flex items-center gap-3 p-5"><div className="h-11 w-11 animate-pulse bg-white/[0.08]" /><div className="flex-1 space-y-2"><div className="h-3 w-28 animate-pulse bg-white/[0.1]" /><div className="h-3 w-48 animate-pulse bg-white/[0.06]" /></div></div>
          </div>
        ) : (
          <section className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className={`grid h-11 w-11 place-items-center rounded-lg ${companyReady ? "bg-primary/15 text-primary" : "bg-amber-400/10 text-amber-300"}`}>
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{profile?.companyName || t("dashboard.companyMissing")}</p>
                  <p className="text-xs text-muted-foreground">
                    {companyReady ? t("dashboard.companyVerified", { cui: profile?.cui }) : t("dashboard.companyRequired")}
                  </p>
                </div>
              </div>
              <Link href="/dashboard/ticket-validation" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-semibold transition hover:bg-white/5">
                <QrCode className="h-4 w-4" />
                {t("dashboardNav.ticketValidation")}
              </Link>
            </div>

            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className={`grid h-11 w-11 place-items-center rounded-lg ${stripeReady ? "bg-primary/15 text-primary" : "bg-white/5 text-muted-foreground"}`}>
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t("dashboard.stripePayments")}</p>
                  <p className="text-xs text-muted-foreground">
                    {!companyReady ? t("dashboard.availableAfterVerification") : !agreementCurrent ? t("dashboard.acceptAgreementBeforeStripe") : stripeReady ? t("dashboard.paymentsActive") : t("dashboard.connectStripeToSell")}
                  </p>
                  {!stripeReady && <Link href="/organizers/stripe-connect" className="mt-1 inline-block text-[11px] font-semibold text-primary transition hover:opacity-80">{t("dashboard.stripeExplainer")}</Link>}
                </div>
              </div>
              {companyReady && !agreementCurrent && <Link href="/organizers/agreement?returnTo=/dashboard" className="inline-flex h-10 items-center justify-center rounded-lg border border-primary/35 px-3 text-xs font-semibold text-primary transition hover:bg-primary/10">{t("dashboard.acceptAgreement")}</Link>}
              {companyReady && agreementCurrent && !stripeReady && (
                <div className="flex gap-2">
                  {profile?.stripeAccountId && (
                    <button type="button" onClick={refreshStripeStatus} disabled={stripeLoading} aria-label={t("dashboard.refreshStripe")} className="grid h-10 w-10 place-items-center rounded-lg border border-white/15 transition hover:bg-white/5 disabled:opacity-50">
                      <RefreshCw className={`h-4 w-4 ${stripeLoading ? "animate-spin" : ""}`} />
                    </button>
                  )}
                  {profile?.stripeAccountId && (
                    <button
                      type="button"
                      onClick={openStripeDashboard}
                      disabled={stripeLoading}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-semibold transition hover:bg-white/5 disabled:opacity-50"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {t("dashboard.openStripeDashboard")}
                    </button>
                  )}
                  <button type="button" onClick={startStripeOnboarding} disabled={stripeLoading} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                    <CreditCard className="h-4 w-4" />
                    {profile?.stripeAccountId ? t("dashboard.continueStripe") : t("dashboard.connectStripe")}
                  </button>
                </div>
              )}
              {stripeReady && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <button
                    type="button"
                    onClick={openStripeDashboard}
                    disabled={stripeLoading}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-semibold transition hover:bg-white/5 disabled:opacity-50"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {t("dashboard.openStripeDashboard")}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="border-t border-white/10 pt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="text-lg font-semibold">{t("dashboard.recentEvents")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("dashboard.recentEventsHint")}</p></div>
            <Link href="/dashboard/events" className="text-xs font-semibold text-primary transition hover:opacity-80">{t("common.seeAll")}</Link>
          </div>
          {eventsLoading ? (
            <div className="grid gap-3 sm:grid-cols-2"><div className="h-24 animate-pulse rounded-lg border border-white/10 bg-white/5" /><div className="h-24 animate-pulse rounded-lg border border-white/10 bg-white/5" /></div>
          ) : events.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {events.slice(0, 4).map((event) => (
                <Link key={event.id} href={routeForPlatform(`/dashboard/events/${event.id}`)} onClick={closeEventDetails} className="group flex min-w-0 items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 transition hover:border-white/20 hover:bg-white/[0.06]">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-white/5">{event.bannerUrl && <img src={event.bannerUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />}</div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold group-hover:text-primary">{event.title}</p><p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground"><Calendar className="h-3 w-3 shrink-0" />{formatEventDateShort(event.startTime)}</p><p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" />{event.locationName}</p></div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-white/15 p-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">{t("dashboard.noEvents")}</p><Link href="/dashboard/events/new" className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/35 px-3 text-xs font-semibold text-primary transition hover:bg-primary/10"><Plus className="h-3.5 w-3.5" />{t("dashboard.addEvent")}</Link></div>
          )}
        </section>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </main>
  );
}
