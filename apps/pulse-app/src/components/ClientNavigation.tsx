"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { ENTRY, LAYER, isClientRoute, locationKey, readNavigationState, writeNavigationState, type NavigationEntry } from "@/lib/navigation/state";
import { isMainTabRoot, mainTabIndex, navigateMainTab, TAB_DEPTH, TAB_REQUEST, TAB_TRANSITION, type TabRequest } from "@/lib/navigation/tabs";

type Position = { x: number; y: number };
type Snapshot = { window: Position; regions: Record<string, Position> };
const empty = (): Snapshot => ({ window: { x: 0, y: 0 }, regions: {} });
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const pageKey = (value: string) => {
  const url = new URL(value, location.origin);
  // Never copy auth/reset/checkout credentials into session storage keys.
  const query = new URLSearchParams();
  const keys = url.pathname === "/profiles" ? ["userId"]
    : url.pathname === "/events" ? ["date", "city", "categories", "vibes", "distance", "view"] : [];
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (value !== null) query.set(key, value);
  }
  return url.pathname + (query.size ? `?${query}` : "");
};

export function scrollClientPageToTop() {
  window.dispatchEvent(new Event("spottr:cancel-scroll-restore"));
  window.scrollTo({ top: 0, behavior: "smooth" });
  document.querySelectorAll<HTMLElement>("[data-nav-scroll]").forEach((element) => {
    if (element.scrollHeight > element.clientHeight) element.scrollTo({ top: 0, behavior: "smooth" });
  });
}

export function ClientNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const restoreRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android" || !isClientRoute(pathname ?? "")) return;
    const listener = App.addListener("backButton", () => {
      if (history.state?.[LAYER]?.length) history.back();
      else if (new URLSearchParams(location.search).has("eventId")) {
        if (history.state?.[ENTRY]?.previous) history.back();
        else {
          const url = new URL(location.href);
          url.searchParams.delete("eventId");
          router.replace(url.pathname + url.search, { scroll: false });
        }
      }
      else if (isMainTabRoot(location.pathname, location.search)) {
        if (location.pathname !== "/") navigateMainTab("/");
        else void App.minimizeApp();
      }
      else if (history.state?.[ENTRY]?.previous) history.back();
      else if (location.pathname !== "/") router.replace("/");
      else void App.minimizeApp();
    });
    return () => { void listener.then((handle) => handle.remove()); };
  }, [pathname, router]);

  useEffect(() => {
    const history = window.history;
    const push = history.pushState;
    const replace = history.replaceState;
    const previousRestoration = history.scrollRestoration;
    let url = pageKey(locationKey());
    let entry: NavigationEntry = history.state?.[ENTRY] ?? { id: newId(), url };
    replace.call(history, { ...history.state, [ENTRY]: entry, [TAB_DEPTH]: history.state?.[TAB_DEPTH] ?? (isMainTabRoot(location.pathname, location.search) ? 0 : null) }, "");
    let pendingTab: { href: string; direction: number } | undefined;
    let switchingTab: string | undefined;
    let tabGeneration = 0;
    let switchTimer: ReturnType<typeof setTimeout> | undefined;
    const launchTab = (href: string, direction: number) => {
      const generation = tabGeneration;
      // A skipped View Transition may still invoke its update callback later.
      // Only the latest requested tab is allowed to start a route change.
      const navigate = () => {
        if (generation === tabGeneration) router.replace(href, { scroll: false });
      };
      const event = new CustomEvent(TAB_TRANSITION, { cancelable: true, detail: { href, direction, navigate } });
      if (window.dispatchEvent(event)) navigate();
    };
    let snapshot = structuredClone(readNavigationState<Snapshot>(`scroll:${entry.id}`, readNavigationState(`route:${url}`, empty())));
    let restoring = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let observer: MutationObserver | undefined;
    let removeLoadListener = () => {};
    let persistTimer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    let notificationPending = false;
    const notifyNavigation = () => {
      if (notificationPending) return;
      notificationPending = true;
      // Next writes history inside useInsertionEffect. Subscribers may set
      // React state, so notify only after the current commit has finished.
      queueMicrotask(() => {
        notificationPending = false;
        if (active) window.dispatchEvent(new Event("spottr:navigation"));
      });
    };
    const persist = () => {
      clearTimeout(persistTimer);
      if (!isClientRoute(new URL(url, location.origin).pathname)) return;
      writeNavigationState(`scroll:${entry.id}`, structuredClone(snapshot));
      writeNavigationState(`route:${url}`, structuredClone(snapshot));
    };
    const cancelRestore = () => {
      restoring = false;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      observer?.disconnect();
      removeLoadListener();
    };
    const applyScroll = () => {
      if (!restoring) return;
      window.scrollTo({ left: snapshot.window.x, top: snapshot.window.y, behavior: "instant" });
      document.querySelectorAll<HTMLElement>("[data-nav-scroll]").forEach((element) => {
        const position = snapshot.regions[element.dataset.navScroll!];
        if (position) element.scrollTo({ left: position.x, top: position.y, behavior: "instant" });
      });
    };
    const restore = () => {
      cancelRestore();
      history.scrollRestoration = isClientRoute(location.pathname) ? "manual" : previousRestoration;
      if (!isClientRoute(location.pathname)) return;
      restoring = true;
      const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(applyScroll); };
      schedule();
      // Lists and images may arrive after the route shell. Reapply until the
      // user interacts, without writing a temporary skeleton position back.
      observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true });
      document.addEventListener("load", schedule, true);
      removeLoadListener = () => document.removeEventListener("load", schedule, true);
      timer = setTimeout(cancelRestore, 5000);
    };
    restoreRef.current = restore;
    history.pushState = function (state, unused, target) {
      const next = new URL(target?.toString() ?? location.href, location.href);
      const nextUrl = pageKey(next.href);
      // Same-URL overlay entries belong to the current page and scroll state.
      const sameLocation = next.pathname + next.search === locationKey();
      const currentDepth: number | null = this.state?.[TAB_DEPTH] ?? null;
      if (sameLocation && state?.[LAYER]) {
        push.call(this, { ...state, [TAB_DEPTH]: currentDepth === null ? null : currentDepth + 1 }, unused, target);
        notifyNavigation();
        return;
      }
      if (nextUrl === url && state?.__spottrEvent === true) {
        // Opening an event only changes the overlay URL. Keep the current page's
        // scroll snapshot and stop any late route restoration before the drawer
        // locks the body; this is not a new page to scroll back into position.
        if (!this.state?.__spottrEvent) {
          snapshot.window = { x: window.scrollX, y: window.scrollY };
          document.querySelectorAll<HTMLElement>("[data-nav-scroll]").forEach((element) => {
            snapshot.regions[element.dataset.navScroll!] = { x: element.scrollLeft, y: element.scrollTop };
          });
        }
        persist();
        cancelRestore();
        push.call(this, { ...state, [ENTRY]: entry, [TAB_DEPTH]: currentDepth }, unused, target);
        notifyNavigation();
        return;
      }
      persist();
      cancelRestore();
      const nextEntry = { id: newId(), previous: url, url: nextUrl };
      const navigatingFromLayer = Boolean(this.state?.[LAYER]?.length) && !sameLocation;
      // Leaving a temporary surface replaces its entry, so Back returns to the
      // originating page instead of a closed, duplicate surface.
      const depth = currentDepth === null ? (isMainTabRoot(next.pathname, next.search) ? 0 : null) : currentDepth + (navigatingFromLayer ? 0 : 1);
      (navigatingFromLayer ? replace : push).call(this, { ...state, [ENTRY]: nextEntry, [LAYER]: undefined, [TAB_DEPTH]: depth }, unused, target);
      entry = nextEntry;
      url = nextUrl;
      snapshot = structuredClone(readNavigationState(`route:${url}`, empty()));
      notifyNavigation();
      restore();
    };
    history.replaceState = function (state, unused, target) {
      const next = new URL(target?.toString() ?? location.href, location.href);
      const nextUrl = pageKey(next.href);
      const changed = nextUrl !== url;
      const tabArrival = switchingTab === next.pathname && isMainTabRoot(next.pathname, next.search);
      const depth = tabArrival ? 0 : (this.state?.[TAB_DEPTH] ?? (isMainTabRoot(next.pathname, next.search) ? 0 : null));
      if (changed) { persist(); cancelRestore(); }
      entry = { ...entry, url: nextUrl };
      if (tabArrival) {
        switchingTab = undefined;
        clearTimeout(switchTimer);
      }
      url = nextUrl;
      replace.call(this, { ...state, [ENTRY]: entry, [TAB_DEPTH]: depth, ...(tabArrival ? { [LAYER]: undefined, __spottrEvent: false } : {}) }, unused, target);
      if (changed) snapshot = structuredClone(readNavigationState(`route:${url}`, empty()));
      notifyNavigation();
      if (changed) restore();
    };
    const onPop = (event: PopStateEvent) => {
      const nextUrl = pageKey(locationKey());
      if (pendingTab) {
        // Consume the return to the tab's root before Next renders it. The
        // destination then replaces that root, leaving no detail pages behind it.
        event.stopImmediatePropagation();
        const target = pendingTab;
        pendingTab = undefined;
        url = nextUrl;
        entry = history.state?.[ENTRY] ?? { id: newId(), url };
        snapshot = structuredClone(readNavigationState(`route:${url}`, empty()));
        launchTab(target.href, target.direction);
        return;
      }
      if (nextUrl === url) { entry = history.state?.[ENTRY] ?? entry; return; }
      persist();
      cancelRestore();
      url = nextUrl;
      entry = history.state?.[ENTRY] ?? { id: newId(), url };
      snapshot = structuredClone(readNavigationState(`scroll:${entry.id}`, readNavigationState(`route:${url}`, empty())));
      restore();
    };
    const onTabRequest = (event: Event) => {
      const request = (event as CustomEvent<TabRequest>).detail;
      if (!isMainTabRoot(request.href) || request.href.includes("?")) return;
      // A modal owns Back and navigation until it has been closed.
      if (history.state?.[LAYER]?.length || new URLSearchParams(location.search).has("eventId")
        || document.querySelector('[role="dialog"][aria-modal="true"], [data-vaul-drawer]')
        || document.body.classList.contains("barcode-scanner-active")) return;
      request.accepted = true;
      switchingTab = request.href;
      tabGeneration++;
      const direction = Math.sign(mainTabIndex(request.href) - mainTabIndex(location.pathname));
      const depth = history.state?.[TAB_DEPTH];
      persist();
      cancelRestore();
      clearTimeout(switchTimer);
      switchTimer = setTimeout(() => { switchingTab = undefined; pendingTab = undefined; }, 5000);
      if (pendingTab) {
        // One history traversal is already returning to the root. Retarget it
        // instead of issuing another go(-depth) and leaving the application.
        pendingTab = { href: request.href, direction };
      } else if (Number.isInteger(depth) && depth > 0) {
        pendingTab = { href: request.href, direction };
        history.go(-depth);
      } else launchTab(request.href, direction);
    };
    const onScroll = (event: Event) => {
      if (restoring) return;
      const target = event.target;
      if (target === document) {
        // A mobile drawer fixes the body in place; its temporary window offset
        // must not replace the page position saved before the drawer opened.
        if (document.body.style?.position === "fixed") return;
        snapshot.window = { x: window.scrollX, y: window.scrollY };
      }
      else if (target instanceof HTMLElement && target.dataset.navScroll) {
        snapshot.regions[target.dataset.navScroll] = { x: target.scrollLeft, y: target.scrollTop };
      } else return;
      clearTimeout(persistTimer);
      persistTimer = setTimeout(persist, 120);
    };
    window.addEventListener("popstate", onPop, true);
    window.addEventListener(TAB_REQUEST, onTabRequest);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("pagehide", persist);
    window.addEventListener("pageshow", restore);
    window.addEventListener("wheel", cancelRestore, { passive: true });
    window.addEventListener("touchstart", cancelRestore, { passive: true });
    window.addEventListener("pointerdown", cancelRestore, { passive: true });
    window.addEventListener("keydown", cancelRestore);
    window.addEventListener("spottr:cancel-scroll-restore", cancelRestore);
    window.addEventListener("spottr:restore-scroll-now", applyScroll);
    restore();
    return () => {
      active = false;
      tabGeneration++;
      clearTimeout(switchTimer);
      persist(); cancelRestore();
      history.pushState = push; history.replaceState = replace;
      history.scrollRestoration = previousRestoration;
      window.removeEventListener("popstate", onPop, true);
      window.removeEventListener(TAB_REQUEST, onTabRequest);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("pagehide", persist);
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("wheel", cancelRestore);
      window.removeEventListener("touchstart", cancelRestore);
      window.removeEventListener("pointerdown", cancelRestore);
      window.removeEventListener("keydown", cancelRestore);
      window.removeEventListener("spottr:cancel-scroll-restore", cancelRestore);
      window.removeEventListener("spottr:restore-scroll-now", applyScroll);
    };
  }, []);

  useEffect(() => { restoreRef.current(); }, [pathname]);
  return null;
}
