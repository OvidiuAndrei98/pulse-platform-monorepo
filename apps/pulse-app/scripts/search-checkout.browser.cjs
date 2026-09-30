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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-search-checkout-"));
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


  const sizes = [390, 600, 767, 768, 1024, 1600, 600];
  const searchSizes = [];
  const resize = async width => {
    await call('Emulation.setDeviceMetricsOverride', {width,height:844,deviceScaleFactor:1,mobile:width < 768});
    await delay(150);
  };
  const geometry = () => evaluate(`(() => {
    const r = document.querySelector('[role=dialog]').getBoundingClientRect();
    return {x:r.x,y:r.y,width:r.width,height:r.height,viewport:innerWidth};
  })()`);
  await navigate('/');
  const openSearch = async () => {
    await evaluate("document.querySelector('button[aria-label=\"Search\"]').click()");
    await until("document.querySelector('[role=dialog] input[type=search]') && history.state.__spottrLayer?.length");
    await delay(700);
  };
  await openSearch();
  for (const width of sizes) {
    await resize(width);
    const r = await geometry(); searchSizes.push(r);
    const expected = width < 768 ? r.viewport : Math.min(680,Math.max(480,r.viewport*.46));
    assert.ok(Math.abs(r.width-expected)<2, 'Search width at '+width);
  }
  // The first live frame following popstate must already be clear. The system
  // gesture owns its snapshot animation; there must be no second JS exit.
  await evaluate(`window.__backFrames=[]; window.addEventListener('popstate',()=>{
    let remaining=35;
    const sample=()=>{window.__backFrames.push(Boolean(document.querySelector('[role=dialog]')));if(--remaining)requestAnimationFrame(sample);};
    requestAnimationFrame(sample);
  },{once:true}); history.back()`);
  await until('window.__backFrames.length === 35');
  assert.ok((await evaluate('window.__backFrames')).every(visible=>!visible),'Search never reappears after Back');
  assert.equal(await evaluate('Boolean(history.state.__spottrLayer?.length)'),false);
  assert.notEqual(await evaluate('document.body.style.overflow'),'hidden');
  await openSearch();
  await evaluate("document.querySelector('[role=dialog] header button').click()");
  assert.ok(await evaluate("Boolean(document.querySelector('[role=dialog]'))"),'X retains the visual exit');
  await until("!document.querySelector('[role=dialog]') && !history.state.__spottrLayer?.length");
  // Opening then going Back before delayed autofocus must not revive the input.
  await evaluate("document.querySelector('button[aria-label=\"Search\"]').click()");
  await until('Boolean(history.state.__spottrLayer?.length)');
  await evaluate('history.back()');
  await delay(800);
  assert.equal(await evaluate("Boolean(document.querySelector('[role=dialog]')) || document.activeElement?.type === 'search'"),false);
  console.log('PASS Search Back has no replay, X animates, and rapid Back cancels autofocus');

  await navigate('/events/test-event');
  await until("document.querySelector('[role=alert]')");
  await evaluate('window.__api.fail=false'); await retry();
  await until("document.querySelector('input[type=radio]')");
  await evaluate("document.querySelector('input[type=radio]').click(); Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim().startsWith('Continue')).click()");
  await until("document.querySelector('[role=dialog]')");
  await delay(700);
  for (const [index,width] of sizes.entries()) {
    await resize(width);
    const r = await geometry();
    assert.ok(Math.abs(r.width-searchSizes[index].width)<2, 'Checkout matches Search width at '+width);
    assert.ok(Math.abs(r.height-844)<2, 'Checkout retains full height at '+width);
    if(width<768) assert.ok(Math.abs(r.x)<2,'Checkout fills the screen below 768px');
  }
  await evaluate(`${button('Next')}.click()`);
  await until("document.querySelector('input[type=email]')");
  assert.equal(await evaluate("document.querySelector('input[type=email]').value"),'test@example.com');
  console.log('PASS checkout shares Search breakpoints through live mobile/desktop resizing and retains its steps');
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
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("pulse-search-checkout-")) {
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
});
