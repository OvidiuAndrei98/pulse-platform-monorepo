import { Minus, Plus } from "lucide-react";
import { ReactNode } from "react";

export const eventInputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/60 focus:bg-white/[0.04] color-scheme-dark";

export function FormField({
  label,
  compact,
  error,
  children,
}: {
  label: string;
  compact?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <label
          className={`block font-medium text-foreground/85 ${compact ? "text-xs" : "text-sm"}`}
        >
          {label}
        </label>
        {error && (
          <span role="alert" className="text-xs text-red-400">
            {error}
          </span>
        )}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export function StepperInput({
  value,
  onChange,
  step = 1,
  min = 0,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  disabled?: boolean;
}) {
  return (
    <div className={`flex h-[42px] items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.02] p-1 ${disabled ? "opacity-45" : ""}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(Math.max(min, value - step))}
        className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(Math.max(min, Number(event.target.value) || 0))
        }
        className="w-full bg-transparent text-center text-sm font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(value + step)}
        className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
