// Run against a local dev or production server: node scripts/tickets.browser.cjs
// Use dev mode to catch React's development-only lifecycle warnings.
// Override NAVIGATION_TEST_URL / CHROME_PATH when needed. No account is used.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");

const base = process.env.NAVIGATION_TEST_URL || "http://localhost:3100";
const sheetOnly = process.argv.includes("--sheet-only");
const passOnly = process.argv.includes("--pass-only");
const connectionOnly = process.argv.includes("--connection-only");
const chrome = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-tickets-"));
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
  const friendQr = await require('qrcode').toDataURL('glow://friend/11111111-2222-4333-8444-555555555555',{width:360,margin:4});
  const ownQr = await require('qrcode').toDataURL('glow://friend/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',{width:360,margin:4});

  await call("Page.addScriptToEvaluateOnNewDocument", { source: `
    localStorage.setItem('pulse_token', 'mock-tickets-test');
    const originalFetch = window.fetch.bind(window);
    const common = { eventTitle: 'Next Night', eventId: '90', locationName: 'Test venue', startTime: '2099-10-01T18:00:00Z', endTime: '2099-10-02T04:00:00Z', ticketTypeName: 'General admission', isValidated: false, priceRon: 80, organizerCompanyName: 'Test Organizer', organizerCui: 'TEST', organizerFiscalAddress: 'Test address' };
    window.__api = { fail: false, empty: false, calls: 0, connections:0 };
    Object.assign(common, {ticketPriceBani:8000,ticketingFeeBani:570,paidTotalBani:8570,vatPercentage:21,vatAmountBani:1487});
    window.__streams = [];
    navigator.mediaDevices.getUserMedia = async () => {
      if (window.__cameraDelay) await new Promise(resolve => setTimeout(resolve,window.__cameraDelay));
      if (window.__denyCamera) throw new DOMException('Test permission denied','NotAllowedError');
      const canvas=document.createElement('canvas');canvas.width=canvas.height=360;
      const stream=canvas.captureStream(10);
      if (window.__qrStream) {
        const img = new Image();img.src=window.__ownQr ? ${JSON.stringify(ownQr)} : ${JSON.stringify(friendQr)};await img.decode();
        canvas.getContext('2d').drawImage(img,0,0,360,360);
      } else {canvas.getContext('2d').fillRect(0,0,360,360);}
      window.__streams.push(stream);return stream;
    };
    const appendChild = Node.prototype.appendChild;
    Node.prototype.appendChild = function(node) {
      const result = appendChild.call(this,node);
      if (node.tagName === 'IFRAME' && node.contentDocument) {
        const write = node.contentDocument.write.bind(node.contentDocument);
        node.contentDocument.write = (...args) => {
          if (args.join('').includes('data-ticket-pdf')) window.__pdfMarkup = args.join('');
          return write(...args);
        };
      }
      return result;
    };
    const toDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      const url = toDataURL.apply(this,args);
      if (this.width === 1588) window.__pdfImage = url;
      return url;
    };
    const tickets = [
      {...common, id:'later', eventId:'2', eventTitle:'Later Night', startTime:'2099-11-01T18:00:00Z', endTime:'2099-11-02T04:00:00Z', validationHash:'fixture-later'},
      {...common, id:'used', eventId:'used-event', eventTitle:'Recent Night', startTime:'2021-10-01T18:00:00Z', endTime:'2021-10-02T04:00:00Z', isValidated:true, validationHash:'fixture-used'},
      {...common, id:'next-one', validationHash:'fixture-next-one'},
      {...common, id:'expired', eventId:'old-event', eventTitle:'Old Night', startTime:'2020-10-01T18:00:00Z', endTime:'2020-10-02T04:00:00Z', validationHash:'fixture-expired'},
      {...common, id:'next-two', ticketTypeName:'VIP admission', validationHash:'0123456789abcdef'.repeat(4)}
    ];
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
      if (!url.pathname.includes('/api/v1/')) return originalFetch(input, init);
      const route = url.pathname.split('/api/v1')[1];
      const reply = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json'}});
      if (route === '/wardrobe/mine') return reply({ deposits: [], staffAccess: false });
      if (route === '/users/me') return reply({id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',username:'Test User',role:location.pathname.startsWith('/dashboard')?'organizer':'user',email:'test@example.com',preferredLanguage:'en'});
      if (route.startsWith('/dashboard/organizer/profile/')) return reply({isVerified:true,verificationStatus:'approved',stripeChargesEnabled:true,stripePayoutsEnabled:true});
      if (route === '/dashboard/events/mobile') {
        const event={id:'mobile',organizerId:'ticket-user',title:'VAT fixture',description:'A complete fixture event description',category:'house',vibe:'indoor',status:'draft',city:'Bucuresti',locationName:'Test venue',googlePlaceId:'test',latitude:44,longitude:26,startTime:'2099-10-01T18:00:00Z',endTime:'2099-10-02T04:00:00Z',organizerAbsorbsServiceFee:false,lineup:[],stats:{},ticketTypes:[{id:'11111111-2222-4333-8444-555555555555',name:'General Access',priceRon:50,capacity:100,startSales:'2099-01-01T12:00:00Z',endSales:'2099-10-01T17:00:00Z'},{id:'11111111-2222-4333-8444-666666666666',name:'VIP Access',priceRon:100,capacity:100,startSales:'2099-01-01T12:00:00Z',endSales:'2099-10-01T17:00:00Z'}]};
        if (init?.method==='POST') window.__api.saved=JSON.parse(init.body);
        return reply(event);
      }
      if (route === '/dashboard/events/mobile/invitations' && init?.method==='POST') {window.__api.invitation=JSON.parse(init.body);return reply([]);}
      if (route === '/users/me/tickets') { window.__api.calls++; await new Promise(resolve => setTimeout(resolve,120)); return window.__api.fail ? reply({title:'Unavailable'},503) : reply(window.__api.empty ? [] : tickets); }
      if (route.startsWith('/friends/connect/')) { window.__api.connections++; return reply({},window.__connectionStatus || 200); }
      return reply([]);
    };
    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { if (blob?.type === 'application/pdf') window.__pdfBlob = blob; return createObjectURL(blob); };
    const anchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() { if (this.download?.endsWith('.pdf')) { window.__pdf = {download:this.download,href:this.href}; return; } return anchorClick.call(this); };
  ` });
  const clickTab = async (text) => evaluate(`Array.from(document.querySelectorAll('main button')).find(b => b.textContent.trim().startsWith(${JSON.stringify(text)})).click()`);
  for (const width of sheetOnly || connectionOnly ? [] : [390,1280]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 768 });
    await navigate('/users/me/tickets');
    await until("document.querySelector('[data-ticket-event]')");
    await clickTab('Upcoming');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-ticket-event]')].map(e => e.dataset.ticketEvent)"), ['90','2']);
    assert.equal(await evaluate("document.querySelector('[data-featured]').dataset.ticketEvent"), '90');
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
    await clickTab('Show QR');
    await until("document.querySelector('[data-ticket-preview=next-one] [data-ticket-qr]')");
    const first = await evaluate("document.querySelector('[data-ticket-preview] [data-ticket-qr]').src");
    const historyLength = await evaluate('history.length');
    assert.ok(await evaluate("document.querySelector('button[aria-label=\"Previous ticket\"]').disabled"));
    await evaluate("document.querySelector('button[aria-label=\"Next ticket\"]').click()");
    await until("document.querySelector('[data-ticket-preview=next-two] [data-ticket-qr]')");
    const second = await evaluate("document.querySelector('[data-ticket-preview] [data-ticket-qr]').src");
    assert.notEqual(first,second,'Each ticket renders its own QR');
    assert.equal(await evaluate('history.length'),historyLength,'Changing tickets does not add Back entries');
    assert.ok(await evaluate("document.querySelector('[data-ticket-preview]').textContent.includes('Ticket 2 of 2')"));
    assert.ok(await evaluate("document.querySelector('button[aria-label=\"Next ticket\"]').disabled"));
    if (passOnly) {
      await evaluate(fs.readFileSync(require.resolve('jsqr'),'utf8')+'; true');
      for (const [fitWidth,fitHeight] of [[320,568],[390,667],[390,844],[844,390],[1280,800]]) {
        await call('Emulation.setDeviceMetricsOverride',{width:fitWidth,height:fitHeight,deviceScaleFactor:1,mobile:fitWidth<768});
        await delay(600);
        await until("document.querySelector('[data-ticket-qr]')?.complete");
        const fit = await evaluate(`(() => {
          const preview=document.querySelector('[data-ticket-preview]'),pass=preview.querySelector('[data-ticket-pass]');
          const bounds=pass.getBoundingClientRect(),viewport=pass.parentElement.getBoundingClientRect();
          const image=pass.querySelector('[data-ticket-qr]'),qr=image.getBoundingClientRect();
          const download=Array.from(preview.querySelectorAll('button')).find(b=>b.textContent.trim()==='Download PDF');
          const canvas=document.createElement('canvas');canvas.width=canvas.height=Math.floor(qr.width);
          const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
          const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
          return {fits:preview.scrollHeight<=preview.clientHeight+1 && preview.scrollWidth<=preview.clientWidth+1 && bounds.top>=viewport.top-1 && bounds.bottom<=viewport.bottom+1,
            bottomGap:preview.getBoundingClientRect().bottom-download.getBoundingClientRect().bottom,
            qrWidth:qr.width,decoded:window.jsQR(pixels.data,pixels.width,pixels.height)?.data,
            details:pass.textContent};
        })()`);
        assert.ok(fit.fits, `Ticket has no scroll or clipping at ${fitWidth}x${fitHeight}`);
        assert.ok(Math.abs(fit.bottomGap-28)<1, 'PDF button stays 28px above the bottom');
        assert.equal(fit.decoded,'0123456789abcdef'.repeat(4), `Rendered QR decodes at ${fitWidth}x${fitHeight} (${fit.qrWidth}px)`);
        for (const text of ['Next Night','VIP admission','next-two','Test venue','01.10.2099']) assert.ok(fit.details.includes(text),text+' is preserved');
      }
      await call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<768});
      await delay(600);
    }
    await evaluate(`${button('Download PDF')}.click()`);
    await until("window.__pdf?.download && window.__pdfBlob?.size > 1000");
    assert.ok(await evaluate("window.__pdf.download.includes('VIP-admission')"),'PDF follows the selected ticket');
    assert.equal(await evaluate("window.__pdfBlob.slice(0,5).text()"),'%PDF-','Download is a real PDF document');
    assert.ok(await evaluate("window.__pdfMarkup.includes('85.70') && window.__pdfMarkup.includes('5.70') && window.__pdfMarkup.includes('14.87')"),'PDF includes saved total, fee and included VAT');
    assert.ok(await evaluate("!window.__pdfMarkup.includes('Test Organizer') && !window.__pdfMarkup.includes('class=\"warning\"')"),'PDF omits company data and warning panel');
    assert.ok(await evaluate("!window.__pdfMarkup.includes('See invoice')"),'PDF does not refer users to an invoice');
    if (process.env.TICKETS_SCREENSHOT && width === 390) {
      const png = await evaluate('window.__pdfImage');
      if (png) fs.writeFileSync(process.env.TICKETS_SCREENSHOT.replace('.png','-pdf.png'),Buffer.from(png.split(',')[1],'base64'));
      const shot = await call('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(process.env.TICKETS_SCREENSHOT.replace('.png','-pass.png'),Buffer.from(shot.data,'base64'));
    }
    await call('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await until("!document.querySelector('[data-ticket-preview]')");
    assert.equal(await evaluate('location.pathname'),'/users/me/tickets');
    await clickTab('History');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-ticket-event]')].map(e => e.dataset.ticketEvent)"), ['used-event','old-event']);
    await clickTab('Used');
    assert.equal(await evaluate("document.querySelectorAll('[data-ticket-id]').length"),1);
    await evaluate("document.querySelector('[data-ticket-id=used]').click()");
    await until("document.querySelector('[data-ticket-preview]')?.textContent.includes('already been used')");
    await call('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await until("!document.querySelector('[data-ticket-preview]')");
    await clickTab('Expired');
    assert.equal(await evaluate("document.querySelector('[data-ticket-id]').dataset.ticketId"),'expired');
    await evaluate("document.querySelector('[data-ticket-id=expired]').click()");
    await until("document.querySelector('[data-ticket-preview]')?.textContent.includes('event has ended')");
    await call('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await until("!document.querySelector('[data-ticket-preview]')");
    await clickTab('Upcoming');
    assert.equal(await evaluate('window.__api.calls'),1,'Switching filters and QR does not refetch');
    if (process.env.TICKETS_SCREENSHOT && width === 390) {
      await evaluate("window.dispatchEvent(new Event('spottr:cancel-scroll-restore')); window.scrollTo(0,0)");
      await delay(400);
      const shot = await call('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(process.env.TICKETS_SCREENSHOT, Buffer.from(shot.data,'base64'));
    }
    console.log('PASS chronological tickets, featured event, QR paging, PDF, history filters and dismissal at ' + width + 'px');
  }
  for (const height of passOnly ? [] : sheetOnly || connectionOnly ? [568,667,844] : [667,844]) {
    await call('Emulation.setDeviceMetricsOverride', {width:height === 568 ? 320 : 390,height,deviceScaleFactor:1,mobile:true});
    await navigate('/users/me');
    await until("Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('General admission'))");
    await evaluate(`(() => {
      window.dispatchEvent(new Event('spottr:cancel-scroll-restore'));
      const trigger=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('General admission'));
      trigger.scrollIntoView({block:'center',behavior:'instant'});
      window.__ticketSwitch=document.querySelector('[role=group][aria-label="My tickets and orders"]');
    })()`);
    await delay(300);
    const scrollBefore = await evaluate('scrollY');
    const indicator = () => evaluate(`(() => {
      const control=window.__ticketSwitch.getBoundingClientRect();
      const pill=window.__ticketSwitch.querySelector(':scope > span').getBoundingClientRect();
      return {left:pill.left-control.left,top:pill.top-control.top,width:pill.width};
    })()`);
    const before = await indicator();
    await evaluate("Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('General admission')).click()");
    await until("document.querySelector('[data-ticket-preview] [data-ticket-qr]')");
    await delay(500);
    assert.ok(await evaluate("(() => {const r=document.querySelector('[data-ticket-preview]').closest('[role=dialog]').getBoundingClientRect();return r.top>=0 && Math.abs(r.bottom-innerHeight)<2 && Math.abs(r.height-innerHeight*.9)<2;})()"),'Profile ticket sheet uses the event sheet 90svh height');
    assert.deepEqual(await indicator(), before, 'Opening a sheet keeps the indicator in its control');
    const passFits = `(() => {
      const preview=document.querySelector('[data-ticket-preview]');
      const pass=preview.querySelector('[data-ticket-pass]');
      const r=pass.getBoundingClientRect(),v=pass.parentElement.getBoundingClientRect();
      const qr=pass.querySelector('[data-ticket-qr]').getBoundingClientRect();
      return preview.scrollHeight<=preview.clientHeight+1 && preview.scrollWidth<=preview.clientWidth+1
        && r.top>=v.top-1 && r.bottom<=v.bottom+1 && r.left>=v.left-1 && r.right<=v.right+1
        && qr.width>=100 && Math.abs(qr.width-qr.height)<1;
    })()`;
    assert.ok(await evaluate(passFits), 'Whole ticket fits without scrolling and QR remains square');
    assert.ok(await evaluate("document.querySelector('[data-ticket-pass] img[alt=SPOTTR]').naturalWidth>0"), 'The real logo loads');
    if (process.env.TICKETS_SCREENSHOT) {
      const shot=await call('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(process.env.TICKETS_SCREENSHOT.replace('.png',`-${height}.png`),Buffer.from(shot.data,'base64'));
    }
    if (sheetOnly) {
      await evaluate("document.querySelector('[data-ticket-pass] h2').textContent='A very long event title with multiple artists and special guests for the anniversary edition'; document.querySelector('[data-ticket-pass] a span').textContent='A long venue name · Strada Exemplului, number 123, Bucuresti'; true");
      await delay(150);
      assert.ok(await evaluate(passFits), 'Long event and venue names fit without clipping or scroll');
    }
    await call('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await delay(80);
    assert.ok(await evaluate("Boolean(document.querySelector('[data-ticket-preview]'))"),'Dismissal preserves the ticket during the exit animation');
    assert.deepEqual(await indicator(), before, 'Indicator stays put during dismissal');
    await until("!document.querySelector('[data-ticket-preview]') && getComputedStyle(document.body).pointerEvents !== 'none'");
    assert.ok(Math.abs(await evaluate('scrollY')-scrollBefore)<2, 'Closing the ticket restores the same page scroll');
    assert.deepEqual(await indicator(), before, 'Indicator stays put after dismissal');
    if (sheetOnly) {
      await call('Emulation.setTouchEmulationEnabled', {enabled:true,maxTouchPoints:1});
      await evaluate("Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('General admission')).click()");
      await until("document.querySelector('[data-ticket-preview] [data-ticket-qr]')");
      await delay(500);
      const top = await evaluate("document.querySelector('[data-ticket-preview]').closest('[role=dialog]').getBoundingClientRect().top");
      const swipe = async (distance) => {
        await call('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:195,y:top+16}]});
        for (let step=1;step<=10;step++) {
          await call('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:195,y:top+16+distance*step/10}]});
          await delay(25);
        }
        await call('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
      };
      await swipe(15);
      await delay(550);
      assert.ok(await evaluate("Boolean(document.querySelector('[data-ticket-preview]'))"),'Short pull keeps the ticket open');
      await swipe(height*.65);
      await until("!document.querySelector('[data-ticket-preview]') && getComputedStyle(document.body).pointerEvents !== 'none'");
      assert.ok(Math.abs(await evaluate('scrollY')-scrollBefore)<2, 'Drag dismissal preserves profile scroll');
      await evaluate("Array.from(window.__ticketSwitch.querySelectorAll('button')).find(b=>b.textContent.includes('History')).click()");
      await delay(250);
      const historyIndicator = await indicator();
      assert.ok(historyIndicator.left>before.left+before.width-2, 'History moves the pill to the second segment');
      await navigate('/users/me/tickets');
      await navigate('/users/me');
      await evaluate('window.__ticketSwitch=document.querySelector(\'[role=group][aria-label="My tickets and orders"]\'); true');
      await until("Array.from(window.__ticketSwitch.querySelectorAll('button')).some(b=>b.textContent.includes('History') && b.getAttribute('aria-pressed')==='true')");
      assert.deepEqual(await indicator(), historyIndicator, 'Restored tab has its indicator in place');
      await evaluate("Array.from(window.__ticketSwitch.querySelectorAll('button')).find(b=>b.textContent.includes('Active')).click()");
      console.log('PASS ticket height, animated dismissal, short/full drag, scroll and tab indicator at '+height+'px');
      continue;
    }
    const openCode = async () => {await evaluate(`${button('My code')}.click()`);await until("document.querySelector('[role=dialog] img')");};
    await openCode();
    await delay(550);
    const connectionFits = `(() => {
      const sheet=document.querySelector('[data-connection-sheet]');
      return Array.from(sheet.querySelectorAll('div')).filter(el=>!el.closest('[aria-hidden=true]')).every(el=>el.scrollHeight<=el.clientHeight+1 && el.scrollWidth<=el.clientWidth+1);
    })()`;
    if (process.env.TICKETS_SCREENSHOT) {
      const shot=await call('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(process.env.TICKETS_SCREENSHOT.replace('.png',`-code-${height}.png`),Buffer.from(shot.data,'base64'));
    }
    assert.ok(await evaluate(connectionFits), 'My code fits without internal scrolling: '+JSON.stringify(await evaluate("Array.from(document.querySelector('[data-connection-sheet]').querySelectorAll('div')).filter(el=>el.scrollHeight>el.clientHeight+1 || el.scrollWidth>el.clientWidth+1).map(el=>({class:el.className,height:el.clientHeight,scroll:el.scrollHeight,width:el.clientWidth,scrollWidth:el.scrollWidth}))")));
    const codeHeight = await evaluate("document.querySelector('[data-connection-sheet]').getBoundingClientRect().height");
    const heightFrames = await evaluate(`new Promise(resolve => {
      const frames = [], started = performance.now();
      const sample = () => {
        frames.push(document.querySelector('[data-connection-sheet]').getBoundingClientRect().height);
        if (performance.now() - started < 350) requestAnimationFrame(sample); else resolve(frames);
      };
      document.querySelector('[role=dialog] button[aria-pressed=false]').click();
      requestAnimationFrame(sample);
    })`);
    assert.ok(heightFrames.some(value => value>codeHeight+1 && value<height*.9-1), 'Height grows through intermediate positions: '+JSON.stringify({codeHeight,height,heightFrames}));
    await delay(350);
    assert.ok(Math.abs(await evaluate("document.querySelector('[data-connection-sheet]').getBoundingClientRect().height")-height*.9)<2,'Scan QR fills the event sheet height');
    assert.equal(await evaluate("document.querySelectorAll('[role=dialog] img').length"),0,'Own QR is hidden while scanning');
    await evaluate("Array.from(document.querySelectorAll('[role=dialog] button')).find(b => b.textContent.trim()==='Scan QR' && !b.hasAttribute('aria-pressed')).click()");
    await until("window.__streams.some(s=>s.getTracks().some(t=>t.readyState==='live')) && document.querySelector('[role=dialog] video')");
    await delay(500);
    assert.ok(await evaluate(connectionFits), 'Running camera fills its available space without scrolling');
    assert.ok(await evaluate("(() => {const r=document.querySelector('[role=dialog]').getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight+1;})()"),'Scanner sheet fits viewport');
    if (process.env.TICKETS_SCREENSHOT && height===667) {const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.env.TICKETS_SCREENSHOT.replace('.png','-scanner.png'),Buffer.from(shot.data,'base64'));}
    if (connectionOnly) {
      await evaluate("document.querySelector('[role=dialog] button[aria-pressed=false]').click()");
      await delay(60);
      const shrinking = await evaluate("document.querySelector('[data-connection-sheet]').getBoundingClientRect().height");
      assert.ok(shrinking>codeHeight+1 && shrinking<height*.9-1, 'Returning to My code animates the height too');
      await until("window.__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))");
      await delay(350);
      assert.ok(await evaluate(connectionFits), 'My code stays within bounds after stopping camera');
      await evaluate("document.querySelector('[role=dialog] button[aria-pressed=false]').click()");
      await evaluate("Array.from(document.querySelectorAll('[role=dialog] button')).find(b=>b.textContent.trim()==='Scan QR' && !b.hasAttribute('aria-pressed')).click()");
      await until("document.querySelector('[role=dialog] video')?.srcObject?.active");
    }
    await call('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await until("!document.querySelector('[role=dialog]') && window.__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')) && getComputedStyle(document.body).pointerEvents !== 'none'");
    // Decode an actual QR from a synthetic camera stream, not a mocked decoder.
    await openCode();
    await evaluate("window.__denyCamera=true; document.querySelector('[role=dialog] button[aria-pressed=false]').click()");
    await evaluate("Array.from(document.querySelectorAll('[role=dialog] button')).find(b => b.textContent.trim()==='Scan QR' && !b.hasAttribute('aria-pressed')).click()");
    await until("document.querySelector('[role=dialog]').textContent.includes('camera could not be started')");
    await evaluate("window.__denyCamera=false; window.__qrStream=true");
    await evaluate("Array.from(document.querySelectorAll('[role=dialog] button')).find(b => b.textContent.trim()==='Scan QR' && !b.hasAttribute('aria-pressed')).click()");
    await until("window.__api.connections===1 && window.__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))");
    await delay(300);
    assert.equal(await evaluate('window.__api.connections'),1,'QR causes one connection request');
    if (height === 667) {
      const scanAgain = async () => evaluate("Array.from(document.querySelectorAll('[role=dialog] button')).find(b => b.textContent.trim()==='Scan QR' && !b.hasAttribute('aria-pressed')).click()");
      await evaluate('window.__ownQr=true');
      await scanAgain();
      await until("document.querySelector('[role=status]')?.textContent.includes('your own code')");
      assert.equal(await evaluate('window.__api.connections'),1,'Own QR never sends a connection request');
      await evaluate('window.__ownQr=false; window.__connectionStatus=500');
      await scanAgain();
      await until("document.querySelector('[role=status]')?.textContent.includes('HTTP 500')");
      await evaluate('window.__qrStream=false');
      await scanAgain();
      await until("document.querySelector('[role=dialog] video')?.srcObject?.active");
      await delay(1200);
      assert.equal(await evaluate("Boolean(document.querySelector('[role=dialog] [role=status]'))"),false,'New camera attempt clears stale connection errors');
      assert.equal(await evaluate('window.__api.connections'),2,'Blank camera frames never initiate a connection');
      await evaluate("Array.from(document.querySelectorAll('[role=dialog] button')).find(b => b.textContent.trim()==='Stop camera').click()");
      await until("window.__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))");
    }
    await evaluate('window.__qrStream=false');
    await call('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await until("!document.querySelector('[role=dialog]') && getComputedStyle(document.body).pointerEvents !== 'none'");
    // Close while permission/startup is still outstanding: no late camera leak.
    await openCode();
    await evaluate("window.__cameraDelay=600; document.querySelector('[role=dialog] button[aria-pressed=false]').click()");
    await evaluate("Array.from(document.querySelectorAll('[role=dialog] button')).find(b => b.textContent.trim()==='Scan QR' && !b.hasAttribute('aria-pressed')).click()");
    await delay(120);
    await call('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await delay(1500);
    await until("!document.querySelector('[role=dialog]') && window.__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')) && getComputedStyle(document.body).pointerEvents !== 'none'");
    await evaluate("window.dispatchEvent(new Event('spottr:cancel-scroll-restore')); document.querySelector('a[href=\"/users/me/tickets\"]').scrollIntoView({block:'center',behavior:'instant'})");
    await delay(300);
    const point=await evaluate("(() => {const a=document.querySelector('a[href=\"/users/me/tickets\"]'),r=a.getBoundingClientRect(),top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {x:r.left+r.width/2,y:r.top+r.height/2,clickable:a.contains(top),top:top?.outerHTML.slice(0,500),link:a.outerHTML,body:document.body.style.cssText};})()");
    if (!point.clickable) console.error('Blocked link details',point);
    assert.ok(point.clickable,'No invisible overlay blocks profile links');
    await call('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
    await until("location.pathname==='/users/me/tickets'");
    console.log('PASS profile ticket bounds, real QR decode, exclusive scanner mode, camera cleanup and navigation at height '+height);
  }
  if (connectionOnly) {
    await navigate('/users/me');
    for (const [width, height] of [[667,375],[844,390],[1280,800]]) {
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});
      await delay(200);
      await evaluate(`${button('My code')}.click()`);
      await until("document.querySelector('[data-connection-sheet] img')");
      await delay(500);
      for (const mode of ['code','scan']) {
        if (mode==='scan') {
          await evaluate("document.querySelector('[data-connection-sheet] button[aria-pressed=false]').click()");
          await delay(400);
        }
        const bounds=await evaluate(`(() => {
          const sheet=document.querySelector('[data-connection-sheet]'), r=sheet.getBoundingClientRect();
          return {fits:r.top>=0 && r.bottom<=innerHeight+1,
            overflow:Array.from(sheet.querySelectorAll('div')).filter(el=>!el.closest('[aria-hidden=true]') && (el.scrollHeight>el.clientHeight+1 || el.scrollWidth>el.clientWidth+1)).map(el=>({class:el.className,h:el.clientHeight,sh:el.scrollHeight})),
            qr:sheet.querySelector('img[alt="Profile QR code"]')?.getBoundingClientRect().width};
        })()`);
        assert.ok(bounds.fits,'Connection sheet fits '+width+'x'+height);
        assert.deepEqual(bounds.overflow,[],'No internal overflow in '+mode+' at '+width+'x'+height);
      }
      await call('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await until("!document.querySelector('[data-connection-sheet]')");
      console.log('PASS Quick connect portrait/landscape/desktop bounds at '+width+'x'+height);
    }
  }
  if (sheetOnly || passOnly || connectionOnly) {
    assert.deepEqual(errors, [], 'No uncaught runtime errors');
    assert.deepEqual(lifecycleWarnings, [], 'No insertion-effect warnings');
    await send('Browser.close');
    await delay(500);
    return;
  }
  await call('Page.addScriptToEvaluateOnNewDocument',{source:'window.__api.fail=true; window.__api.empty=true;'});
  await navigate('/users/me/tickets');
  await until("document.querySelector('[role=alert] button')");
  await evaluate("window.__api.fail=false; document.querySelector('[role=alert] button').click()");
  await until("document.querySelector('main a[href=\"/events\"]')");
  assert.equal(await evaluate("document.querySelectorAll('[data-ticket-event]').length"),0);
  console.log('PASS failed request retry and empty upcoming state');
  // Exercise the actual batch renderer with real jsPDF/html2canvas, without
  // creating invitations, sending email, or requiring a dashboard account.
  const ts = require('typescript');
  const compiled = name => ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/components/tickets',name),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
  const design = JSON.parse(fs.readFileSync(path.join(__dirname,'../../../api/internal/email/ticket-design.json'),'utf8'));
  const qr = await require('qrcode').toDataURL('fixture-invitation', {width:700,margin:4});
  await evaluate(fs.readFileSync(require.resolve('jspdf/dist/jspdf.umd.min.js'),'utf8') + ';true');
  await evaluate(fs.readFileSync(require.resolve('html2canvas/dist/html2canvas.min.js'),'utf8') + ';true');
  const batch = await evaluate(`(async () => {
    const designExports = {};
    new Function('require','exports',${JSON.stringify(compiled('ticketDesign.ts'))})(() => (${JSON.stringify(design)}),designExports);
    const htmlExports = {};
    new Function('require','exports',${JSON.stringify(compiled('ticketPdfHtml.ts'))})(() => designExports,htmlExports);
    const pdfExports = {};
    new Function('require','exports',${JSON.stringify(compiled('ticketPdf.ts'))})(name => name === './ticketDesign' ? designExports : name === './ticketPdfHtml' ? htmlExports : name === 'jspdf' ? window.jspdf : name === 'html2canvas' ? window.html2canvas : {toDataURL:async () => ${JSON.stringify(qr)}},pdfExports);
    const exports = {};
    new Function('require','exports',${JSON.stringify(compiled('invitationBatchPdf.ts'))})(() => pdfExports,exports);
    const before = document.querySelectorAll('iframe').length;
    const result = await exports.createInvitationBatchPdf({title:'Noapte în București <test>',startTime:'2099-10-01T18:00:00Z',locationName:'Venue'},[
      {id:'second',status:'active',batchIndex:2,label:'Guest',validationHash:'two'},
      {id:'cancelled',status:'revoked',batchIndex:3,label:'Guest',validationHash:'cancelled'},
      {id:'first',status:'active',batchIndex:1,label:'Guest',validationHash:'one'}
    ],key => key,'en');
    if (!window.__pdfMarkup.includes('data-ticket-pdf') || window.__pdfMarkup.includes('See invoice') || window.__pdfMarkup.includes('class="vat"')) throw new Error('Batch must use the shared PDF without invented VAT');
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    const pdf = new TextDecoder('latin1').decode(bytes);
    return {count:result.count,size:result.blob.size,pages:pdf.split('/Type /Page' + String.fromCharCode(10)).length - 1,clean:document.querySelectorAll('iframe').length === before,header:pdf.slice(0,5)};
  })()`);
  assert.equal(batch.count,2);
  assert.equal(batch.pages,2);
  assert.equal(batch.header,'%PDF-');
  assert.ok(batch.size > 10000 && batch.clean);
  console.log('PASS batch PDF uses the shared A4 design, skips revoked invitations and cleans up its renderer');
  await call('Emulation.setDeviceMetricsOverride', { width:390,height:844,deviceScaleFactor:1,mobile:true });
  await navigate('/dashboard/events/mobile');
  await until("document.querySelector('#event-editor-form')");
  await evaluate(`${button('Save changes')}.click()`);
  await until("document.body.innerText.includes('Choose 21%, 11% or no VAT.')");
  assert.ok(!(await evaluate('window.__api.saved')), 'Unconfigured VAT must not save');
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('input[name=\"event-vat\"]')).map(input=>input.value)"),['21','11','0'],'Only the three supported choices exist');
  assert.equal(await evaluate("document.querySelector('input[name=\"event-vat\"]:checked') !== null"),false,'VAT is not guessed');
  await evaluate("document.querySelector('input[name=\"event-vat\"][value=\"21\"]').click()");
  await evaluate(`${button('Save changes')}.click()`);
  await until('window.__api.saved');
  assert.equal(await evaluate('window.__api.saved.vatPercentage'),21);
  for (const rate of [11,0]) {
    await navigate('/dashboard/events/mobile');
    await until("document.querySelector('#event-editor-form')");
    await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Tickets' && b.closest('nav[aria-label=\"Event sections\"]')).click()");
    await evaluate(`document.querySelector('input[name="event-vat"][value="${rate}"]').click()`);
    await evaluate(`${button('Save changes')}.click()`);
    await until('window.__api.saved');
    assert.equal(await evaluate('window.__api.saved.vatPercentage'),rate,'Selected VAT must be sent explicitly');
  }
  console.log('PASS event requires explicit VAT and saves included rate or no VAT');
  await navigate('/dashboard/events/mobile');
  await until("document.querySelector('#event-editor-form')");
  await evaluate(`${button('Manage')}.click()`);
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Invitations') && b.textContent.includes('0 invitations')).click()");
  await until("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Choose invitation type')");
  await evaluate("(()=>{const input=document.querySelector('input[placeholder=\"Name or label\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Guest');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  assert.equal(await evaluate(`${button('Generate invitation')}.disabled`),true,'Type required even with a label');
  await evaluate(`${button('Choose invitation type')}.click()`);
  assert.ok(!(await evaluate("Array.from(document.querySelectorAll('[role=option]')).some(o=>o.textContent.includes('General invitation'))")));
  await evaluate("Array.from(document.querySelectorAll('[role=option]')).find(o=>o.textContent.includes('VIP Access')).click()");
  await evaluate(`${button('Generate invitation')}.click()`);
  await until('window.__api.invitation');
  assert.equal(await evaluate('window.__api.invitation.ticketTypeId'),'11111111-2222-4333-8444-666666666666');
  await until("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Choose invitation type')");
  console.log('PASS invitation has no generic or automatic selection and requires an event ticket type');
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
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("pulse-tickets-")) {
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
});
