// Run against a local dev or production server: node scripts/navigation.browser.cjs
// Use dev mode to catch React's development-only lifecycle warnings.
// Override NAVIGATION_TEST_URL / CHROME_PATH when needed. No account is used.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");

const base = process.env.NAVIGATION_TEST_URL || "http://127.0.0.1:3100";
const chrome = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-navigation-"));
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
    throw new Error("Timed out: " + expression + "\n" + detail);
  };
  const navigate = async (route) => {
    await call("Page.navigate", { url: base + route });
    await until("Boolean(history.state?.__spottrNavigation)");
    await delay(250);
  };
  const button = (text) => `Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(text)})`;

  await navigate("/legal/terms");
  await evaluate("window.dispatchEvent(new Event('touchstart')); window.scrollTo(0, 700)");
  await delay(180);
  assert.equal(await evaluate("window.scrollY"), 700);
  await evaluate("document.querySelector('a[href=\"/\"]').click()");
  await until("location.pathname === '/' && document.querySelector('button[aria-current=\"page\"]')");
  await evaluate("history.back()");
  await until("location.pathname === '/legal/terms' && window.scrollY === 700");
  console.log("PASS real Next navigation restores legal page scroll");

  await navigate("/events");
  await evaluate(`${button("Map")}.click()`);
  await until("document.querySelector('.leaflet-container')");
  await evaluate("document.querySelector('button[aria-label=\"Home\"]').click()");
  await until("location.pathname === '/' && !document.querySelector('.leaflet-container')");
  await delay(300);
  assert.deepEqual(lifecycleWarnings, [], "Map → Home must not update React during useInsertionEffect");
  console.log("PASS Map → Home without insertion-effect warnings");
  await evaluate("document.querySelector('button[aria-label=\"Map\"]').click()");
  await until("location.pathname === '/events' && document.querySelector('button[aria-label=\"Filters\"]')");
  const openFilters = async () => {
    await evaluate("document.querySelector('button[aria-label=\"Filters\"]').click()");
    await until("Boolean(history.state?.__spottrLayer?.length)");
  };
  await openFilters();
  await evaluate(`${button("Tonight")}.click()`);
  await evaluate(`${button("Apply filters")}.click()`);
  await until("!history.state?.__spottrLayer?.length");
  assert.equal(await evaluate("location.search"), "");
  assert.equal(await evaluate("sessionStorage.getItem('spottr:navigation:v1:discovery')"), null);
  await delay(300);
  await openFilters();
  assert.equal(await evaluate(`${button("Tonight")}.classList.contains('border-primary/60')`), true);
  await evaluate("history.back()");
  await until("!history.state?.__spottrLayer?.length");
  assert.equal(await evaluate("location.pathname"), "/events");
  console.log("PASS Back closes filters without leaving the events route");

  await until("!document.querySelector('[role=dialog][aria-modal=true]')");
  await evaluate("document.querySelector('button[aria-label=\"Home\"]').click()");
  await until("location.pathname === '/'");
  await evaluate("document.querySelector('button[aria-label=\"Map\"]').click()");
  await until("location.pathname === '/events' && document.querySelector('button[aria-label=\"Filters\"]')");
  await delay(300);
  await openFilters();
  assert.equal(await evaluate(`${button("Tonight")}.classList.contains('border-primary/60')`), false);
  console.log("PASS filters reset after switching tabs");
  await evaluate("history.back()");
  await delay(300);
  await call("Page.reload");
  await until("Boolean(history.state?.__spottrNavigation) && document.querySelector('button[aria-label=\"Filters\"]')");
  await delay(300);
  await openFilters();
  assert.equal(await evaluate(`${button("Tonight")}.classList.contains('border-primary/60')`), false);
  assert.deepEqual(errors, [], "No uncaught runtime errors");
  assert.deepEqual(lifecycleWarnings, [], "No insertion-effect warnings across navigation flows");
  console.log("PASS filters are not restored after refresh; no runtime exceptions");
  await send("Target.closeTarget", { targetId });
}

const deadline = setTimeout(() => { child.kill(); console.error("Browser test exceeded 60s"); process.exitCode = 1; }, 60000);
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  clearTimeout(deadline);
  socket?.close();
  if (child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await Promise.race([exited, delay(2000)]); }
  // The only recursive removal is the dedicated profile created by this test.
  const resolved = path.resolve(profile);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("pulse-navigation-")) {
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
