"use client";

import { TicketQuantityStepper } from "@/components/ui/TicketQuantityStepper";
import { type ReactNode } from "react";

import { changeTicketQuantity,ticketQuantityLimit } from "@packages/app-core/checkout/ticketAvailability";
import { PromoCodeField } from "@/features/events/PromoCodeField";
import { formatRon } from "@packages/app-core/events/serviceFee";


import type { TicketCheckoutDrawerModel } from "../useTicketCheckout";
import { StepCard } from "./primitives";

export function CheckoutTicketsStep({model, prices}: {model: Pick<TicketCheckoutDrawerModel, "busy" | "changeStep" | "furthestStep" | "onQuantitiesChange" | "promo" | "quantities" | "selectedTickets" | "step" | "t" | "ticketSummary">; prices: ReactNode}) {
 const { busy, changeStep, furthestStep, onQuantitiesChange, promo, quantities, selectedTickets, step, t, ticketSummary }=model;

 return (<StepCard
            number={1}
            title={t("checkout.tickets")}
            hint={t("checkout.ticketStepHint")}
            active={step === "tickets"}
            completed={furthestStep > 0}
            summary={ticketSummary}
            onEdit={() => changeStep("tickets")}
            disabled={busy}
          >
            <div className="divide-y divide-white/10">
              {selectedTickets.map((ticket) => {
                const maximumQuantity = ticketQuantityLimit(selectedTickets,quantities,ticket.id,Date.now());
                return (
                <div key={ticket.id} className="first:pt-0">
                  <p className="break-words text-lg font-bold text-primary">
                    {ticket.name}
                  </p>
                  <p className="mt-1 text-base font-semibold text-primary">
                    {formatRon(ticket.priceRon)}
                  </p>
                  {ticket.description && (
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-white/50">
                      {ticket.description}
                    </p>
                  )}
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-sm text-white/70">
                      {t("checkout.quantity")}
                    </span>
                    <TicketQuantityStepper name={ticket.name} value={quantities[ticket.id]??0} maximum={maximumQuantity} disabled={busy} testIDPrefix={'checkout-ticket-'+ticket.id}
                      onStep={delta=>onQuantitiesChange(changeTicketQuantity(selectedTickets,quantities,ticket.id,(quantities[ticket.id]??0)+delta))}/>
                  </div>
                </div>
                );
              })}
            </div>
            <div className="mt-4 border-t border-white/10 pt-4">
              {" "}
              <PromoCodeField
                code={promo.code}
                applied={promo.applied}
                error={promo.error}
                isValidating={promo.isValidating}
                onChange={promo.setCode}
                onApply={() => void promo.apply()}
                onClear={promo.clear}
              />
            </div>
            {prices}
          </StepCard>);
}
