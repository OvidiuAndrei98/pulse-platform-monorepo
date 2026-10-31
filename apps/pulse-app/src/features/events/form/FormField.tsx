"use client";
import { Minus, Plus } from "lucide-react";
import { ReactNode } from "react";
import {Field,Input,fieldClass,useFieldState} from '@/components/ui/Field';
import {useTranslation} from 'react-i18next';

export const eventInputClass = fieldClass;

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
  return <Field label={label} error={error} className="w-full">{children}</Field>;
}

export function StepperInput({
  value,
  onChange,
  step = 1,
  min = 0,
  disabled = false,
  id,label,invalid,describedBy,
}: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  disabled?: boolean;
  id?:string;label?:string;invalid?:boolean;describedBy?:string;
}) {
  const field=useFieldState();id??=field?.id;label??=field?.label;invalid??=field?.invalid;describedBy??=field?.errorId;
  const {t}=useTranslation(),name=label??t('ui.quantity');
  return (
    <div className={`flex h-[42px] items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.02] p-1 ${disabled ? "opacity-45" : ""}`}>
      <button
        type="button"
        aria-label={t('ui.decrease',{field:name})}
        disabled={disabled}
        onClick={() => onChange(Math.max(min, value - step))}
        className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <Input bare
        id={id} aria-label={name} aria-invalid={invalid} aria-describedby={describedBy}
        type="number"
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(Math.max(min, Number(event.target.value) || 0))
        }
        className="w-full bg-transparent text-center text-sm font-medium  [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        aria-label={t('ui.increase',{field:name})}
        disabled={disabled}
        onClick={() => onChange(value + step)}
        className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
