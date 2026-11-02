"use client";

import { Minus, Plus } from "lucide-react";
import { type ReactNode } from "react";

import { getRemainingTicketCapacity } from "@/features/checkout/TicketTypeSelector";
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
                const maximumQuantity = Math.min(8, getRemainingTicketCapacity(ticket));
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
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={busy || (quantities[ticket.id] ?? 0) <= 1}
                        onClick={() =>
                          onQuantitiesChange({
                            ...quantities,
                            [ticket.id]: Math.max(
                              1,
                              (quantities[ticket.id] ?? 0) - 1,
                            ),
                          })
                        }
                        aria-label={t("checkout.decreaseQuantity", {
                          name: ticket.name,
                        })}
                        className="grid h-10 w-10 place-items-center rounded-full border border-white/40 disabled:opacity-25"
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span
                        className="min-w-5 text-center text-base"
                        aria-live="polite"
                      >
                        {quantities[ticket.id] ?? 0}
                      </span>
                      <button
                        type="button"
                        disabled={busy || (quantities[ticket.id] ?? 0) >= maximumQuantity}
                        onClick={() =>
                          onQuantitiesChange({
                            ...quantities,
                            [ticket.id]: Math.min(
                              maximumQuantity,
                              (quantities[ticket.id] ?? 0) + 1,
                            ),
                          })
                        }
                        aria-label={t("checkout.increaseQuantity", {
                          name: ticket.name,
                        })}
                        className="grid h-10 w-10 place-items-center rounded-full border border-white/70 disabled:opacity-25"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
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
