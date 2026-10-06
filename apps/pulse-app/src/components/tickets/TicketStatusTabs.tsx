"use client";

import { useState } from "react";
import { Receipt, Ticket } from "lucide-react";
import { useTranslation } from "react-i18next";

type TicketTab = "active" | "history";

export function TicketStatusTabs({ value, onChange, activeCount }: {
  value: TicketTab;
  onChange: (value: TicketTab) => void;
  activeCount: number;
}) {
  const { t } = useTranslation();
  const [animate, setAnimate] = useState(false);
  return (
    <div role="group" aria-label={t("userProfile.ticketsOrders")} className="relative isolate grid shrink-0 grid-cols-2 rounded-full border border-white/10 bg-white/5 p-1 md:hidden">
      {/* The pill moves only inside this control. Page scroll, modal locks and
          route restoration must never participate in its animation. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-primary ${animate ? "motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out" : ""}`}
        style={{ transform: value === "history" ? "translateX(100%)" : "translateX(0)" }}
        onTransitionEnd={() => setAnimate(false)}
      />
      {(["active", "history"] as const).map((tab) => {
        const selected = value === tab;
        const Icon = tab === "active" ? Ticket : Receipt;
        return (
          <button
            key={tab}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              if (selected) return;
              setAnimate(true);
              onChange(tab);
            }}
            className={`relative z-10 flex min-h-9 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${selected ? "text-black" : "text-zinc-400 hover:text-white"}`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t(tab === "active" ? "userProfile.active" : "userProfile.history")}
            {tab === "active" && (
              <span className={`ml-1 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums transition-colors duration-200 ${selected ? "bg-black/90 text-primary" : "bg-primary/20 text-primary"}`}>
                {activeCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
