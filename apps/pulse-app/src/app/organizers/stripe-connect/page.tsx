"use client";

import Link from "next/link";
import { ArrowRight, Building2, CreditCard, ShieldCheck, WalletCards } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function StripeConnectPage() {
  const { t } = useTranslation();
  const steps = [
    { icon: Building2, title: t("stripeConnect.stepCompanyTitle"), text: t("stripeConnect.stepCompanyText") },
    { icon: CreditCard, title: t("stripeConnect.stepStripeTitle"), text: t("stripeConnect.stepStripeText") },
    { icon: WalletCards, title: t("stripeConnect.stepSalesTitle"), text: t("stripeConnect.stepSalesText") },
  ];
  return <main className="app-page-spacing mx-auto min-h-screen max-w-3xl text-foreground">
    <Link href="/" className="text-xs font-semibold text-primary transition hover:opacity-80">SPOTTR</Link>
    <header className="mt-7 border-b border-white/10 pb-8"><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{t("stripeConnect.eyebrow")}</p><h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{t("stripeConnect.title")}</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">{t("stripeConnect.intro")}</p></header>
    <section className="grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-3">{steps.map(({ icon: Icon, title, text }) => <article key={title} className="bg-[#101311] p-5"><span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><h2 className="mt-5 text-sm font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></article>)}</section>
    <section className="mt-8 border border-white/10 bg-white/[0.03] p-5 sm:p-6"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="text-base font-semibold">{t("stripeConnect.organizerResponsibility")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("stripeConnect.organizerResponsibilityText")}</p></div></div></section>
    <section className="mt-8 border border-primary/25 bg-primary/[0.04] p-5"><h2 className="text-base font-semibold">{t("stripeConnect.beforeActivation")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("stripeConnect.beforeActivationText")}</p><Link href="/organizers/agreement" className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">{t("stripeConnect.viewAgreement")} <ArrowRight className="h-4 w-4" /></Link></section>
  </main>;
}
