// Run against a local dev or production server: node scripts/discovery.browser.cjs
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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-discovery-"));
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
    const detail = await evaluate("JSON.stringify({ path: location.pathname, scroll: scrollY, text: document.body.innerText.slice(-1500), cameraErrors:window.__cameraErrors, streams:window.__streams?.map(s=>s.getTracks().map(t=>t.readyState)) })");
    console.error("Runtime errors", errors, await evaluate("JSON.stringify({api: window.__api, state: history.state})"));
    throw new Error("Timed out: " + expression + "\n" + detail);
  };
  const navigate = async (route) => {
    await call("Page.navigate", { url: base + route });
    await until("Boolean(history.state?.__spottrNavigation)");
    await delay(250);
  };
  const button = (text) => `Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(text)})`;

  await call('Page.addScriptToEvaluateOnNewDocument',{source:`
    localStorage.setItem('pulse_token','discovery-test');
    const originalFetch=window.fetch.bind(window);
    window.__requests=[];window.__failNext=false;
    const event=i=>({id:'event-'+i,title:'Night '+i,locationName:'Test venue',city:'Bucuresti',category:'TECHNO',vibe:'indoor',status:'published',latitude:44.4,longitude:26.1,organizerId:'organizer',organizerName:'Organizer',startTime:'2099-10-01T18:00:00Z',endTime:'2099-10-02T04:00:00Z',bannerUrl:'/party-event.webp',ticketTypes:[],stats:{isFavorited:false,goingCount:0}});
    window.fetch=async(input,init)=>{
      const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);
      if(!url.pathname.includes('/api/v1/')) return originalFetch(input,init);
      const route=url.pathname.split('/api/v1')[1];
      const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
      if (route === '/wardrobe/mine') return reply({ deposits: [], staffAccess: false });
      if(route==='/users/me') return reply({id:'test-user',role:'user',username:'Tester',preferredLanguage:'en',email:'test@example.com'});
      if(route==='/profiles/search') return reply([]);
      if(route.endsWith('/social')) return reply({friends:[],goingCount:0,ticketsSoldCount:0,manualGoingCount:0});
      if(route==='/events') {
        const page=Number(url.searchParams.get('page')||1),q=url.searchParams.get('q')||'';
        window.__requests.push({page,q,city:url.searchParams.get('city')});
        await new Promise(resolve=>setTimeout(resolve,q==='older'?800:100));
        if(window.__failNext && page===2) return reply({title:'Temporary error'},503);
        if(q==='empty') return reply([]);
        const all=Array.from({length:45},(_,i)=>event(i+1));
        if(q==='latest') return reply([{...event(99),title:'Latest result'}]);
        if(q==='older') return reply([{...event(98),title:'Old stale result'}]);
        return reply(all.slice((page-1)*20,page*20));
      }
      return reply([]);
    };
    Object.defineProperty(navigator.geolocation,'getCurrentPosition',{value:(_,fail)=>fail({code:1})});
  `});
  const typeSearch=async value=>evaluate(`(() => {const input=document.querySelector('[role=dialog] input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const scrollList=()=>evaluate("window.dispatchEvent(new Event('spottr:cancel-scroll-restore'));document.querySelector('[data-nav-scroll=events-list]').scrollTop=100000");
  for(const width of [390,1280]) {
    if (width !== 390) await evaluate('sessionStorage.clear()');
    await call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<768});
    await navigate('/events');
    await until("document.querySelectorAll('[data-event-card]').length===20");
    await delay(500);
    assert.deepEqual(await evaluate('window.__requests.map(r=>r.page)'),[1],'First visit fetches only one page');
    await evaluate('window.__failNext=true');await scrollList();
    await until("document.querySelector('[role=alert]')");
    assert.equal(await evaluate("document.querySelectorAll('[data-event-card]').length"),20,'Next-page failure retains the first page');
    const requests=await evaluate('window.__requests.length');await delay(500);
    assert.equal(await evaluate('window.__requests.length'),requests,'Failed page is not retried in a loop');
    await evaluate("window.__failNext=false;document.querySelector('[role=alert] button').click()");
    await until("document.querySelectorAll('[data-event-card]').length===40");
    await scrollList();await until("document.querySelectorAll('[data-event-card]').length===45");
    await scrollList();await delay(400);
    assert.deepEqual(await evaluate('window.__requests.map(r=>r.page)'),[1,2,2,3],'Scroll loads each page and stops at the end');
    assert.equal(await evaluate("Array.from(document.querySelectorAll('button')).some(b=>/load more/i.test(b.textContent))"),false);
    // Warm return through tabs retains loaded pages and restores the inner scroll.
    const previousScroll=await evaluate("document.querySelector('[data-nav-scroll=events-list]').scrollTop");
    await evaluate("document.querySelector('[data-bottom-nav] button[aria-label=Home]').click()");
    await until("location.pathname==='/'");
    await evaluate("document.querySelector('[data-bottom-nav] button[aria-label=Map]').click()");
    await until("location.pathname==='/events' && document.querySelectorAll('[data-event-card]').length===45");
    await delay(500);
    const restoredScroll=await evaluate("document.querySelector('[data-nav-scroll=events-list]').scrollTop");
    assert.ok(Math.abs(restoredScroll-previousScroll)<3,'Back to the tab restores the long list: '+previousScroll+' => '+restoredScroll);

    await navigate('/');
    await until("document.querySelector('button[aria-label=Search]')");
    await evaluate("document.querySelector('button[aria-label=Search]').click()");
    await until("document.querySelector('[role=dialog] input[type=search]')");
    await typeSearch('night');
    await until("window.__requests.some(r=>r.q==='night') && document.querySelector('[role=dialog]').textContent.includes('Night 20')");
    assert.equal(await evaluate("window.__requests.filter(r=>r.q==='night').length"),1);
    await evaluate("document.querySelector('[data-drawer-keyboard-scroll]').scrollTop=100000");
    await until("document.querySelector('[role=dialog]').textContent.includes('Night 40')");
    await evaluate("document.querySelector('[data-drawer-keyboard-scroll]').scrollTop=100000");
    await until("document.querySelector('[role=dialog]').textContent.includes('Night 45')");
    assert.deepEqual(await evaluate("window.__requests.filter(r=>r.q==='night').map(r=>r.page)"),[1,2,3]);
    await typeSearch('older');await delay(250);await typeSearch('latest');
    await until("document.querySelector('[role=dialog]').textContent.includes('Latest result')");await delay(900);
    assert.equal(await evaluate("document.querySelector('[role=dialog]').textContent.includes('Old stale result')"),false);
    await typeSearch('empty');await until("document.querySelector('[role=dialog]').textContent.includes('No events')");
    await evaluate('history.back()');await until("!document.querySelector('[role=dialog]')");
    console.log('PASS Events and Search infinite scroll, retry, end-of-list, warm tab return and stale searches at '+width+'px');
  }
  assert.deepEqual(errors,[],'No runtime errors');
  assert.deepEqual(lifecycleWarnings,[],'No React lifecycle warnings');
  await send('Browser.close');await delay(500);
}

const deadline = setTimeout(() => { child.kill(); console.error("Browser test exceeded 120s"); process.exitCode = 1; }, 120000);
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  clearTimeout(deadline);
  socket?.close();
  if (child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await Promise.race([exited, delay(2000)]); }
  // The only recursive removal is the dedicated profile created by this test.
  const resolved = path.resolve(profile);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("pulse-discovery-")) {
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
});
