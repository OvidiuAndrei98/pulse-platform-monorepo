// Run against a local dev or production server: node scripts/logout-sheet.browser.cjs
// Use dev mode to catch React's development-only lifecycle warnings.
// Override NAVIGATION_TEST_URL / CHROME_PATH when needed. All API requests are mocked; no real account is used.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");

const base = process.env.NAVIGATION_TEST_URL || "http://localhost:3100";
const chrome = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-logout-sheet-"));
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
      if (message.params.type === 'error' && !/Failed to load/.test(text)) console.log('CONSOLE',text);
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
    const detail = await evaluate("JSON.stringify({ path: location.pathname, scroll: scrollY, text: document.body.innerText.slice(0, 500), cards: Array.from(document.querySelectorAll('h3,h2')).filter(e=>e.textContent.includes('Test Event')).map(e=>e.parentElement.outerHTML.slice(0,1800)) })");
    console.error("Runtime errors", errors, await evaluate("JSON.stringify({api: window.__api, state: history.state})"));
    throw new Error("Timed out: " + expression + "\n" + detail);
  };
  const navigate = async (route) => {
    await call("Page.navigate", { url: base + route });
    await until("Boolean(history.state?.__spottrNavigation)");
    await delay(250);
  };
  const button = (text) => `Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(text)})`;

  await call('Page.addScriptToEvaluateOnNewDocument', {source: `
    localStorage.setItem('pulse_token','mock-test');
    localStorage.setItem('i18nextLng','en');
    const originalFetch=window.fetch.bind(window);
    window.__api=[];
    const event={id:'test-event',title:'Test Event',organizerId:'other-organizer',organizerName:'Test Organizer',description:'Test description',locationName:'Test venue',city:'Bucuresti',latitude:44.4,longitude:26.1,category:'Party',startTime:'2020-10-01T18:00:00Z',endTime:'2099-10-02T04:00:00Z',bannerUrl:'/party-event.webp',stats:{isFavorited:false,goingCount:0},ticketTypes:[{id:'test-tier',name:'Test ticket',priceRon:50,description:'Entry',capacity:100,ticketsSold:0,startSales:'2020-01-01T00:00:00Z',endSales:'2099-10-01T17:00:00Z'}]};
    window.fetch=async(input,init)=>{
      const url=new URL(typeof input==='string'?input:input.url,location.origin);
      if(!url.pathname.includes('/api/v1/')) return originalFetch(input,init);
      const route=url.pathname.split('/api/v1')[1]; window.__api.push(route);
      let data=[];
      if(route==='/wardrobe/mine') return new Response(JSON.stringify({deposits:[],staffAccess:false}),{headers:{'Content-Type':'application/json'}});
      if(route==='/users/me') data={id:'test-organizer',username:'Test Organizer',email:'test@example.com',role:'organizer',preferredLanguage:'en'};
      else if(route==='/events') data=[event];
      else if(route==='/events/test-event') data=event;
      else if(route.startsWith('/profiles/')) data={id:'other-organizer',username:'Test Organizer',role:'organizer',relationship:'none',followsOrganizer:false,followerCount:0,friendCount:0,eventCount:0};
      else if(route.endsWith('/social')) data={friends:[],goingCount:0,interestedCount:0};
      else if(route.includes('/organizer')) data={isVerified:true,verificationStatus:'approved',companyName:'Test Organizer',stripeChargesEnabled:true,stripePayoutsEnabled:true};
      return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
    };
    Object.defineProperty(navigator.geolocation,'getCurrentPosition',{value:(_ok,fail)=>fail({code:1,message:'Denied'})});
  `});
  for (const width of [1440,390]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<768});
    await navigate('/dashboard');
    await until("Array.from(document.querySelectorAll('button')).some(b=>/log.?out/i.test(b.textContent))");
    const target=await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>/log.?out/i.test(b.textContent)&&b.getBoundingClientRect().width);b.scrollIntoView({inline:'center'}); const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...target,button:'left',clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',...target,button:'left',clickCount:1});
    await until("location.pathname==='/login' && document.querySelector('main a[href=\"/\"]')");
    await evaluate("document.querySelector('main a[href=\"/\"]').click()");
    await until("location.pathname==='/' && document.querySelector('button[aria-label=\"Search\"]')");
    await delay(800);
    assert.equal(await evaluate('location.pathname'),'/');
    assert.equal(await evaluate("localStorage.getItem('pulse_token')"),null);
    console.log('PASS organizer logout and login X at width',width);
  }
  for (const offset of [0,600,1400]) {
    await navigate('/');
    await until("Array.from(document.querySelectorAll('[role=button]')).some(b=>b.textContent.toLowerCase().includes('test event'))");
    await evaluate(`document.body.style.minHeight='3500px'; window.dispatchEvent(new Event('touchstart'));window.scrollTo(0,${offset})`);
    await delay(200);
    await evaluate("Array.from(document.querySelectorAll('[role=button]')).find(b=>b.textContent.toLowerCase().includes('test event')).click()");
    await until("document.querySelector('[data-vaul-drawer] input[type=radio]')");
    await delay(650);
    assert.equal(await evaluate('scrollY'),offset,'Opening the event sheet preserves Home scroll');
    await evaluate("window.__checkoutScrollFrames=[]; let frames=45; const sample=()=>{window.__checkoutScrollFrames.push(scrollY);if(--frames)requestAnimationFrame(sample);};requestAnimationFrame(sample)");
    await evaluate("Array.from(document.querySelectorAll('[data-vaul-drawer] button')).find(b=>b.textContent.trim().startsWith('Continue')).click()");
    await until("document.querySelector('aside[role=dialog]') && history.state.__spottrLayer?.length");
    await delay(800);
    assert.equal(await evaluate('window.scrollY'),offset,'Checkout must preserve the document offset used by the event-sheet history snapshot');
    const frameOffsets = await evaluate('window.__checkoutScrollFrames');
    assert.ok(frameOffsets.length > 10 && frameOffsets.every(value=>value===offset),'No document jump during the opening animation');
    assert.ok(await evaluate("(()=>{const preview=document.querySelector('[inert]');const r=preview?.lastElementChild?.getBoundingClientRect();return r && r.top>=0 && r.bottom<=innerHeight+1 && preview.textContent.includes('Test Event');})()"),'Sheet preview remains within the viewport behind checkout');
    await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Next').click()");
    await until("document.querySelector('aside[role=dialog] input[type=email]')");
    await evaluate('history.back()');
    await until("!document.querySelector('aside[role=dialog]') && document.querySelector('[data-vaul-drawer] input[type=radio]')");
    assert.equal(await evaluate('scrollY'),offset,'Returning from checkout retains the document offset');
    assert.equal(await evaluate('document.documentElement.style.overflow'),'','Checkout releases its scroll lock');
    await delay(650);
    await evaluate('history.back()');
    await until("!location.search.includes('eventId') && !document.querySelector('[data-vaul-drawer]')");
    assert.equal(await evaluate('scrollY'),offset,'Closing the event sheet restores the original Home position');
    console.log('PASS Home -> sheet -> checkout billing -> Back -> close at scroll',offset);
  }
  assert.deepEqual(errors,[],'No uncaught runtime errors');
  await send('Browser.close');
}

const deadline = setTimeout(() => { child.kill(); console.error("Browser test exceeded 240s"); process.exitCode = 1; }, 240000);
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  clearTimeout(deadline);
  socket?.close();
  if (child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await Promise.race([exited, delay(2000)]); }
  // The only recursive removal is the dedicated profile created by this test.
  const resolved = path.resolve(profile);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("pulse-logout-sheet-")) {
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
});
