"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Minus, Plus } from "lucide-react";

const weekdayLabels = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sa", "Du"];
const toLocalDateTime = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

const parseValue = (value: string) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Alege data si ora",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedDate = useMemo(() => parseValue(value), [value]);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );

  useEffect(() => {
    if (open) setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  }, [open, selectedDate]);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const calendarDays = useMemo(() => {
    const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const startOffset = (monthStart.getDay() + 6) % 7;
    const firstCell = new Date(monthStart);
    firstCell.setDate(firstCell.getDate() - startOffset);
    const daysInMonth = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + 1,
      0,
    ).getDate();
    const cellCount = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    return Array.from({ length: cellCount }, (_, index) => {
      const date = new Date(firstCell);
      date.setDate(firstCell.getDate() + index);
      return date;
    });
  }, [visibleMonth]);

  const updateDate = (nextDate: Date) => {
    const next = new Date(nextDate);
    next.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
    onChange(toLocalDateTime(next));
  };
  const updateTime = (hours: string, minutes: string) => {
    const next = new Date(selectedDate);
    next.setHours(Number(hours), Number(minutes), 0, 0);
    onChange(toLocalDateTime(next));
  };
  const adjustTime = (part: "hours" | "minutes", delta: number) => {
    const limit = part === "hours" ? 24 : 60;
    const current = part === "hours" ? selectedDate.getHours() : selectedDate.getMinutes();
    const next = (current + delta + limit) % limit;
    updateTime(
      String(part === "hours" ? next : selectedDate.getHours()).padStart(2, "0"),
      String(part === "minutes" ? next : selectedDate.getMinutes()).padStart(2, "0"),
    );
  };
  const buttonLabel = value
    ? new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium", timeStyle: "short" }).format(selectedDate)
    : placeholder;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-left text-sm outline-none transition focus:border-primary/30 focus:bg-white/[0.04] ${
          value ? "text-foreground" : "text-muted-foreground/40"
        }`}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate">{buttonLabel}</span>
        <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div role="dialog" aria-label={placeholder} className="absolute left-0 top-[calc(100%+0.5rem)] z-40 max-h-[calc(100dvh-2rem)] w-[min(18.5rem,calc(100vw-2.5rem))] overflow-y-auto rounded-2xl border border-white/15 bg-[oklch(0.18_0.02_150_/_98%)] p-3 shadow-[0_20px_46px_rgba(0,0,0,0.5)] [scrollbar-color:rgba(255,255,255,0.16)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar]:w-1.5">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground" aria-label="Luna anterioara"><ChevronLeft className="h-4 w-4" /></button>
            <p className="text-sm font-semibold capitalize">{new Intl.DateTimeFormat("ro-RO", { month: "long", year: "numeric" }).format(visibleMonth)}</p>
            <button type="button" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground" aria-label="Luna urmatoare"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {weekdayLabels.map((day) => <span key={day} className="pb-0.5 text-[9px] font-semibold uppercase text-muted-foreground">{day}</span>)}
            {calendarDays.map((day) => {
              const sameMonth = day.getMonth() === visibleMonth.getMonth();
              const selected = day.toDateString() === selectedDate.toDateString();
              const today = day.toDateString() === new Date().toDateString();
              return <button key={day.toISOString()} type="button" onClick={() => updateDate(day)} className={`grid h-8 place-items-center rounded-xl text-xs transition ${selected ? "bg-primary font-semibold text-primary-foreground" : sameMonth ? "text-foreground hover:bg-white/[0.06]" : "text-muted-foreground/35 hover:bg-white/[0.04]"} ${today && !selected ? "ring-1 ring-primary/50" : ""}`}>{day.getDate()}</button>;
            })}
          </div>
          <div className="mt-3 border-t border-white/10 pt-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ora</p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <TimeStepper value={selectedDate.getHours()} max={23} onDecrease={() => adjustTime("hours", -1)} onIncrease={() => adjustTime("hours", 1)} onValueChange={(hours) => updateTime(String(hours).padStart(2, "0"), String(selectedDate.getMinutes()).padStart(2, "0"))} />
              <span className="text-sm font-semibold text-muted-foreground">:</span>
              <TimeStepper value={selectedDate.getMinutes()} max={59} onDecrease={() => adjustTime("minutes", -1)} onIncrease={() => adjustTime("minutes", 1)} onValueChange={(minutes) => updateTime(String(selectedDate.getHours()).padStart(2, "0"), String(minutes).padStart(2, "0"))} />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => onChange(toLocalDateTime(new Date()))} className="rounded-full px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10">Acum</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Gata</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TimeStepper({
  value,
  max,
  onDecrease,
  onIncrease,
  onValueChange,
}: {
  value: number;
  max: number;
  onDecrease: () => void;
  onIncrease: () => void;
  onValueChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value).padStart(2, "0"));

  useEffect(() => {
    setDraft(String(value).padStart(2, "0"));
  }, [value]);

  const commit = () => {
    if (!draft) {
      setDraft(String(value).padStart(2, "0"));
      return;
    }
    const nextValue = Math.min(max, Math.max(0, Number(draft)));
    onValueChange(nextValue);
    setDraft(String(nextValue).padStart(2, "0"));
  };

  return (
    <div className="flex h-9 items-center justify-between rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
      <button type="button" onClick={onDecrease} aria-label="Scade" className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition hover:bg-white/[0.08] hover:text-foreground"><Minus className="h-3 w-3" /></button>
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, "").slice(0, 2))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        aria-label="Introdu valoarea"
        className="w-8 bg-transparent text-center text-sm font-semibold tabular-nums outline-none"
      />
      <button type="button" onClick={onIncrease} aria-label="Creste" className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition hover:bg-white/[0.08] hover:text-foreground"><Plus className="h-3 w-3" /></button>
    </div>
  );
}
