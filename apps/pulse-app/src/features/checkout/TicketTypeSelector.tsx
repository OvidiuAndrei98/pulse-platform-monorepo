"use client";

import { useEffect, useId, useState } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TicketTier } from "@/core/DataProvider";
import { formatRon } from "@/features/events/serviceFee";

import { getTicketAvailability, getRemainingTicketCapacity, isTicketSelectionAvailable } from "./ticketAvailability";
export { getTicketAvailability, getRemainingTicketCapacity, isTicketSelectionAvailable } from "./ticketAvailability";
export type { TicketAvailability } from "./ticketAvailability";

export function TicketTypeSelector({
  tickets,
  quantities,
  onChange,
  disabled,
}: {
  tickets: readonly TicketTier[];
  quantities: Record<string, number>;
  onChange: (value: Record<string, number>) => void;
  disabled?: boolean;
}) {
  const name = useId();
  const { t } = useTranslation();
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    let timeoutId: number | undefined;

    const refreshAvailability = () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      const now = Date.now();
      setNowMs(now);

      const nextBoundary = tickets
        .flatMap((ticket) => [Date.parse(ticket.startSales), Date.parse(ticket.endSales)])
        .filter((boundary) => Number.isFinite(boundary) && boundary > now)
        .sort((left, right) => left - right)[0];
      const delay = nextBoundary === undefined
        ? 60_000
        : Math.min(60_000, Math.max(250, nextBoundary - now + 50));
      timeoutId = window.setTimeout(refreshAvailability, delay);
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refreshAvailability();
      }
    };

    refreshAvailability();
    window.addEventListener("focus", refreshAvailability);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshAvailability);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [tickets]);

  useEffect(() => {
    if (nowMs === null) return;
    const ticketsById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
    const hasUnavailableSelection = Object.entries(quantities).some(([ticketId, quantity]) => {
      if (quantity <= 0) return false;
      const ticket = ticketsById.get(ticketId);
      return !ticket || getTicketAvailability(ticket, nowMs) !== "available";
    });
    if (hasUnavailableSelection) {
      onChange({});
    }
  }, [nowMs, onChange, quantities, tickets]);

  return (
    <fieldset className="space-y-2.5" disabled={disabled}>
      <legend className="sr-only">{t("checkout.selectTickets")}</legend>
      {tickets.map((ticket) => {
        const availability = getTicketAvailability(ticket, nowMs);
        const unavailable = availability !== "available";
        const selected = !unavailable && (quantities[ticket.id] ?? 0) > 0;
        const status =
          availability === "sold-out"
            ? t("checkout.soldOut")
            : availability === "sales-ended"
              ? t("checkout.salesEnded")
              : availability === "sales-not-started"
                ? t("checkout.salesNotStarted")
                : null;
        return (
          <label
            key={ticket.id}
            aria-disabled={disabled || unavailable}
            className={`relative flex items-center gap-3 rounded-2xl border px-4 py-4 transition-colors ${disabled || unavailable ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${selected ? "border-primary bg-primary/10" : unavailable ? "border-white/[0.07] bg-white/[0.02]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"}`}
          >
            <input
              type="radio"
              name={name}
              value={ticket.id}
              checked={selected}
              disabled={disabled || unavailable}
              onChange={() => {
                if (!disabled && !unavailable) {
                  onChange({ [ticket.id]: 1 });
                }
              }}
              className="peer sr-only"
            />
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-primary ${selected ? "border-primary bg-primary text-white" : "border-white/30"}`}
            >
              {selected && <Check className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-semibold text-white">
                {ticket.name}
              </span>
              {ticket.description && (
                <span className="mt-1 block break-words text-xs leading-5 text-white/50">
                  {ticket.description}
                </span>
              )}
            </span>
            {status ? (
              <span className="shrink-0 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
                {status}
              </span>
            ) : (
              <span className="shrink-0 text-sm font-bold text-primary">
                {ticket.priceRon === 0 ? t("checkout.free") : formatRon(ticket.priceRon)}
              </span>
            )}
          </label>
        );
      })}
    </fieldset>
  );
}
