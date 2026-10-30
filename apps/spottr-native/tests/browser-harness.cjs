const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { spawn } = require('node:child_process');
const { createChromeProfile } = require('./chrome-profile.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function withBrowser(run, { fakeCamera = false } = {}) {
  const dist = path.resolve(__dirname, '../dist'), artifacts = path.resolve(__dirname, '../artifacts');
  fs.mkdirSync(artifacts, { recursive: true });
  let child, socket;
  const browserProfile = createChromeProfile('checkout', () => ({ child, socket, server }));
  const profile = browserProfile.path;
  const server = http.createServer((req, res) => {
    const file = path.resolve(dist, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(dist + path.sep) && file !== dist) { res.writeHead(403); res.end(); return; }
    const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(dist, 'index.html');
    res.setHeader('content-type', { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff': 'font/woff', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(target)] || 'application/octet-stream');
    fs.createReadStream(target).pipe(res);
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    child = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', ...(fakeCamera ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] : []), 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    const endpoint = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Chrome startup timeout')), 15000); child.once('error', reject); child.stderr.on('data', bytes => { const match = bytes.toString().match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } }); });
    socket = new WebSocket(endpoint); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let seq = 0; const pending = new Map(), errors = [];
    socket.onmessage = ({ data }) => { const msg = JSON.parse(data); if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text); if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map(v => v.value || v.description).join(' ')); if (process.env.BROWSER_NETWORK_DEBUG && msg.method === 'Network.loadingFailed') console.error('Browser network failure', msg.params); if(process.env.BROWSER_NETWORK_DEBUG && msg.method==='Log.entryAdded') console.error('Browser log',msg.params.entry); const item = pending.get(msg.id); if (item) { pending.delete(msg.id); msg.error ? item.reject(msg.error) : item.resolve(msg.result); } };
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++seq, timer = setTimeout(() => reject(Error('CDP timeout ' + method)), 20000); pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } }); socket.send(JSON.stringify({ id, method, params, sessionId })); });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' }), { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params) => send(method, params, sessionId).catch(error => { throw Error(method + ' ' + JSON.stringify(error) + ' ' + String(params?.expression || '').slice(0, 300)); });
    await call('Runtime.enable'); await call('Page.enable'); await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    const until = async (expression, timeoutMs = 14000) => { const deadline = Date.now() + timeoutMs; while (Date.now() < deadline) { if (await evaluate(`Boolean(${expression})`)) return; await delay(100); } throw Error('Timed out: ' + expression + '\n' + await evaluate('document.body.innerText') + '\n' + errors.join('\n')); };
    const selector = id => `[data-testid="${id}"]`;
    const click = async id => { await until(`document.querySelector(${JSON.stringify(selector(id))})`); await evaluate(`{const el=document.querySelector(${JSON.stringify(selector(id))}),r=el.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight||!el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)))el.scrollIntoView({block:'center'});}`); const point = await evaluate(`{const r=document.querySelector(${JSON.stringify(selector(id))}).getBoundingClientRect();({x:r.x+r.width/2,y:r.y+r.height/2})}`); await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 }); await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 }); };
    const input = async (id, text) => { await click(id); await evaluate(`{ const el=document.querySelector(${JSON.stringify(selector(id))}); el.focus(); el.select(); }`); await call('Input.insertText', { text }); };
    const capture = async name => { const result = await call('Page.captureScreenshot', { format: 'png' }); const dir = path.resolve(__dirname, '../artifacts'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(result.data, 'base64')); };
    await run({ base, call, evaluate, until, click, input, delay, capture, errors });
  } finally { await browserProfile.cleanup(); }
}
module.exports = { withBrowser };
