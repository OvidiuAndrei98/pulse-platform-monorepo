// Production web smoke tests with an isolated Chrome profile and mocked API.
// No account, payment or production API is touched. Run after `pnpm export:web`.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { createChromeProfile } = require('./chrome-profile.cjs');
const dist = path.resolve(__dirname, '../dist');
const artifacts = path.resolve(__dirname, '../artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(dist, '.' + pathname);
  if (file !== dist && !file.startsWith(dist + path.sep)) { res.writeHead(403); res.end(); return; }
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(dist, 'index.html');
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' }[path.extname(target)] || 'application/octet-stream';
  res.setHeader('content-type', type); fs.createReadStream(target).pipe(res);
});
let child, socket;
const browserProfile = createChromeProfile('web', () => ({ child, socket, server }));
const profile = browserProfile.path;
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  child = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome startup timed out')), 15000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.stderr.on('data', data => { const match = data.toString().match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0; const pending = new Map(), errors = [];
  socket.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map(a => a.value || a.description).join(' '));
    const callback = pending.get(msg.id); if (callback) { pending.delete(msg.id); msg.error ? callback.reject(msg.error) : callback.resolve(msg.result); }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence; const timer = setTimeout(() => reject(new Error(`CDP timeout ${method}`)), 20000);
    pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  await call('Runtime.enable'); await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const until = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${expression})`)) return; await delay(100); } throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText.slice(0,1600)')}\n${errors.join('\n')}`); };
  const selector = id => `[data-testid="${id}"]`;
  const click = async id => {
    await until(`document.querySelector(${JSON.stringify(selector(id))})`);
    const point = await evaluate(`{const r=document.querySelector(${JSON.stringify(selector(id))}).getBoundingClientRect();({x:r.x+r.width/2,y:r.y+r.height/2})}`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    if (id.startsWith('tab-')) await until(`document.querySelector(${JSON.stringify(selector(id))}).getAttribute('aria-selected')==='true'`);
  };
  const textButton = label => `Array.from(document.querySelectorAll('[role=button]')).find(el => el.textContent.trim() === ${JSON.stringify(label)})`;
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = window.fetch.bind(window);
    window.__qa = { requests: [], fail: true };
    const uuid = n => '12345678-abcd-abcd-abcd-' + String(n).padStart(12, '0');
    window.__qa.account = { id: uuid(999), username: 'Native QA', email: 'qa@example.test', role: 'user', hasPassword: true, preferredLanguage: 'en', showAttendancePublicly: false, createdAt: '2026-10-07T12:00:00Z' };
    window.__qa.hidden = []; window.__qa.mutations = [];
    window.__qa.friends = [{ id: uuid(700), username: 'Alice QA', bio: 'Techno nights' }];
    window.__qa.friendRequests = [{ id: uuid(701), username: 'Bea QA' }, { id: uuid(702), username: 'Cam QA' }];
    window.__qa.feedFail = true; window.__qa.removeFail = true;
    window.__qa.notifications = []; window.__qa.notificationsFail = true; window.__qa.readFail = true;
    const event = n => ({ id: uuid(n), title: n === 90 ? 'Live tonight' : 'Future event ' + n, category: 'TECHNO', city: 'Bucuresti', locationName: 'Test venue', startTime: n === 90 ? '2020-01-01T12:00:00Z' : '2099-10-08T18:00:00Z', endTime: '2099-10-09T02:00:00Z', description: 'Native event details. '.repeat(30), ticketTypes: [{ id: 'general', name: 'General access', priceRon: 50, capacity: 100, ticketsSold: 1, startSales: '2020-01-01T00:00:00Z', endSales: '2099-10-09T02:00:00Z' }], lineup: [] });
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (!url.pathname.includes('/api/v1/')) { if (url.origin === location.origin) return original(input, init); throw new Error('Unexpected external request ' + url); }
      window.__qa.requests.push(url.pathname + url.search);
      const q = url.searchParams.get('q');
      await new Promise(resolve => setTimeout(resolve, q === 'old' ? 1200 : window.__qa.responseDelay || 40));
      const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      if (window.__qa.fail) return response({}, 503);
      const method = init?.method || 'GET', body = init?.body ? JSON.parse(init.body) : {};
      if (method !== 'GET') window.__qa.mutations.push({ path: url.pathname, method, body });
      if (url.pathname.endsWith('/auth/login')) return body.password === 'correct-password' ? response({token:'qa-session-only'}) : response({error:'invalid_credentials'},401);
      if (url.pathname.endsWith('/users/me')) {
        if (method === 'DELETE') return response({error:'invalid_password'},401);
        if (method === 'PUT') Object.assign(window.__qa.account,body);
        return response(window.__qa.account);
      }
      if (url.pathname.endsWith('/users/me/saved-events')) return response(Array.from({length:6},(_,i)=>event(i+1)));
      if (url.pathname.endsWith('/users/me/orders')) return response([{id:uuid(600),eventTitle:'QA fiscal event',locationName:'QA venue',createdAt:'2026-10-07T12:00:00Z',paidTotalBani:5450,refundedAmountBani:5000,status:'refunded',invoiceRequested:true,invoiceStatus:'issued',invoiceSeries:'QA',invoiceNumber:'1',refundInvoiceStatus:'pending'},{id:uuid(601),eventTitle:'Not an invoice',createdAt:'2026-10-07T12:00:00Z',paidTotalBani:5000,invoiceRequested:false}]);
      if (url.pathname.endsWith('/users/me/tickets')) return response([{id:uuid(500),eventId:uuid(1),eventTitle:'QA access ticket',validationHash:'qa-validation-hash-not-a-real-ticket',isValidated:false,ticketTypeName:'General access',locationName:'QA venue',startTime:'2099-10-08T18:00:00Z',endTime:'2099-10-09T02:00:00Z',priceRon:50,ticketPriceBani:5000,ticketingFeeBani:450,paidTotalBani:5450}]);
      if (url.pathname.endsWith('/notifications')) return window.__qa.notificationsFail ? response({},503) : response({items:window.__qa.notifications,unreadCount:window.__qa.notifications.filter(row=>!row.isRead).length});
      if (url.pathname.includes('/notifications/') && url.pathname.endsWith('/read')) {
        if(window.__qa.readFail)return response({},500);
        const item=window.__qa.notifications.find(row=>row.id===url.pathname.split('/').at(-2));if(item)item.isRead=true;
        return response({success:true});
      }
      if (url.pathname.endsWith('/feed')) return window.__qa.feedFail ? response({},503) : response([
        {activityType:'friend_ticket',actorId:uuid(700),actorUsername:'Alice QA',eventId:uuid(1),eventTitle:'After Dark social QA',occurredAt:'2026-10-07T12:00:00Z',eventStartTime:'2099-10-08T18:00:00Z'},
        {activityType:'friend_going',actorId:uuid(700),actorUsername:'Alice QA',eventId:uuid(1),eventTitle:'After Dark social QA',occurredAt:'2026-10-07T11:00:00Z',eventStartTime:'2099-10-08T18:00:00Z'},
      ]);
      if (url.pathname.endsWith('/friends/requests')) return window.__qa.friendsFail ? response({},503) : response(window.__qa.friendRequests);
      if (url.pathname.includes('/friends/request/') && method==='PUT') {
        const id=url.pathname.split('/').pop(), friend=window.__qa.friendRequests.find(row=>row.id===id);
        if(body.status==='accepted' && friend)window.__qa.friends.push(friend);
        window.__qa.friendRequests=window.__qa.friendRequests.filter(row=>row.id!==id);
        return response({success:true});
      }
      if (url.pathname.includes('/friends/') && method==='DELETE') {
        if(window.__qa.removeFail)return response({},500);
        window.__qa.friends=window.__qa.friends.filter(row=>row.id!==url.pathname.split('/').pop());return response({success:true});
      }
      if (url.pathname.endsWith('/friends')) return window.__qa.friendsFail ? response({},503) : response(window.__qa.friends);
      if (url.pathname.includes('/users/me/hidden-categories')) {
        if (method === 'POST') window.__qa.hidden=[...new Set([...window.__qa.hidden,body.category])];
        if (method === 'DELETE') window.__qa.hidden=window.__qa.hidden.filter(value=>value!==decodeURIComponent(url.pathname.split('/').pop()));
        return response(window.__qa.hidden.length?window.__qa.hidden:null);
      }
      if (url.pathname.endsWith('/promotions/active')) return response([]);
      if (url.pathname.endsWith('/social')) return response({ goingCount: 2, interestedCount: 1 });
      if (url.pathname.endsWith('/events')) {
        if (q === 'empty') return response([]);
        if (q) return response([{ ...event(q === 'old' ? 71 : 72), title: q + ' result' }]);
        if (url.searchParams.has('startsBefore')) return response([event(90)]);
        const page = Number(url.searchParams.get('page') || 1);
        return response(Array.from({ length: page === 1 ? 20 : page === 2 ? 1 : 0 }, (_, i) => event(page === 1 && i === 19 ? 90 : (page - 1) * 20 + i + 1)));
      }
      const id = url.pathname.split('/').pop();
      if (id === uuid(404)) return response({}, 404);
      return response(event(Number(id.slice(-12))));
    };
  }.toString()})();` });

  await call('Page.navigate', { url: base + '/' });
  await until(`document.body`);
  await until(`document.body.innerText.includes('Events could not be loaded')`);
  await evaluate(`window.__qa.fail=false; Array.from(document.querySelectorAll('[role=button]')).filter(el => el.textContent.trim() === 'Try again').forEach(el => el.click())`);
  await until(`document.body.innerText.toLowerCase().includes('future event 1')`);
  await until(`document.body.innerText.toLowerCase().includes('live tonight')`);
  console.log('PASS API failure, retry and Home events');
  await evaluate(`window.__bar=document.querySelector('[data-testid="tab-bar"]'); window.__home=document.querySelector('[data-testid="home-list"]'); window.__origin=performance.timeOrigin`);
  const capture = async name => { const { data } = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(artifacts, name + '.png'), Buffer.from(data, 'base64')); };
  const pull = async (id, distance = 210, observe) => {
    const point = await evaluate(`{const r=document.querySelector('[data-testid="${id}"]').getBoundingClientRect();({x:r.left+r.width/2,y:r.top+120})}`);
    await call('Emulation.setTouchEmulationEnabled',{enabled:true});
    await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});
    for(let step=1;step<=10;step++) {
      await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y:point.y+distance*step/10,id:1}]}); await delay(20);
      if (observe) await observe(step);
    }
    await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await call('Emulation.setTouchEmulationEnabled',{enabled:false});
  };
  await capture('home-mobile');
  for (let i = 0; i < 5; i++) { await click('tab-Explore'); await click('tab-Feed'); await click('tab-Home'); }
  assert.equal(await evaluate(`window.__bar===document.querySelector('[data-testid="tab-bar"]') && window.__home===document.querySelector('[data-testid="home-list"]') && performance.timeOrigin===window.__origin`), true);
  console.log('PASS rapid tab taps keep navbar and Home mounted');
  await evaluate(`document.querySelector('[data-testid="home-list"]').scrollTop=230`);
  const homeRetainedScroll=await evaluate(`document.querySelector('[data-testid="home-list"]').scrollTop`);
  await click('tab-Feed'); await click('tab-Home');
  await delay(400); // A duplicate tabPress starts smooth scroll after the click frame.
  assert.equal(await evaluate(`document.querySelector('[data-testid="home-list"]').scrollTop`),homeRetainedScroll,'Switching tabs preserves Home position');
  await click('tab-Home');
  await until(`document.querySelector('[data-testid="home-list"]').scrollTop===0`);
  await evaluate(`document.querySelector('[data-testid="home-list"]').scrollTop=230;document.querySelector('[data-testid="tab-Home"]').focus()`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await until(`document.querySelector('[data-testid="home-list"]').scrollTop===0`);
  console.log('PASS returning tabs preserve scroll; active tab mouse and keyboard presses scroll to top');
  await evaluate(`document.querySelector('[data-testid="home-list"]').scrollTop=0`); await delay(80);
  const homeRefreshCount = await evaluate(`window.__qa.requests.filter(path=>path.includes('/promotions/active')).length`);
  const pullLevels = [];
  await pull('home-list',75, async () => {
    pullLevels.push(await evaluate(`{const el=document.querySelector('[data-testid="home-list-refresh-indicator"] [data-testid="refresh-light"]');new DOMMatrix(getComputedStyle(el).transform).d}`));
  });
  assert.ok(new Set(pullLevels.map(value=>value.toFixed(3))).size>=4,'The spotlight grows downward with the pull');
  await delay(300);
  assert.equal(await evaluate(`window.__qa.requests.filter(path=>path.includes('/promotions/active')).length`),homeRefreshCount,'A short pull does not refresh');
  await evaluate(`document.querySelector('[data-testid="home-list"]').scrollTop=250`); await delay(80);
  await pull('home-list'); await delay(150);
  assert.equal(await evaluate(`window.__qa.requests.filter(path=>path.includes('/promotions/active')).length`),homeRefreshCount,'Scrolling content does not refresh before reaching the top');
  await evaluate(`document.querySelector('[data-testid="home-list"]').scrollTop=0;window.__qa.responseDelay=600`); await delay(80);
  await pull('home-list');
  await until(`window.__qa.requests.filter(path=>path.includes('/promotions/active')).length===${homeRefreshCount+1}`);
  const sweepAtStart = await evaluate(`{const el=document.querySelector('[data-testid="home-list-refresh-indicator"] [data-testid="refresh-light-sweep"]');({transform:getComputedStyle(el).transform,state:getComputedStyle(el).animationPlayState,timing:getComputedStyle(el).animationTimingFunction})}`);
  await delay(130);
  assert.equal(sweepAtStart.state,'running','Released refresh keeps the light sweeping while pending');
  assert.equal(sweepAtStart.timing,'ease-in-out','Light changes direction softly');
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('[data-testid="home-list-refresh-indicator"] [data-testid="refresh-light-sweep"]')).transform`),sweepAtStart.transform,'The light keeps searching between frames');
  await capture('home-refresh-loading');
  await evaluate(`window.__lightExit=[];{const end=performance.now()+1600;function sample(){const light=document.querySelector('[data-testid="home-list-refresh-indicator"] [data-testid="refresh-light"]'),content=document.querySelector('[data-testid="home-list-refresh-indicator"]').parentElement;window.__lightExit.push({opacity:Number(getComputedStyle(light).opacity),offset:new DOMMatrix(getComputedStyle(content).transform).m42});if(performance.now()<end)requestAnimationFrame(sample)}sample()}`);
  assert.ok(await evaluate(`document.querySelector('[data-testid="home-list"]').textContent.toLowerCase().includes('future event 1')`),'A pull must preserve the loaded cards');
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="event-sheet"]')`),false,'Pulling Home does not accidentally open a card');
  await pull('home-list');
  assert.equal(await evaluate(`window.__qa.requests.filter(path=>path.includes('/promotions/active')).length`),homeRefreshCount+1,'Repeated pulls join the pending refresh');
  await delay(1400); await evaluate('window.__qa.responseDelay=0');
  const lightExit=await evaluate('window.__lightExit');
  assert.ok(lightExit.some(frame=>frame.opacity<0.08&&frame.offset>63),'The spotlight extinguishes before the content retracts');
  assert.ok(lightExit.some(frame=>frame.opacity===0&&frame.offset<1),'Light stays off after the content returns');
  await evaluate('window.__qa.fail=true'); await pull('home-list');
  await until(`document.querySelector('[data-testid="home-list"]').textContent.includes('Events could not be loaded')`);
  assert.ok(await evaluate(`document.querySelector('[data-testid="home-list"]').textContent.toLowerCase().includes('future event 1')`),'Failed manual refresh retains the previous cards');
  await until(`getComputedStyle(document.querySelector('[data-testid="home-list-refresh-indicator"] [data-testid="refresh-light"]')).opacity==='0'`);
  await evaluate('window.__qa.fail=false'); await pull('home-list');
  await until(`!document.querySelector('[data-testid="home-list"]').textContent.includes('Events could not be loaded')`);
  assert.equal(await evaluate(`window.__home===document.querySelector('[data-testid="home-list"]')`),true,'Refreshing keeps the scroll view mounted');
  await until(`getComputedStyle(document.querySelector('[data-testid="home-list-refresh-indicator"] [data-testid="refresh-light"]')).opacity==='0'`);
  console.log('PASS Home pull-to-refresh threshold, top boundary and cached content');
  const cardPoint=await evaluate(`{const r=document.querySelector('[data-testid="home-list"] [aria-label="Live tonight"]').getBoundingClientRect();({x:r.left+r.width/2,y:r.top+40})}`);
  const beforeRoundtrip=await evaluate(`window.__qa.requests.filter(path=>path.includes('/promotions/active')).length`);
  await call('Emulation.setTouchEmulationEnabled',{enabled:true});
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...cardPoint,id:1}]});
  for(const delta of [20,40,60,80,60,40,20,0]) { await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cardPoint.x,y:cardPoint.y+delta,id:1}]});await delay(20); }
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await evaluate(`window.__qa.requests.filter(path=>path.includes('/promotions/active')).length`),beforeRoundtrip,'Returning a pull to its origin does not refresh');
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="event-sheet"]')`),false,'A cancelled pull does not open the card');
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...cardPoint,id:1}]});
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await until(`document.querySelector('[data-testid="event-sheet"]')`);
  await call('Emulation.setTouchEmulationEnabled',{enabled:false});
  await delay(600); await click('sheet-handle'); await until(`!document.querySelector('[data-testid="event-sheet"]')`);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...cardPoint,button:'left',clickCount:1});
  for(let step=1;step<=10;step++){await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:cardPoint.x,y:cardPoint.y+160*step/10,button:'left',buttons:1});await delay(20);}
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:cardPoint.x,y:cardPoint.y+160,button:'left',clickCount:1});
  await until(`window.__qa.requests.filter(path=>path.includes('/promotions/active')).length===${beforeRoundtrip+1}`);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="event-sheet"]')`),false,'Mouse pull does not also activate the card');
  await delay(300);
  const railPoint=await evaluate(`{const rail=Array.from(document.querySelectorAll('[data-testid="home-list"] div')).find(el=>el.scrollWidth>el.clientWidth+100&&['auto','scroll'].includes(getComputedStyle(el).overflowX));window.__qa.rail=rail;const r=rail.getBoundingClientRect();({x:r.right-50,y:r.top+60})}`);
  await call('Emulation.setTouchEmulationEnabled',{enabled:true});
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...railPoint,id:1}]});
  for(let step=1;step<=10;step++){await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:railPoint.x-170*step/10,y:railPoint.y+2,id:1}]});await delay(20);}
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await until(`window.__qa.rail.scrollLeft>20`);
  assert.equal(await evaluate(`window.__qa.requests.filter(path=>path.includes('/promotions/active')).length`),beforeRoundtrip+1,'Horizontal carousels do not refresh Home');
  await call('Emulation.setTouchEmulationEnabled',{enabled:false});
  console.log('PASS cancelled pull preserves the next card tap, mouse pull and horizontal carousel');
  if(process.argv.includes('--refresh-only')) { assert.deepEqual(errors,[]); return; }
  await click('home-search');
  await until(`document.querySelector('[data-testid="event-search"]')`);
  const input = async value => {
    await evaluate(`{ const input = document.querySelector('[data-testid="event-search"]'); input.focus(); input.setSelectionRange(0,input.value.length); }`);
    await call('Input.insertText', { text: value });
  };
  await input('old'); await delay(380); await input('new'); await until(`document.querySelector('[data-testid="search-results"]').innerText.includes('new result')`); await delay(1300);
  assert.equal(await evaluate(`document.querySelector('[data-testid="search-results"]').innerText.includes('old result')`), false);
  await input('empty'); await until(`document.querySelector('[data-testid="search-results"]').innerText.includes('No events found')`);
  assert.equal(await evaluate(`window.__qa.requests.some(r=>r.includes('q=empty')&&r.includes('startsAfter='))`), true);
  await evaluate(`document.querySelector('[aria-label="Back"]').click()`);
  await until(`!document.querySelector('[data-testid="event-search"]')`);
  console.log('PASS async search race, empty state, date filtering and back');
  await click('tab-Explore');
  await until(`document.querySelector('[data-testid="events-list"]')?.innerText.includes('Future event 1')`);
  await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  await evaluate(`{const list=document.querySelector('[data-testid="events-list"]');list.scrollTop=list.scrollHeight;}`);
  await delay(500);
  await until(`document.querySelector('[data-testid="events-list"]').innerText.includes('Future event 21')`);
  await evaluate(`window.__scroll=document.querySelector('[data-testid="events-list"]').scrollTop; Array.from(document.querySelectorAll('[data-testid="events-list"] [role=button]')).find(el=>el.getAttribute('aria-label')==='Future event 21'||el.textContent.includes('Future event 21')).click()`);
  await until(`document.querySelector('[data-testid="event-sheet"]')?.innerText.includes('Native event details.')`);
  await capture('event-mobile');
  await delay(700);
  const handle = await evaluate(`{ const r=document.querySelector('[data-testid="sheet-handle"]').getBoundingClientRect(); ({x:r.x+r.width/2,y:r.y+r.height/2}) }`);
  // Cross the midpoint with distance alone. Near-midpoint swipes can correctly
  // spring open when a busy renderer lowers their measured release velocity.
  const dragDistance = await evaluate('innerHeight * 0.6');
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...handle, button: 'left', buttons: 1, clickCount: 1 });
  for (let step = 1; step <= 12; step++) {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: handle.x, y: handle.y + dragDistance * step / 12, button: 'left', buttons: 1 });
    await delay(20);
    if (step === 5) assert.ok(await evaluate(`document.querySelector('[data-testid="sheet-handle"]').getBoundingClientRect().top`) > handle.y + 60, 'Drawer must follow the drag before release');
  }
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: handle.x, y: handle.y + dragDistance, button: 'left', clickCount: 1 });
  await until(`!document.querySelector('[data-testid="event-sheet"]')`);
  assert.equal(await evaluate(`Math.abs(document.querySelector('[data-testid="events-list"]').scrollTop-window.__scroll)<2`), true);
  console.log('PASS infinite scrolling, event drag-to-dismiss and scroll restoration');
  await evaluate(`Array.from(document.querySelectorAll('[data-testid="events-list"] [role=button]')).find(el=>el.getAttribute('aria-label')==='Future event 21'||el.textContent.includes('Future event 21')).click()`);
  await until(`document.querySelector('[data-testid="event-sheet"]')`); await delay(700);
  const contentStart = await evaluate(`{const r=document.querySelector('[data-testid="event-content"]').getBoundingClientRect();({x:r.x+r.width/2,y:r.top+70})}`);
  const touchHandleTop = await evaluate(`document.querySelector('[data-testid="sheet-handle"]').getBoundingClientRect().top`);
  assert.equal(await evaluate(`document.querySelector('[data-testid="event-content"]').scrollTop`), 0, 'Content dismissal starts at the top of its scroll view');
  await call('Emulation.setTouchEmulationEnabled', { enabled: true });
  await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{...contentStart,id:1}] });
  for (let step=1;step<=12;step++) {
    await call('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:contentStart.x,y:contentStart.y+dragDistance*step/12,id:1}]});
    await delay(20);
    if (step===5) {
      assert.ok(await evaluate(`document.querySelector('[data-testid="sheet-handle"]').getBoundingClientRect().top`) > touchHandleTop + 90, 'Touch drag from content must visibly follow the finger before release');
      assert.equal(await evaluate(`Math.abs(document.querySelector('[data-testid="events-list"]').scrollTop-window.__scroll)<2`), true, 'Touch dragging must keep the background list stationary');
    }
  }
  await call('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  await until(`!document.querySelector('[data-testid="event-sheet"]')`);
  await call('Emulation.setTouchEmulationEnabled', { enabled: false });
  assert.equal(await evaluate(`Math.abs(document.querySelector('[data-testid="events-list"]').scrollTop-window.__scroll)<2`),true);
  console.log('PASS touch drag from event content dismisses without moving the background');
  await click('tab-Feed');
  await until(`document.body.innerText.includes("Sign in to see friends' activity.")`);
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await capture('desktop');
  assert.deepEqual(errors, []);
  console.log('PASS desktop rendering, guest Feed and no JavaScript errors');
  await call('Emulation.setDeviceMetricsOverride', { width:390,height:844,deviceScaleFactor:1,mobile:true });
  await click('tab-Profile');
  await until(`document.querySelector('[data-testid="auth-screen"]')`);
  await click('auth-back');
  await until(`!document.querySelector('[data-testid="auth-screen"]') && document.querySelector('[data-testid="tab-Home"]').getAttribute('aria-selected')==='true'`);
  await click('tab-Profile'); await click('auth-email-choice');
  const fill = async (id,value) => { await evaluate(`{const el=document.querySelector('[data-testid="${id}"]');el.focus();el.select();}`); await call('Input.insertText',{text:value}); };
  await fill('auth-email','qa@example.test'); await fill('auth-password','wrong-password'); await click('auth-submit');
  await until(`document.body.innerText.includes('Incorrect email or password.')`);
  await fill('auth-password','correct-password'); await click('auth-submit');
  await until(`!document.querySelector('[data-testid="auth-screen"]') && document.querySelector('[data-testid="profile-list"]')?.innerText.includes('Native QA')`);
  await until(`document.body.innerText.includes('QA access ticket')`);
  await capture('profile-mobile');
  const pressText = async label => { await until(`${textButton(label)}`); await evaluate(`${textButton(label)}.scrollIntoView({block:'center'})`); await evaluate(`${textButton(label)}.click()`); };
  const dragProfileSurface = async (sheet, target, background = 'profile-list') => {
    await delay(500);
    const before = await evaluate(`({top:document.querySelector('[data-testid="sheet-handle"]').getBoundingClientRect().top,scroll:document.querySelector('[data-testid="${background}"]').scrollTop})`);
    const point = await evaluate(`{const r=(${target}).getBoundingClientRect();({x:r.left+r.width/2,y:r.top+Math.min(20,r.height/2)})}`);
    const delta = Math.min(120, 630-point.y);
    assert.ok(delta > 45, 'Profile gesture needs visible space below its starting point');
    await call('Emulation.setTouchEmulationEnabled', {enabled:true});
    await call('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{...point,id:1}]});
    for (let step=1;step<=8;step++) {
      await call('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:point.x,y:point.y+delta*step/8,id:1}]});
      await delay(25);
    }
    assert.ok(await evaluate(`document.querySelector('[data-testid="sheet-handle"]').getBoundingClientRect().top`) > before.top+25, `${sheet} must track a drag from its inner content`);
    for (let step=7;step>=0;step--) {
      await call('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:point.x,y:point.y+delta*step/8,id:1}]});
      await delay(25);
    }
    await call('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
    await call('Emulation.setTouchEmulationEnabled', {enabled:false});
    await until(`document.querySelector('[data-testid="${sheet}"]') && Math.abs(document.querySelector('[data-testid="sheet-handle"]').getBoundingClientRect().top-(${before.top}))<2`);
    assert.equal(await evaluate(`document.querySelector('[data-testid="${background}"]').scrollTop`),before.scroll,'Sheet gesture must keep background scroll unchanged');
  };
  await pressText('Event preferencesPersonalize the events you see');
  await until(`document.querySelector('[data-testid="preferences-sheet"]')`);
  await until(`document.querySelector('[role="checkbox"]')`);
  await evaluate(`{const el=Array.from(document.querySelectorAll('[role=checkbox]')).find(el=>el.textContent==='TECHNO');el.click();el.click();}`);
  await delay(350);
  assert.deepEqual(await evaluate('window.__qa.hidden'),[]);
  await evaluate(`Array.from(document.querySelectorAll('[role=checkbox]')).find(el=>el.textContent==='HOUSE').click()`);
  await until(`window.__qa.hidden.includes('HOUSE')`);
  await dragProfileSurface('preferences-sheet', `document.querySelector('[data-testid="preferences-sheet"] [role=checkbox]')`);
  assert.deepEqual(await evaluate('window.__qa.hidden'),['HOUSE'],'Dragging a category must not toggle it');
  await click('sheet-handle');
  await until(`!document.querySelector('[data-testid="preferences-sheet"]')`);
  await pressText('My code');
  await until(`document.querySelector('[data-testid="quick-connect-sheet"]')`); await delay(600);
  await capture('quick-connect-mobile');
  const codeTop = await evaluate(`document.querySelector('[data-testid="sheet-handle"]').getBoundingClientRect().top`);
  await evaluate(`Array.from(document.querySelectorAll('[data-testid="quick-connect-sheet"] [role=tab]')).find(el=>el.textContent.trim()==='Scan QR').click()`);
  await until(`document.querySelector('[data-testid="sheet-handle"]').getBoundingClientRect().top < ${codeTop - 80}`);
  await delay(500);
  await capture('quick-connect-scan-mobile');
  await dragProfileSurface('quick-connect-sheet', `document.querySelector('[data-testid="quick-connect-sheet"] [role=tab]')`);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-testid="quick-connect-sheet"] svg')).some(el=>el.getBoundingClientRect().width>90)`),false,'Dragging the other tab must not replace the camera with the personal QR code');
  await evaluate(`Array.from(document.querySelectorAll('[data-testid="quick-connect-sheet"] [role=tab]')).find(el=>el.textContent.trim()==='My code').click()`);
  await until(`Math.abs(document.querySelector('[data-testid="sheet-handle"]').getBoundingClientRect().top-${codeTop})<1`);
  assert.equal(await evaluate(`document.querySelector('[data-testid="sheet-pill"]').getBoundingClientRect().height`),6);
  await dragProfileSurface('quick-connect-sheet', `Array.from(document.querySelectorAll('[data-testid="quick-connect-sheet"] svg')).sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width)[0]`);
  await click('sheet-handle'); await until(`!document.querySelector('[data-testid="quick-connect-sheet"]')`);
  await evaluate(`Array.from(document.querySelectorAll('[data-testid="profile-list"] [role=button]')).find(el=>el.textContent.includes('QA access ticket')).click()`);
  await until(`document.querySelector('[data-testid="ticket-preview"]')`); await delay(600);
  await capture('ticket-mobile');
  assert.ok(await evaluate(`document.querySelector('[data-testid="ticket-preview"]').innerText.includes('Download PDF')`));
  const assertTicketBounds = async () => {
    const bounds = await evaluate(`{const button=document.querySelector('[data-testid="ticket-download"]').getBoundingClientRect();const area=document.querySelector('[data-testid="ticket-fit-area"]').getBoundingClientRect(); const qr=document.querySelector('[data-testid="ticket-fit-area"] svg').getBoundingClientRect(); ({bottom:button.bottom,top:button.top,window:innerHeight,areaTop:area.top,areaBottom:area.bottom,qrTop:qr.top,qrBottom:qr.bottom,qrWidth:qr.width})}`);
    assert.ok(bounds.bottom <= bounds.window - 20 && bounds.top > 0, 'PDF button remains visible with bottom spacing: '+JSON.stringify(bounds));
    assert.ok(bounds.qrTop >= bounds.areaTop - 1 && bounds.qrBottom <= bounds.areaBottom + 1 && bounds.qrWidth >= 90, 'QR fits the available card area: '+JSON.stringify(bounds));
  };
  await assertTicketBounds();
  await dragProfileSurface('ticket-preview', `document.querySelector('[data-testid="ticket-fit-area"] svg')`);
  await call('Emulation.setDeviceMetricsOverride',{width:360,height:640,deviceScaleFactor:1,mobile:true}); await delay(400); await capture('ticket-small-mobile');
  await assertTicketBounds();
  await click('sheet-handle'); await until(`!document.querySelector('[data-testid="ticket-preview"]')`);
  const clickInProfile = async id => { await evaluate("document.querySelector('[data-testid=\""+id+"\"]').scrollIntoView({block:'center'})"); await delay(80); await click(id); };
  await clickInProfile('profile-saved-all');
  await until(`document.querySelector('[data-testid="saved-events-page"]')?.innerText.includes('Future event 6')`);
  assert.equal(await evaluate(`window.__bar===document.querySelector('[data-testid="tab-bar"]')`),true);
  await click('account-back'); await until(`!document.querySelector('[data-testid="saved-events-page"]')`);
  await clickInProfile('profile-tickets-all');
  await until(`document.querySelector('[data-testid="tickets-page"]')?.innerText.includes('QA access ticket')`);
  await evaluate(`Array.from(document.querySelectorAll('[data-testid="tickets-page"] [role=button]')).find(el=>el.textContent.includes('Show QR')).click()`);
  await until(`document.querySelector('[data-testid="ticket-preview"]')`); await delay(500); await assertTicketBounds();
  await click('sheet-handle'); await until(`!document.querySelector('[data-testid="ticket-preview"]')`);
  await click('account-back'); await until(`!document.querySelector('[data-testid="tickets-page"]')`);
  await evaluate(`Array.from(document.querySelectorAll('[data-testid="profile-list"] [role=tab]')).find(el=>el.textContent.trim()==='History').click()`);
  await until(`Array.from(document.querySelectorAll('[data-testid="profile-list"] [role=button]')).find(el=>el.textContent.includes('View orders'))`);
  await evaluate(`Array.from(document.querySelectorAll('[data-testid="profile-list"] [role=button]')).find(el=>el.textContent.includes('View orders')).click()`);
  await until(`document.querySelector('[data-testid="invoices-page"]')?.innerText.includes('QA fiscal event')`);
  assert.equal(await evaluate(`document.querySelector('[data-testid="invoices-page"]').innerText.includes('Not an invoice')`),false);
  assert.ok(await evaluate(`document.querySelector('[data-testid="invoices-page"]').innerText.includes('Credit note waiting to be issued')`));
  await capture('invoices-mobile');
  await click('account-back'); await until(`!document.querySelector('[data-testid="invoices-page"]')`);
  console.log('PASS saved events, ticket list with QR, invoices/refunds and persistent navbar');
  await click('tab-Feed');
  await until(`Array.from(document.querySelectorAll('[data-testid="feed-list"] [role=button]')).some(el=>el.textContent==='Try again')`);
  await evaluate(`window.__qa.feedFail=false;Array.from(document.querySelectorAll('[data-testid="feed-list"] [role=button]')).find(el=>el.textContent==='Try again').click()`);
  await until(`document.querySelector('[data-testid="feed-list"]').textContent.includes('After Dark social QA')`);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-testid="feed-list"] [role=button]')).filter(el=>el.getAttribute('aria-label')?.endsWith(': After Dark social QA')).length`),1,'Ticket and RSVP for one friend must yield one feed entry');
  await click('feed-friends'); await until(`document.querySelector('[data-testid="friends-sheet"]')?.textContent.includes('Alice QA')`);
  await delay(600);
  await fill('friends-sheet-search','not-a-friend');
  await until(`!document.querySelector('[data-testid="friends-sheet-list"]').textContent.includes('Alice QA')`);
  await fill('friends-sheet-search','Alice');
  await until(`document.querySelector('[data-testid="friends-sheet-list"]').textContent.includes('Alice QA')`);
  await dragProfileSurface('friends-sheet', `document.querySelector('[data-testid="friends-sheet-list"] [role=button]')`, 'feed-list');
  const friendId=n=>'12345678-abcd-abcd-abcd-'+String(n).padStart(12,'0');
  await evaluate(`{const el=document.querySelector('[data-testid="friend-accept-${friendId(701)}"]');el.click();el.click();}`);
  await until(`!document.querySelector('[data-testid="friend-accept-${friendId(701)}"]')`);
  assert.equal(await evaluate(`window.__qa.mutations.filter(row=>row.method==='PUT'&&row.path.endsWith('/friends/request/${friendId(701)}')).length`),1,'Rapid accept taps issue one mutation');
  await click('friend-decline-'+friendId(702)); await until(`!document.querySelector('[data-testid="friend-decline-${friendId(702)}"]')`);
  await capture('friends-sheet-mobile');
  await click('friends-manage'); await until(`document.querySelector('[data-testid="friends-page"]')?.textContent.includes('Bea QA')`);
  await click('friend-remove-'+friendId(700));
  await until(`document.querySelector('[data-testid="friend-remove-${friendId(700)}"]').getAttribute('aria-disabled')!=='true'`); await delay(150);
  assert.ok(await evaluate(`document.querySelector('[data-testid="friends-page"]').textContent.includes('Alice QA')`),'Failed removal must retain the friend');
  await evaluate('window.__qa.removeFail=false');
  await click('friend-remove-'+friendId(700)); await until(`!document.querySelector('[data-testid="friend-remove-${friendId(700)}"]')`);
  await capture('friends-manage-mobile');
  await click('friends-back'); await until(`!document.querySelector('[data-testid="friends-page"]')`);
  assert.equal(await evaluate(`window.__bar===document.querySelector('[data-testid="tab-bar"]')`),true);
  await evaluate(`window.__qa.friends.push({id:'${friendId(703)}',username:'Dan QA'})`);
  await click('feed-friends');
  await until(`document.querySelector('[data-testid="friends-sheet-list"]')?.textContent.includes('Dan QA')`);
  await delay(500); await click('sheet-handle'); await until(`!document.querySelector('[data-testid="friends-sheet"]')`);
  await evaluate('window.__qa.friendsFail=true'); await click('feed-friends');
  await until(`Array.from(document.querySelectorAll('[data-testid="friends-sheet-list"] [role=button]')).some(el=>el.textContent==='Try again')`);
  assert.ok(await evaluate(`document.querySelector('[data-testid="friends-sheet-list"]').textContent.includes('Dan QA')`),'Friends remain visible if their background refresh fails');
  await evaluate('window.__qa.friendsFail=false'); await click('sheet-handle'); await until(`!document.querySelector('[data-testid="friends-sheet"]')`);
  const feedRefreshCount=await evaluate(`window.__qa.requests.filter(path=>path.endsWith('/feed')).length`);
  await click('tab-Home'); await evaluate('window.__qa.feedFail=true'); await click('tab-Feed'); await delay(200);
  assert.equal(await evaluate(`window.__qa.requests.filter(path=>path.endsWith('/feed')).length`),feedRefreshCount,'Returning to Feed does not fetch automatically');
  await evaluate(`document.querySelector('[data-testid="feed-list"]').scrollTop=0`); await pull('feed-list');
  await until(`Array.from(document.querySelectorAll('[data-testid="feed-list"] [role=button]')).some(el=>el.textContent==='Try again')`);
  assert.ok(await evaluate(`document.querySelector('[data-testid="feed-list"]').textContent.includes('After Dark social QA')`),'Background refresh errors preserve cached feed rows');
  await evaluate(`window.__qa.feedFail=false;Array.from(document.querySelectorAll('[data-testid="feed-list"] [role=button]')).find(el=>el.textContent==='Try again').click()`);
  await until(`!Array.from(document.querySelectorAll('[data-testid="feed-list"] [role=button]')).some(el=>el.textContent==='Try again')`);
  console.log('PASS authenticated feed retry/grouping, friend search, sheet drag, accept/decline and removal failure/retry');
  await click('tab-Home');
  await evaluate(`document.querySelector('[data-testid="home-list"]').scrollTop=0`); await delay(150);
  assert.ok(await evaluate(`document.querySelector('[data-testid="home-list"]').textContent.includes('Hello, Native QA')`));
  await click('home-notifications');
  await until(`Array.from(document.querySelectorAll('[data-testid="notifications-panel"] [role=button]')).some(el=>el.textContent==='Try again')`);
  await evaluate(`window.__qa.notificationsFail=false;Array.from(document.querySelectorAll('[data-testid="notifications-panel"] [role=button]')).find(el=>el.textContent==='Try again').click()`);
  await until(`document.querySelector('[data-testid="notifications-panel"]')?.textContent.includes('No notifications yet.')`);
  await click('notifications-close');
  await until(`!document.querySelector('[data-testid="notifications-panel"]')`);
  await evaluate(`window.__qa.notifications=[{id:'${friendId(800)}',type:'message',title:'New message QA',body:'A new message',isRead:false,createdAt:new Date().toISOString()},{id:'${friendId(801)}',type:'ticket_purchased',title:'Server title',body:'Server body',eventId:'${friendId(1)}',isRead:false,createdAt:new Date().toISOString()}]`);
  await click('home-notifications');
  await until(`document.querySelector('[data-testid="notifications-panel"]')?.textContent.includes('New message QA')`);
  assert.ok(await evaluate(`document.querySelector('[data-testid="notifications-panel"]').textContent.includes('Your tickets are confirmed')`));
  await delay(250);
  await capture('notifications-mobile');
  const panelBounds = await evaluate(`{const r=document.querySelector('[data-testid="notifications-panel"]').getBoundingClientRect();({left:r.left,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight})}`);
  assert.ok(panelBounds.left>=19 && panelBounds.right<=panelBounds.width-19 && panelBounds.bottom<panelBounds.height,'Popover stays inside a small mobile viewport');
  await click('notification-'+friendId(800)); await until(`!document.querySelector('[data-testid="notifications-panel"]')`); await delay(150);
  assert.equal(await evaluate(`window.__qa.notifications[0].isRead`),false,'Failed read must retain unread status');
  await evaluate('window.__qa.readFail=false');
  await click('home-notifications');
  await until(`document.querySelector('[data-testid="notifications-panel"]')?.textContent.includes("The change couldn't be saved.")`);
  await click('notification-'+friendId(800));
  await until(`window.__qa.notifications[0].isRead`);
  await click('home-notifications'); await click('notification-'+friendId(801));
  await until(`document.querySelector('[data-testid="event-content"]')?.textContent.includes('Future event 1')`);
  await until(`window.__qa.notifications[1].isRead`);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="sheet-handle"]')`),false,'Notification opens the full event page, matching the web application');
  await evaluate(`document.querySelector('[data-testid="event-sheet"] [aria-label="Back"]').click()`);
  await until(`!document.querySelector('[data-testid="event-sheet"]')`);
  await until(`!document.querySelector('[data-testid="notification-unread"]')`);
  console.log('PASS Home account greeting, notification error/retry/empty/fresh opening, read failure/retry and event navigation');
  await click('tab-Profile');
  await pressText('Log out');
  await until(`document.querySelector('[data-testid="tab-Home"]').getAttribute('aria-selected')==='true'`);
  assert.equal(await evaluate(`localStorage.getItem('spottr-native.session.v1')`), null);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="home-notifications"]')`),false,'Logout hides private notifications');
  assert.equal(await evaluate(`window.__bar===document.querySelector('[data-testid="tab-bar"]')`),true);
  assert.deepEqual(errors,[]);
  console.log('PASS native email login, safe close, profile, rapid category changes, QR sheets and logout (mock API only)');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(browserProfile.cleanup);
