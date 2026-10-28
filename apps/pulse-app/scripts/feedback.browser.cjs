// Run against a local dev or production server: node scripts/feedback.browser.cjs
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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-feedback-"));
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

  for (const route of ["/users/me/tickets", "/users/me/invoices"]) {
    await navigate(route);
    await until("document.querySelector('[role=alert]')");
    assert.equal(await evaluate(hasText("No invoices yet")), false);
    assert.equal(await evaluate(hasText("You have no active tickets.")), false);
    await evaluate("window.__api.fail = false");
    await retry();
    await until("!document.querySelector('[role=alert]') && !document.querySelector('main .animate-pulse')");
    assert.ok(await evaluate("window.__api.requests.filter(path => /tickets|orders/.test(path)).length >= 2"));
    console.log("PASS error and retry on " + route);
  }
  await navigate("/events");
  await until("document.querySelector('[role=alert]')");
  await evaluate(`${button("Map")}.click()`);
  await until("document.querySelector('.leaflet-container') && document.querySelector('[role=alert]')");
  await evaluate("window.__api.fail = false");
  await retry();
  await until("!document.querySelector('[role=alert]') && !document.querySelector('[role=status]')");
  await evaluate("document.querySelector('button[aria-label=\"Find my location\"]').click()");
  await until(hasText("Location access is disabled."));
  console.log("PASS map fetch retry and denied location feedback");

  await navigate("/events/test-event");
  await until("document.querySelector('[role=alert]')");
  assert.equal(await evaluate(hasText("404")), false);
  console.log("PASS event network failure does not become a 404");
  await evaluate("window.__api.fail = false");
  await retry();
  await until("document.querySelector('input[type=radio]')");
  await evaluate("(() => { const target = document.querySelector('button[aria-label=\"Add to favorites\"]'); target.click(); target.click(); })()");
  await until("document.querySelector('button[aria-label=\"Remove from favorites\"][aria-busy=true]')");
  await until("document.querySelector('button[aria-label=\"Add to favorites\"]:not(:disabled)')");
  assert.equal(await evaluate("window.__api.requests.filter(path => path.includes('/favorite')).length"), 1);
  await until(hasText("The change couldn't be saved."));
  console.log("PASS favorite prevents duplicate requests and restores its state after failure");
  await evaluate("document.querySelector('input[type=radio]').click()");
  await evaluate("Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().startsWith('Continue')).click()");
  await until(`${button("Next")}`);
  await evaluate(`${button("Next")}.click()`);
  await until("document.querySelector('input[type=email]')");
  await evaluate(`${button("Continue to summary")}.click()`);
  await until("document.activeElement?.getAttribute('aria-invalid') === 'true'");
  assert.equal(await evaluate("document.activeElement.getAttribute('aria-invalid')"), "true");
  for (const [suffix, value] of [["name", "Test User"], ["address", "Street 1"], ["city", "Cluj"], ["county", "Cluj"]]) {
    await evaluate(`(() => { const input = document.querySelector('input[id$="-billing-${suffix}"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  }
  await evaluate(`${button("Continue to summary")}.click()`);
  await until("Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim().startsWith('Pay'))");
  await delay(300);
  assert.equal(await evaluate("document.querySelector('input[type=email]').offsetParent === null"), true);
  await evaluate("(() => { const target = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().startsWith('Pay')); target.click(); target.click(); })()");
  await until("window.__api.requests.some(path => path.includes('/purchase'))");
  await until(hasText("Simulated mutation failure"));
  assert.equal(await evaluate("window.__api.requests.filter(path => path.includes('/purchase')).length"), 1);
  console.log("PASS inline billing validation and one checkout request from summary");
  await navigate("/?eventId=test-event");
  await until("document.querySelector('[role=dialog] [role=alert]')");
  console.log("PASS event deep-link failure is visible in the sheet");

  const enterSheetCheckout = async summary => {
    await until("document.querySelector('[data-vaul-drawer] input[type=radio]')");
    await evaluate("document.querySelector('[data-vaul-drawer] input[type=radio]').click()");
    await evaluate("Array.from(document.querySelectorAll('[data-vaul-drawer] button')).find(b => b.textContent.trim().startsWith('Continue')).click()");
    await until(`${button("Next")}`);
    await evaluate(`${button("Next")}.click()`);
    await until("document.querySelector('aside[role=dialog] input[type=email]')");
    if (summary) {
      for (const [suffix, value] of [["name", "Test User"], ["address", "Street 1"], ["city", "Cluj"], ["county", "Cluj"]]) {
        await evaluate(`(() => { const input = document.querySelector('input[id$="-billing-${suffix}"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      }
      await evaluate(`${button("Continue to summary")}.click()`);
      await until("Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim().startsWith('Pay'))");
    }
    await until("document.querySelector('aside[role=dialog]')");
    await delay(550);
  };
  const dismissCheckoutAndEvent = async expectedStep => {
    assert.ok(await evaluate(`document.querySelector('aside[role=dialog]').textContent.includes(${JSON.stringify(expectedStep)})`));
    await evaluate('history.back()');
    await until("!document.querySelector('aside[role=dialog]') && document.querySelector('[data-vaul-drawer][data-state=open] input[type=radio]')");
    assert.ok(await evaluate("new URLSearchParams(location.search).has('eventId')"), 'Back from checkout restores the same event');
    await call('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27 });
    await until("!document.querySelector('[data-vaul-drawer]')");
    assert.equal(await evaluate("new URLSearchParams(location.search).has('eventId')"), false);
  };
  const checkUpwardOverscroll = async (surfaceColor = [0, 0, 0, 255]) => {
    await delay(600);
    await evaluate(`(() => {
      const marker = document.createElement('div');
      marker.id = 'overscroll-test-background';
      marker.style.cssText = 'position:fixed;inset:auto 0 0;height:120px;background:#00ff00;z-index:98;pointer-events:none';
      document.body.append(marker);
    })()`);
    const origin = await evaluate("(() => { const r = document.querySelector('[data-vaul-drawer]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.top + 14 }; })()");
    await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...origin, id: 1 }] });
    // Establish a drawer drag downward, then reverse past its resting position.
    // Vaul leaves a gesture that starts upward to the scrollable content.
    for (const offset of [-24, -48, 25, 60, 100]) {
      await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: origin.x, y: origin.y - offset, id: 1 }] });
      await delay(40);
    }
    const geometry = await evaluate("({ bottom: document.querySelector('[data-vaul-drawer]').getBoundingClientRect().bottom, height: innerHeight, width: innerWidth })");
    assert.ok(geometry.bottom < geometry.height - 3, 'Upward elastic drag must still work: ' + JSON.stringify(geometry));
    const screenshot = await call('Page.captureScreenshot', { format: 'png' });
    const pixel = await evaluate(`(async () => {
      const image = new Image(); image.src = 'data:image/png;base64,${screenshot.data}'; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      return Array.from(context.getImageData(${Math.floor(geometry.width / 2)}, ${geometry.height - 4}, 1, 1).data);
    })()`);
    assert.deepEqual(pixel, surfaceColor, 'The sheet surface must cover the gap below its lifted bottom edge');
    await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await until("Math.abs(document.querySelector('[data-vaul-drawer]').getBoundingClientRect().bottom - innerHeight) < 1");
    assert.equal(await evaluate("document.querySelector('[data-vaul-drawer]').dataset.state"), 'open');
    await evaluate("document.querySelector('#overscroll-test-background').remove()");
  };
  await evaluate("window.__api.fail = false");
  await evaluate("document.querySelector('[data-vaul-drawer] [role=alert] button').click()");
  await until("document.querySelector('[data-vaul-drawer] input[type=radio]')");
  await checkUpwardOverscroll();
  console.log('PASS upward event sheet drag keeps its background filled and settles without closing');
  await enterSheetCheckout(false);
  await dismissCheckoutAndEvent("Step 2 of 3");
  assert.equal(await evaluate("location.pathname"), "/");
  console.log("PASS Back from billing restores the event; Escape closes the event");

  const beforeEvent = await call("Page.getNavigationHistory");
  await evaluate(`(() => {
    const { __NA, _N, ...state } = history.state;
    history.pushState({ ...state, __spottrEvent: true }, '', '/?eventId=test-event');
  })()`);
  await enterSheetCheckout(true);
  await dismissCheckoutAndEvent("Step 3 of 3");
  assert.equal((await call("Page.getNavigationHistory")).currentIndex, beforeEvent.currentIndex);
  console.log("PASS summary returns to its event before dismissal, with no stale history entry");

  await navigate('/feed');
  await until(`${button('My friends')}`);
  await evaluate(`${button('My friends')}.click()`);
  await until("document.querySelector('[data-vaul-drawer]')");
  await checkUpwardOverscroll();
  await evaluate('history.back()');
  await until("!document.querySelector('[data-vaul-drawer]')");
  await navigate('/users/me');
  await until(`${button('My code')}`);
  await evaluate(`${button('My code')}.click()`);
  await until("document.querySelector('[data-vaul-drawer] img')");
  assert.ok(await evaluate("document.querySelector('[data-vaul-drawer]').getBoundingClientRect().height > 250"), 'Content-sized QR sheet retains its layout');
  await checkUpwardOverscroll();
  await evaluate('history.back()');
  await until("!document.querySelector('[data-vaul-drawer]')");
  console.log('PASS Friends and content-sized QR sheets retain layout, upward drag and Back');

  await navigate("/");
  await until("document.querySelector('button[aria-label=\"Search\"]')");
  await evaluate("document.querySelector('button[aria-label=\"Search\"]').click()");
  await until("document.querySelector('[role=dialog] input')");
  const type = async (value) => evaluate(`(() => { const input = document.querySelector('[role=dialog] input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await type("older");
  await until("window.__api.requests.some(path => path.includes('q=older'))");
  await type("newer");
  await until(hasText("@newerresult"));
  await delay(1200);
  assert.equal(await evaluate(hasText("@olderresult")), false);
  await type("error");
  await until("document.querySelector('[role=dialog] [role=alert]')");
  await evaluate("window.__api.fail = false; document.querySelector('[role=dialog] [role=alert] button').click()");
  await until(hasText("@errorresult"));
  console.log("PASS stale search response ignored; failed search can retry");

  await navigate("/users/test-organizer");
  await until(`${button("Follow")}`);
  await evaluate(`(() => { const target = ${button("Follow")}; target.click(); target.click(); })()`);
  await until("document.querySelector('button[aria-busy=true]')");
  await until(hasText("The change couldn't be saved."));
  assert.equal(await evaluate("window.__api.requests.filter(path => path.includes('/follow')).length"), 1);
  assert.ok(await evaluate(`Boolean(${button("Follow")})`));
  console.log("PASS follow prevents duplicate requests and rolls back on failure");

  await navigate("/checkout/success?session_id=mock&event_id=mock");
  await until(hasText("Still awaiting confirmation"));
  assert.equal(await evaluate("window.__api.requests.filter(path => path === '/checkout/reconcile').length"), 4);
  assert.equal(await evaluate("Boolean(document.querySelector('main .animate-spin'))"), false);
  await evaluate("window.__api.payment = 'offline'");
  await evaluate(`${button("Check again")}.click()`);
  await until(hasText("We couldn't check your payment"));
  await evaluate("window.__api.payment = 'completed'");
  await evaluate(`${button("Check again")}.click()`);
  await until("document.querySelector('main a[href=\"/users/me/tickets\"]')");
  console.log("PASS pending and offline confirmation stop spinning; retry can confirm");
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
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("pulse-feedback-")) {
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
});
