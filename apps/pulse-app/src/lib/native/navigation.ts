import { isNativePlatform } from "@/lib/native/platform";

export function routeForPlatform(path: string) {
  if (!isNativePlatform()) return path;

  const url = new URL(path, window.location.origin);
  const eventGroupMatch = url.pathname.match(/^\/events\/([^/]+)\/group$/);
  if (eventGroupMatch) return `/events/mobile/group?groupEventId=${encodeURIComponent(eventGroupMatch[1])}${url.search ? `&${url.search.slice(1)}` : ""}`;

  const eventMatch = url.pathname.match(/^\/events\/([^/]+)$/);
  if (eventMatch) return `/events?eventId=${encodeURIComponent(eventMatch[1])}${url.search ? `&${url.search.slice(1)}` : ""}`;

  const profileMatch = url.pathname.match(/^\/users\/([^/]+)$/);
  if (profileMatch && profileMatch[1] !== "me") {
    return `/profiles?userId=${encodeURIComponent(profileMatch[1])}${url.search ? `&${url.search.slice(1)}` : ""}`;
  }

  const editEventMatch = url.pathname.match(/^\/dashboard\/events\/([^/]+)$/);
  if (editEventMatch && editEventMatch[1] !== "new") return `/dashboard/events/edit?eventId=${encodeURIComponent(editEventMatch[1])}`;

  return `${url.pathname}${url.search}${url.hash}`;
}
