"use client";

import { Check, LockKeyhole } from "lucide-react";
import { type ReactNode } from "react";

import { useTranslation } from "react-i18next";

export function PriceRow({
  label,
  value,
  highlighted = false,
}: {
  label: string;
  value: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-4 ${highlighted ? "text-primary" : "text-muted-foreground"}`}
    >
      <span>{label}</span>
      <span className="shrink-0">{value}</span>
    </div>
  );
}

export function StepCard({
  number,
  title,
  hint,
  active,
  completed,
  summary,
  onEdit,
  disabled,
  children,
}: {
  number: number;
  title: string;
  hint: string;
  active: boolean;
  completed: boolean;
  summary?: string;
  onEdit?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section
      className={
        "rounded-3xl border bg-[#151112] p-4 sm:p-5 " +
        (active
          ? "border-primary/60 shadow-[0_1px_20px_-10px_var(--color-primary)]"
          : "border-transparent")
      }
    >
      <div className="flex items-center gap-3">
        <span
          className={
            "grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold " +
            (active
              ? "bg-[var(--ui-action)] text-white"
              : completed
                ? "bg-emerald-500 text-white"
                : "text-white/30")
          }
        >
          {active ? (
            number
          ) : completed ? (
            <Check className="h-4 w-4" />
          ) : (
            <LockKeyhole className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className={
              "text-base font-semibold " +
              (!active && !completed ? "text-white/35" : "text-white")
            }
          >
            {title}
          </h3>
          {(active || completed) && (
            <p className="mt-1 text-xs leading-5 text-white/45">
              {active ? hint : summary}
            </p>
          )}
        </div>
        {!active && completed && onEdit && (
          <button
            type="button"
            disabled={disabled}
            onClick={onEdit}
            className="min-h-10 shrink-0 text-xs font-semibold text-primary disabled:opacity-40"
          >
            {t("checkout.editStep")}
          </button>
        )}
      </div>
      <div hidden={!active} className="mt-4 border-t border-white/10 pt-4">
        {children}
      </div>
    </section>
  );
}
