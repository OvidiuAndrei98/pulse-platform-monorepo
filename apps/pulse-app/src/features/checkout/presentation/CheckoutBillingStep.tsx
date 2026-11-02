"use client";

import { Check, CreditCard, Loader2 } from "lucide-react";

import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

import { InvoiceDetailsFields } from "@/features/checkout/InvoiceDetailsFields";

import { Input as UIInput } from '@/components/ui/Field';

import type { TicketCheckoutDrawerModel } from "../useTicketCheckout";
import { StepCard } from "./primitives";

export function CheckoutBillingStep({model}: {model: Pick<TicketCheckoutDrawerModel, "billingErrors" | "billingLoading" | "billingSource" | "busy" | "changeStep" | "emailError" | "event" | "forgetBilling" | "furthestStep" | "guestEmail" | "id" | "invoiceDetails" | "promo" | "rememberBilling" | "savedBilling" | "setBillingAttempted" | "setBillingSource" | "setGuestEmail" | "setInvoiceDetails" | "setRememberBilling" | "step" | "t" | "ticketCount" | "signedIn">}) {
 const { billingErrors, billingLoading, billingSource, busy, changeStep, emailError, event, forgetBilling, furthestStep, guestEmail, id, invoiceDetails, promo, rememberBilling, savedBilling, setBillingAttempted, setBillingSource, setGuestEmail, setInvoiceDetails, setRememberBilling, step, t, ticketCount, signedIn }=model;

 return (<StepCard
            number={2}
            title={t("checkout.billingPayment")}
            hint={t("checkout.billingStepHint")}
            active={step === "billing"}
            completed={furthestStep > 1}
            summary={
              invoiceDetails.name + " \u00b7 " + t("checkout.stripePayment")
            }
            onEdit={() => changeStep("billing")}
            disabled={
              busy || !ticketCount || Boolean(promo.code && !promo.applied)
            }
          >
            <div className="mb-5 flex items-center gap-3 rounded-2xl border border-primary/60 bg-primary/5 p-4">
              <CreditCard className="h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold">
                  {t("checkout.stripePayment")}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-white/50">
                  {t("checkout.stripeRedirectHint")}
                </p>
              </div>
              <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />
            </div>
            <label
              className="block text-sm font-semibold"
              htmlFor={id + "-email"}
            >
              {t("eventSheet.emailForTickets")}
            </label>
            <UIInput
              required
              id={id + "-email"}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={guestEmail}
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? id + "-email-error" : undefined}
              onChange={(inputEvent) => setGuestEmail(inputEvent.target.value)}
              placeholder={t("checkout.emailPlaceholder")}
              className="mt-2 h-11 w-full transition placeholder:text-muted-foreground sm:text-sm"
            />
            {emailError && (
              <p
                id={id + "-email-error"}
                role="alert"
                className="mt-1.5 text-xs text-red-400"
              >
                {t(emailError)}
              </p>
            )}
            {!signedIn && (
              <GoogleSignInButton
                returnTo={`/events/${event.id}?checkout=1`}
                className="mt-3 h-11 rounded-xl text-xs"
              />
            )}
            {billingLoading ? (
              <div className="mt-4 flex min-h-20 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02]">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="sr-only">{t("common.loading")}</span>
              </div>
            ) : (
              <>
                {savedBilling && (
                  <div
                    role="radiogroup"
                    aria-label={t("checkout.billingDetailsChoice")}
                    className="mt-4 space-y-2"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={billingSource === "saved"}
                      disabled={busy}
                      onClick={() => {
                        setBillingSource("saved");
                        setInvoiceDetails({ ...savedBilling });
                        setBillingAttempted(false);
                        setRememberBilling(false);
                      }}
                      className={`w-full rounded-xl border p-3.5 text-left transition disabled:opacity-40 ${
                        billingSource === "saved"
                          ? "border-primary/70 bg-primary/10"
                          : "border-white/10 bg-white/[0.02]"
                      }`}
                    >
                      <span className="block text-sm font-semibold">
                        {t("checkout.useSavedBilling")}
                      </span>
                      <span className="mt-1 block break-words text-xs leading-5 text-white/55">
                        {savedBilling.name}
                        {" \u00b7 "}
                        {savedBilling.address}, {savedBilling.city}
                      </span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={billingSource === "new"}
                      disabled={busy}
                      onClick={() => {
                        setBillingSource("new");
                        setInvoiceDetails({ ...savedBilling });
                        setBillingAttempted(false);
                        setRememberBilling(true);
                      }}
                      className={`w-full rounded-xl border p-3.5 text-left text-sm font-semibold transition disabled:opacity-40 ${
                        billingSource === "new"
                          ? "border-primary/70 bg-primary/10"
                          : "border-white/10 bg-white/[0.02]"
                      }`}
                    >
                      {t("checkout.useOtherBilling")}
                    </button>
                  </div>
                )}

                {billingSource === "saved" && savedBilling ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void forgetBilling()}
                    className="mt-2 min-h-10 text-xs text-white/50 underline disabled:opacity-40"
                  >
                    {t("checkout.removeSavedBilling")}
                  </button>
                ) : (
                  <>
                    <InvoiceDetailsFields
                      value={invoiceDetails}
                      onChange={setInvoiceDetails}
                      idPrefix={id}
                      errors={billingErrors}
                    />

                    {signedIn && (
                      <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={rememberBilling}
                          disabled={busy}
                          onChange={(event) =>
                            setRememberBilling(event.target.checked)
                          }
                          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                        />
                        <span>
                          {t(
                            savedBilling
                              ? "checkout.replaceSavedBilling"
                              : "checkout.rememberBilling",
                          )}
                          <span className="mt-1 block text-xs leading-5 text-white/45">
                            {t("checkout.rememberBillingHint")}
                          </span>
                        </span>
                      </label>
                    )}
                  </>
                )}
              </>
            )}
          </StepCard>);
}
