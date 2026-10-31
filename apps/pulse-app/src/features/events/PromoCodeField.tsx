"use client";

import { Check, Loader2, X } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { AppliedEventPromoCode, EventPromoCodeError } from "./useEventPromoCode";
import {ActionButton as UIActionButton} from '@/components/ui/ActionButton';
import {Input as UIInput} from '@/components/ui/Field';

interface PromoCodeFieldProps {
  code: string;
  applied: AppliedEventPromoCode | null;
  error: EventPromoCodeError;
  isValidating: boolean;
  onChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
}

export function PromoCodeField({
  code,
  applied,
  error,
  isValidating,
  onChange,
  onApply,
  onClear,
}: PromoCodeFieldProps) {
  const { t } = useTranslation();
  const inputId = useId();

  return (
    <div className="border-b border-white/10 pb-3">
      <label className="block text-xs font-semibold text-foreground/80" htmlFor={inputId}>
        {t("auth.promoCode")}
      </label>
      <div className="mt-2 flex gap-2">
        <UIInput
          id={inputId}
          value={code}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onApply();
            }
          }}
          disabled={Boolean(applied)}
          maxLength={40}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t("auth.promoPlaceholder")}
          className="h-10 min-w-0 flex-1 font-semibold uppercase tracking-wide transition placeholder:text-muted-foreground disabled:opacity-75"
        />
        {applied ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={t("checkout.removePromo")}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <UIActionButton
            type="button"
            onClick={onApply}
            disabled={code.length < 3 || isValidating}
            className="h-10 shrink-0 px-3.5 text-xs font-semibold transition hover:brightness-110 disabled:opacity-40"
          >
            {isValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : t("checkout.applyPromo")}
          </UIActionButton>
        )}
      </div>
      {applied && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary">
          <Check className="h-3.5 w-3.5" />
          {t("checkout.promoApplied", { percent: applied.discountPercent })}
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs font-medium text-red-400">
          {t(error === "invalid" ? "checkout.promoInvalid" : "checkout.promoValidationFailed")}
        </p>
      )}
    </div>
  );
}
