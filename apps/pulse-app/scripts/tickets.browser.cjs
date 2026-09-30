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
        const img = new Image();img.src=${JSON.stringify(friendQr)};await img.decode();
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
      {...common, id:'next-two', ticketTypeName:'VIP admission', validationHash:'fixture-next-two'}
    ];
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
      if (!url.pathname.includes('/api/v1/')) return originalFetch(input, init);
      const route = url.pathname.split('/api/v1')[1];
      const reply = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json'}});
      if (route === '/users/me') return reply({id:'ticket-user',username:'Test User',role:location.pathname.startsWith('/dashboard')?'organizer':'user',email:'test@example.com',preferredLanguage:'en'});
      if (route.startsWith('/dashboard/organizer/profile/')) return reply({isVerified:true,verificationStatus:'approved',stripeChargesEnabled:true,stripePayoutsEnabled:true});
      if (route === '/dashboard/events/mobile') {
        const event={id:'mobile',organizerId:'ticket-user',title:'VAT fixture',description:'A complete fixture event description',category:'house',vibe:'indoor',status:'draft',city:'Bucuresti',locationName:'Test venue',googlePlaceId:'test',latitude:44,longitude:26,startTime:'2099-10-01T18:00:00Z',endTime:'2099-10-02T04:00:00Z',organizerAbsorbsServiceFee:false,lineup:[],stats:{},ticketTypes:[{id:'11111111-2222-4333-8444-555555555555',name:'General Access',priceRon:50,capacity:100,startSales:'2099-01-01T12:00:00Z',endSales:'2099-10-01T17:00:00Z'},{id:'11111111-2222-4333-8444-666666666666',name:'VIP Access',priceRon:100,capacity:100,startSales:'2099-01-01T12:00:00Z',endSales:'2099-10-01T17:00:00Z'}]};
        if (init?.method==='POST') window.__api.saved=JSON.parse(init.body);
        return reply(event);
      }
      if (route === '/dashboard/events/mobile/invitations' && init?.method==='POST') {window.__api.invitation=JSON.parse(init.body);return reply([]);}
      if (route === '/users/me/tickets') { window.__api.calls++; await new Promise(resolve => setTimeout(resolve,120)); return window.__api.fail ? reply({title:'Unavailable'},503) : reply(window.__api.empty ? [] : tickets); }
      if (route.startsWith('/friends/connect/')) { window.__api.connections++; return reply({}); }
      return reply([]);
    };
    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { if (blob?.type === 'application/pdf') window.__pdfBlob = blob; return createObjectURL(blob); };
    const anchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() { if (this.download?.endsWith('.pdf')) { window.__pdf = {download:this.download,href:this.href}; return; } return anchorClick.call(this); };
  ` });
  const clickTab = async (text) => evaluate(`Array.from(document.querySelectorAll('main button')).find(b => b.textContent.trim().startsWith(${JSON.stringify(text)})).click()`);
  for (const width of [390,1280]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 768 });
    await navigate('/users/me/tickets');
    await until("document.querySelector('[data-ticket-event]')");
    await clickTab('Upcoming');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-ticket-event]')].map(e => e.dataset.ticketEvent)"), ['90','2']);
    assert.equal(await evaluate("document.querySelector('[data-featured]').dataset.ticketEvent"), '90');
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
    await clickTab('Show QR');
    await until("document.querySelector('[data-ticket-preview=next-one] img')");
    const first = await evaluate("document.querySelector('[data-ticket-preview] img').src");
    const historyLength = await evaluate('history.length');
    assert.ok(await evaluate("document.querySelector('button[aria-label=\"Previous ticket\"]').disabled"));
    await evaluate("document.querySelector('button[aria-label=\"Next ticket\"]').click()");
    await until("document.querySelector('[data-ticket-preview=next-two] img')");
    const second = await evaluate("document.querySelector('[data-ticket-preview] img').src");
    assert.notEqual(first,second,'Each ticket renders its own QR');
    assert.equal(await evaluate('history.length'),historyLength,'Changing tickets does not add Back entries');
    assert.ok(await evaluate("document.querySelector('[data-ticket-preview]').textContent.includes('Ticket 2 of 2')"));
    assert.ok(await evaluate("document.querySelector('button[aria-label=\"Next ticket\"]').disabled"));
    await evaluate(`${button('Download PDF')}.click()`);
    await until("window.__pdf?.download && window.__pdfBlob?.size > 1000");
    assert.ok(await evaluate("window.__pdf.download.includes('VIP-admission')"),'PDF follows the selected ticket');
    assert.equal(await evaluate("window.__pdfBlob.slice(0,5).text()"),'%PDF-','Download is a real PDF document');
    assert.ok(await evaluate("window.__pdfMarkup.includes('85.70') && window.__pdfMarkup.includes('5.70') && window.__pdfMarkup.includes('14.87')"),'PDF includes saved total, fee and included VAT');
    assert.ok(await evaluate("!window.__pdfMarkup.includes('Test Organizer') && !window.__pdfMarkup.includes('class=\"warning\"')"),'PDF omits company data and warning panel');
    if (process.env.TICKETS_SCREENSHOT && width === 390) {
      const png = await evaluate('window.__pdfImage');
      if (png) fs.writeFileSync(process.env.TICKETS_SCREENSHOT.replace('.png','-pdf.png'),Buffer.from(png.split(',')[1],'base64'));
      const shot = await call('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(process.env.TICKETS_SCREENSHOT.replace('.png','-pass.png'),Buffer.from(shot.data,'base64'));
    }
    await evaluate('history.back()');
    await until("!document.querySelector('[data-ticket-preview]')");
    assert.equal(await evaluate('location.pathname'),'/users/me/tickets');
    await clickTab('History');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-ticket-event]')].map(e => e.dataset.ticketEvent)"), ['used-event','old-event']);
    await clickTab('Used');
    assert.equal(await evaluate("document.querySelectorAll('[data-ticket-id]').length"),1);
    await evaluate("document.querySelector('[data-ticket-id=used]').click()");
    await until("document.querySelector('[data-ticket-preview]')?.textContent.includes('already been used')");
    await evaluate('history.back()');
    await until("!document.querySelector('[data-ticket-preview]')");
    await clickTab('Expired');
    assert.equal(await evaluate("document.querySelector('[data-ticket-id]').dataset.ticketId"),'expired');
    await evaluate("document.querySelector('[data-ticket-id=expired]').click()");
    await until("document.querySelector('[data-ticket-preview]')?.textContent.includes('event has ended')");
    await evaluate('history.back()');
    await until("!document.querySelector('[data-ticket-preview]')");
    await clickTab('Upcoming');
    assert.equal(await evaluate('window.__api.calls'),1,'Switching filters and QR does not refetch');
    if (process.env.TICKETS_SCREENSHOT && width === 390) {
      await evaluate("window.dispatchEvent(new Event('spottr:cancel-scroll-restore')); window.scrollTo(0,0)");
      await delay(400);
      const shot = await call('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(process.env.TICKETS_SCREENSHOT, Buffer.from(shot.data,'base64'));
    }
    console.log('PASS chronological tickets, featured event, QR paging, PDF, history filters and Back at ' + width + 'px');
  }
  for (const height of [667,844]) {
    await call('Emulation.setDeviceMetricsOverride', {width:390,height,deviceScaleFactor:1,mobile:true});
    await navigate('/users/me');
    await until("Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('General admission'))");
    await evaluate("Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('General admission')).click()");
    await until("document.querySelector('[data-ticket-preview] img')");
    await delay(500);
    assert.ok(await evaluate("(() => {const r=document.querySelector('[data-ticket-preview]').closest('[role=dialog]').getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight+1 && r.height<=innerHeight*.75;})()"),'Profile ticket sheet fits viewport');
    await evaluate('history.back()');
    await until("!document.querySelector('[data-ticket-preview]') && getComputedStyle(document.body).pointerEvents !== 'none'");
    const openCode = async () => {await evaluate(`${button('My code')}.click()`);await until("document.querySelector('[role=dialog] img')");};
    await openCode();
    await evaluate("document.querySelector('[role=dialog] button[aria-pressed=false]').click()");
    assert.equal(await evaluate("document.querySelectorAll('[role=dialog] img').length"),0,'Own QR is hidden while scanning');
    await evaluate("Array.from(document.querySelectorAll('[role=dialog] button')).find(b => b.textContent.trim()==='Scan QR' && !b.hasAttribute('aria-pressed')).click()");
    await until("window.__streams.some(s=>s.getTracks().some(t=>t.readyState==='live')) && document.querySelector('[role=dialog] video')");
    await delay(500);
    assert.ok(await evaluate("(() => {const r=document.querySelector('[role=dialog]').getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight+1;})()"),'Scanner sheet fits viewport');
    if (process.env.TICKETS_SCREENSHOT && height===667) {const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.env.TICKETS_SCREENSHOT.replace('.png','-scanner.png'),Buffer.from(shot.data,'base64'));}
    await evaluate('history.back()');
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
    await evaluate('window.__qrStream=false; history.back()');
    await until("!document.querySelector('[role=dialog]') && getComputedStyle(document.body).pointerEvents !== 'none'");
    // Close while permission/startup is still outstanding: no late camera leak.
    await openCode();
    await evaluate("window.__cameraDelay=600; document.querySelector('[role=dialog] button[aria-pressed=false]').click()");
    await evaluate("Array.from(document.querySelectorAll('[role=dialog] button')).find(b => b.textContent.trim()==='Scan QR' && !b.hasAttribute('aria-pressed')).click()");
    await delay(120);
    await evaluate('history.back()');
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
    const exports = {};
    new Function('require','exports',${JSON.stringify(compiled('invitationBatchPdf.ts'))})(name => name === './ticketDesign' ? designExports : name === 'jspdf' ? window.jspdf : name === 'html2canvas' ? window.html2canvas : {toDataURL:async () => ${JSON.stringify(qr)}},exports);
    const before = document.querySelectorAll('iframe').length;
    const result = await exports.createInvitationBatchPdf({title:'Noapte în București <test>',startTime:'2099-10-01T18:00:00Z',locationName:'Venue'},[
      {id:'second',status:'active',batchIndex:2,label:'Guest',validationHash:'two'},
      {id:'cancelled',status:'revoked',batchIndex:3,label:'Guest',validationHash:'cancelled'},
      {id:'first',status:'active',batchIndex:1,label:'Guest',validationHash:'one'}
    ],{invitation:'Invitation',dateAndTime:'Date',location:'Location',ticketCode:'Ticket code',validationHint:'Show at entry'});
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    const pdf = new TextDecoder('latin1').decode(bytes);
    return {count:result.count,size:result.blob.size,pages:pdf.split('/Type /Page' + String.fromCharCode(10)).length - 1,clean:document.querySelectorAll('iframe').length === before,header:pdf.slice(0,5)};
  })()`);
  assert.equal(batch.count,2);
  assert.equal(batch.pages,2);
  assert.equal(batch.header,'%PDF-');
  assert.ok(batch.size > 10000 && batch.clean);
  console.log('PASS batch PDF uses the shared card, skips revoked invitations and cleans up its renderer');
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
