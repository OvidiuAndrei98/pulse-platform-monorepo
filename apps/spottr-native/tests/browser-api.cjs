// Read-only smoke test against the running Expo preview and its real configured API.
// Starts its own isolated Chrome profile; no login, purchase or data mutations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createChromeProfile } = require('./chrome-profile.cjs');
const base = process.env.NATIVE_QA_URL || 'http://localhost:8081';
const artifacts = path.resolve(__dirname, '../artifacts');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let child, socket;
const browserProfile = createChromeProfile('api', () => ({ child, socket }));
const profile = browserProfile.path;

async function main() {
  const response = await fetch(base + '/api/v1/events?page=1');
  assert.equal(response.status, 200);
  const events = await response.json();
  assert.ok(Array.isArray(events));
  const active = events.filter(e => e.title && Date.parse(e.endTime) > Date.now());
  const event = active.find(e => e.bannerUrl) ?? active[0];
  assert.ok(event, 'This real-data test requires an active event in the configured API.');
  child = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome startup timed out')), 15000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.stderr.on('data', data => { const match = data.toString().match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const pending = new Map(), errors = [], apiResponses = [];
  let sequence = 0;
  socket.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Network.responseReceived' && ['Fetch', 'XHR'].includes(msg.params.type) && msg.params.response.url.includes('/api/v1/')) apiResponses.push({ url: msg.params.response.url, status: msg.params.response.status });
    const callback = pending.get(msg.id); if (callback) { pending.delete(msg.id); msg.error ? callback.reject(msg.error) : callback.resolve(msg.result); }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout ${method}`)); }, 60000);
    pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  await call('Runtime.enable'); await call('Page.enable'); await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const until = async expression => { for (let i = 0; i < 300; i++) { if (await evaluate(`Boolean(${expression})`)) return; await delay(200); } throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText.slice(0,1600)')}\n${errors.join('\n')}`); };
  const click = async selector => {
    await until(`document.querySelector(${JSON.stringify(selector)})`);
    const rect = await evaluate(`{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();({x:r.x+r.width/2,y:r.y+r.height/2})}`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...rect, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...rect, button: 'left', clickCount: 1 });
  };
  const capture = async name => { fs.mkdirSync(artifacts, { recursive: true }); const { data } = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(artifacts, name + '.png'), Buffer.from(data, 'base64')); };

  await call('Page.navigate', { url: base });
  await until(`document.querySelector('[data-testid="home-list"]')?.innerText.toLowerCase().includes(${JSON.stringify(event.title.toLowerCase())})`);
  await until(`Array.from(document.querySelectorAll('img')).filter(img => img.src.startsWith('http')).every(img => img.complete && img.naturalWidth > 0)`);
  await capture('api-home-mobile');
  console.log('PASS Home displays a real event from the configured API');
  await click('[data-testid="home-search"]');
  await until(`document.querySelector('[data-testid="event-search"]')`);
  await evaluate(`document.querySelector('[data-testid="event-search"]').focus()`);
  await call('Input.insertText', { text: event.title });
  for (let i = 0; i < 100 && !apiResponses.some(r => new URL(r.url).searchParams.get('q') === event.title); i++) await delay(100);
  await until(`document.querySelector('[data-testid="search-results"]')?.innerText.includes(${JSON.stringify(event.title)})`);
  assert.ok(apiResponses.some(r => new URL(r.url).searchParams.get('q') === event.title && r.status === 200));
  await capture('api-search-mobile');
  console.log('PASS Search queries the real API and renders its result');
  await click('[data-testid="search-results"] [role="button"]');
  await until(`document.querySelector('[data-testid="event-sheet"]')?.innerText.includes(${JSON.stringify(event.title)})`);
  await until(`document.querySelector('[data-testid="event-sheet"]')?.innerText.includes('About this event')`);
  for (let i = 0; i < 150 && !apiResponses.some(r => new URL(r.url).pathname.endsWith('/events/' + event.id + '/social')); i++) await delay(100);
  assert.ok(apiResponses.some(r => new URL(r.url).pathname.endsWith('/events/' + event.id) && r.status === 200));
  assert.ok(apiResponses.some(r => new URL(r.url).pathname.endsWith('/events/' + event.id + '/social') && r.status === 200));
  await until(`Array.from(document.querySelectorAll('[data-testid="event-sheet"] img')).every(img => img.complete && img.naturalWidth > 0)`);
  await capture('api-event-mobile');
  console.log('PASS Event detail refreshes from its real endpoint');
  await click('[aria-label="Back"]');
  await until(`!document.querySelector('[data-testid="event-sheet"]')`);
  await evaluate(`Array.from(document.querySelectorAll('[data-testid="home-list"] [role="button"]')).find(el=>el.getAttribute('aria-label')===${JSON.stringify(event.title)}).click()`);
  await until(`document.querySelector('[data-testid="event-sheet"]') && document.querySelector('[data-testid="sheet-pill"]')`);
  await delay(700);
  const handleBounds = await evaluate(`{ const pill=document.querySelector('[data-testid="sheet-pill"]').getBoundingClientRect(), body=document.querySelector('[data-testid="event-content"]').getBoundingClientRect(), handle=document.querySelector('[data-testid="sheet-handle"]').getBoundingClientRect(); ({width:pill.width,height:pill.height,offset:pill.top-body.top,contentTop:body.top,handleTop:handle.top}); }`);
  assert.equal(handleBounds.width,48); assert.equal(handleBounds.height,6);
  assert.ok(Math.abs(handleBounds.contentTop-handleBounds.handleTop)<1,'Handle overlays event image, without a separate header');
  assert.ok(Math.abs(handleBounds.offset-13)<1,'Same 13px top inset as the original Next sheet');
  await capture('api-event-sheet-mobile');
  console.log('PASS original 48x6 pill and fading shadow overlay the event image');
  const failed = apiResponses.filter(r => r.status >= 400);
  assert.deepEqual(failed, [], 'Unexpected failed API requests');
  assert.ok(apiResponses.every(r => new URL(r.url).origin === new URL(base).origin), 'Web preview must use its same-origin proxy');
  assert.deepEqual(errors, []);
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await capture('api-event-desktop');
  console.log(`PASS ${apiResponses.length} real same-origin API responses; no JavaScript exceptions`);
  console.log(JSON.stringify(apiResponses.map(r => ({ path: new URL(r.url).pathname, status: r.status }))));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(browserProfile.cleanup);
