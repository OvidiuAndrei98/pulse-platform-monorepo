// Run against a local dev or production server: node scripts/layout.browser.cjs
// Use dev mode to catch React's development-only lifecycle warnings.
// Override NAVIGATION_TEST_URL / CHROME_PATH when needed. No account is used.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");

const base = process.env.NAVIGATION_TEST_URL || "http://localhost:3100";
const chrome = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-layout-"));
const child = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;

async function run() {
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome startup timed out")), 15000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.stderr.on("data", (chunk) => {
      const match = chunk.toString().match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  console.log("Chrome connected");
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  const lifecycleWarnings = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
    if (message.method === "Runtime.consoleAPICalled") {
      const text = message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" ");
      if (/useInsertionEffect.*schedule updates/.test(text)) lifecycleWarnings.push(text);
    }
    const callback = pending.get(message.id);
    if (callback) { pending.delete(message.id); message.error ? callback.reject(message.error) : callback.resolve(message.result); }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 10000);
    pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Network.enable");
  await call("Network.setBlockedURLs", { urls: ["https://*"] });
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ": " + result.exceptionDetails.exception?.description);
    return result.result.value;
  };
  const until = async (expression) => {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await delay(100);
    }
    const detail = await evaluate("JSON.stringify({ path: location.pathname, scroll: scrollY, text: document.body.innerText.slice(0, 500) })");
    console.error("Runtime errors", errors, await evaluate("JSON.stringify({api: window.__api, state: history.state})"));
    throw new Error("Timed out: " + expression + "\n" + detail);
  };
  const navigate = async (route) => {
    await call("Page.navigate", { url: base + route });
    await until("Boolean(history.state?.__spottrNavigation)");
    await delay(250);
  };
  const button = (text) => `Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(text)})`;

  // Intercept every API call before hydration. No real account or payment is used.
  await call("Page.addScriptToEvaluateOnNewDocument", { source: `
    localStorage.setItem('pulse_token', 'mock-feedback-test');
    const originalFetch = window.fetch.bind(window);
    window.__api = { fail: true, payment: 'pending', requests: [] };
    const organizer = { id: 'test-organizer', username: 'testorganizer', organizerName: 'Test Organizer', role: 'organizer', relationship: 'none', followsOrganizer: false, followerCount: 7, friendCount: 0, eventCount: 0, bio: '' };
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
      if (!url.pathname.includes('/api/v1/')) return originalFetch(input, init);
      const route = url.pathname.split('/api/v1')[1];
      const state = window.__api;
      state.requests.push(route + url.search);
      const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      if (route === '/users/me') return respond({ id: 'test-user', username: 'Test User', email: 'test@example.com', role: 'user', preferredLanguage: 'en' });
      if (route === '/users/me/billing-details') return respond({});
      if (route === '/profiles/search') {
        const q = url.searchParams.get('q');
        await wait(q === 'older' ? 1100 : 80);
        if (q === 'error' && state.fail) return respond({ title: 'Unavailable' }, 503);
        return respond([{ ...organizer, id: q, role: 'user', username: q + 'result' }]);
      }
      if (route.startsWith('/profiles/')) return respond(organizer);
      if (route === '/checkout/reconcile') {
        if (state.payment === 'offline') throw new TypeError('simulated offline');
        return respond({ status: state.payment });
      }
      if (route.includes('/follow') || route.includes('/favorite') || route.includes('/purchase')) {
        await wait(350);
        return respond({ title: 'Simulated mutation failure' }, 503);
      }
      if (route === '/events' || route === '/users/me/tickets' || route === '/users/me/orders' || /^\\/events\\/[^/]+$/.test(route)) {
        await wait(250);
        if (state.fail) return respond({ title: 'Simulated load failure' }, 503);
        if (route.startsWith('/events/')) return respond({ id: 'test-event', title: 'Test Event', organizerId: 'test-organizer', organizerName: 'Test Organizer', description: 'Test description', locationName: 'Test venue', city: 'Bucuresti', latitude: 44.4, longitude: 26.1, category: 'Party', startTime: '2099-10-01T18:00:00Z', endTime: '2099-10-02T04:00:00Z', stats: { isFavorited: false, goingCount: 0 }, ticketTypes: [{ id: 'test-tier', name: 'Test ticket', priceRon: 50, description: 'Entry' }] });
        return respond([]);
      }
      return respond([]);
    };
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', { value: (_ok, fail) => setTimeout(() => fail({ code: 1, message: 'Permission denied' }), 100) });
  ` });
  const hasText = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`;
  const retry = async () => { await evaluate(`${button("Try again")}.click()`); };


  await call("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__api.fail = false;
    window.__api.hiddenCategories = [];
    window.__api.categoryMutations = [];
    window.__api.categoryReads = 0;
    window.__api.categoryCompletions = 0;
    const previousFetch = window.fetch;
    const svg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="pink"/></svg>');
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
      const route = url.pathname.split('/api/v1')[1];
      const method = init?.method || (input instanceof Request ? input.method : 'GET');
      const response = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
      if (route === '/users/me/hidden-categories' && method === 'GET') {
        window.__api.categoryReads++;
        if (!window.__releaseCategories) await new Promise(resolve => { window.__releaseCategories = resolve; });
        const categories = window.__api.hiddenCategories;
        return response(categories.length ? categories : null);
      }
      if (route === '/users/me/hidden-categories' && method === 'POST') {
        const body = init?.body ?? await input.clone().text();
        const { category } = JSON.parse(body);
        window.__api.categoryMutations.push({ method, category });
        if (window.__api.holdCategoryMutation) await new Promise(resolve => { window.__releaseCategoryMutation = resolve; });
        await new Promise(resolve => setTimeout(resolve, 150));
        window.__api.categoryCompletions++;
        if (window.__api.failCategoryMutation) return new Response(JSON.stringify({ title: 'Simulated save failure' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
        window.__api.hiddenCategories.push(category);
        return response(null);
      }
      if (route?.startsWith('/users/me/hidden-categories/') && method === 'DELETE') {
        const category = decodeURIComponent(route.split('/').pop());
        window.__api.categoryMutations.push({ method, category });
        await new Promise(resolve => setTimeout(resolve, 150));
        window.__api.categoryCompletions++;
        window.__api.hiddenCategories = window.__api.hiddenCategories.filter(value => value !== category);
        return response(null);
      }
      if (route?.endsWith('/social')) return response({ friends: [], goingCount: 0, ticketsSoldCount: 0, manualGoingCount: 0 });
      if (route === '/events') {
        await new Promise(resolve => { window.__releaseEvents = resolve; });
        return response([{ id: 'layout-event', title: 'Layout Test', organizerId: 'test-organizer', organizerName: 'Test Organizer', locationName: 'Test venue', city: 'Cluj', category: 'Party', startTime: '2099-10-01T18:00:00Z', endTime: '2099-10-02T04:00:00Z', bannerUrl: '', stats: { isFavorited: false, goingCount: 0 }, ticketTypes: [] }]);
      }
      if (route === '/feed') return response([{ activityType: 'organizer_update', actorId: 'test-organizer', actorUsername: 'Test Organizer', eventId: 'layout-event', eventTitle: 'Layout Test', eventStartTime: '2099-10-01T18:00:00Z', occurredAt: '2026-09-28T09:00:00Z', organizerUpdateId: 'photo', organizerUpdateImageUrl: svg }]);
      return previousFetch(input, init);
    };
  ` });
  for (const width of [390, 1280]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: width < 768 });
    await navigate('/');
    await until("window.__releaseEvents && document.querySelector('[role=status] section .shrink-0')");
    const before = await evaluate(`(() => {
      const card = document.querySelector('[role=status] section .shrink-0').getBoundingClientRect();
      const nav = document.querySelector('[data-bottom-nav-glass]').getBoundingClientRect();
      return { width: card.width, height: card.height, navX: nav.x, navWidth: nav.width };
    })()`);
    await evaluate("window.__releaseEvents()");
    await until("document.querySelector('[data-nav-scroll^=home-carousel] [role=button]')");
    const after = await evaluate(`(() => {
      const card = document.querySelector('[data-nav-scroll^=home-carousel] [role=button]').getBoundingClientRect();
      const nav = document.querySelector('[data-bottom-nav-glass]').getBoundingClientRect();
      return { width: card.width, height: card.height, navX: nav.x, navWidth: nav.width };
    })()`);
    assert.equal(after.width, before.width, 'Home skeleton width matches card at ' + width);
    assert.ok(Math.abs(after.height - before.height) <= 2, 'Home skeleton height matches card: ' + JSON.stringify({ before, after }));
    assert.ok(Math.abs(after.navX - before.navX) < 1, 'Navbar must not move as loading completes');
    await until("document.querySelector('[data-tab-page]')");
    const gutter = await evaluate(`(() => {
      window.dispatchEvent(new Event('spottr:cancel-scroll-restore'));
      const page = document.querySelector('[data-tab-page]');
      page.style.height = '100px'; page.style.overflow = 'hidden'; window.scrollTo(0, 0);
      const nav = document.querySelector('[data-bottom-nav-glass]');
      const short = nav.getBoundingClientRect().x;
      const shortScroll = document.documentElement.scrollHeight > innerHeight;
      page.style.height = '2400px';
      const tall = nav.getBoundingClientRect().x;
      const tallScroll = document.documentElement.scrollHeight > innerHeight;
      page.style.height = '100px';
      const shortAgain = nav.getBoundingClientRect().x;
      return { short, tall, shortAgain, shortScroll, tallScroll, gutter: getComputedStyle(document.documentElement).scrollbarGutter };
    })()`);
    assert.equal(gutter.shortScroll, false);
    assert.equal(gutter.tallScroll, true);
    assert.equal(gutter.gutter, 'stable');
    assert.ok(Math.abs(gutter.tall - gutter.short) < 1 && Math.abs(gutter.shortAgain - gutter.short) < 1, 'Navbar stable with scrollbar appearing/disappearing: ' + JSON.stringify(gutter));
    console.log('PASS Home skeleton geometry and stable scrollbar/navbar at ' + width + 'px');

    await navigate('/feed');
    await until("document.querySelector('article button img')");
    const media = await evaluate(`(async () => {
      const photo = document.querySelector('article button img');
      await photo.decode();
      const rect = () => { const r = photo.parentElement.getBoundingClientRect(); return { width: r.width, height: r.height, bottom: r.bottom }; };
      const before = rect();
      photo.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="1600"><rect width="100" height="1600" fill="blue"/></svg>');
      await photo.decode();
      await new Promise(requestAnimationFrame);
      return { before, after: rect() };
    })()`);
    assert.deepEqual(media.before, media.after, 'Photo intrinsic dimensions must not change the reserved post area');
    console.log('PASS delayed portrait photo keeps its reserved geometry at ' + width + 'px');
    await navigate('/events');
    await until("document.querySelector('button[aria-label=\"Filters\"]')");
    const modalNavX = await evaluate("document.querySelector('[data-bottom-nav-glass]').getBoundingClientRect().x");
    await evaluate("document.querySelector('button[aria-label=\"Filters\"]').click()");
    await until("history.state.__spottrLayer?.length");
    await delay(550);
    assert.ok(Math.abs(await evaluate("document.querySelector('[data-bottom-nav-glass]').getBoundingClientRect().x") - modalNavX) < 1, 'Scroll locking must not double-compensate the scrollbar');
    await evaluate("history.back()");
    await until("!history.state.__spottrLayer?.length && !document.querySelector('[role=dialog]')");
    assert.ok(Math.abs(await evaluate("document.querySelector('[data-bottom-nav-glass]').getBoundingClientRect().x") - modalNavX) < 1);
    console.log('PASS scrollbar reservation stays stable when opening/closing filters at ' + width + 'px');
    await navigate('/users/me');
    await until("window.__releaseCategories && document.querySelector('section button[aria-pressed]')");
    const preferencesHeight = await evaluate("document.querySelector('section button[aria-pressed]').closest('section').getBoundingClientRect().height");
    await evaluate("window.__releaseCategories()");
    await until("!document.querySelector('section button[aria-pressed]').disabled");
    assert.equal(await evaluate("document.querySelector('section button[aria-pressed]').closest('section').getBoundingClientRect().height"), preferencesHeight);
    console.log('PASS profile preferences keep their height while loading at ' + width + 'px');
    const categoryButton = "document.querySelector('section button[aria-pressed]')";
    const initialCategoryReads = await evaluate('window.__api.categoryReads');
    assert.equal(await evaluate(`${categoryButton}.getAttribute('aria-pressed')`), 'false');
    const category = await evaluate(`${categoryButton}.textContent`);
    // The first selection must work even if the initial GET returned JSON null.
    await evaluate(`window.__api.holdCategoryMutation = true; window.__categoryElement = ${categoryButton}; ${categoryButton}.click()`);
    await until('window.__releaseCategoryMutation');
    await until(`${categoryButton}?.getAttribute('aria-pressed') === 'true' && !${categoryButton}.disabled`);
    assert.deepEqual(await evaluate('window.__api.hiddenCategories'), [], 'Selection is visible before saving completes');
    assert.equal(await evaluate(`${categoryButton} === window.__categoryElement && !${categoryButton}.closest('section').querySelector('[role=status], button:disabled, [aria-busy=true]')`), true, 'No remount, spinner or disabled categories during saving');
    await evaluate('window.__api.holdCategoryMutation = false; window.__releaseCategoryMutation()');
    await until('window.__api.categoryCompletions === 1');
    assert.deepEqual(await evaluate('window.__api.hiddenCategories'), [category]);
    // Removing the last selection returns null again during the refetch.
    await evaluate(`${categoryButton}.click()`);
    await until('window.__api.categoryCompletions === 2');
    await until(`${categoryButton}?.getAttribute('aria-pressed') === 'false' && !${categoryButton}.disabled`);
    assert.deepEqual(await evaluate('window.__api.hiddenCategories'), []);
    await evaluate(`${categoryButton}.click()`);
    await until('window.__api.categoryCompletions === 3');
    await until(`${categoryButton}?.getAttribute('aria-pressed') === 'true' && !${categoryButton}.disabled`);
    assert.deepEqual(await evaluate('window.__api.categoryMutations'), [
      { method: 'POST', category }, { method: 'DELETE', category }, { method: 'POST', category },
    ], 'Empty -> selected -> empty -> selected');
    await evaluate(`${categoryButton}.click(); ${categoryButton}.click()`);
    await until('window.__api.categoryCompletions === 5');
    assert.deepEqual(await evaluate('window.__api.hiddenCategories'), [category], 'Rapid reversal saves the latest selection');
    await until(`${categoryButton}.getAttribute('aria-pressed') === 'true'`);
    const secondCategory = "document.querySelectorAll('section button[aria-pressed]')[1]";
    await evaluate(`window.__api.failCategoryMutation = true; ${secondCategory}.click()`);
    await until(`${secondCategory}.getAttribute('aria-pressed') === 'true'`);
    await until(`${secondCategory}.getAttribute('aria-pressed') === 'false' && document.querySelector('[data-sonner-toast]')`);
    assert.deepEqual(await evaluate('window.__api.hiddenCategories'), [category], 'A failed save reverts only the affected selection');
    await evaluate(`window.__api.failCategoryMutation = false; ${secondCategory}.click()`);
    await until('window.__api.hiddenCategories.length === 2');
    assert.equal(await evaluate('window.__api.categoryReads'), initialCategoryReads, 'Selections do not refetch or reset the component');
    console.log('PASS null categories, optimistic selection, rapid reversal and failed-save recovery at ' + width + 'px');
  }
  assert.deepEqual(errors, [], "No uncaught runtime errors");
  assert.deepEqual(lifecycleWarnings, [], "No insertion-effect warnings");
  await send("Target.closeTarget", { targetId });
  await send("Browser.close");
  await delay(500);
}

const deadline = setTimeout(() => { child.kill(); console.error("Browser test exceeded 120s"); process.exitCode = 1; }, 120000);
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  clearTimeout(deadline);
  socket?.close();
  if (child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await Promise.race([exited, delay(2000)]); }
  // The only recursive removal is the dedicated profile created by this test.
  const resolved = path.resolve(profile);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("pulse-layout-")) {
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
});
