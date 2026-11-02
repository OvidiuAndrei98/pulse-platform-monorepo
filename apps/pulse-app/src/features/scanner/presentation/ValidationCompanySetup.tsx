"use client";

import { Loader2, ShieldCheck } from "lucide-react";

import { ActionButton as UIActionButton } from '@/components/ui/ActionButton';
import { Input as UIInput } from '@/components/ui/Field';

import type { TicketValidationWorkspaceModel } from "../useTicketValidation";

export function ValidationCompanySetup({model}: {model: Pick<TicketValidationWorkspaceModel, "agreementAccepted" | "companyName" | "cui" | "error" | "notice" | "profile" | "retryCompanyVerification" | "setAgreementAccepted" | "setCompanyName" | "setCui" | "submitCompany" | "submittingProfile" | "t">}) {
 const { agreementAccepted, companyName, cui, error, notice, profile, retryCompanyVerification, setAgreementAccepted, setCompanyName, setCui, submitCompany, submittingProfile, t }=model;

 return (<section className="rounded-xl border border-amber-400/25 bg-amber-400/[0.04] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-amber-300" />
              <div>
                <h1 className="text-xl font-semibold sm:text-2xl">
                  {t("validation.companyVerification")}
                </h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t("validation.companyHint")}
                </p>
              </div>
            </div>
            {profile?.verificationStatus === "pending" ? (
              <div className="mt-5 flex flex-col gap-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-amber-200">
                  {t("validation.companyPending")}
                </p>
                <button
                  type="button"
                  onClick={retryCompanyVerification}
                  className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-amber-300/30 px-3 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/10"
                >
                  {t("validation.verifyAgain")}
                </button>
              </div>
            ) : (
              <form onSubmit={submitCompany} className="mt-6 space-y-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                  <UIInput
                    value={cui}
                    onChange={(event) => setCui(event.target.value)}
                    placeholder={t("validation.cui")}
                    required
                    className="h-11"
                  />
                  <UIInput
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                    placeholder={t("validation.companyName")}
                    required
                    className="h-11"
                  />
                  <UIActionButton
                    type="submit"
                    disabled={submittingProfile || !agreementAccepted}
                    className="inline-flex h-11 items-center justify-center gap-2 px-4 text-sm font-semibold disabled:opacity-50"
                  >
                    {submittingProfile && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    {t("validation.verify")}
                  </UIActionButton>
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-black/10 p-3 text-xs leading-5 text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={agreementAccepted}
                    onChange={(event) =>
                      setAgreementAccepted(event.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
                  />
                  <span>
                    {t("validation.agreementPrefix")}{" "}
                    <a
                      href="/organizers/agreement"
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-primary hover:underline"
                    >
                      {t("validation.agreementLink")}
                    </a>
                    {t("validation.agreementSuffix")}
                  </span>
                </label>
              </form>
            )}
            {error && (
              <p role="alert" className="mt-4 text-sm text-red-400">
                {error}
              </p>
            )}
            {notice && <p className="mt-4 text-sm text-primary">{notice}</p>}
          </section>);
}
