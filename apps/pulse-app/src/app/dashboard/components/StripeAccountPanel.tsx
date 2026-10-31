"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CreditCard,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { type OrganizerProfile } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { useTranslation } from "react-i18next";
import {ModalFrame} from "@/components/ui/ModalFrame";
import { toast } from "sonner";
import {ActionButton as UIActionButton} from '@/components/ui/ActionButton';
import {ActionLink as UIActionLink} from '@/components/ui/ActionButton';

export function StripeAccountPanel({
  onReadyChange,
}: {
  onReadyChange(ready: boolean): void;
}) {
  const { user } = useDataProvider();
  const { t } = useTranslation();
  const [profile, setProfile] = useState<OrganizerProfile>();
  const [loading, setLoading] = useState(true);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);
  const [error, setError] = useState("");

  const loadProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      setProfile(await user.refreshStripeAccountStatus());
    } catch {
      try {
        setProfile(await user.getOrganizerProfile());
      } catch {
        setProfile(undefined);
      }
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

  const disconnectStripe = async () => {
    if (!user) return;
    setDisconnectLoading(true);
    setError("");
    try {
      await user.disconnectStripeAccount();
      setProfile(await user.getOrganizerProfile());
      setDisconnectOpen(false);
      toast.success(t("dashboard.stripeDisconnected"));
    } catch {
      toast.error(t("dashboard.stripeDisconnectFailed"));
    } finally {
      setDisconnectLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const stripeAction = new URLSearchParams(window.location.search).get(
      "stripe",
    );
    if (!stripeAction) return;

    window.history.replaceState({}, "", "/dashboard/finance");
    if (stripeAction === "refresh") {
      void startStripeOnboarding();
      return;
    }
    void refreshStripeStatus();
  }, [user]);

  const companyReady = profile?.verificationStatus === "approved";
  const stripeReady = Boolean(
    profile?.stripeChargesEnabled && profile?.stripePayoutsEnabled,
  );
  const agreementCurrent = profile?.organizerAgreementVersion === "2026-10-18";

  useEffect(() => {
    onReadyChange(companyReady && stripeReady);
  }, [companyReady, stripeReady, onReadyChange]);
  return (
    <section data-testid="stripe-account-panel">
      {loading ? (
        <div className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-3 p-5">
            <div className="h-11 w-11 animate-pulse bg-white/[0.08]" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-28 animate-pulse bg-white/[0.1]" />
              <div className="h-3 w-48 animate-pulse bg-white/[0.06]" />
            </div>
          </div>
        </div>
      ) : !companyReady ? (
        <section className="overflow-hidden rounded-xl border border-amber-400/20 bg-amber-400/[0.04]">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-amber-400/10 text-amber-300">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {profile?.verificationStatus === "pending"
                    ? t("organizerProfile.companyPending")
                    : profile?.verificationStatus === "rejected"
                      ? t("organizerProfile.companyRejected")
                      : t("dashboard.companyMissing")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {profile?.verificationStatus === "pending"
                    ? t("dashboard.companyPendingHint")
                    : profile?.verificationStatus === "rejected"
                      ? t("dashboard.companyRejectedHint")
                      : t("dashboard.companyRequired")}
                </p>
              </div>
            </div>
            <UIActionLink
              href="/dashboard/ticket-validation"
              className="inline-flex h-10 items-center justify-center  bg-[var(--ui-action)] px-3 text-xs font-semibold  transition hover:opacity-90"
            >
              {t("organizerProfile.configureCompany")}
            </UIActionLink>
          </div>
        </section>
      ) : (
        <section className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`grid h-11 w-11 place-items-center rounded-lg ${stripeReady ? "bg-primary/15 text-primary" : "bg-white/5 text-muted-foreground"}`}
              >
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {t("dashboard.stripePayments")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {!companyReady
                    ? t("dashboard.availableAfterVerification")
                    : !agreementCurrent
                      ? t("dashboard.acceptAgreementBeforeStripe")
                      : stripeReady
                        ? t("dashboard.paymentsActive")
                        : t("dashboard.connectStripeToSell")}
                </p>
                {!stripeReady && (
                  <Link
                    href="/organizers/stripe-connect"
                    className="mt-1 inline-block text-[11px] font-semibold text-primary transition hover:opacity-80"
                  >
                    {t("dashboard.stripeExplainer")}
                  </Link>
                )}
              </div>
            </div>
            {companyReady && !agreementCurrent && (
              <Link
                href="/organizers/agreement?returnTo=/dashboard/finance"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-primary/35 px-3 text-xs font-semibold text-primary transition hover:bg-primary/10"
              >
                {t("dashboard.acceptAgreement")}
              </Link>
            )}
            {companyReady &&
              (agreementCurrent || Boolean(profile?.stripeAccountId)) && (
                <div className="flex flex-wrap gap-2">
                  {profile?.stripeAccountId && (
                    <button
                      type="button"
                      onClick={refreshStripeStatus}
                      disabled={stripeLoading}
                      aria-label={t("dashboard.refreshStripe")}
                      className="grid h-10 w-10 place-items-center rounded-lg border border-white/15 transition hover:bg-white/5 disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${stripeLoading ? "animate-spin" : ""}`}
                      />
                    </button>
                  )}
                  {agreementCurrent && !stripeReady && (
                    <UIActionButton
                      type="button"
                      onClick={startStripeOnboarding}
                      disabled={stripeLoading}
                      className="inline-flex h-10 items-center gap-2 px-3 text-xs font-semibold transition hover:opacity-90 disabled:opacity-50"
                    >
                      <CreditCard className="h-4 w-4" />
                      {profile?.stripeAccountId
                        ? t("dashboard.continueStripe")
                        : t("dashboard.connectStripe")}
                    </UIActionButton>
                  )}
                  {profile?.stripeAccountId && (
                    <button
                      type="button"
                      onClick={() => setDisconnectOpen(true)}
                      disabled={stripeLoading}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-500/30 px-3 text-xs font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                    >
                      <Unplug className="h-4 w-4" />
                      {t("dashboard.disconnectStripe")}
                    </button>
                  )}
                </div>
              )}
          </div>
        </section>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {disconnectOpen && (
        <ModalFrame open onClose={()=>setDisconnectOpen(false)} dismissible={!disconnectLoading} label={t("dashboard.disconnectStripeTitle")}>
          <div className="p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-300">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2
                  id="disconnect-stripe-title"
                  className="text-lg font-semibold"
                >
                  {t("dashboard.disconnectStripeTitle")}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t("dashboard.disconnectStripeHint")}
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                data-dialog-initial-focus
                onClick={() => setDisconnectOpen(false)}
                disabled={disconnectLoading}
                className="h-10 rounded-lg border border-white/15 px-4 text-sm font-semibold transition hover:bg-white/5 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={disconnectStripe}
                disabled={disconnectLoading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                {disconnectLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Unplug className="h-4 w-4" />
                )}
                {t("dashboard.confirmDisconnectStripe")}
              </button>
            </div>
          </div>
        </ModalFrame>
      )}
    </section>
  );
}
