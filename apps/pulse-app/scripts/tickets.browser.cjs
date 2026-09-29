// Run against a local dev or production server: node scripts/feedback.browser.cjs
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

  await call("Page.addScriptToEvaluateOnNewDocument", { source: `
    localStorage.setItem('pulse_token', 'mock-tickets-test');
    const originalFetch = window.fetch.bind(window);
    const common = { eventTitle: 'Next Night', eventId: '90', locationName: 'Test venue', startTime: '2099-10-01T18:00:00Z', endTime: '2099-10-02T04:00:00Z', ticketTypeName: 'General admission', isValidated: false, priceRon: 80, organizerCompanyName: 'Test Organizer', organizerCui: 'TEST', organizerFiscalAddress: 'Test address' };
    window.__api = { fail: false, empty: false, calls: 0 };
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
      if (route === '/users/me') return reply({id:'ticket-user',username:'Test User',role:'user',email:'test@example.com',preferredLanguage:'en'});
      if (route === '/users/me/tickets') { window.__api.calls++; await new Promise(resolve => setTimeout(resolve,120)); return window.__api.fail ? reply({title:'Unavailable'},503) : reply(window.__api.empty ? [] : tickets); }
      return reply([]);
    };
    window.open = () => ({document:{open(){window.__pdf='';}, write(html){window.__pdf=(window.__pdf || '') + html;}, close(){}}});
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
    await until("window.__pdf?.includes('next-two')");
    assert.ok(await evaluate("window.__pdf.includes('VIP admission')"),'PDF follows the selected ticket');
    assert.equal(await evaluate("new DOMParser().parseFromString(window.__pdf,'text/html').querySelector('[data-ticket-pass]').outerHTML"), await evaluate("document.querySelector('[data-ticket-preview] [data-ticket-pass]').outerHTML"), 'App and PDF render the same ticket markup');
    if (process.env.TICKETS_SCREENSHOT && width === 390) {
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
