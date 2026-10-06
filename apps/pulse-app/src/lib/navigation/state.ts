export function isClientRoute(path: string) {
  return path === "/" || /^\/(events|feed|profiles|users|login|register|forgot-password|reset-password|auth|checkout|legal)(\/|$)/.test(path);
}

export function safeInternalPath(value: string | null | undefined, fallback = "/") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return fallback;
  return value;
}

const memory = new Map<string, unknown>();
const prefix = "spottr:navigation:v1:";
export function readNavigationState<T>(key: string, fallback: T): T {
  if (memory.has(key)) return memory.get(key) as T;
  try {
    const stored = sessionStorage.getItem(prefix + key);
    if (stored !== null) return JSON.parse(stored) as T;
  } catch { /* Private mode and storage limits must not break navigation. */ }
  return fallback;
}
export function writeNavigationState(key: string, value: unknown) {
  memory.set(key, value);
  try { sessionStorage.setItem(prefix + key, JSON.stringify(value)); } catch { /* Keep the in-memory copy. */ }
}

export type NavigationEntry = { id: string; previous?: string; url: string };
export const ENTRY = "__spottrNavigation";
export const LAYER = "__spottrLayer";
export const locationKey = () => window.location.pathname + window.location.search;
// Next copies its own router fields for external history updates. Passing its
// internal marker ourselves would bypass useSearchParams synchronization.
export function externalHistoryState(extra: Record<string, unknown> = {}) {
  const { __NA, _N, ...state } = window.history.state ?? {};
  return { ...state, ...extra };
}
export function canGoBack(allowPrevious?: (path: string) => boolean) {
  const previous = (window.history.state?.[ENTRY] as NavigationEntry | undefined)?.previous;
  return Boolean(previous && (!allowPrevious || allowPrevious(previous)));
}
