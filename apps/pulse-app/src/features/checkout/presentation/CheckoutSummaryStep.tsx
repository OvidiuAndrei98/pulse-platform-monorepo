"use client";

import { type ReactNode } from "react";

import { formatRon } from "@packages/app-core/events/serviceFee";


import type { TicketCheckoutDrawerModel } from "../useTicketCheckout";
import { StepCard, PriceRow } from "./primitives";

export function CheckoutSummaryStep({model, prices}: {model: Pick<TicketCheckoutDrawerModel, "guestEmail" | "invoiceDetails" | "quantities" | "selectedTickets" | "step" | "t">; prices: ReactNode}) {
 const { guestEmail, invoiceDetails, quantities, selectedTickets, step, t }=model;

 return (<StepCard
            number={3}
            title={t("checkout.orderSummary")}
            hint={t("checkout.summaryStepHint")}
            active={step === "summary"}
            completed={false}
          >
            <div className="space-y-2 text-sm">
              {selectedTickets.map((ticket) => (
                <PriceRow
                  key={ticket.id}
                  label={quantities[ticket.id] + " \u00d7 " + ticket.name}
                  value={formatRon(
                    (quantities[ticket.id] ?? 0) * ticket.priceRon,
                  )}
                />
              ))}
            </div>
            {prices}
            <div className="mt-5 space-y-1 border-t border-white/10 pt-4 text-xs leading-5 text-white/55">
              <p className="break-all">{guestEmail}</p>
              <p className="font-semibold text-white/80">
                {invoiceDetails.name}
              </p>
              {invoiceDetails.type === "company" && (
                <p>
                  {invoiceDetails.taxId} {invoiceDetails.registrationNumber}
                </p>
              )}
              <p className="break-words">
                {[
                  invoiceDetails.address,
                  invoiceDetails.city,
                  invoiceDetails.sector || invoiceDetails.county,
                  invoiceDetails.country,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <p>{t("checkout.stripePayment")}</p>
            </div>
          </StepCard>);
}
