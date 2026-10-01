"use client";

import { useId } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TicketTier } from "@/core/DataProvider";
import { formatRon } from "@/features/events/serviceFee";

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
  return (
    <fieldset className="space-y-2.5" disabled={disabled}>
      <legend className="sr-only">{t("checkout.selectTickets")}</legend>
      {tickets.map((ticket) => {
        const selected = (quantities[ticket.id] ?? 0) > 0;
        return (
          <label
            key={ticket.id}
            className={`relative flex items-center gap-3 rounded-2xl border px-4 py-4 transition-colors ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${selected ? "border-primary bg-primary/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"}`}
          >
            <input
              type="radio"
              name={name}
              value={ticket.id}
              checked={selected}
              onChange={() => onChange({ [ticket.id]: 1 })}
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
            <span className="shrink-0 text-sm font-bold text-primary">
              {ticket.priceRon === 0 ? t("checkout.free") : formatRon(ticket.priceRon)}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
