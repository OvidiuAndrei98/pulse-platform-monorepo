"use client";

import { ChevronDown, Mail, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

const supportEmail = "contact@code-lab.ro";

export function OrganizerAccountClosure({ email }: { email: string }) {
  const { t } = useTranslation();
  const href = `mailto:${supportEmail}?subject=${encodeURIComponent(t("userProfile.closeManagedEmailSubject"))}&body=${encodeURIComponent(t("userProfile.closeManagedEmailBody", { email }))}`;
  return <details data-testid="organizer-account-closure" className="group rounded-3xl border border-red-500/15 bg-red-500/[0.03]">
    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-3xl p-5 [&::-webkit-details-marker]:hidden">
      <Trash2 className="h-[18px] w-[18px] shrink-0 text-red-400" />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block text-sm font-semibold text-red-400">{t("userProfile.closeManagedAccount")}</span>
        <span className="block text-[13px] leading-5 text-muted-foreground">{t("userProfile.closeManagedHint")}</span>
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
    </summary>
    <div className="space-y-5 px-5 pb-5">
      <p className="text-[13px] leading-5 text-muted-foreground">{t("userProfile.closeManagedWhy")}</p>
      <h3 className="text-sm font-semibold">{t("userProfile.closeManagedStepsTitle")}</h3>
      <ol className="space-y-3">
        {[1, 2, 3].map(step => <li key={step} className="flex gap-3 rounded-2xl bg-white/[0.03] p-4 text-[13px] leading-5">
          <span className="font-semibold text-primary">{step}</span>
          <span className="min-w-0 break-words text-muted-foreground">{t(`userProfile.closeManagedStep${step}`, { email, supportEmail })}</span>
        </li>)}
      </ol>
      <p className="text-[13px] leading-5 text-muted-foreground">{t("userProfile.closeManagedNoAutomatic")}</p>
      <a href={href} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 sm:w-auto">
        <Mail className="h-4 w-4" />{t("userProfile.closeManagedEmail")}
      </a>
      <p className="select-text text-xs text-muted-foreground">{supportEmail}</p>
    </div>
  </details>;
}
