"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiClient, ApiError } from "@packages/api-client/src/Client";

export interface AppliedEventPromoCode {
  code: string;
  discountPercent: number;
}

export type EventPromoCodeError = "invalid" | "unavailable" | null;

export function useEventPromoCode(eventId: string) {
  const [code, setCodeState] = useState("");
  const [applied, setApplied] = useState<AppliedEventPromoCode | null>(null);
  const [error, setValidationFailure] = useState<EventPromoCodeError>(null);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    setCodeState("");
    setApplied(null);
    setValidationFailure(null);
    setIsValidating(false);
  }, [eventId]);

  const setCode = useCallback((value: string) => {
    const normalized = value
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "")
      .slice(0, 40);
    setCodeState(normalized);
    setApplied(null);
    setValidationFailure(null);
  }, []);

  const apply = useCallback(async () => {
    const normalized = code.trim();
    if (normalized.length < 3 || isValidating) {
      setValidationFailure("invalid");
      return null;
    }

    setIsValidating(true);
    setValidationFailure(null);
    try {
      const result = await ApiClient.instance.post(
        "/events/{id}/promo-code/validate",
        {
          params: { path: { id: eventId } },
          body: { code: normalized },
        },
      );
      setCodeState(result.code);
      setApplied(result);
      return result;
    } catch (requestError) {
      setApplied(null);
      setValidationFailure(
        requestError instanceof ApiError && requestError.status < 500
          ? "invalid"
          : "unavailable",
      );
      return null;
    } finally {
      setIsValidating(false);
    }
  }, [code, eventId, isValidating]);

  const clear = useCallback(() => {
    setCodeState("");
    setApplied(null);
    setValidationFailure(null);
  }, []);

  return { code, setCode, applied, error, isValidating, apply, clear };
}

export function discountedUnitPrice(priceRon: number, discountPercent: number) {
  if (discountPercent <= 0) return priceRon;
  return Math.max(1, Math.floor((priceRon * (100 - discountPercent) + 50) / 100));
}
