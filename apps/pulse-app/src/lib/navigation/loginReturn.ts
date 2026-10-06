import { safeInternalPath } from "./state";

// Cancelling login must not send a guest back into an authentication redirect.
export function isPublicLoginReturnPath(value: string): boolean {
  const safe = safeInternalPath(value, "");
  if (!safe) return false;
  const path = new URL(safe, "https://navigation.local").pathname;
  return path === "/" || path === "/feed" || path === "/profiles" ||
    /^\/events(?:\/[^/]+)?\/?$/.test(path) ||
    /^\/users\/(?!me(?:\/|$))[^/]+\/?$/.test(path) ||
    /^\/legal\/(privacy|terms)\/?$/.test(path);
}
