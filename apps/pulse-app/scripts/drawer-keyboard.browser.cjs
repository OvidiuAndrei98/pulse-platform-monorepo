// Run against a local dev or production server: node scripts/drawer-keyboard.browser.cjs
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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-keyboard-"));
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
    window.__api = { fail: false, payment: 'pending', requests: [], billing: null };
    const organizer = { id: 'test-organizer', username: 'testorganizer', organizerName: 'Test Organizer', role: 'organizer', relationship: 'none', followsOrganizer: false, followerCount: 7, friendCount: 0, eventCount: 0, bio: '' };
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
      if (!url.pathname.includes('/api/v1/')) return originalFetch(input, init);
      const route = url.pathname.split('/api/v1')[1];
      const state = window.__api;
      const method = (init?.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
      state.requests.push(route + url.search);
      const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
      if (route === '/wardrobe/mine') return respond({ deposits: [], staffAccess: false });
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      if (route === '/users/me') return respond({ id: 'test-user', username: 'Test User', email: 'test@example.com', role: location.pathname.startsWith('/dashboard') ? 'organizer' : 'user', preferredLanguage: 'en' });
      if (route === '/users/me/billing-details' && method === 'GET') return respond(state.billing ? { details: state.billing } : {});
      if (route === '/users/me/billing-details' && method === 'PUT') { state.billing = JSON.parse(init.body); return respond(state.billing); }
      if (route === '/users/me/billing-details' && method === 'DELETE') { state.billing = null; return new Response(null, { status: 204 }); }
      if (route.startsWith('/dashboard/organizer/profile/')) return respond({isVerified:true,verificationStatus:'approved',stripeChargesEnabled:true,stripePayoutsEnabled:true});
      if (route === '/dashboard/events/mobile') return respond({id:'mobile',organizerId:'test-user',title:'Keyboard fixture',description:'A complete test event description',category:'house',vibe:'indoor',status:'published',city:'Bucuresti',locationName:'Test venue',latitude:44,longitude:26,startTime:'2099-10-01T18:00:00Z',endTime:'2099-10-02T04:00:00Z',organizerAbsorbsServiceFee:false,lineup:[],stats:{},ticketTypes:[]});
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

  // Model visualViewport changes independently of the layout viewport, as on
  // iOS. This is not a substitute for a physical Safari/SwiftKey check.
  await call('Page.addScriptToEvaluateOnNewDocument', {source: `
    window.__keyboard = {height:innerHeight, offsetTop:0, scale:1};
    for (const key of ['height','offsetTop','scale']) Object.defineProperty(visualViewport,key,{configurable:true,get:()=>window.__keyboard[key]});
  `});
  const keyboard = async (height, offsetTop=0, scale=1) => {
    await evaluate('Object.assign(window.__keyboard,'+JSON.stringify({height,offsetTop,scale})+'); visualViewport.dispatchEvent(new Event("resize")); visualViewport.dispatchEvent(new Event("scroll"));');
    await delay(250);
  };
  const checkKeyboard = async (field, surface='[data-drawer-viewport]') => {
    await delay(600);
    await evaluate('window.__panel=document.querySelector('+JSON.stringify(surface)+');window.__field=document.querySelector('+JSON.stringify(field)+');window.__field.focus({preventScroll:true});');
    await delay(150);
    const original = await evaluate('({height:__panel.offsetHeight,top:__panel.getBoundingClientRect().top,style:__panel.style.cssText})');
    await keyboard(420);
    assert.equal(await evaluate('__panel.dataset.keyboardOpen'),'true');
    assert.ok(await evaluate("[...__panel.querySelectorAll('[data-drawer-keyboard-hide]')].every(node=>getComputedStyle(node).display==='none')"),'Marked drawer chrome is hidden while typing');
    assert.ok(await evaluate("[...__panel.querySelectorAll('[data-drawer-keyboard-header]')].every(node=>parseFloat(getComputedStyle(node).paddingTop)<=8)"),'Drawer header is compact while typing');
    assert.ok(await evaluate("[...__panel.querySelectorAll('[data-drawer-keyboard-footer]')].every(node=>parseFloat(getComputedStyle(node).paddingBottom)<=8)"),'Drawer footer is compact while typing');
    assert.ok(await evaluate("[...__panel.querySelectorAll('[data-drawer-keyboard-control]')].every(node=>node.getBoundingClientRect().height<=44)"),'Drawer controls are compact while typing');
    const bounds = await evaluate('({top:__panel.getBoundingClientRect().top,bottom:__panel.getBoundingClientRect().bottom,fieldTop:__field.getBoundingClientRect().top,fieldBottom:__field.getBoundingClientRect().bottom,scroll:scrollY})');
    assert.ok(bounds.bottom<=421 && bounds.top>=0,JSON.stringify(bounds));
    assert.ok(bounds.fieldTop>=bounds.top && bounds.fieldBottom<=bounds.bottom,'Focused field stays visible: '+JSON.stringify(bounds));
    assert.ok(await evaluate("document.body.style.position==='fixed' || (getComputedStyle(document.body).overflowY==='hidden' && (document.body.hasAttribute('data-scroll-locked') || getComputedStyle(document.documentElement).overflowY==='hidden'))"),'Keyboard keeps the underlying page locked, including the scroll-preserving side-panel lock');
    const currentTop=bounds.top;
    await keyboard(390,30);
    assert.ok(Math.abs(await evaluate('__panel.getBoundingClientRect().top')-currentTop-30)<2,'Compensate viewport pan once, not twice');
    await keyboard(844);
    assert.ok(Math.abs(await evaluate('__panel.offsetHeight')-original.height)<2,'Restores natural drawer size');
    assert.equal(await evaluate('__panel.dataset.keyboardOpen'),undefined);
    await keyboard(420,0,2);
    assert.equal(await evaluate('__panel.dataset.keyboardOpen'),undefined,'Pinch zoom is not treated as keyboard');
    await keyboard(844);
  };

  await navigate('/events/test-event');
  await until("document.querySelector('input[type=radio]')");
  await evaluate("document.querySelector('input[type=radio]').click(); Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim().startsWith('Continue')).click()");
  await until("document.querySelector('[role=dialog]')");
  assert.equal(await evaluate("document.querySelector('[role=dialog] [data-drawer-keyboard-scroll]').contains(document.querySelector('[role=dialog] header'))"), true, 'Checkout header scrolls with the form instead of staying pinned');
  await evaluate(button('Next')+'.click()');
  await until("document.querySelector('input[id$=\"-billing-country\"]')");
  await checkKeyboard('input[id$="-billing-country"]');
  await call('Emulation.setTouchEmulationEnabled',{enabled:true});
  await call('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
  await keyboard(200);
  assert.ok(await evaluate('__panel.getBoundingClientRect().bottom<=201'),'Landscape keyboard fits the rotated viewport');
  await keyboard(390);
  assert.equal(await evaluate('__panel.dataset.keyboardOpen'),undefined,'Rotation does not leave a stale keyboard threshold');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await keyboard(844);
  // Close with the keyboard still open, and ensure all page locks are released.
  await keyboard(420);
  await evaluate("document.querySelector('[role=dialog] header button:last-child').click()");
  await until("!document.querySelector('[role=dialog]')");
  await keyboard(844);
  assert.equal(await evaluate('document.body.style.position'),'');
  assert.equal(await evaluate('document.body.style.overflow'),'');
  console.log('PASS checkout: lower fields, viewport pan, restore, pinch zoom and keyboard-open dismissal');

  await navigate('/events/test-event');
  await evaluate("window.__api.billing = {type:'company',name:'Saved Company',taxId:'RO123',registrationNumber:'J1/1/2026',address:'Saved street 1',city:'Cluj-Napoca',county:'Cluj',sector:'',country:'Romania'}");
  await until("document.querySelector('input[type=radio]')");
  await evaluate("document.querySelector('input[type=radio]').click(); Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim().startsWith('Continue')).click()");
  await until("document.querySelector('[role=dialog]')");
  await evaluate(button('Next')+'.click()');
  await until("Array.from(document.querySelectorAll('[role=dialog] button')).some(button=>button.textContent.includes('Use these details'))");
  assert.equal(await evaluate("Boolean(document.querySelector('input[id$=\"-billing-name\"]'))"), false, 'Saved billing selection hides the form');
  await evaluate("Array.from(document.querySelectorAll('[role=dialog] button')).find(button=>button.textContent.includes('Use or edit different details')).click()");
  await until("document.querySelector('input[id$=\"-billing-name\"]')");
  assert.equal(await evaluate("document.querySelector('input[type=checkbox]').checked"), true, 'Editing defaults to replacing the saved profile');
  await evaluate("(() => { const input=document.querySelector('input[id$=\"-billing-name\"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Updated Company'); input.dispatchEvent(new Event('input',{bubbles:true})); })()");
  await evaluate(button('Continue to summary')+'.click()');
  await until("window.__api.billing?.name === 'Updated Company' && document.querySelector('[role=dialog]')?.textContent.includes('Step 3 of 3')");
  await evaluate("document.querySelector('[role=dialog] header button:last-child').click()");
  await until("!document.querySelector('[role=dialog]')");
  console.log('PASS saved billing hides the form and edited details replace the account profile');

  await navigate('/');
  await until("document.querySelector('button[aria-label=Search]')");
  await evaluate("window.dispatchEvent(new Event('spottr:cancel-scroll-restore')); window.scrollTo(0,200)");
  await delay(300);
  const savedScroll = await evaluate('scrollY');
  await evaluate("document.querySelector('button[aria-label=Search]').click()");
  await until("document.querySelector('[role=dialog] input')");
  await checkKeyboard('[role=dialog] input');
  await evaluate('history.back()');
  await until("!document.querySelector('[role=dialog]')");
  assert.ok(Math.abs(await evaluate('scrollY')-savedScroll)<2,'Restores page position after closing search');
  console.log('PASS search: viewport resizing and background scroll restoration');

  await navigate('/feed');
  await until(button('My friends'));
  await evaluate(button('My friends')+'.click()');
  await until("document.querySelector('[data-vaul-drawer] input')");
  await checkKeyboard('[data-vaul-drawer] input');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await until("!document.querySelector('[data-vaul-drawer]')");
  assert.equal(await evaluate('document.body.style.position'),'');
  assert.equal(await evaluate('document.body.style.overflow'),'');
  console.log('PASS shared Vaul drawer: stable top, field visibility and cleanup');

  await navigate('/dashboard/events/mobile');
  await until("document.querySelector('#event-editor-form')");
  await evaluate(button('Manage')+'.click()');
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Invitations') && b.textContent.includes('0 invitations')).click()");
  await until("document.querySelector('input[placeholder=\"Name or label\"]')");
  await checkKeyboard('input[placeholder="Name or label"]');
  await evaluate("document.querySelector('[role=dialog] button[aria-label=Close]').click()");
  await until("!document.querySelector('[role=dialog]')");
  assert.equal(await evaluate('document.body.style.position'),'');
  console.log('PASS management drawer: keyboard resize and cleanup');

  await until(button('Request event cancellation'));
  await evaluate(button('Request event cancellation')+'.click()');
  await until("document.querySelector('[role=dialog] textarea')");
  await checkKeyboard('[role=dialog] input[type=url]');
  await evaluate("document.querySelector('[role=dialog] button[aria-label=Close]').click()");
  await until("!document.querySelector('[role=dialog]')");
  console.log('PASS cancellation sheet: lower field stays above the keyboard');

  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:844,deviceScaleFactor:1,mobile:false});
  await call('Emulation.setTouchEmulationEnabled',{enabled:false});
  await navigate('/');
  await until("document.querySelector('button[aria-label=Search]')");
  await evaluate("document.querySelector('button[aria-label=Search]').click()");
  await until("document.querySelector('[role=dialog] input')");
  await keyboard(420);
  assert.equal(await evaluate("document.querySelector('[data-drawer-viewport]').dataset.keyboardOpen"),undefined,'Desktop geometry is unchanged');
  console.log('PASS desktop does not apply phone keyboard adjustments');
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
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("pulse-keyboard-")) {
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
});
