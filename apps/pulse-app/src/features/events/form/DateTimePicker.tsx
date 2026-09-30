"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Minus, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

const toLocalDateTime = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
const parseValue = (value: string) => { const date = value ? new Date(value) : new Date(); return Number.isNaN(date.getTime()) ? new Date() : date; };

export function DateTimePicker({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedDate = useMemo(() => parseValue(value), [value]);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const locale = i18n.language === "ro" ? "ro-RO" : "en-GB";
  const weekdayLabels = useMemo(() => Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2024, 0, index + 1))), [locale]);
  const displayPlaceholder = placeholder ?? t("datePicker.placeholder");
  useEffect(() => { if (open) setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)); }, [open, selectedDate]);
  useEffect(() => { const outside = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); }; const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; document.addEventListener("mousedown", outside); window.addEventListener("keydown", escape); return () => { document.removeEventListener("mousedown", outside); window.removeEventListener("keydown", escape); }; }, []);
  const calendarDays = useMemo(() => { const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1); const startOffset = (monthStart.getDay() + 6) % 7; const firstCell = new Date(monthStart); firstCell.setDate(firstCell.getDate() - startOffset); const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate(); const cellCount = Math.ceil((startOffset + daysInMonth) / 7) * 7; return Array.from({ length: cellCount }, (_, index) => { const date = new Date(firstCell); date.setDate(firstCell.getDate() + index); return date; }); }, [visibleMonth]);
  const updateDate = (nextDate: Date) => { const next = new Date(nextDate); next.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0); onChange(toLocalDateTime(next)); };
  const updateTime = (hours: string, minutes: string) => { const next = new Date(selectedDate); next.setHours(Number(hours), Number(minutes), 0, 0); onChange(toLocalDateTime(next)); };
  const adjustTime = (part: "hours" | "minutes", delta: number) => { const limit = part === "hours" ? 24 : 60; const current = part === "hours" ? selectedDate.getHours() : selectedDate.getMinutes(); const next = (current + delta + limit) % limit; updateTime(String(part === "hours" ? next : selectedDate.getHours()).padStart(2, "0"), String(part === "minutes" ? next : selectedDate.getMinutes()).padStart(2, "0")); };
  const buttonLabel = value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(selectedDate) : displayPlaceholder;

  return <div ref={rootRef} className="relative">
    <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)} className={`flex w-full items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-left text-sm outline-none transition focus:border-primary/30 focus:bg-white/[0.04] ${value ? "text-foreground" : "text-muted-foreground/40"}`}>
      <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate">{buttonLabel}</span>
      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
    {open && <div role="dialog" aria-label={displayPlaceholder} className="fixed inset-x-5 bottom-[calc(var(--native-safe-bottom)+6.5rem)] z-[120] max-h-[calc(100dvh-var(--native-safe-top)-8rem)] w-auto overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-[#171717]/[0.98] p-3 shadow-[0_20px_46px_rgba(0,0,0,0.5)] md:absolute md:inset-x-auto md:bottom-auto md:left-0 md:top-[calc(100%+0.5rem)] md:z-40 md:max-h-[calc(100dvh-2rem)] md:w-[min(18.5rem,calc(100vw-2.5rem))]">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground" aria-label={t("datePicker.previousMonth")}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold capitalize">{new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(visibleMonth)}</p>
        <button type="button" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground" aria-label={t("datePicker.nextMonth")}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {weekdayLabels.map((day, index) => <span key={`${day}-${index}`} className="pb-0.5 text-[9px] font-semibold uppercase text-muted-foreground">{day}</span>)}
        {calendarDays.map((day) => {
          const sameMonth = day.getMonth() === visibleMonth.getMonth();
          const selected = day.toDateString() === selectedDate.toDateString();
          const today = day.toDateString() === new Date().toDateString();
          return <button key={day.toISOString()} type="button" onClick={() => updateDate(day)} className={`grid h-8 place-items-center rounded-xl text-xs transition ${selected ? "bg-primary font-semibold text-primary-foreground" : sameMonth ? "text-foreground hover:bg-white/[0.06]" : "text-muted-foreground/35 hover:bg-white/[0.04]"} ${today && !selected ? "ring-1 ring-primary/50" : ""}`}>{day.getDate()}</button>;
        })}
      </div>
      <div className="mt-3 border-t border-white/10 pt-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("datePicker.time")}</p>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <TimeStepper value={selectedDate.getHours()} max={23} onDecrease={() => adjustTime("hours", -1)} onIncrease={() => adjustTime("hours", 1)} onValueChange={(hours) => updateTime(String(hours).padStart(2, "0"), String(selectedDate.getMinutes()).padStart(2, "0"))} />
          <span className="text-sm font-semibold text-muted-foreground">:</span>
          <TimeStepper value={selectedDate.getMinutes()} max={59} onDecrease={() => adjustTime("minutes", -1)} onIncrease={() => adjustTime("minutes", 1)} onValueChange={(minutes) => updateTime(String(selectedDate.getHours()).padStart(2, "0"), String(minutes).padStart(2, "0"))} />
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => onChange(toLocalDateTime(new Date()))} className="rounded-full px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10">{t("datePicker.now")}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">{t("datePicker.done")}</button>
      </div>
    </div>}
  </div>;
}

export function TimePicker({ value, onChange, compact = false, className }: { value: string; onChange: (value: string) => void; compact?: boolean; className?: string }) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [hours, minutes] = /^\d{2}:\d{2}$/.test(value) ? value.split(":").map(Number) : [20, 0];
  const emit = (nextHours: number, nextMinutes: number) => onChange(`${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`);
  const adjust = (part: "hours" | "minutes", delta: number) => {
    if (part === "hours") emit((hours + delta + 24) % 24, minutes);
    else emit(hours, (minutes + delta + 60) % 60);
  };

  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return <div ref={rootRef} className="relative">
    <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)} className={`flex w-full items-center border border-white/10 text-left text-foreground outline-none transition focus:border-primary/60 ${className ?? (compact ? "h-8 gap-1.5 rounded-md bg-background px-2 text-xs" : "h-10 gap-2 rounded-md bg-background px-3 text-sm")}`}>
      <Clock className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} shrink-0 text-primary`} />
      <span className={`flex-1 tabular-nums ${value ? "text-foreground" : "text-muted-foreground"}`}>{value || "--:--"}</span>
    </button>
    {open && <div role="dialog" aria-label={t("datePicker.time")} className="fixed inset-x-5 bottom-[calc(var(--native-safe-bottom)+6.5rem)] z-[120] rounded-2xl border border-white/15 bg-[#171717]/[0.98] p-4 shadow-[0_20px_46px_rgba(0,0,0,0.5)] md:absolute md:inset-x-auto md:bottom-auto md:left-0 md:top-[calc(100%+0.5rem)] md:z-50 md:w-64">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("datePicker.time")}</p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TimeStepper value={hours} max={23} onDecrease={() => adjust("hours", -1)} onIncrease={() => adjust("hours", 1)} onValueChange={(next) => emit(next, minutes)} />
        <span className="text-sm font-semibold text-muted-foreground">:</span>
        <TimeStepper value={minutes} max={59} onDecrease={() => adjust("minutes", -5)} onIncrease={() => adjust("minutes", 5)} onValueChange={(next) => emit(hours, next)} />
      </div>
      <button type="button" onClick={() => setOpen(false)} className="mt-4 h-9 w-full rounded-full bg-primary text-xs font-semibold text-primary-foreground">{t("datePicker.done")}</button>
    </div>}
  </div>;
}

function TimeStepper({ value, max, onDecrease, onIncrease, onValueChange }: { value: number; max: number; onDecrease: () => void; onIncrease: () => void; onValueChange: (value: number) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(String(value).padStart(2, "0"));
  useEffect(() => { setDraft(String(value).padStart(2, "0")); }, [value]);
  const commit = () => { if (!draft) { setDraft(String(value).padStart(2, "0")); return; } const nextValue = Math.min(max, Math.max(0, Number(draft))); onValueChange(nextValue); setDraft(String(nextValue).padStart(2, "0")); };
  return <div className="flex h-9 items-center justify-between rounded-full border border-white/[0.08] bg-white/[0.03] p-1"><button type="button" onClick={onDecrease} aria-label={t("datePicker.decrease")} className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition hover:bg-white/[0.08] hover:text-foreground"><Minus className="h-3 w-3" /></button><input type="text" inputMode="numeric" value={draft} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setDraft(event.target.value.replace(/\D/g, "").slice(0, 2))} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} aria-label={t("datePicker.enterValue")} className="w-8 bg-transparent text-center text-sm font-semibold tabular-nums outline-none" /><button type="button" onClick={onIncrease} aria-label={t("datePicker.increase")} className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition hover:bg-white/[0.08] hover:text-foreground"><Plus className="h-3 w-3" /></button></div>;
}
