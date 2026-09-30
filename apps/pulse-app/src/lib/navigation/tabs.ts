export const MAIN_TABS = [
  { id: "home", path: "/", label: "nav.home" },
  { id: "map", path: "/events", label: "nav.map" },
  { id: "feed", path: "/feed", label: "nav.feed" },
  { id: "profile", path: "/users/me", label: "nav.profile" },
] as const;

export function mainTabs(organizer = false) {
  return MAIN_TABS.map((tab) => ({ ...tab, path: tab.id === "profile" && organizer ? "/dashboard" : tab.path }));
}

export function mainTabIndex(path: string) {
  return MAIN_TABS.findIndex((tab) => {
    if (tab.id === "profile") return /^\/(users|profiles|dashboard|ticket-validation)(\/|$)/.test(path);
    return path === tab.path || (tab.path !== "/" && path.startsWith(tab.path + "/"));
  });
}

export function isMainTabRoot(path: string, search = "") {
  return (MAIN_TABS.some((tab) => tab.path === path) || path === "/dashboard")
    && !new URLSearchParams(search).has("eventId");
}

export const TAB_DEPTH = "__spottrTabDepth";
export const TAB_REQUEST = "spottr:tab-request";
export const TAB_TRANSITION = "spottr:tab-transition";
export const TAB_VISUAL_STATE = "spottr:tab-visual-state";
export type TabVisualState = { href: string; phase: "pending" | "ready" };
export type TabRequest = { href: string; accepted: boolean };
export type TabTransition = { href: string; direction: number; navigate: () => void };

export function navigateMainTab(href: string) {
  const detail: TabRequest = { href, accepted: false };
  window.dispatchEvent(new CustomEvent(TAB_REQUEST, { detail }));
  return detail.accepted;
}
