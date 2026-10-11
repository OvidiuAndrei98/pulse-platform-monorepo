import { normalizeEvent, type Event } from "./events";
import type { Language } from "../i18n";

export type Preferences = { language: Language; saved: Event[] };
export function parsePreferences(
  raw: string | null,
  fallback: Language,
): Preferences {
  try {
    const data: unknown = raw ? JSON.parse(raw) : null;
    if (!data || typeof data !== "object")
      return { language: fallback, saved: [] };
    const value = data as { language?: unknown; saved?: unknown };
    const events = Array.isArray(value.saved)
      ? value.saved.map(normalizeEvent).filter((e) => e !== null)
      : [];
    return {
      language:
        value.language === "en" || value.language === "ro"
          ? value.language
          : fallback,
      saved: [...new Map(events.map((e) => [e.id, e])).values()].slice(0, 200),
    };
  } catch {
    return { language: fallback, saved: [] };
  }
}

// Serialization prevents an older save from completing after a newer one.
export function serializedWriter(write: (value: string) => Promise<void>) {
  let pending = Promise.resolve();
  return (value: string) => {
    const operation = pending.catch(() => {}).then(() => write(value));
    pending = operation;
    return operation;
  };
}
