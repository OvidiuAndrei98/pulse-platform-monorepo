"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { readNavigationState, writeNavigationState } from "./state";

// Persist only UI choices, never passwords, tokens, payment or billing fields.
export function useNavigationState<T>(key: string, initial: T) {
  const fallback = useRef(initial);
  const [value, setValue] = useState(initial);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  useEffect(() => {
    setValue(readNavigationState(key, fallback.current));
    setLoadedKey(key);
  }, [key]);
  const update = useCallback((next: SetStateAction<T>) => {
    setValue((previous) => {
      const value = typeof next === "function" ? (next as (value: T) => T)(previous) : next;
      writeNavigationState(key, value);
      return value;
    });
  }, [key]);
  return [value, update, loadedKey === key] as const;
}
