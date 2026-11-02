"use client";
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';

export function HoldForHelp({ disabled, onComplete }: { disabled: boolean; onComplete: () => Promise<void> }) {
  const { t } = useTranslation();
  const timer = useRef<number | null>(null);
  const completedByHold = useRef(false);
  const [holding, setHolding] = useState(false);
  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  const beginHold = () => {
    if (disabled || timer.current !== null) return;
    completedByHold.current = false;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      completedByHold.current = true;
      setHolding(false);
      void onComplete();
    }, 1400);
  };
  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    beginHold();
  };
  useEffect(() => stop, []);
  return (
    <button
      data-chat-help-control
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (!event.repeat) beginHold();
      }}
      onKeyUp={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          stop();
        }
      }}
      onBlur={stop}
      onClick={(event) => {
        // Virtual screen-reader activation has no pointer hold gesture.
        if (disabled) return;
        if (event.detail !== 0) {
          completedByHold.current = false;
          return;
        }
        if (completedByHold.current) {
          completedByHold.current = false;
          return;
        }
        stop();
        void onComplete();
      }}
      aria-label={holding ? t("safetyGroup.keepHolding") : t("safetyGroup.holdForHelp")}
      className="relative flex min-h-11 w-full touch-none select-none items-center justify-center gap-2 overflow-hidden rounded-full border border-red-400/50 bg-red-500/10 px-5 py-2.5 text-sm font-semibold text-red-300 disabled:opacity-40"
    >
      {holding && <span className="absolute inset-y-0 left-0 animate-[help-fill_1.4s_linear_forwards] bg-red-500/25" />}
      <ShieldAlert className="relative h-5 w-5" /><span className="relative">{holding ? t("safetyGroup.keepHolding") : t("safetyGroup.holdForHelp")}</span>
    </button>
  );
}
