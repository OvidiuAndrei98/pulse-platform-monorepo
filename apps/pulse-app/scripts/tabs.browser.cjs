// Run against a local dev or production server: node scripts/tabs.browser.cjs
// Use dev mode to catch React's development-only lifecycle warnings.
// Override NAVIGATION_TEST_URL / CHROME_PATH when needed. No account is used.
// NAVIGATION_TEST_EXPORT=1 serves the existing out/ with Capacitor's asset rules.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");

let base = process.env.NAVIGATION_TEST_URL || "http://localhost:3100";
let exportServer;
const chrome = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-tabs-"));
const child = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;

async function run() {
  if (process.env.NAVIGATION_TEST_EXPORT === '1') {
    const { createStaticExportServer } = require('./helpers/static-export-server.cjs');
    exportServer = createStaticExportServer(path.join(__dirname, '../out'));
    await new Promise(resolve => exportServer.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${exportServer.address().port}`;
  }
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 45000);
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
  const viewportWidth = Number(process.env.NAVIGATION_TEST_WIDTH || 390);
  await call("Emulation.setDeviceMetricsOverride", { width: viewportWidth, height: 844, deviceScaleFactor: 1, mobile: viewportWidth < 768 });
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
    console.error('Nav hit target', await evaluate(`(() => { const b = document.querySelector('[data-bottom-nav] button'); const r = b.getBoundingClientRect(); return { rect: r.toJSON(), active: document.querySelector('[aria-current=page]')?.outerHTML, bodyPointer: getComputedStyle(document.body).pointerEvents, hits: document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2).slice(0, 6).map(e => e.outerHTML.slice(0, 350)) }; })()`));
    throw new Error("Timed out: " + expression + "\n" + detail);
  };
  const navigate = async (route) => {
    const previousDocument = await evaluate('performance.timeOrigin');
    await call("Page.navigate", { url: base + route });
    await until(`performance.timeOrigin !== ${previousDocument} && Boolean(history.state?.__spottrNavigation)`);
    await delay(250);
  };
  const button = (text) => `Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(text)})`;

  // Intercept every API call before hydration. No real account or payment is used.
  await call("Page.addScriptToEvaluateOnNewDocument", { source: `
    localStorage.setItem('pulse_token', 'mock-feedback-test');
    const originalFetch = window.fetch.bind(window);
    // Also hold static-export prefetches: production warms tabs before a tap.
    window.__coldRouteReleases = [];
    window.__releaseColdRoute = () => {
      window.__coldRouteReleased = true;
      window.__coldRouteReleases.splice(0).forEach(resolve => resolve());
    };
    window.__api = { fail: true, payment: 'pending', requests: [] };
    const organizer = { id: 'test-organizer', username: 'testorganizer', organizerName: 'Test Organizer', role: 'organizer', relationship: 'none', followsOrganizer: false, followerCount: 7, friendCount: 0, eventCount: 0, bio: '' };
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
      if (!url.pathname.includes('/api/v1/')) {
        if (!window.__coldRouteReleased && (url.pathname === '/events' || url.pathname === '/events.txt' || url.pathname.startsWith('/events/__next.'))) {
          window.__coldRouteHeld = true;
          await new Promise(resolve => window.__coldRouteReleases.push(resolve));
        }
        return originalFetch(input, init);
      }
      const route = url.pathname.split('/api/v1')[1];
      const state = window.__api;
      state.requests.push(route + url.search);
      const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
      if (route === '/wardrobe/mine') return respond({ deposits: [], staffAccess: false });
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
        if (route.startsWith('/events/')) return respond({ id: 'test-event', title: 'Test Event', organizerId: 'test-organizer', organizerName: 'Test Organizer', description: 'Test description', locationName: 'Test venue', city: 'Bucuresti', latitude: 44.4, longitude: 26.1, category: 'Party', startTime: '2099-10-01T18:00:00Z', endTime: '2099-10-02T04:00:00Z', stats: { isFavorited: false, goingCount: 0 }, ticketTypes: [{ id: 'test-tier', name: 'Test ticket', priceRon: 50, description: 'Entry', capacity: 100, ticketsSold: 0, startSales: '2020-01-01T00:00:00Z', endSales: '2099-10-01T17:00:00Z' }] });
        return respond([]);
      }
      return respond([]);
    };
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', { value: (_ok, fail) => setTimeout(() => fail({ code: 1, message: 'Permission denied' }), 100) });
  ` });
  const hasText = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`;
  const retry = async () => { await evaluate(`${button("Try again")}.click()`); };


  // Keep data requests separate from route requests to exercise both kinds of delay.
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    const fallbackFetch = window.fetch;
    window.__data = { counts: {}, holds: {}, releases: {}, fail: sessionStorage.getItem('test-fail-data') === '1', version: 'Cached' };
    const example = { id: 'cached-event', title: 'Cached event', organizerId: 'test-organizer', organizerName: 'Organizer',
      locationName: 'Test venue', city: 'Cluj', category: 'PARTY', latitude: 44.4, longitude: 26.1,
      startTime: '2099-10-01T18:00:00Z', endTime: '2099-10-02T04:00:00Z', stats: { isFavorited: true, goingCount: 0 }, ticketTypes: [] };
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
      const route = url.pathname.split('/api/v1')[1];
      const state = window.__data;
      if (route?.endsWith('/social')) return new Response(JSON.stringify({ friends: [], goingCount: 0, ticketsSoldCount: 0, manualGoingCount: 0 }), { headers: { 'Content-Type': 'application/json' } });
      const known = ['/events', '/feed', '/users/me/saved-events', '/users/me/tickets'];
      if (!known.includes(route)) return fallbackFetch(input, init);
      state.counts[route] = (state.counts[route] || 0) + 1;
      if (state.holds[route]) await new Promise(resolve => { state.releases[route] = resolve; });
      const response = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
      if (state.fail) return new Response(JSON.stringify({ title: 'Simulated failure' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      if (route === '/feed') return response([{ activityType: 'organizer_event', actorId: 'test-organizer', actorUsername: 'Organizer', eventId: example.id, eventTitle: 'Cached feed event', eventStartTime: example.startTime, occurredAt: '2026-09-28T10:00:00Z' }]);
      if (route === '/users/me/tickets') return response([{ id: 'ticket', eventId: example.id, eventTitle: 'Cached ticket', startTime: example.startTime, endTime: example.endTime, ticketTypeName: 'Standard', locationName: 'Test venue', validationHash: 'mock', priceRon: 50 }]);
      return response([{ ...example, title: state.version + (route.includes('saved') ? ' saved event' : ' event') }]);
    };
  ` });
  await navigate('/');
  await until("document.querySelector('[data-nav-scroll^=home-carousel] [role=button]')");
  await until("document.querySelector('[data-nav-indicator]')");
  await evaluate(`window.__navbar = document.querySelector('[data-bottom-nav]');
    window.__indicator = document.querySelector('[data-nav-indicator]');
    window.__pageSurface = document.querySelector('[data-tab-page]');
    window.__directions = []; window.addEventListener('spottr:tab-transition', e => window.__directions.push(e.detail.direction));`);
  let documentStart = await evaluate('performance.timeOrigin');
  const initial = await call('Page.getNavigationHistory');
  const tapTab = async label => {
    await until(`(() => { const b = document.querySelector('[data-bottom-nav] button[aria-label="${label}"]'); const r = b.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === b; })()`);
    const point = await evaluate(`(() => {
      const rect = document.querySelector('[data-bottom-nav] button[aria-label="${label}"]').getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
    assert.equal(await evaluate("document.querySelector('[data-bottom-nav] button[aria-current=page]').getAttribute('aria-label')"), label, 'Tab responds on contact, before the finger is lifted');
    await delay(30);
    await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const tab = async (label, path) => {
    await tapTab(label);
    await until(`location.pathname === '${path}' && document.querySelector('[data-bottom-nav] button[aria-current="page"]').getAttribute('aria-label') === '${label}'`);
    assert.equal(await evaluate('performance.timeOrigin'), documentStart, 'Tab navigation must not reload the document');
    assert.equal(await evaluate("document.querySelector('[data-bottom-nav]') === window.__navbar"), true);
    assert.equal(await evaluate("document.querySelector('[data-nav-indicator]') === window.__indicator"), true);
    assert.equal(await evaluate("document.querySelector('[data-tab-page]') === window.__pageSurface && window.__pageSurface.getAnimations().length === 0 && getComputedStyle(window.__pageSurface).transform === 'none'"), true, 'Persistent content surface must not slide or fade');
  };
  await evaluate(`(() => {
    window.__coldCommits = [];
    window.addEventListener('spottr:navigation', () => window.__coldCommits.push(location.pathname));
  })()`);
  const initialX = await evaluate('window.__indicator.getBoundingClientRect().x');
  await tapTab('Map');
  await until('window.__coldRouteHeld');
  assert.equal(await evaluate('location.pathname'), '/');
  await delay(80);
  assert.ok(await evaluate('window.__indicator.getBoundingClientRect().x') > initialX + 5, 'Capsule moves while the destination route is still blocked');
  assert.equal(await evaluate("document.querySelector('[data-bottom-nav] button[aria-current=page]').getAttribute('aria-label')"), 'Map');
  await tab('Home', '/');
  await evaluate('window.__releaseColdRoute()');
  await delay(400);
  assert.equal(await evaluate('location.pathname'), '/');
  assert.equal(await evaluate("window.__coldCommits.includes('/events')"), false);
  console.log('PASS immediate capsule movement, real touch cancellation and ignored late route');

  await tab('Map', '/events');
  await until("document.querySelector('[data-nav-scroll=events-list] button') && document.body.innerText.includes('Cached event')");
  await tab('Feed', '/feed');
  await until("document.querySelector('article')");
  await tab('Profile', '/users/me');
  await until("document.body.innerText.includes('Cached saved event') && document.body.innerText.includes('Cached ticket')");
  await tab('Home', '/');
  await until("document.querySelector('[data-nav-scroll^=home-carousel] [role=button]')");
  // Warm re-entry: withhold every API response that could replace the visible data.
  // The event list now caches pages for 30s. Expire caches without a long wait.
  await evaluate('window.__realDateNow = Date.now; Date.now = () => window.__realDateNow() + 130000');
  await evaluate("window.__data.holds = { '/events': true, '/users/me/saved-events': true, '/users/me/tickets': true, '/feed': true }");
  await tab('Map', '/events');
  await until("window.__data.releases['/events']");
  assert.equal(await evaluate("document.body.innerText.includes('Cached event') && !document.querySelector('[data-nav-scroll=events-list] .animate-pulse')"), true);
  await evaluate("window.__data.version = 'Fresh'; window.__data.releases['/events'](); delete window.__data.holds['/events']");
  await until("document.body.innerText.includes('Fresh event')");
  console.log('PASS Map keeps cached cards visible and then shows fresh results');
  await tab('Feed', '/feed');
  await until("window.__data.releases['/feed']");
  assert.equal(await evaluate("document.body.innerText.includes('Cached feed event') && !document.querySelector('main [role=status]')"), true);
  await evaluate("window.__data.fail = true; window.__data.releases['/feed'](); delete window.__data.holds['/feed']");
  await delay(200);
  assert.equal(await evaluate("document.body.innerText.includes('Cached feed event')"), true, 'Failed refresh must not erase the feed');
  await evaluate('window.__data.fail = false; Date.now = window.__realDateNow');
  await tab('Profile', '/users/me');
  await until("window.__data.releases['/users/me/tickets'] && window.__data.releases['/users/me/saved-events']");
  assert.equal(await evaluate("document.body.innerText.includes('Cached saved event') && document.body.innerText.includes('Cached ticket')"), true);
  assert.equal(await evaluate("Boolean(document.querySelector('[data-tab-page] .animate-pulse'))"), false, 'No profile skeleton on warm re-entry');
  await evaluate("window.__data.fail = true; window.__data.releases['/users/me/tickets'](); window.__data.releases['/users/me/saved-events'](); window.__data.holds = {}");
  await until("document.querySelector('[role=alert]')");
  assert.equal(await evaluate("document.body.innerText.includes('Cached saved event') && document.body.innerText.includes('Cached ticket')"), true, 'Profile data survives a background failure');
  await evaluate('window.__data.fail = false');
  console.log('PASS expired Feed and Profile revalidate without full loading or losing data on errors');

  await tab('Home', '/');
  await delay(300);
  // Sample the actual capsule position, including a mid-flight reversal.
  const smooth = await evaluate(`new Promise(resolve => {
    const samples = []; const started = performance.now();
    const position = () => window.__indicator.getBoundingClientRect().x;
    const start = position();
    document.querySelector('[data-bottom-nav] button[aria-label="Profile"]').click();
    setTimeout(() => document.querySelector('[data-bottom-nav] button[aria-label="Map"]').click(), 70);
    const frame = () => {
      samples.push({ time: performance.now() - started, x: position() });
      if (performance.now() - started < 450) requestAnimationFrame(frame);
      else resolve({ samples, start, target: document.querySelector('[data-bottom-nav] button[aria-label="Map"]').getBoundingClientRect().x });
    };
    requestAnimationFrame(frame);
  })`);
  assert.ok(smooth.samples.some(s => s.time < 100 && s.x > smooth.start + 2), 'Capsule must start moving in the first frames');
  assert.ok(new Set(smooth.samples.map(s => Math.round(s.x))).size >= 5, 'Several intermediate positions, not a jump');
  assert.ok(Math.abs(smooth.samples.at(-1).x - smooth.target) < 1, JSON.stringify(smooth));
  await until("location.pathname === '/events'");
  assert.equal(await evaluate("document.querySelectorAll('[data-bottom-nav]').length"), 1);
  assert.notEqual(await evaluate("getComputedStyle(document.querySelector('[data-bottom-nav-glass]')).backdropFilter"), 'none');
  const tabPoint = label => evaluate(`(() => {
    const button = document.querySelector('[data-bottom-nav] button[aria-label="${label}"]');
    const r = button.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  const activeTab = () => evaluate("document.querySelector('[data-bottom-nav] button[aria-current=page]').getAttribute('aria-label')");
  await evaluate(`window.__inputRequests = []; window.__retapScrolls = 0;
    window.addEventListener('spottr:tab-request', e => { if (e.detail.accepted) window.__inputRequests.push(e.detail.href); });
    window.addEventListener('spottr:cancel-scroll-restore', () => window.__retapScrolls++);`);
  const homePoint = await tabPoint('Home');
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...homePoint, button: 'left', buttons: 1, clickCount: 1 });
  assert.equal(await activeTab(), 'Home', 'Mouse responds before release, too');
  // A fast press that slips outside the button must not be lost to a drag.
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: homePoint.x + 20, y: homePoint.y - 70, buttons: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: homePoint.x + 20, y: homePoint.y - 70, button: 'left', buttons: 0, clickCount: 1 });
  assert.equal(await activeTab(), 'Home');
  const expectedRequests = ['/'];
  const targets = [['Profile', '/users/me'], ['Map', '/events'], ['Home', '/'], ['Feed', '/feed']];
  for (let i = 0; i < 24; i++) {
    const [label, route] = targets[i % targets.length];
    const point = await tabPoint(label);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    assert.equal(await activeTab(), label, `Rapid mouse press ${i} accepted`);
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    expectedRequests.push(route);
  }
  for (let i = 0; i < 8; i++) {
    const [label, route] = targets[i % targets.length];
    const point = await tabPoint(label);
    await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
    assert.equal(await activeTab(), label, `Rapid touch ${i} accepted`);
    await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 12, y: point.y, id: 1 }] });
    await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expectedRequests.push(route);
  }
  // Alternating thumbs may overlap briefly. The second contact still counts,
  // and lifting the first must not switch back to its tab.
  const mapPoint = await tabPoint('Map');
  await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...homePoint, id: 1 }] });
  assert.equal(await activeTab(), 'Home');
  await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...homePoint, id: 1 }, { ...mapPoint, id: 2 }] });
  assert.equal(await activeTab(), 'Map', 'Overlapping second touch also selects its tab');
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ ...mapPoint, id: 2 }] });
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expectedRequests.push('/', '/events');
  await until("location.pathname === '/events'");
  assert.deepEqual(await evaluate('window.__inputRequests'), expectedRequests, 'Each press runs once; release cannot issue another navigation');
  assert.equal(await evaluate('window.__retapScrolls'), 0, 'Release must not accidentally scroll the new tab to top');
  assert.equal(await evaluate("getComputedStyle(window.__navbar).userSelect"), 'none');
  assert.equal(await evaluate(`(() => {
    const b = document.querySelector('[data-bottom-nav] button');
    return getComputedStyle(b.querySelector('svg')).pointerEvents === 'none'
      && !b.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true }));
  })()`), true, 'No SVG hit target or uncancelled native drag');
  // Secondary buttons must not activate tabs; Enter/Space must still work.
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...homePoint, button: 'right', buttons: 2, clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...homePoint, button: 'right', buttons: 0, clickCount: 1 });
  assert.equal(await activeTab(), 'Map');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await evaluate("document.querySelector('[data-bottom-nav] button[aria-label=Home]').focus()");
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await until("location.pathname === '/' && document.querySelector('[aria-current=page]').getAttribute('aria-label') === 'Home'");
  await evaluate("document.querySelector('[data-bottom-nav] button[aria-label=Map]').focus()");
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await until("location.pathname === '/events' && document.querySelector('[aria-current=page]').getAttribute('aria-label') === 'Map'");
  console.log('PASS rapid mouse/touch presses, slipping taps, no duplicate activation or native drag, keyboard');
  const finalHistory = await call('Page.getNavigationHistory');
  assert.equal(finalHistory.entries.length, initial.entries.length, 'Root tabs replace history entries');
  assert.ok(await evaluate('window.__directions.includes(-1) && window.__directions.includes(1)'));
  console.log('PASS rapid reversal, one persistent navbar, blur and root history');

  await evaluate("document.querySelector('button[aria-label=Filters]').click()");
  await until("document.querySelector('[data-drawer-viewport]')");
  assert.equal(await evaluate("(() => { const detail = { href: '/', accepted: false }; window.dispatchEvent(new CustomEvent('spottr:tab-request', { detail })); return detail.accepted; })()"), false);
  await evaluate(`${button('Apply filters')}.click()`);
  await until("!document.querySelector('[data-drawer-viewport]')");
  await delay(550); // Let the modal's exit layer release touch handling.
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await tab('Home', '/');
  assert.equal(await evaluate("document.querySelector('[data-tab-page]').getAnimations().length"), 0);
  assert.equal(await evaluate('window.__indicator.getAnimations().length'), 0);
  console.log('PASS open filters block tab navigation; reduced motion');

  // A fresh session with no successful Feed response: retrying on re-entry
  // keeps the known error visible instead of flashing a full-page skeleton.
  // Home also preloads Feed, so simulate failure from before hydration.
  await evaluate("sessionStorage.setItem('test-fail-data', '1')");
  await navigate('/');
  await until("document.querySelector('[data-nav-indicator]')");
  await evaluate(`window.__navbar = document.querySelector('[data-bottom-nav]');
    window.__indicator = document.querySelector('[data-nav-indicator]');
    window.__pageSurface = document.querySelector('[data-tab-page]');
    window.__data.fail = true;`);
  documentStart = await evaluate('performance.timeOrigin');
  await until("document.querySelector('[role=alert]')");
  await tab('Feed', '/feed');
  await until("document.querySelector('main [role=alert]')");
  await tab('Home', '/');
  await evaluate("window.__data.holds['/feed'] = true");
  await tab('Feed', '/feed');
  await until("window.__data.releases['/feed']");
  assert.equal(await evaluate("Boolean(document.querySelector('main [role=alert]')) && !document.querySelector('main [role=status]')"), true);
  await evaluate("window.__data.fail = false; window.__data.releases['/feed']()");
  await until("document.querySelector('article')");
  console.log('PASS failed first load remains stable on tab re-entry and recovers in place');
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
  exportServer?.close();
  if (child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await Promise.race([exited, delay(2000)]); }
  // The only recursive removal is the dedicated profile created by this test.
  const resolved = path.resolve(profile);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("pulse-tabs-")) {
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
});
