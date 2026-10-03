"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const generation = useRef(0);
  const pending = useRef<number | null>(null);
  const currentEvent = useRef(eventId);
  currentEvent.current = eventId;

  useEffect(() => {
    generation.current++;
    pending.current = null;
    setCodeState("");
    setApplied(null);
    setValidationFailure(null);
    setIsValidating(false);
    return () => { generation.current++; pending.current = null; };
  }, [eventId]);

  const setCode = useCallback((value: string) => {
    generation.current++;
    pending.current = null;
    setIsValidating(false);
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
    if (pending.current !== null) return null;
    if (normalized.length < 3) {
      setValidationFailure("invalid");
      return null;
    }

    const request = ++generation.current;
    pending.current = request;
    const isCurrent = () => request === generation.current && currentEvent.current === eventId;
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
      if (!isCurrent()) return null;
      setCodeState(result.code);
      setApplied(result);
      return result;
    } catch (requestError) {
      if (!isCurrent()) return null;
      setApplied(null);
      setValidationFailure(
        requestError instanceof ApiError && requestError.status < 500
          ? "invalid"
          : "unavailable",
      );
      return null;
    } finally {
      if (isCurrent()) { pending.current = null; setIsValidating(false); }
    }
  }, [code, eventId, isValidating]);

  const clear = useCallback(() => {
    generation.current++;
    pending.current = null;
    setIsValidating(false);
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
