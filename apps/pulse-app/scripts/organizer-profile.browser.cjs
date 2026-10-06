// Run against a local dev or production server: node scripts/organizer-profile.browser.cjs
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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-organizer-"));
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
  const checkVerticalScroll = async (width, context) => {
    await evaluate("window.dispatchEvent(new Event('spottr:cancel-scroll-restore')); window.scrollTo({top:0,behavior:'instant'})");
    await delay(550);
    if (width < 768) {
      await call('Emulation.setTouchEmulationEnabled', { enabled: true });
      // Swipe the page gutter, not an event rail that owns horizontal gestures.
      await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{x:12,y:600}] });
      await delay(30);
      for (const y of [570,530,480,430,380]) {
        await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{x:12,y}] });
        await delay(40);
      }
      await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await call('Input.dispatchMouseEvent', {type:'mouseWheel',x:300,y:600,deltaX:0,deltaY:300});
    }
    await delay(600);
    const state = await evaluate(`({y:scrollY,body:document.body.style.cssText,overflow:getComputedStyle(document.body).overflowY,lock:document.body.getAttribute('data-scroll-locked'),drawers:document.querySelectorAll('[data-vaul-drawer]').length})`);
    assert.ok(state.y > 50, context + ': vertical scrolling works: ' + JSON.stringify(state));
  };

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
        if (route.startsWith('/events/')) return respond({ id: 'test-event', title: 'Test Event', organizerId: 'test-organizer', organizerName: 'Test Organizer', description: 'Test description', locationName: 'Test venue', city: 'Bucuresti', latitude: 44.4, longitude: 26.1, category: 'Party', startTime: '2099-10-01T18:00:00Z', endTime: '2099-10-02T04:00:00Z', stats: { isFavorited: false, goingCount: 0 }, ticketTypes: [{ id: 'test-tier', name: 'Test ticket', priceRon: 50, description: 'Entry', capacity: 100, ticketsSold: 0, startSales: '2020-01-01T00:00:00Z', endSales: '2099-10-01T17:00:00Z' }] });
        return respond([]);
      }
      return respond([]);
    };
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', { value: (_ok, fail) => setTimeout(() => fail({ code: 1, message: 'Permission denied' }), 100) });
  ` });

  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    const fallback = window.fetch;
    window.__organizer = { fail: false, requests: 0, follows: 0 };
    const profile = { id: 'test-organizer', username: 'nightcollective', organizerName: 'Night Collective', role: 'organizer',
      avatarUrl: '/spottr-logo-192.png', bio: 'Music, friends and nights to remember.', organizerVerified: true,
      relationship: 'none', followsOrganizer: false, followerCount: 218, eventCount: 12, ticketsSoldCount: 1250 };
    const event = { organizerId: profile.id, organizerName: profile.organizerName, title: 'Night Session', locationName: 'Test venue', city: 'Bucuresti', category: 'TECHNO', bannerUrl: '/party-event.webp', latitude: 44.4, longitude: 26.1, ticketTypes: [{ id: 'test-tier', name: 'General', priceRon: 150, stock: 100 }], stats: { isFavorited: false, goingCount: 0 } };
    const upcoming = [3,1,4,2].map(id => ({ ...event, id: 'upcoming-' + id, title: 'Night Session ' + id, startTime: '2099-10-0' + id + 'T18:00:00Z', endTime: '2099-10-0' + (id + 1) + 'T04:00:00Z' }));
    const past = [2,4,1,3].map(id => ({ ...event, id: 'past-' + id, title: 'Last edition ' + id, startTime: '2020-10-0' + id + 'T18:00:00Z', endTime: '2020-10-0' + (id + 1) + 'T04:00:00Z' }));
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
      const route = url.pathname.split('/api/v1')[1];
      const reply = (data, status=200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      if (route?.startsWith('/profiles/')) return reply(profile);
      if (route === '/events' && url.searchParams.has('organizerId')) {
        window.__organizer.requests++;
        return window.__organizer.fail ? reply({ title: 'Unavailable' },503) : reply([...upcoming, ...past]);
      }
      if (route?.endsWith('/social')) return reply({ friends: [], goingCount: 0, ticketsSoldCount: 0, manualGoingCount: 0 });
      if (route === '/organizers/test-organizer/follow') { window.__organizer.follows++; return reply(null); }
      if (route === '/organizers/test-organizer/updates') return reply([{ id: 'photo', eventId: 'upcoming-1', eventTitle: 'Night Session 1', imageUrl: '/party-event.webp', caption: 'See you on the dance floor', expiresAt: '2099-10-01T18:00:00Z' }]);
      const detail = [...upcoming, ...past].find(e => route === '/events/' + e.id);
      if (detail) return reply(detail);
      return fallback(input, init);
    };
    Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.__sharedProfile = data; } });
  ` });
  const checkSheet = async (selector, width) => {
    await delay(550);
    const bounds = await evaluate(`(() => {
      const panel = document.querySelector(${JSON.stringify(selector)});
      panel.focus();
      const r = panel.getBoundingClientRect();
      return { left: r.left, right: innerWidth - r.right, overflow: panel.scrollWidth > panel.clientWidth, outline: getComputedStyle(panel).outlineStyle };
    })()`);
    assert.equal(bounds.overflow, false, 'Sheet content stays inside its narrower surface');
    assert.equal(bounds.outline, 'none', 'The dialog container has no browser-blue focus outline');
    if (width < 768) {
      assert.equal(bounds.left, 12, 'Mobile sheet has a 12px left gutter');
      assert.equal(bounds.right, 12, 'Mobile sheet has a 12px right gutter');
    }
  };
  if (process.argv.includes('--sheets-only')) {
    await call('Page.addScriptToEvaluateOnNewDocument', {source:`
      (() => {
      const fallback=window.fetch;
      window.__social={responses:[],hidden:[]};
      const friend=id=>({id,username:id,bio:'Music and nights out',role:'user',relationship:'friend',friendCount:0,followerCount:0,eventCount:0});
      let requests=[friend('Request One'),friend('Request Two')];
      window.fetch=async(input,init)=>{
        const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin),route=url.pathname.split('/api/v1')[1];
        const reply=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
        if(route==='/friends') return reply(Array.from({length:30},(_,i)=>friend('Friend '+i)));
        if(route==='/friends/requests') return reply(requests);
        if(route?.startsWith('/friends/request/')) {window.__social.responses.push(JSON.parse(init.body).status);return reply({});}
        if(route==='/users/me/hidden-categories') {
          if(init?.method==='POST') window.__social.hidden.push(JSON.parse(init.body).category);
          return reply(window.__social.hidden);
        }
        if(route?.startsWith('/users/me/hidden-categories/')) {window.__social.hidden=[];return reply({});}
        return fallback(input,init);
      };
      })();
    `});
    const escape=async()=>{
      await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await until("!document.querySelector('[data-vaul-drawer]')");
    };
    for(const [width,height] of [[320,568],[390,844],[1280,800]]) {
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});
      await navigate('/feed');
      await until("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('My friends'))");
      const historyBefore=await evaluate('history.length');
      await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('My friends')).click()");
      await until("document.querySelector('[data-friends-sheet] input')");
      await delay(500);
      assert.equal(await evaluate('history.length'),historyBefore,'Friends does not add a Back entry');
      assert.equal(await evaluate("document.querySelector('[data-friends-sheet] button[aria-label=Close]')"),null);
      await until("document.querySelector('[data-friends-sheet] button[aria-label^=Accept]')");
      await evaluate("document.querySelector('[data-friends-sheet] button[aria-label^=Accept]').click()");
      await until("window.__social.responses.includes('accepted')");
      await evaluate("document.querySelector('[data-friends-sheet] button[aria-label^=Decline]').click()");
      await until("window.__social.responses.includes('declined')");
      const header=await evaluate("document.querySelector('[data-friends-sheet] input').getBoundingClientRect().top");
      await evaluate("document.querySelector('[data-friends-sheet] [data-drawer-keyboard-scroll]').scrollTop=500");
      assert.equal(await evaluate("document.querySelector('[data-friends-sheet] input').getBoundingClientRect().top"),header,'Search stays fixed while friends scroll');
      await evaluate(`(() => {const input=document.querySelector('[data-friends-sheet] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Friend 29');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await until("document.querySelectorAll('[data-friends-sheet] a[href^=\"/users/Friend\"]').length===1");
      await escape();
      assert.equal(await evaluate('location.pathname'),'/feed');
      await navigate('/users/me');
      await until("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Event preferences'))");
      const preferencesHistory=await evaluate('history.length');
      await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Event preferences')).click()");
      await until("document.querySelector('[data-preferences-sheet] button[aria-pressed=false]:not(:disabled)')");
      await delay(500);
      assert.equal(await evaluate('history.length'),preferencesHistory);
      await evaluate("document.querySelector('[data-preferences-sheet] button[aria-pressed=false]').click()");
      await until("window.__social.hidden.length===1 && document.querySelector('[data-preferences-sheet] button[aria-pressed=true]')");
      await evaluate("document.querySelector('[data-preferences-sheet] button[aria-pressed=true]').click()");
      await until('window.__social.hidden.length===0');
      await escape();
      await navigate('/profiles?userId=test-organizer');
      await until(button('Info'));
      const infoHistory=await evaluate('history.length');
      await evaluate(button('Info')+'.click()');
      await until("document.querySelector('[data-organizer-info]')");
      await delay(500);
      assert.equal(await evaluate('history.length'),infoHistory);
      assert.equal(await evaluate("document.querySelector('[data-organizer-info] button[aria-label=Close]')"),null);
      assert.equal(await evaluate("document.querySelector('[data-organizer-info] [data-organizer-stats]').textContent"),await evaluate("document.querySelector('main [data-organizer-stats]').textContent"));
      const fits=await evaluate("(() => {const s=document.querySelector('[data-organizer-info]'),r=s.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight+1 && s.scrollWidth<=s.clientWidth;})()");
      assert.ok(fits,'Organizer sheet fits viewport');
      if(process.env.ORGANIZER_SCREENSHOT && width===390) {const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.env.ORGANIZER_SCREENSHOT,Buffer.from(shot.data,'base64'));}
      await escape();
      console.log('PASS friends search/requests/scroll, preferences save, organizer Info and no extra Back entries at '+width+'x'+height);
    }
    assert.deepEqual(errors,[]);
    assert.deepEqual(lifecycleWarnings,[]);
    await send('Browser.close');await delay(500);return;
  }
  for (const width of [320,390,1280]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 768 });
    await navigate('/profiles?userId=test-organizer');
    await until("document.querySelectorAll('[data-organizer-events=upcoming] [data-event-card]').length === 4 && document.querySelector('[data-organizer-events=past] [data-event-card]')");
    await checkVerticalScroll(width, 'Direct organizer visit');
    const geometry = await evaluate(`(() => {
      const cards = [...document.querySelectorAll('[data-organizer-events=upcoming] [data-event-card]')].map(e => e.getBoundingClientRect().toJSON());
      return { cards, overflow: document.documentElement.scrollWidth > innerWidth, heading: document.querySelector('h1').textContent };
    })()`);
    assert.equal(geometry.overflow, false);
    assert.equal(geometry.heading, 'Night Collective');
    assert.ok(Math.abs(geometry.cards[0].y - geometry.cards[1].y) < 1, 'Event cards appear side by side');
    for (const kind of ['upcoming', 'past']) {
      const rail = `document.querySelector('#organizer-${kind}-rail')`;
      const titles = await evaluate(`[...${rail}.querySelectorAll('[data-event-card]')].map(card => card.querySelector('h3').textContent)`);
      assert.deepEqual(titles, kind === 'upcoming' ? [1,2,3,4].map(id => 'Night Session ' + id) : [4,3,2,1].map(id => 'Last edition ' + id));
      assert.ok(await evaluate(`${rail}.scrollWidth > ${rail}.clientWidth`), 'Events overflow only their horizontal rail');
      if (width >= 768) {
        await evaluate(`document.querySelector('[aria-controls="organizer-${kind}-rail"][aria-label^="Next"]').click()`);
      } else {
        await call('Emulation.setTouchEmulationEnabled', { enabled: true });
        await evaluate(`window.dispatchEvent(new Event('spottr:cancel-scroll-restore')); ${rail}.scrollIntoView({block:'center',behavior:'instant'})`);
        await delay(300);
        const point = await evaluate(`(() => { const r = ${rail}.getBoundingClientRect(); return {x: r.right - 24, y: r.top + 80}; })()`);
        await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
        await delay(30);
        for (const offset of [40,80,120,160,200]) {
          await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{x:point.x-offset,y:point.y}] });
          await delay(30);
        }
        await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
      await until(`${rail}.scrollLeft > 50`);
      await delay(500);
      await evaluate(`${rail}.scrollTo({left:0,behavior:'instant'})`);
      await until(`${rail}.scrollLeft < 1`);
    }
    assert.ok(await evaluate(`(() => {
      const upcoming = document.querySelector('[data-organizer-events=upcoming]');
      const stats = document.querySelector('main [data-organizer-stats]');
      const past = document.querySelector('[data-organizer-events=past]');
      return Boolean(upcoming.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING)
        && Boolean(stats.compareDocumentPosition(past) & Node.DOCUMENT_POSITION_FOLLOWING)
        && stats.textContent.includes('Followers') && stats.textContent.includes('Tickets sold');
    })()`), 'Followers and ticket sales separate the event sliders');
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Info').click()`);
    await until("document.querySelector('[data-organizer-info]')?.textContent.includes('Music, friends and nights to remember.')");
    await checkSheet('[data-organizer-info]', width);
    assert.equal(await evaluate("document.querySelector('[data-organizer-info] [data-organizer-stats]').textContent"), await evaluate("document.querySelector('main [data-organizer-stats]').textContent"));
    await delay(550);
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await until("!document.querySelector('[data-organizer-info]')");
    assert.ok(await evaluate("location.pathname === '/profiles' && document.querySelector('[data-organizer-profile]') !== null"), 'Escape dismisses Info without leaving the organizer');
    await checkVerticalScroll(width, 'After closing Info');
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Follow').click()`);
    await until("window.__organizer.follows === 1 && Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Following' && !b.disabled)");
    await evaluate("document.querySelector('button[aria-label=\"Share profile\"]').click()");
    assert.equal(await evaluate('window.__sharedProfile.title'), 'Night Collective');
    assert.ok(await evaluate("window.__sharedProfile.url.includes('userId=test-organizer')"));
    for (const kind of ['upcoming','past']) {
      await evaluate(`document.querySelector('[data-organizer-events=${kind}] [data-event-card]').click()`);
      await until("new URLSearchParams(location.search).has('eventId') && document.querySelector('[data-nav-scroll^=\"event-sheet:\"]')");
      if (width < 768) {
        await checkSheet('[data-vaul-drawer]', width);
        if (kind === 'upcoming') {
          await evaluate("document.querySelector('[data-vaul-drawer] input[type=radio]').click()");
          await until("document.querySelector('[data-drawer-body]').lastElementChild.textContent.includes('Continue')");
        }
        assert.ok(await evaluate(`(() => {
          const footer = document.querySelector('[data-drawer-body]').lastElementChild;
          const r = footer.getBoundingClientRect();
          return [...footer.querySelectorAll('button')].every(button => {
            const b = button.getBoundingClientRect();
            return b.left >= r.left && b.right <= r.right && button.scrollWidth <= button.clientWidth;
          });
        })()`), 'Footer actions and the price fit without clipping');
        const buttons = await evaluate(`(() => {
          const footer = document.querySelector('[data-drawer-body]').lastElementChild;
          return [...footer.querySelectorAll('button[aria-label]')].map(button => {
            const r = button.getBoundingClientRect(), s = getComputedStyle(button);
            return { width: r.width, height: r.height, radius: s.borderRadius, overflow: s.overflow, highlight: s.webkitTapHighlightColor };
          });
        })()`);
        assert.equal(buttons.length, 2, 'Bookmark and share buttons are present');
        for (const button of buttons) {
          assert.equal(button.width, 44);
          assert.equal(button.height, 44);
          assert.ok(button.radius === '50%' || parseFloat(button.radius) >= 22);
          assert.equal(button.overflow, 'hidden');
          assert.equal(button.highlight, 'rgba(0, 0, 0, 0)');
        }
        await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await evaluate("document.querySelector('[data-drawer-body]').lastElementChild.querySelector('button').focus()");
        await delay(250);
        assert.ok(await evaluate("document.activeElement.matches(':focus-visible') && getComputedStyle(document.activeElement).boxShadow !== 'none'"), 'Bookmark retains a visible keyboard focus ring');
      }
      await evaluate('history.back()');
      await until("!new URLSearchParams(location.search).has('eventId') && !document.querySelector('[data-nav-scroll^=\"event-sheet:\"]')");
    }
    await until("document.body.innerText.includes('See you on the dance floor')");
    await evaluate("document.querySelector('[data-organizer-events=upcoming] [data-event-card]').click()");
    await until("Array.from(document.querySelectorAll('[data-nav-scroll^=\"event-sheet:\"] button')).some(b => b.textContent.includes('Night Collective'))");
    await delay(550);
    await evaluate("Array.from(document.querySelectorAll('[data-nav-scroll^=\"event-sheet:\"] button')).find(b => b.textContent.includes('Night Collective')).click()");
    await until("location.pathname === '/users/test-organizer' && document.querySelector('[data-organizer-profile]') && !document.querySelector('[data-nav-scroll^=\"event-sheet:\"]')");
    await checkVerticalScroll(width, 'Organizer reached from event sheet');
    // Screenshot the normal page, after both event sheets have closed.
    await evaluate("window.dispatchEvent(new Event('spottr:cancel-scroll-restore')); window.scrollTo(0,0)");
    await delay(550);
    if (process.env.ORGANIZER_SCREENSHOT && width === 390) {
      const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(process.env.ORGANIZER_SCREENSHOT, Buffer.from(shot.data,'base64'));
    }
    console.log('PASS organizer sliders, date order, touch/arrow scrolling, shared cards, Info, Follow, Share, posts and event Back at ' + width + 'px');
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
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("pulse-organizer-")) {
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
});
