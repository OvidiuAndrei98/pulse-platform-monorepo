// Run against a local dev or production server: node scripts/event-surfaces.browser.cjs
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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-event-surfaces-"));
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, method === 'Page.navigate' ? 45000 : 10000);
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
    const event={id:'test-event',isLive:true,title:'Test Event',organizerId:'other-organizer',organizerName:'Test Organizer',description:'Test description',locationName:'Test venue',city:'Bucuresti',latitude:44.4,longitude:26.1,category:'Party',startTime:'2020-10-01T18:00:00Z',endTime:'2099-10-02T04:00:00Z',bannerUrl:'/party-event.webp',stats:{isFavorited:false,goingCount:0},ticketTypes:[{id:'test-tier',name:'Test ticket',priceRon:50,description:'Entry',capacity:100,ticketsSold:0,startSales:'2020-01-01T00:00:00Z',endSales:'2099-10-01T17:00:00Z'}]};
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


  await call('Emulation.setTouchEmulationEnabled',{enabled:true});
  for (const offset of [0, 1000]) {
    await navigate('/');
    await until("Array.from(document.querySelectorAll('[role=button]')).some(b=>b.textContent.toLowerCase().includes('test event'))");
    await evaluate("document.body.style.minHeight='4000px';window.dispatchEvent(new Event('spottr:cancel-scroll-restore'));window.scrollTo({top:"+offset+",behavior:'instant'})");
    await delay(300);
    await evaluate("window.__homeLogo=document.querySelector('img[src=\"/spottr-logo.svg\"]');window.__homeSearch=document.querySelector('button[aria-label=Search]');void 0");
    await evaluate("Array.from(document.querySelectorAll('[role=button]')).find(b=>b.textContent.toLowerCase().includes('test event')).click()");
    await until("document.querySelector('[data-vaul-drawer] input[type=radio]')");
    await delay(650);
    await evaluate("window.__backdrop=document.querySelector('[data-event-sheet-backdrop]');void 0");
    for (let cycle=0; cycle<2; cycle++) {
      await evaluate("Array.from(document.querySelectorAll('[data-vaul-drawer] button')).find(b=>b.textContent.trim().startsWith('Continue')).click()");
      await until("document.querySelector('aside[role=dialog]') && history.state.__spottrLayer?.length");
      await delay(700);
      assert.equal(await evaluate('scrollY'),offset,'Opening checkout keeps Home offset');
      assert.equal(await evaluate("window.__backdrop===document.querySelector('[data-event-sheet-backdrop]')"),true,'The sheet backdrop survives checkout');
      // Sampling over the return catches repeated fade-in and backdrop removal.
      await evaluate("window.__backdropSamples=[];(() => {let count=55;const sample=()=>{const b=document.querySelector('[data-event-sheet-backdrop]');window.__backdropSamples.push({same:b===window.__backdrop,opacity:b?getComputedStyle(b).opacity:null,scroll:scrollY});if(--count)requestAnimationFrame(sample);};requestAnimationFrame(sample);})()");
      await evaluate('history.back()');
      await until("!document.querySelector('aside[role=dialog]') && document.querySelector('[data-vaul-drawer] input[type=radio]')");
      await delay(1000);
      const samples=await evaluate('window.__backdropSamples');
      assert.ok(samples.length>20 && samples.every(s=>s.same && Number(s.opacity)===1 && s.scroll===offset),'Backdrop and scroll stay stable through checkout Back: '+JSON.stringify(samples));
      assert.equal(await evaluate("window.__homeLogo===document.querySelector('img[src=\"/spottr-logo.svg\"]') && window.__homeSearch===document.querySelector('button[aria-label=Search]')"),true,'Home header is not remounted');
      assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-vaul-overlay]')).backdropFilter"),'none','The interactive overlay does not add a second blur');
      assert.equal(await evaluate("document.querySelectorAll('[data-event-sheet-backdrop]').length"),1);
    }
    if (offset === 0) {
      const origin = await evaluate("(() => {const r=document.querySelector('[data-vaul-drawer]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+16};})()");
      const drag = async distance => {
        await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});
        for(let step=1;step<=10;step++) {
          await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:origin.x,y:origin.y+distance*step/10}]});
          await delay(45);
        }
        await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      };
      await drag(20);
      await delay(650);
      assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-event-sheet-backdrop]')).opacity"),'1','Cancelled drag restores the backdrop');
      await drag(420);
    } else {
      await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    }
    await until("!document.querySelector('[data-vaul-drawer]') && !document.querySelector('[data-event-sheet-backdrop]')");
    assert.equal(await evaluate('scrollY'),offset,'Closing the event keeps Home scroll');
    assert.equal(await evaluate("document.body.getAttribute('data-scroll-locked')"),null,'Sheet releases Radix scroll lock');
    console.log('PASS stable sheet backdrop, header and scroll during repeated checkout returns at',offset);

    await evaluate("document.querySelector('button[aria-label=Search]').click()");
    await until("document.querySelector('[role=dialog] input[type=search]') && history.state.__spottrLayer?.length");
    await delay(650);
    assert.equal(await evaluate('scrollY'),offset,'Search preserves the actual document offset');
    assert.notEqual(await evaluate('document.body.style.position'),'fixed','Search does not fix the body');
    await evaluate("window.__routeCommit=[];for(const method of ['pushState','replaceState']){const original=history[method];history[method]=function(state,unused,target){if(String(target).includes('/events/test-event'))window.__routeCommit.push({position:document.body.style.position,overflow:document.documentElement.style.overflow,search:Boolean(document.querySelector('[role=dialog] input[type=search]'))});return original.apply(this,arguments)}}");
    await evaluate("Array.from(document.querySelectorAll('[role=dialog] button')).find(b=>b.textContent.toLowerCase().includes('test event')).click()");
    await until("location.pathname==='/events/test-event' && document.querySelector('main input[type=radio]')");
    const commits=await evaluate('window.__routeCommit');
    assert.ok(commits.length && commits.every(c=>c.position!=='fixed' && c.overflow!=='hidden' && !c.search),'The route commits after Search releases its surface and scroll lock');
    await delay(600);
    await evaluate("window.dispatchEvent(new Event('spottr:cancel-scroll-restore'));window.scrollTo({top:1100,behavior:'instant'})");
    await delay(150);
    assert.ok(await evaluate('scrollY>500'),'The event is scrolled before Back');
    await evaluate('history.back()');
    await until("location.pathname==='/' && document.querySelector('button[aria-label=Search]')");
    await delay(650);
    assert.equal(await evaluate('scrollY'),offset,'Back from a scrolled event restores Home');
    assert.equal(await evaluate("Boolean(document.querySelector('[role=dialog]'))"),false,'No stale Search overlay');
    console.log('PASS Home -> Search -> event -> scroll -> Back at Home offset',offset);
  }
  const dot=await evaluate("(() => {const dot=document.querySelector('.spottr-live-dot'),pulse=dot?.querySelector('.animate-ping'),badge=dot?.closest('.spottr-live-badge');return pulse && badge && {animation:getComputedStyle(pulse).animationName,duration:getComputedStyle(pulse).animationDuration,filter:getComputedStyle(badge).backdropFilter,backgroundFilter:getComputedStyle(badge,'::before').backdropFilter,width:dot.getBoundingClientRect().width}})()");
  assert.equal(dot?.animation,'ping','Keep the original expanding pulse');
  assert.equal(dot.duration,'1s','Keep the original pulse speed');
  assert.equal(dot.width,8,'Keep the original dot size');
  assert.equal(dot.filter,'none','The animated dot has no filtered badge ancestor');
  assert.equal(dot.backgroundFilter,'blur(12px)','Preserve the badge blur on its own background layer');
  const pulseFrames=await evaluate("new Promise(resolve=>{const badge=document.querySelector('.spottr-live-badge'),pulse=badge.querySelector('.animate-ping'),frames=[];let remaining=75;const sample=()=>{const r=badge.getBoundingClientRect();frames.push({width:r.width,height:r.height,opacity:getComputedStyle(badge).opacity,transform:getComputedStyle(pulse).transform});if(--remaining)requestAnimationFrame(sample);else resolve(frames)};requestAnimationFrame(sample)})");
  assert.ok(pulseFrames.every(f=>f.width===pulseFrames[0].width && f.height===pulseFrames[0].height && f.opacity==='1'),'Badge dimensions and opacity stay constant throughout the pulse');
  assert.ok(new Set(pulseFrames.map(f=>f.transform)).size>2,'The original dot still expands');
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.spottr-live-dot .animate-ping')).animationName"),'none');
  assert.deepEqual(errors,[],'No uncaught runtime errors');
  assert.deepEqual(lifecycleWarnings,[],'No lifecycle warnings');
  await send('Browser.close');
}

const deadline = setTimeout(() => { child.kill(); console.error("Browser test exceeded 240s"); process.exitCode = 1; }, 240000);
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  clearTimeout(deadline);
  socket?.close();
  if (child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await Promise.race([exited, delay(2000)]); }
  // The only recursive removal is the dedicated profile created by this test.
  const resolved = path.resolve(profile);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("pulse-event-surfaces-")) {
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
});
