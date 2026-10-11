// Gesture regressions against an existing production web export. All API data is mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { createChromeProfile } = require('./chrome-profile.cjs');
const dist = path.resolve(__dirname, '../dist');
const artifacts = path.resolve(__dirname, '../artifacts');
let temporary;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/qa-banner.svg') { res.setHeader('content-type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#34204e"/><circle cx="320" cy="200" r="120" fill="#ff0044"/></svg>'); return; }
  const resolved = path.resolve(dist, '.' + pathname);
  if (resolved !== dist && !resolved.startsWith(dist + path.sep)) { res.writeHead(403); res.end(); return; }
  const target = fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? resolved : path.join(dist, 'index.html');
  res.setHeader('content-type', { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(target)] || 'application/octet-stream');
  fs.createReadStream(target).pipe(res);
});
let child, socket, call, evaluate;
const browserProfile = createChromeProfile('sheet', () => ({ child, socket, server }));
const errors = [], observations = [];
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  child = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${browserProfile.path}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Chrome startup timeout')), 15000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.stderr.on('data', data => { const match = data.toString().match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0; const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(arg => arg.value || arg.description).join(' '));
    const operation = pending.get(message.id);
    if (operation) { pending.delete(message.id); message.error ? operation.reject(message.error) : operation.resolve(message.result); }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence, timeout = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 15000);
    pending.set(id, { resolve: result => { clearTimeout(timeout); resolve(result); }, reject: error => { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  call = (method, params) => send(method, params, sessionId);
  evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
  const until = async expression => {
    for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${expression})`)) return; await delay(50); }
    throw new Error(`Timed out: ${expression}`);
  };
  await call('Runtime.enable'); await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call('Emulation.setTouchEmulationEnabled', { enabled: true });
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = window.fetch.bind(window);
    window.__unexpectedLinks = [];
    window.open = url => { window.__unexpectedLinks.push(String(url)); return null; };
    window.__sheetInput = [];
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel', 'click', 'contextmenu', 'dragstart']) window.addEventListener(type, input => {
      const target = input.target, trail = [];
      for (let node = target; node && trail.length < 6; node = node.parentElement) trail.push({ tag: node.tagName, id: node.getAttribute('data-testid'), touchAction: getComputedStyle(node).touchAction });
      const entry = { type, time: performance.now(), detail: input.detail, y: input.clientY ?? input.touches?.[0]?.clientY, handle: document.querySelector('[data-testid="sheet-handle"]')?.getBoundingClientRect().top, trail };
      window.__sheetInput.push(entry);
      setTimeout(() => { entry.prevented = input.defaultPrevented; entry.selection = String(window.getSelection()); }, 0);
    }, true);
    const uuid = n => '12345678-abcd-abcd-abcd-' + String(n).padStart(12, '0');
    const event = { id: uuid(1), organizerId: uuid(2), title: 'Gesture QA event', bannerUrl: location.origin + '/qa-banner.svg', category: 'TECHNO', city: 'Bucuresti', locationName: 'Test venue', startTime: '2099-10-08T18:00:00Z', endTime: '2099-10-09T02:00:00Z', description: 'Scrollable event description. '.repeat(140), ticketTypes: [{ id: 'general', name: 'General access', priceRon: 50, capacity: 100, ticketsSold: 1, startSales: '2020-01-01T00:00:00Z', endSales: '2099-10-09T02:00:00Z' }], lineup: [] };
    const surface = { ...event, id: uuid(3), title: 'Gesture surface event', description: 'Short surface description.' };
    const interaction = { ...surface, id: uuid(4), title: 'Gesture interaction event', ticketTypes: [...surface.ticketTypes, { ...surface.ticketTypes[0], id: 'vip', name: 'VIP access', priceRon: 75 }] };
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (!url.pathname.includes('/api/v1/')) { if (url.origin === location.origin) return original(input, init); throw new Error('Unexpected external request'); }
      if (init?.method && init.method !== 'GET') throw new Error('Gesture QA must not issue mutations');
      const data = url.pathname.endsWith('/promotions/active') || url.pathname.endsWith('/updates') ? [] : url.pathname.endsWith('/events') ? [event, surface, interaction] : url.pathname.endsWith('/social') ? { goingCount: 2, interestedCount: 1 } : url.pathname.includes('/profiles/') ? { id: uuid(2), username: 'Organizer', role: 'organizer', relationship: 'none', followersCount: 0, ticketsSold: 0 } : url.pathname.includes('/users/') ? { id: uuid(2), username: 'Organizer' } : url.pathname.endsWith(uuid(4)) ? interaction : url.pathname.endsWith(uuid(3)) ? surface : event;
      return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
    };
  }.toString()})();` });
  await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  await until(`document.querySelector('[data-testid="tab-Explore"]')`);
  observations.push({ phase: 'bundle', scripts: await evaluate('Array.from(document.scripts).map(script=>script.src).filter(Boolean)') });
  await evaluate(`document.querySelector('[data-testid="tab-Explore"]').click()`);
  let listId = 'events-list', eventTitle = 'Gesture QA event';
  const eventButton = () => `Array.from(document.querySelectorAll('[data-testid="${listId}"] [role="button"]')).find(el=>el.getAttribute('aria-label')===${JSON.stringify(eventTitle)}||el.textContent.includes(${JSON.stringify(eventTitle)}))`;
  await until(eventButton());
  const metrics = () => evaluate(`{const content=document.querySelector('[data-testid="event-content"]'),handle=document.querySelector('[data-testid="sheet-handle"]');({exists:!!content,handle:handle?.getBoundingClientRect().top,scroll:content?.scrollTop,max:content&&content.scrollHeight-content.clientHeight,background:document.querySelector('[data-testid="${listId}"]')?.scrollTop})}`);
  const settled = async () => { let last; for (let i = 0; i < 60; i++) { const value = await metrics(); if (value.handle !== undefined && Math.abs(value.handle - 84.4) < 1 && last !== undefined && Math.abs(value.handle - last) < 0.1) return; last = value.handle; await delay(30); } throw new Error('Sheet did not settle open: ' + JSON.stringify(await metrics())); };
  const open = async early => {
    await evaluate(`${eventButton()}.click()`);
    await until(`document.querySelector('[data-testid="event-content"]')`);
    if (early) await until(`document.querySelector('[data-testid="sheet-handle"]').getBoundingClientRect().top < innerHeight-180`);
    else await settled();
  };
  const swipe = async (start, delta, { mouse = false, follow = false, holdOpening = false, holdRelease = 0, returnToStart = false } = {}) => {
    const before = await metrics(), samples = [];
    if (mouse) await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', buttons: 1, clickCount: 1 });
    else await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
    if (holdOpening) {
      const grabbed = await metrics(); await delay(100); const held = await metrics();
      observations.push({ phase: 'opening-hold', start, grabbed, held });
      assert.ok(Math.abs(held.handle - grabbed.handle) < 8, 'Touching the opening drawer must stop it from escaping the finger before pan activation');
    }
    for (let step = 1; step <= 14; step++) {
      const progress = returnToStart ? (step <= 7 ? step : 14-step)/7 : step/14;
      const point = { x: start.x, y: start.y + delta * progress };
      if (mouse) await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, button: 'left', buttons: 1 });
      else await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, id: 1 }] });
      await delay(25);
      samples.push(await metrics());
    }
    if (holdRelease) await delay(holdRelease);
    if (mouse) await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: start.x, y: start.y + (returnToStart ? 0 : delta), button: 'left', clickCount: 1 });
    else await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    observations.push({ before, start, delta, mouse, returnToStart, samples });
    if (follow) assert.ok(samples[10].handle - samples[2].handle > Math.abs(delta) * 0.25, 'The drawer must track the finger during the drag');
    assert.ok(samples.every(sample => Math.abs(sample.background - before.background) < 2), 'Dragging or scrolling a drawer must not move the background list');
    return samples;
  };
  const dismiss = async (target, early, mouse = false) => {
    await open(early);
    const start = await evaluate(`{const r=document.querySelector('[data-testid="${target === 'handle' ? 'sheet-handle' : 'event-content'}"]').getBoundingClientRect();({x:r.left+r.width/2,y:r.top+${target === 'handle' ? '16' : '70'}})}`);
    await swipe(start, 820 - start.y, { mouse, follow: true, holdOpening: early });
    await until(`!document.querySelector('[data-testid="event-sheet"]')`);
    console.log(`PASS ${mouse ? 'mouse' : 'touch'} ${target} dismissal ${early ? 'during opening' : 'after opening'}`);
  };
  if (process.argv.includes('--dismiss-timing-only')) {
    // Measure the actual blocker and use hit-tested input, not DOM .click(),
    // which would bypass the transparent overlay responsible for the regression.
    for (const origin of ['Explore', 'Home']) for (const method of ['handle', 'backdrop', 'drag']) {
      listId = origin === 'Home' ? 'home-list' : 'events-list';
      await evaluate(`document.querySelector('[data-testid="tab-${origin}"]').click()`);
      await until(eventButton());
      await open(false);
      const nextTab = origin === 'Home' ? 'Explore' : 'Home';
      const point = method === 'backdrop' ? { x: 195, y: 35 } : await evaluate(`{const r=document.querySelector('[data-testid="sheet-handle"]').getBoundingClientRect();({x:r.x+r.width/2,y:r.y+r.height/2})}`);
      if (method === 'drag') {
        await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
        for (let step = 1; step <= 12; step++) {
          await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y + 520 * step/12, id: 1 }] });
          await delay(20);
        }
      } else await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
      await evaluate(`window.__dismissDone=new Promise(resolve=>{
        const sheet=document.querySelector('[data-testid="event-sheet"]');
        const handle=document.querySelector('[data-testid="sheet-handle"]');
        const tab=document.querySelector('[data-testid="tab-${nextTab}"]');
        const r=tab.getBoundingClientRect(), point={x:r.x+r.width/2,y:r.y+r.height/2};
        const start=performance.now(), samples=[];
        const tick=()=>{
          const connected=sheet.isConnected, top=connected?handle.getBoundingClientRect().top:innerHeight;
          const exposed=tab.contains(document.elementFromPoint(point.x,point.y));
          const elapsed=performance.now()-start;
          samples.push({elapsed,connected,top,exposed});
          if ((!connected&&exposed)||elapsed>1500) resolve({elapsed,samples,point});
          else requestAnimationFrame(tick);
        }; tick();
      }); true`);
      if (method === 'drag') await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      else await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
      const result = await evaluate('window.__dismissDone');
      observations.push({ phase: 'dismiss-timing', origin, method, ...result });
      console.log(`${origin} ${method}: background interactive after ${Math.round(result.elapsed)}ms`);
      assert.ok(result.elapsed <= 550, `Dismissal must release the background within 550ms, including frame/callback overhead; got ${Math.round(result.elapsed)}ms`);
      if (method !== 'drag') {
        // Preserve the original spring's visible motion instead of making every
        // open/close transition a faster 280ms timing animation.
        const middle = result.samples.find(s => s.elapsed >= 100);
        assert.ok(middle?.connected && middle.top > 300 && middle.top < 580, `Original spring motion around 100ms must be preserved: ${JSON.stringify(middle)}`);
      }
      assert.ok(result.samples.some(s => s.connected && s.top < 830), 'Observe the closing sheet before it leaves the viewport');
      assert.ok(result.samples.every(s => !s.connected || !s.exposed), 'No tap-through while the sheet is still mounted');
      // No post-dismiss delay: the first real touch must navigate immediately.
      await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...result.point, id: 1 }] });
      await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await until(`document.querySelector('[data-testid="tab-${nextTab}"]').getAttribute('aria-selected')==='true'`);
      assert.equal(await evaluate(`!!document.querySelector('[data-testid="event-sheet"]')`), false, 'The dismissed sheet must not reopen');
      console.log(`PASS ${origin} ${method}: first touch after dismiss activates ${nextTab}`);
    }
    assert.deepEqual(errors, []);
    return;
  }
  if (!process.argv.includes('--clicks-only')) {
    await open(false);
    await swipe({ x: 195, y: 650 }, -180, { holdRelease: 250 });
    await delay(150);
    const scrolled = await metrics();
    assert.ok(scrolled.scroll >= 150 && scrolled.scroll <= 250, `Continuous handoff begins with 150–250px of content scroll: ${JSON.stringify(scrolled)}`);
    const samples = await swipe({ x: 195, y: 190 }, 610, { holdRelease: 150 });
    const firstTop = samples.findIndex(sample => sample.scroll <= 1);
    assert.ok(firstTop >= 0 && firstTop < samples.length - 3, 'Content must reach its top before the downward gesture finishes');
    assert.ok(samples.at(-1).handle > scrolled.handle + 200, `After content reaches its top, the same continuous touch must pull the drawer down: ${JSON.stringify(samples)}`);
    assert.ok(samples.at(-1).handle > samples[firstTop].handle + 150, 'The drawer must keep tracking the remaining movement without another touchStart');
    await until(`!document.querySelector('[data-testid="event-sheet"]')`);
    console.log('PASS one continuous touch scrolls content to top and then dismisses the drawer');
    if (process.argv.includes('--handoff-only')) { assert.deepEqual(errors, []); return; }
    await open(false);
    await swipe({ x: 195, y: 250 }, 140, { returnToStart: true, holdRelease: 150 });
    await settled();
    assert.ok((await metrics()).scroll <= 1, 'Returning a drag to its origin must not introduce content scroll on a long event');
    console.log('PASS long content drag returns to origin without introducing scroll');
    const heldScroll = await swipe({ x: 195, y: 650 }, -180, { holdRelease: 300 });
    const released = await metrics(); await delay(200); const afterHold = await metrics();
    observations.push({ phase: 'held-scroll-release', beforeRelease: heldScroll.at(-1), released, afterHold });
    assert.ok(Math.abs(afterHold.scroll-heldScroll.at(-1).scroll)<4, 'Holding still before release must not create a new scroll fling');
    await swipe({ x: 195, y: 650 }, -140);
    const flick = await metrics(); await delay(120); const momentum = await metrics();
    observations.push({ phase: 'scroll-inertia', flick, momentum });
    assert.ok(momentum.scroll > flick.scroll + 5, 'A scrolling flick should continue with inertia after release');
    await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 450, id: 1 }] });
    const stopped = await metrics(); await delay(120);
    assert.ok(Math.abs((await metrics()).scroll-stopped.scroll)<2, 'The next touch must stop scrolling inertia immediately');
    await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const beforeWheel = await metrics();
    await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 195, y: 450, deltaY: 100, deltaX: 0 });
    await until(`document.querySelector('[data-testid="event-content"]').scrollTop > ${beforeWheel.scroll+50}`);
    assert.ok(Math.abs((await metrics()).handle-84.4)<1, 'Wheel scrolling must leave the drawer expanded');
    await evaluate(`document.querySelector('[data-testid="sheet-handle"]').click()`);
    await until(`!document.querySelector('[data-testid="event-sheet"]')`);
    console.log('PASS held scroll release, inertial scrolling, touch interruption and wheel scrolling');
    if (process.argv.includes('--scroll-edges-only')) { assert.deepEqual(errors, []); return; }
  }
  if (!process.argv.includes('--clicks-only')) {
  await dismiss('handle', false, true);
  await dismiss('content', false);
  await dismiss('handle', true, true);
  await dismiss('content', true, true);
  for (let i = 0; i < 3; i++) { await dismiss('handle', true); await dismiss('content', true); }
  for (const finish of ['touchEnd', 'touchCancel', 'mouseReleased']) {
    await open(true);
    const point = await evaluate(`{const r=document.querySelector('[data-testid="event-content"]').getBoundingClientRect();({x:r.left+r.width/2,y:r.top+70})}`);
    if (finish === 'mouseReleased') await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1 });
    else await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
    const grabbed = await metrics(); await delay(100);
    assert.ok(Math.abs((await metrics()).handle - grabbed.handle) < 8, 'A stationary opening grab must pause the animation');
    if (finish === 'mouseReleased') await call('Input.dispatchMouseEvent', { type: finish, ...point, button: 'left' });
    else await call('Input.dispatchTouchEvent', { type: finish, touchPoints: [] });
    await settled();
    await evaluate(`document.querySelector('[data-testid="sheet-handle"]').click()`);
    await until(`!document.querySelector('[data-testid="event-sheet"]')`);
    console.log(`PASS opening grab without drag resumes after ${finish}`);
  }
  await open(false);
  await swipe({ x: 195, y: 650 }, -340); await delay(150);
  const scrolled = await metrics(); assert.ok(scrolled.scroll > 200, 'Upward touch must scroll event content');
  await swipe({ x: 195, y: 300 }, 120); await delay(150);
  const partial = await metrics();
  assert.ok(partial.scroll < scrolled.scroll && partial.scroll > 0, 'Downward touch first scrolls the content toward its top');
  assert.ok(Math.abs(partial.handle - 84.4) < 1, 'The drawer stays expanded while its content remains scrolled');
  const start = await evaluate(`{const r=document.querySelector('[data-testid="sheet-handle"]').getBoundingClientRect();({x:r.left+r.width/2,y:r.top+16})}`);
  await swipe(start, 820 - start.y, { follow: true });
  await until(`!document.querySelector('[data-testid="event-sheet"]')`);
  console.log('PASS touch scroll handoff and handle dismissal while content is scrolled');
  await open(false);
  await swipe({ x: 195, y: 650 }, -260); await delay(150);
  await swipe({ x: 195, y: 260 }, 350); await delay(300);
  assert.equal((await metrics()).scroll, 0, 'Downward touch must return content to the top');
  if ((await metrics()).exists) {
    const point = await evaluate(`{const r=document.querySelector('[data-testid="event-content"]').getBoundingClientRect();({x:r.left+r.width/2,y:r.top+70})}`);
    await swipe(point, 820 - point.y, { follow: true });
    await until(`!document.querySelector('[data-testid="event-sheet"]')`);
  }
  console.log('PASS content dismissal after scrolling back to the top');
  eventTitle = 'Gesture surface event';
  const targets = {
    image: `document.querySelector('[data-testid="event-content"] img')`,
    title: `Array.from(document.querySelectorAll('[data-testid="event-content"] [dir="auto"]')).find(el=>el.textContent==='Gesture surface event')`,
    description: `Array.from(document.querySelectorAll('[data-testid="event-content"] [dir="auto"]')).find(el=>el.textContent==='Short surface description.')`,
    organizer: `Array.from(document.querySelectorAll('[data-testid="event-content"] [role="button"]')).find(el=>el.textContent.includes('Organized by'))`,
    tier: `document.querySelector('[data-testid="event-content"] [role="radio"]')`,
    footer: `Array.from(document.querySelectorAll('[data-testid="event-sheet"] [role="button"]')).find(el=>el.textContent.includes('Continue'))`,
  };
  for (const origin of ['Explore', 'Home']) {
    await evaluate(`document.querySelector('[data-testid="tab-${origin}"]').click()`);
    listId = origin === 'Home' ? 'home-list' : 'events-list';
    await until(eventButton());
    for (const mouse of [true, false]) for (const [name, selector] of Object.entries(targets)) {
      await open(false); await until(selector);
      if (name === 'image') {
        await until(`(${selector}).complete && (${selector}).naturalWidth > 0`);
        assert.equal(await evaluate(`(${selector}).draggable`), false, 'Event images must not start browser-native image dragging');
      }
      const start = await evaluate(`{const r=(${selector}).getBoundingClientRect();({x:r.left+r.width/2,y:r.top+Math.min(r.height/2,20),bottom:r.bottom})}`);
      assert.ok(start.y > 100 && start.y < 805, `${name} must be visible before the gesture: ${JSON.stringify(start)}`);
      assert.equal((await metrics()).scroll, 0, 'Surface drag begins at the top of the content');
      const delta = Math.min(420, 830 - start.y);
      const before = await metrics();
      const samples = await swipe({ x: start.x, y: start.y }, delta, { mouse, follow: true });
      assert.ok(samples.at(-1).handle > before.handle + Math.max(18, delta * 0.45), `${origin} ${name} must follow the drag, including short drags near the footer`);
      await delay(900);
      assert.deepEqual(await evaluate('window.__unexpectedLinks'), [], 'Dragging a child button must not activate its navigation or checkout action');
      if ((await metrics()).exists) {
        await evaluate(`document.querySelector('[data-testid="sheet-handle"]').click()`);
        await until(`!document.querySelector('[data-testid="event-sheet"]')`);
      }
      console.log(`PASS ${origin} ${mouse ? 'mouse' : 'touch'} drag from ${name}`);
    }
  }
  }
  eventTitle = 'Gesture interaction event';
  const interactionTargets = {
    organizer: `Array.from(document.querySelectorAll('[data-testid="event-content"] [role="button"]')).find(el=>el.textContent.includes('Organized by'))`,
    general: `Array.from(document.querySelectorAll('[data-testid="event-content"] [role="radio"]')).find(el=>el.textContent.includes('General access'))`,
    vip: `Array.from(document.querySelectorAll('[data-testid="event-content"] [role="radio"]')).find(el=>el.textContent.includes('VIP access'))`,
    footer: `Array.from(document.querySelectorAll('[data-testid="event-sheet"] [role="button"]')).find(el=>el.textContent.includes('Continue'))`,
  };
  const pointFor = selector => evaluate(`{const r=(${selector}).getBoundingClientRect();({x:r.left+r.width/2,y:r.top+r.height/2})}`);
  const activate = async (selector, input) => {
    if (input === 'keyboard') {
      await evaluate(`(${selector}).focus()`);
      assert.equal(await evaluate(`document.activeElement===(${selector})`), true, 'Control must receive keyboard focus');
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    } else {
      const point = await pointFor(selector);
      assert.ok(point.y > 100 && point.y < 810, 'A stationary tap target must be visible');
      if (input === 'mouse') {
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
      } else {
        await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
        // Keep an intentional tap down for a real touch frame. Starting the tap
        // after a drag is still immediate, and any return spring must stay held.
        await delay(50);
        await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
    }
  };
  const assertOrganizer = async (selector, input) => {
    await evaluate('window.__unexpectedLinks=[]');
    await activate(selector, input);
    await until(`document.querySelector('[data-testid="public-profile-back"]')`);
    assert.ok(await evaluate(`location.pathname.endsWith('/users/12345678-abcd-abcd-abcd-000000000002')`), 'Organizer opens the intended native profile');
    assert.deepEqual(await evaluate('window.__unexpectedLinks'), [], 'Organizer must stay inside the native app');
    await evaluate(`document.querySelector('[data-testid="public-profile-back"]').click()`);
    await until(`!document.querySelector('[data-testid="public-profile-screen"]') && document.querySelector('[data-testid="event-sheet"]')`);
    await settled(); // A duplicate navigation would need two backs and fail above.
  };
  await until(eventButton());
  await open(false);
  const generalTotal = await evaluate(`(${interactionTargets.footer}).textContent`);
  const selectedTier = selector => `getComputedStyle(${selector}).borderTopColor==='rgb(255, 0, 68)'`;
  for (const input of ['mouse', 'touch', 'keyboard']) {
    await assertOrganizer(interactionTargets.organizer, input);
    await activate(interactionTargets.vip, input);
    await until(selectedTier(interactionTargets.vip));
    assert.equal(await evaluate(selectedTier(interactionTargets.general)), false);
    assert.notEqual(await evaluate(`(${interactionTargets.footer}).textContent`), generalTotal, 'Choosing VIP must update the purchase total');
    await activate(interactionTargets.general, input);
    await until(selectedTier(interactionTargets.general));
    assert.equal(await evaluate(`(${interactionTargets.footer}).textContent`), generalTotal);
    await activate(interactionTargets.footer, input);
    await until(`document.querySelector('[data-testid="checkout-screen"]')`);
    assert.equal(await evaluate('window.__unexpectedLinks.length'), 0, 'Purchasing opens the native checkout without leaving the app');
    await evaluate(`document.querySelector('[data-testid="checkout-close"]').click()`);
    await until(`!document.querySelector('[data-testid="checkout-screen"]')`);
    console.log(`PASS stationary ${input} organizer, tier and footer activation`);
  }
  for (const mouse of [true, false]) {
    const point = await pointFor(interactionTargets.organizer);
    if (mouse) await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    else await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
    const samples = [];
    for (let step = 1; step <= 16; step++) {
      const moved = { x: point.x, y: point.y + 100 * (step <= 8 ? step : 16-step)/8 };
      if (mouse) await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...moved, button: 'left', buttons: 1 });
      else await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...moved, id: 1 }] });
      await delay(25); samples.push(await metrics());
    }
    if (mouse) await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    else await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    observations.push({ phase: 'return-to-origin-drag', mouse, samples });
    await settled();
    assert.deepEqual(await evaluate('window.__unexpectedLinks'), [], 'Returning a drag to its starting point must not activate the child button');
    await assertOrganizer(interactionTargets.organizer, mouse ? 'mouse' : 'touch');
    console.log(`PASS ${mouse ? 'mouse' : 'touch'} drag returning to origin prevents click and preserves next activation`);
  }
  for (const input of ['mouse', 'touch', 'keyboard']) {
    const point = await pointFor(interactionTargets.organizer);
    await swipe(point, 70, { mouse: input !== 'touch', follow: true });
    assert.deepEqual(await evaluate('window.__unexpectedLinks'), [], 'Short drag must not activate the organizer');
    // No animation wait: the next intentional pointer or keyboard action must work.
    await assertOrganizer(interactionTargets.organizer, input);
    await settled();
    await activate(interactionTargets.vip, input);
    await until(selectedTier(interactionTargets.vip));
    await activate(interactionTargets.general, input);
    await until(selectedTier(interactionTargets.general));
    console.log(`PASS immediate ${input} activation after a short drag`);
  }
  await evaluate(`document.querySelector('[data-testid="sheet-handle"]').click()`);
  await until(`!document.querySelector('[data-testid="event-sheet"]')`);
  await open(true);
  const heldPoint = await evaluate(`{const r=document.querySelector('[data-testid="event-content"]').getBoundingClientRect();({x:r.left+r.width/2,y:r.top+70})}`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...heldPoint, button: 'left', buttons: 1 });
  const grabbed = await metrics(); await delay(100);
  assert.ok(Math.abs((await metrics()).handle-grabbed.handle)<8, 'Outside-release regression must begin with a paused opening sheet');
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 5, button: 'left' });
  await settled();
  await assertOrganizer(interactionTargets.organizer, 'mouse');
  console.log('PASS releasing outside the sheet resumes opening and allows subsequent clicks');
  assert.deepEqual(errors, []);
}
main().catch(async error => {
  console.error(error);
  temporary = fs.mkdtempSync(path.join(artifacts, 'sheet-diagnostics-'));
  const input = evaluate ? await evaluate('window.__sheetInput').catch(() => []) : [];
  fs.writeFileSync(path.join(temporary, 'observations.json'), JSON.stringify({ observations, errors, input }, null, 2));
  if (call) try { const result = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(temporary, 'failure.png'), Buffer.from(result.data, 'base64')); } catch {}
  console.error('Gesture diagnostics:', temporary);
  process.exitCode = 1;
}).finally(browserProfile.cleanup);
