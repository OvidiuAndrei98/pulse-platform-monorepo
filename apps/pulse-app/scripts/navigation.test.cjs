const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.join(__dirname, "../src");

function browser(initial = "/", moduleMocks = {}) {
  class Events {
    listeners = new Map();
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    dispatchEvent(event) { for (const fn of [...(this.listeners.get(event.type) ?? [])]) { fn(event); if (event.stopped) break; } return !event.defaultPrevented; }
  }
  class Element {
    dataset = {}; scrollLeft = 0; scrollTop = 0; scrollHeight = 5000; clientHeight = 500;
    scrollTo({ left = this.scrollLeft, top = this.scrollTop }) { this.scrollLeft = left; this.scrollTop = Math.min(top, this.scrollHeight - this.clientHeight); }
    closest() { return null; }
  }
  class Event {
    constructor(type, options = {}) { this.type = type; Object.assign(this, options); }
    preventDefault() { this.defaultPrevented = true; }
    stopImmediatePropagation() { this.stopped = true; }
  }
  const window = new Events();
  const document = new Events();
  let location = new URL(initial, "https://app.test");
  const entries = [{ state: { __NA: true, tree: "next-tree" }, href: location.href }];
  let index = 0;
  const history = {
    scrollRestoration: "auto",
    get state() { return entries[index].state; },
    get length() { return entries.length; },
    pushState(state, _, target) { location = new URL(target ?? location.href, location); entries.splice(index + 1); entries.push({ state, href: location.href }); index++; },
    replaceState(state, _, target) { location = new URL(target ?? location.href, location); entries[index] = { state, href: location.href }; },
    go(delta) { if (index + delta < 0 || index + delta >= entries.length) return; index += delta; location = new URL(entries[index].href); window.dispatchEvent(new Event("popstate")); },
    back() { this.go(-1); },
    forward() { this.go(1); },
  };
  const timers = new Map(); let sequence = 0;
  const frames = new Map();
  const setTimeout = (fn, delay) => { timers.set(++sequence, { fn, delay }); return sequence; };
  const clearTimeout = (id) => timers.delete(id);
  const requestAnimationFrame = (fn) => { frames.set(++sequence, fn); return sequence; };
  const cancelAnimationFrame = (id) => frames.delete(id);
  const mutations = new Set();
  class MutationObserver {
    constructor(fn) { this.fn = fn; }
    observe() { mutations.add(this.fn); }
    disconnect() { mutations.delete(this.fn); }
  }
  const regions = [];
  document.body = { classList: { contains: () => false } };
  document.querySelectorAll = () => regions;
  document.querySelector = () => regions[0] ?? null;
  window.scrollX = 0; window.scrollY = 0;
  window.scrollTo = ({ left = 0, top = 0 }) => { window.scrollX = left; window.scrollY = top; };
  Object.assign(window, { history, setTimeout, clearTimeout });
  Object.defineProperty(window, "location", { get: () => location });
  const storage = new Map();
  const sessionStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const effects = [];
  const mocks = {
    react: { useEffect: (fn) => effects.push(fn), useRef: (current) => ({ current }), useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}] },
    "react/jsx-runtime": {},
    "next/navigation": { usePathname: () => location.pathname, useRouter: () => ({ replace: (target) => history.replaceState({}, "", target) }), useSearchParams: () => location.searchParams },
    "@capacitor/app": { App: {} },
    "@capacitor/core": { Capacitor: { getPlatform: () => "web" } },
    ...moduleMocks,
  };
  const context = vm.createContext({ window, document, history, sessionStorage, URL, URLSearchParams, Event, CustomEvent: Event, Element, HTMLElement: Element, MutationObserver, setTimeout, clearTimeout, requestAnimationFrame, cancelAnimationFrame, structuredClone, queueMicrotask, console });
  Object.defineProperty(context, "location", { get: () => location });
  const modules = new Map();
  function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const exports = {}; modules.set(file, exports);
    const require = (name) => {
      if (mocks[name]) return mocks[name];
      const resolved = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name);
      return load([resolved, resolved + ".ts", resolved + ".tsx"].find((candidate) => fs.existsSync(candidate)));
    };
    vm.runInContext("(function(require,exports){" + output + "\n})", context)(require, exports);
    return exports;
  }
  const flushFrames = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((fn) => fn()); };
  const flushOpen = () => { for (const [id, timer] of [...timers]) if (timer.delay === 0) { timers.delete(id); timer.fn(); } };
  const mount = (fn) => { fn(); const cleanup = effects.splice(0).map((fn) => fn()); return () => cleanup.reverse().forEach((fn) => fn?.()); };
  return { load: (file) => load(path.join(root, file)), window, document, history, regions, Element, Event, mount, flushFrames, flushOpen, mutations, storage, get location() { return location; } };
}

test("client scope excludes organizer, admin and validation routes", () => {
  const { isClientRoute, safeInternalPath } = browser().load("lib/navigation/state.ts");
  for (const route of ["/", "/events", "/events/123", "/profiles", "/users/me/tickets", "/legal/terms", "/checkout/success"]) assert.equal(isClientRoute(route), true);
  for (const route of ["/dashboard", "/dashboard/events/123", "/admin", "/scan", "/ticket-validation", "/api/events"]) assert.equal(isClientRoute(route), false);
  for (const target of ["//evil.test", "/\\evil.test", "https://evil.test", undefined]) assert.equal(safeInternalPath(target, "/feed"), "/feed");
  assert.equal(safeInternalPath("/events?date=Tonight"), "/events?date=Tonight");
});

test("tab order, nested destinations and native event links use one navigation policy", () => {
  const tabs = browser().load("lib/navigation/tabs.ts");
  assert.equal(tabs.mainTabs().map(tab => tab.path).join(","), "/,/events,/feed,/users/me");
  assert.equal(tabs.mainTabs(true)[3].path, "/dashboard");
  assert.equal(tabs.mainTabIndex("/users/me/saved-events"), 3);
  assert.equal(tabs.mainTabIndex("/events/123"), 1);
  assert.equal(tabs.isMainTabRoot("/events", "?view=map"), true);
  assert.equal(tabs.isMainTabRoot("/events", "?eventId=123"), false);
});

test("main tab changes replace one history entry and preserve each tab scroll", () => {
  const b = browser();
  const cleanup = b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation);
  const tabs = b.load("lib/navigation/tabs.ts");
  b.flushFrames();
  b.window.dispatchEvent(new b.Event("touchstart"));
  b.window.scrollY = 640;
  b.document.dispatchEvent({ type: "scroll", target: b.document });
  assert.equal(tabs.navigateMainTab("/events"), true);
  b.flushFrames();
  assert.equal(b.location.pathname, "/events");
  assert.equal(b.window.scrollY, 0);
  assert.equal(b.history.length, 1);
  tabs.navigateMainTab("/feed");
  tabs.navigateMainTab("/");
  b.flushFrames();
  assert.equal(b.window.scrollY, 640);
  assert.equal(b.history.length, 1);
  b.history.back();
  assert.equal(b.location.pathname, "/");
  cleanup();
});

test("latest tab request wins before the previous transition starts its route update", () => {
  const b = browser();
  const cleanup = b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation);
  const tabs = b.load("lib/navigation/tabs.ts");
  const transitions = [];
  b.window.addEventListener(tabs.TAB_TRANSITION, event => { event.preventDefault(); transitions.push(event.detail); });
  assert.equal(tabs.navigateMainTab("/events"), true);
  assert.equal(tabs.navigateMainTab("/"), true);
  transitions[1].navigate();
  transitions[0].navigate();
  assert.equal(b.location.pathname, "/", "A delayed Map callback must not undo the return to Home");
  assert.equal(tabs.navigateMainTab("/events"), true);
  assert.equal(tabs.navigateMainTab("/feed"), true);
  assert.equal(tabs.navigateMainTab("/users/me"), true);
  transitions[4].navigate();
  transitions[2].navigate();
  transitions[3].navigate();
  assert.equal(b.location.pathname, "/users/me");
  assert.equal(b.history.length, 1);
  cleanup();
});

test("repeated tab requests during history unwinding traverse back only once", () => {
  const b = browser("/users/me");
  const cleanup = b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation);
  const tabs = b.load("lib/navigation/tabs.ts");
  b.history.pushState({}, "", "/users/me/tickets");
  const go = b.history.go.bind(b.history);
  const traversals = [];
  b.history.go = delta => traversals.push(delta);
  tabs.navigateMainTab("/events");
  tabs.navigateMainTab("/feed");
  tabs.navigateMainTab("/");
  assert.deepEqual(traversals, [-1]);
  go(traversals[0]);
  assert.equal(b.location.pathname, "/");
  assert.equal(b.history.state[tabs.TAB_DEPTH], 0);
  cleanup();
});

test("tab capture restores scroll synchronously after commit, including inner regions", () => {
  const b = browser();
  const cleanup = b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation);
  const tabs = b.load("lib/navigation/tabs.ts");
  const carousel = new b.Element();
  carousel.dataset.navScroll = "carousel";
  b.regions.push(carousel);
  b.document.querySelector = () => null;
  b.flushFrames();
  b.window.dispatchEvent(new b.Event("touchstart"));
  b.window.scrollY = 640;
  carousel.scrollLeft = 230;
  b.document.dispatchEvent({ type: "scroll", target: b.document });
  b.document.dispatchEvent({ type: "scroll", target: carousel });
  tabs.navigateMainTab("/events");
  b.window.dispatchEvent(new b.Event("spottr:restore-scroll-now"));
  assert.equal(b.window.scrollY, 0, "Do not wait for requestAnimationFrame after capture");
  carousel.scrollLeft = 0;
  tabs.navigateMainTab("/");
  b.window.dispatchEvent(new b.Event("spottr:restore-scroll-now"));
  assert.equal(b.window.scrollY, 640);
  assert.equal(carousel.scrollLeft, 230);
  b.window.dispatchEvent(new b.Event("touchstart"));
  b.window.scrollY = 700;
  b.window.dispatchEvent(new b.Event("spottr:restore-scroll-now"));
  assert.equal(b.window.scrollY, 700, "Never override user interaction after restoration was cancelled");
  cleanup();
});

test("switching tabs from nested pages unwinds to the root before replacing it", () => {
  const b = browser("/users/me");
  const cleanup = b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation);
  const tabs = b.load("lib/navigation/tabs.ts");
  b.history.pushState({}, "", "/users/me/saved-events");
  b.history.pushState({}, "", "/events/123");
  assert.equal(b.history.state[tabs.TAB_DEPTH], 2);
  tabs.navigateMainTab("/feed");
  assert.equal(b.location.pathname, "/feed");
  assert.equal(b.history.state[tabs.TAB_DEPTH], 0);
  assert.equal(b.load("lib/navigation/state.ts").canGoBack(), false);
  b.history.back();
  assert.equal(b.location.pathname, "/feed");
  b.history.pushState({}, "", "/users/someone");
  b.history.back();
  assert.equal(b.location.pathname, "/feed");
  cleanup();
});

test("an open dialog rejects tab changes; closing overlay preserves depth", () => {
  const b = browser("/events");
  const cleanup = b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation);
  const tabs = b.load("lib/navigation/tabs.ts");
  b.history.pushState({ ...b.history.state, __spottrLayer: ["filter"] }, "", b.location.href);
  assert.equal(b.history.state[tabs.TAB_DEPTH], 1);
  b.document.querySelector = () => ({});
  assert.equal(tabs.navigateMainTab("/feed"), false);
  b.history.back();
  assert.equal(b.history.state[tabs.TAB_DEPTH], 0);
  b.document.querySelector = () => null;
  assert.equal(tabs.navigateMainTab("/feed"), true);
  assert.equal(b.location.pathname, "/feed");
  cleanup();
});

test("iOS delegates Back to the native plugin only on details without an overlay", async () => {
  const calls = [];
  const b = browser("/users/me", {
    "@capacitor/core": {
      Capacitor: { getPlatform: () => "ios", isPluginAvailable: () => true },
      registerPlugin: () => ({ setEnabled: async ({ enabled }) => { calls.push(enabled); } }),
    },
  });
  const cleanup = b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation);
  const cleanNative = b.mount(b.load("components/NativeNavigationGestures.tsx").NativeNavigationGestures);
  assert.equal(calls.at(-1), false);
  b.history.pushState({}, "", "/users/me/tickets");
  await Promise.resolve();
  assert.equal(calls.at(-1), true);
  b.history.pushState({ ...b.history.state, __spottrLayer: ["ticket"] }, "", b.location.href);
  await Promise.resolve();
  assert.equal(calls.at(-1), false);
  b.history.back();
  assert.equal(calls.at(-1), true);
  b.history.back();
  assert.equal(calls.at(-1), false);
  assert.equal(b.window.listeners.get("touchend")?.size ?? 0, 0);
  cleanNative(); cleanup();
});

test("Android system Back returns root tabs to Home, then minimizes, while details still go back", () => {
  let back;
  let minimized = 0;
  const b = browser("/events", {
    "@capacitor/core": { Capacitor: { getPlatform: () => "android" } },
    "@capacitor/app": { App: {
      addListener: (_, callback) => { back = callback; return Promise.resolve({ remove() {} }); },
      minimizeApp: async () => { minimized++; },
    } },
  });
  const cleanup = b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation);
  back();
  assert.equal(b.location.pathname, "/");
  assert.equal(b.history.length, 1);
  back();
  assert.equal(minimized, 1);
  b.history.pushState({}, "", "/users/me/tickets");
  back();
  assert.equal(b.location.pathname, "/");
  assert.equal(minimized, 1);
  cleanup();
});

test("Android Back closes an event opened directly without leaving the app", () => {
  let back;
  const b = browser("/events?eventId=123", {
    "@capacitor/core": { Capacitor: { getPlatform: () => "android" } },
    "@capacitor/app": { App: {
      addListener: (_, callback) => { back = callback; return Promise.resolve({ remove() {} }); },
    } },
  });
  const cleanup = b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation);
  back();
  assert.equal(b.location.pathname + b.location.search, "/events");
  cleanup();
});

test("history notifications run after Next's insertion effect and coalesce to the latest URL", async () => {
  const b = browser("/events");
  const cleanup = b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation);
  const urls = [];
  b.window.addEventListener("spottr:navigation", () => urls.push(b.location.pathname));
  b.history.pushState({ __NA: true }, "", "/");
  assert.deepEqual(urls, [], "pushState must not synchronously notify React subscribers");
  b.history.replaceState({ __NA: true }, "", "/feed");
  assert.deepEqual(urls, [], "replaceState must not synchronously notify React subscribers");
  await Promise.resolve();
  assert.deepEqual(urls, ["/feed"]);
  cleanup();
});

test("unmount cancels a pending history notification", async () => {
  const b = browser("/events");
  const cleanup = b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation);
  let notifications = 0;
  b.window.addEventListener("spottr:navigation", () => notifications++);
  b.history.pushState({}, "", "/");
  cleanup();
  await Promise.resolve();
  assert.equal(notifications, 0);
});

test("map viewport saves movement without reading a destroyed Leaflet map on unmount", () => {
  let destroyed = false;
  let center = { lat: 44, lng: 26 };
  const listeners = new Map();
  const map = {
    setView() {}, fitBounds() {},
    getCenter() { assert.equal(destroyed, false, "MapContainer already removed the panes"); return center; },
    getZoom: () => 12,
    on: (name, handler) => listeners.set(name, handler),
    off: (name) => listeners.delete(name),
  };
  const b = browser("/events", {
    leaflet: { default: { latLng: () => ({ toBounds: () => [] }) } },
    "react-leaflet": { useMap: () => map },
  });
  const { MapViewportController } = b.load("features/events/map/MapBehavior.tsx");
  const cleanup = b.mount(() => MapViewportController({ distanceKm: 15 }));
  center = { lat: 45, lng: 27 };
  listeners.get("moveend")();
  destroyed = true;
  cleanup();
  assert.equal(listeners.size, 0);
  const saved = b.load("lib/navigation/state.ts").readNavigationState("map:nearby:15", null);
  assert.equal(saved.center[0], 45);
  assert.equal(saved.center[1], 27);
});

test("discovery defaults ignore old saved filters and explicit links still work", () => {
  const b = browser();
  b.load("lib/navigation/state.ts").writeNavigationState("discovery", { filters: { city: "Cluj-Napoca" } });
  const { parseDiscoveryState } = b.load("features/events/useDiscoveryState.ts");
  const defaults = parseDiscoveryState("eventId=123");
  assert.equal(defaults.filters.city, ""); assert.equal(defaults.filters.date, "See all");
  const state = parseDiscoveryState("date=Tonight&view=list&city=Iasi&distance=20&categories=A,B");
  assert.equal(state.filters.date, "Tonight"); assert.equal(state.view, "list"); assert.equal(state.filters.city, "Iasi"); assert.equal(state.filters.categories.length, 2);
  assert.equal(parseDiscoveryState("date=invalid&distance=-4").filters.date, "See all");
});

test("editing discovery filters never writes them to storage or browser history", () => {
  const b = browser("/events");
  const { useDiscoveryState } = b.load("features/events/useDiscoveryState.ts");
  let controls;
  b.mount(() => { controls = useDiscoveryState(); });
  controls.setFilters({ ...controls.filters, city: "Iasi", date: "Tonight" });
  assert.equal(b.storage.size, 0);
  assert.equal(b.location.search, "");
  assert.equal(b.history.length, 1);
  b.mount(() => { controls = useDiscoveryState(); });
  assert.equal(controls.filters.city, "");
});

test("Back restores window, horizontal carousel and late-loading list positions", () => {
  const b = browser("/events");
  b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation); b.flushFrames();
  b.window.dispatchEvent(new b.Event("touchstart"));
  const list = new b.Element(); list.dataset.navScroll = "events-list"; list.scrollTop = 950;
  const rail = new b.Element(); rail.dataset.navScroll = "carousel"; rail.scrollLeft = 270;
  b.regions.push(list, rail);
  b.window.scrollY = 400;
  b.document.dispatchEvent({ type: "scroll", target: b.document });
  b.document.dispatchEvent({ type: "scroll", target: list });
  b.document.dispatchEvent({ type: "scroll", target: rail });
  b.history.pushState({ __NA: true }, "", "/users/someone"); b.flushFrames();
  list.scrollTop = 0; rail.scrollLeft = 0; list.scrollHeight = 500;
  b.history.back(); b.flushFrames();
  assert.equal(b.window.scrollY, 400); assert.equal(rail.scrollLeft, 270); assert.equal(list.scrollTop, 0);
  list.scrollHeight = 3000; b.mutations.forEach((fn) => fn()); b.flushFrames();
  assert.equal(list.scrollTop, 950);
});

test("user input cancels restoration rather than fighting subsequent scrolling", () => {
  const b = browser(); b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation); b.flushFrames();
  b.window.dispatchEvent(new b.Event("touchstart")); b.window.scrollY = 620;
  b.document.dispatchEvent({ type: "scroll", target: b.document });
  b.history.pushState({}, "", "/feed"); b.flushFrames(); b.history.back(); b.flushFrames();
  b.window.dispatchEvent(new b.Event("wheel")); b.window.scrollY = 180;
  b.mutations.forEach((fn) => fn()); b.flushFrames(); assert.equal(b.window.scrollY, 180);
});

test("direct links have a fallback and query replacements keep Next history fields", () => {
  const b = browser("/events?date=Tonight"); b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation);
  const state = b.load("lib/navigation/state.ts");
  assert.equal(state.canGoBack(), false);
  b.history.replaceState({ ...b.history.state, custom: 42 }, "", "/events?date=Tonight&view=map");
  assert.equal(b.history.state.tree, "next-tree"); assert.equal(b.history.state.custom, 42);
  assert.equal(state.readNavigationState("tab:/events", ""), "");
  b.history.pushState({}, "", "/users/me"); assert.equal(state.canGoBack(), true);
});

test("redirects restore the destination position without carrying the source scroll", () => {
  const b = browser("/feed"); b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation); b.flushFrames();
  b.window.dispatchEvent(new b.Event("touchstart")); b.window.scrollY = 680;
  b.document.dispatchEvent({ type: "scroll", target: b.document });
  b.history.replaceState({}, "", "/login"); b.flushFrames();
  assert.equal(b.window.scrollY, 0);
  b.history.pushState({}, "", "/feed"); b.flushFrames();
  assert.equal(b.window.scrollY, 680);
});

test("scroll persistence does not duplicate reset or checkout tokens in storage", () => {
  const b = browser("/reset-password?token=private-reset-token");
  const cleanup = b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation);
  b.history.pushState({}, "", "/checkout/success?session_id=private-session-id");
  cleanup();
  const stored = JSON.stringify([...b.storage]);
  assert.equal(stored.includes("private-reset-token"), false);
  assert.equal(stored.includes("private-session-id"), false);
});

test("nested sheet Back consumes checkout steps, then closes only the top layer", () => {
  const b = browser("/events?eventId=123"); b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation);
  const { useBackLayer } = b.load("lib/navigation/useBackLayer.ts");
  let outer = 0; let steps = 2; let closed = 0;
  b.mount(() => useBackLayer(true, () => { outer++; })); b.flushOpen();
  const cleanup = b.mount(() => useBackLayer(true, () => { if (steps) { steps--; return false; } closed++; })); b.flushOpen();
  b.history.back(); assert.equal(steps, 1); assert.equal(closed, 0); assert.equal(outer, 0);
  b.history.back(); assert.equal(steps, 0); assert.equal(outer, 0);
  b.history.back(); assert.equal(closed, 1); assert.equal(outer, 0);
  cleanup(); b.history.back(); assert.equal(outer, 1);
});

test("dismissing an event consumes checkout and event entries without stepping checkout back", () => {
  const b = browser("/feed");
  b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation);
  b.history.pushState({ ...b.history.state, __spottrEvent: true }, "", "/feed?eventId=123");
  let checkoutBack = 0;
  const { useBackLayer } = b.load("lib/navigation/useBackLayer.ts");
  const cleanup = b.mount(() => useBackLayer(true, () => { checkoutBack++; return false; }));
  b.flushOpen();
  b.load("lib/navigation/dismissEventHistory.ts").dismissEventHistory();
  cleanup();
  assert.equal(checkoutBack, 0, "Dismiss is not Back through billing/summary");
  assert.equal(b.location.pathname + b.location.search, "/feed");
  assert.equal(b.history.state.__spottrLayer, undefined);
  assert.equal(b.history.state.__spottrTabDepth, 0);
});

test("dismissing checkout from a direct event link keeps the originating page", () => {
  const b = browser("/feed?eventId=123");
  b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation);
  let checkoutBack = 0;
  const { useBackLayer } = b.load("lib/navigation/useBackLayer.ts");
  const cleanup = b.mount(() => useBackLayer(true, () => { checkoutBack++; return false; }));
  b.flushOpen();
  b.load("lib/navigation/dismissEventHistory.ts").dismissEventHistory();
  cleanup();
  assert.equal(checkoutBack, 0);
  assert.equal(b.location.pathname + b.location.search, "/feed");
  assert.equal(b.history.state.__spottrLayer, undefined);
});

test("Strict Mode probe mount does not add ghost overlay entries", () => {
  const b = browser(); const { useBackLayer } = b.load("lib/navigation/useBackLayer.ts");
  b.mount(() => useBackLayer(true, () => {}))();
  b.mount(() => useBackLayer(true, () => {})); b.flushOpen();
  assert.equal(b.history.length, 2);
});

test("navigation out of a sheet replaces the temporary entry", () => {
  const b = browser("/feed"); b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation);
  const { useBackLayer } = b.load("lib/navigation/useBackLayer.ts");
  const cleanup = b.mount(() => useBackLayer(true, () => {})); b.flushOpen();
  b.window.dispatchEvent(new b.Event("spottr:layer-navigation"));
  cleanup(); b.history.pushState({}, "", "/users/friend");
  assert.equal(b.history.length, 2);
  b.history.back(); assert.equal(b.location.pathname, "/feed"); assert.equal(b.history.state.__spottrLayer, undefined);
});

test("native event links also replace a temporary layer on the same pathname", () => {
  const b = browser("/events"); b.mount(b.load("components/ClientNavigation.tsx").ClientNavigation);
  const { useBackLayer } = b.load("lib/navigation/useBackLayer.ts");
  const cleanup = b.mount(() => useBackLayer(true, () => {})); b.flushOpen();
  b.window.dispatchEvent(new b.Event("spottr:layer-navigation"));
  cleanup(); b.history.pushState({}, "", "/events?eventId=123");
  assert.equal(b.history.length, 2);
  b.history.back(); assert.equal(b.location.search, ""); assert.equal(b.history.state.__spottrLayer, undefined);
});
