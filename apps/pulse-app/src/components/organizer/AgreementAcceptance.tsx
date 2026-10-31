"use client";

import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useDataProvider } from "@/core/DataProviderContext";
import { useTranslation } from "react-i18next";
import {ActionButton as UIActionButton} from '@/components/ui/ActionButton';
import {ActionLink as UIActionLink} from '@/components/ui/ActionButton';

const AGREEMENT_VERSION = "2026-10-18";

export function AgreementAcceptance() {
  const { user, loading } = useDataProvider();
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [hasCompanyProfile, setHasCompanyProfile] = useState(false);

  useEffect(() => {
    if (!user) {
      setProfileLoading(false);
      setHasCompanyProfile(false);
      return;
    }

    let active = true;
    setProfileLoading(true);
    void user
      .getOrganizerProfile()
      .then((profile) => {
        if (active) setHasCompanyProfile(Boolean(profile));
      })
      .catch(() => {
        if (active) setHasCompanyProfile(false);
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const accept = async () => {
    if (!user || !accepted) return;
    setSubmitting(true);
    setMessage("");
    try {
      await user.acceptOrganizerAgreement(AGREEMENT_VERSION);
      const returnTo = searchParams.get("returnTo");
      router.push(returnTo?.startsWith("/") ? returnTo : "/dashboard");
    } catch {
      setMessage(t("agreement.error"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || (user && profileLoading)) return <div className="mt-8 h-24 animate-pulse border border-white/10 bg-white/[0.03]" />;

  if (!user) {
    return <section className="mt-8 border border-primary/25 bg-primary/[0.04] p-5"><p className="text-sm text-muted-foreground">{t("agreement.signIn")}</p><UIActionLink href="/login" className="mt-4 inline-flex h-10 items-center  bg-[var(--ui-action)] px-4 text-sm font-semibold">{t("social.signIn")}</UIActionLink></section>;
  }

  if (!hasCompanyProfile) {
    return <section className="mt-8 border border-primary/25 bg-primary/[0.04] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
        <div><h2 className="text-base font-semibold">{t("agreement.title")}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{t("agreement.companyDetailsFirst")}</p></div>
      </div>
      <UIActionLink href="/dashboard/ticket-validation" className="mt-5 inline-flex h-11 items-center justify-center  bg-[var(--ui-action)] px-4 text-sm font-semibold">{t("agreement.goToVerification")}</UIActionLink>
    </section>;
  }

  return <section className="mt-8 border border-primary/25 bg-primary/[0.04] p-5 sm:p-6">
    <div className="flex items-start gap-3">
      <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
      <div><h2 className="text-base font-semibold">{t("agreement.title")}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{t("agreement.hint")}</p></div>
    </div>
    <label className="mt-5 flex cursor-pointer items-start gap-3 border border-white/10 bg-black/10 p-3 text-sm leading-6 text-muted-foreground">
      <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]" />
      <span>{t("agreement.confirm", { version: AGREEMENT_VERSION })}</span>
    </label>
    {message && <p className="mt-3 text-sm text-amber-200">{message}</p>}
    <div className="mt-4 flex flex-wrap gap-3">
      <UIActionButton type="button" disabled={!accepted || submitting} onClick={accept} className="inline-flex h-11 items-center justify-center gap-2 px-4 text-sm font-semibold disabled:opacity-50">
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />} {t("agreement.accept")}
      </UIActionButton>
      <Link href="/dashboard/ticket-validation" className="inline-flex h-11 items-center justify-center rounded-lg border border-white/15 px-4 text-sm font-semibold transition hover:bg-white/5">{t("agreement.goToVerification")}</Link>
    </div>
  </section>;
}
