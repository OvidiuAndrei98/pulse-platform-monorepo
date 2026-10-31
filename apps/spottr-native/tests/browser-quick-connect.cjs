const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), { createRequire } = require('node:module');
const { withBrowser } = require('./browser-harness.cjs');
const cameraRequire = createRequire(require.resolve('expo-camera/package.json'));
const detectorRequire = createRequire(cameraRequire.resolve('barcode-detector'));
// Exercise the real pinned decoder without reaching its default CDN.
fs.copyFileSync(detectorRequire.resolve('zxing-wasm/reader/zxing_reader.wasm'), path.resolve(__dirname, '../dist/__qa-camera.wasm'));

withBrowser(async ({ base, call, evaluate, until, click, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
    const user = { id: id(1), username: 'Quick Connect QA', email: 'qa@example.test', role: 'user', hasPassword: true, preferredLanguage: 'en', createdAt: '2026-01-01T00:00:00Z' };
    localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'quick-connect-test', user }));
    const original = fetch.bind(window);
    window.fetch = async (url, options = {}) => {
      const parsed = new URL(String(url), location.href), route = parsed.pathname.split('/api/v1')[1];
      if (!route) {
        if (parsed.pathname.endsWith('/zxing_reader.wasm')) return original(location.origin + '/__qa-camera.wasm');
        if (parsed.origin === location.origin) return original(url, options);
        throw Error('Unexpected external fetch');
      }
      if (options.method && options.method !== 'GET') {
        if (route === '/diagnostics/errors') return new Response(null, { status: 204 });
        throw Error('Unexpected mutation');
      }
      const data = route === '/users/me' ? user : route === '/wardrobe/mine' ? { deposits: [], staffAccess: false }
        : route === '/notifications' ? { items: [], unreadCount: 0 } : route === '/users/me/billing-details' ? { details: null } : [];
      return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    };
    window.__camera = { starts: 0, live: 0, stops: 0 };
    const permissions = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = async descriptor => descriptor.name === 'camera'
      ? (await new Promise(resolve => setTimeout(resolve, 180)), { state: 'granted', addEventListener() {}, removeEventListener() {} })
      : permissions(descriptor);
    const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    // Chrome is launched with synthetic media devices. No physical camera is used.
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await getMedia(constraints); window.__camera.starts++;
      for (const track of stream.getTracks()) {
        window.__camera.live++;
        const stop = track.stop.bind(track); let closed = false;
        track.stop = () => { if (!closed) { closed = true; window.__camera.live--; window.__camera.stops++; } stop(); };
      }
      return stream;
    };
  }.toString()})();` });
  await call('Page.navigate', { url: base + '/profile' });
  await until(`document.querySelector('[data-testid="profile-quick-connect"]')`);
  await click('profile-quick-connect');
  await until(`document.querySelector('[data-testid="quick-connect-code-panel"]')`); await delay(650);
  const top = await evaluate(`document.querySelector('[data-testid="sheet-handle"]').getBoundingClientRect().top`);
  const switching = await evaluate(`(async()=>{
    const frames=[];document.querySelector('[data-testid="quick-connect-scan"]').click();
    const start=performance.now();while(performance.now()-start<700){await new Promise(requestAnimationFrame);
      const switcher=document.querySelector('[data-testid="quick-connect-switch"]').getBoundingClientRect(),blob=document.querySelector('[data-testid="quick-connect-indicator"]').getBoundingClientRect();
      frames.push({x:blob.left-switcher.left,top:document.querySelector('[data-testid="sheet-handle"]').getBoundingClientRect().top,buttons:document.querySelectorAll('[data-testid="quick-connect-scan-panel"] [role="button"]').length});
    }return frames;
  })()`);
  assert.ok(switching.every(frame => Math.abs(frame.top - top) < 1), 'The sheet does not jump when starting the camera');
  assert.ok(switching.every(frame => frame.buttons === 0), 'No extra Scan button flashes during permission loading or camera startup');
  assert.ok(switching.some(frame => frame.x > 10 && frame.x < switching.at(-1).x - 10), 'A single capsule slides through intermediate positions');
  await until(`document.querySelector('[data-testid="quick-connect-camera-stage"] video')?.readyState>=2`, 30000);
  await until(`getComputedStyle(document.querySelector('[data-testid="quick-connect-camera-loading"]')).opacity==='0'`);
  assert.equal(await evaluate(`document.querySelector('[data-testid="quick-connect-scan-panel"]').textContent.includes('Loading events')`), false);
  assert.ok(await evaluate('window.__camera.live>0'));
  await capture('quick-connect-camera-ready');
  await click('quick-connect-code');
  await until(`document.querySelector('[data-testid="quick-connect-code-panel"]')`);
  await until('window.__camera.live===0');
  assert.equal(await evaluate(`document.querySelector('[data-testid="quick-connect-sheet"] video')===null`), true);
  await delay(650);
  const bounds = await evaluate(`(()=>{const a=document.querySelector('[data-testid="quick-connect-switch"]').getBoundingClientRect(),b=document.querySelector('[data-testid="quick-connect-indicator"]').getBoundingClientRect();return{left:b.left-a.left,top:b.top-a.top,bottom:a.bottom-b.bottom};})()`);
  assert.ok(Math.abs(bounds.left - 4) < .5 && Math.abs(bounds.top - bounds.bottom) < .5, 'The returned capsule is centered with a 4px inset');
  await click('quick-connect-scan');
  await until(`document.querySelector('[data-testid="quick-connect-camera-stage"] video')?.readyState>=2`, 30000);
  await click('sheet-handle'); await until(`!document.querySelector('[data-testid="quick-connect-sheet"]')`);
  await until('window.__camera.live===0');
  assert.deepEqual(errors, []);
  console.log('PASS Quick Connect sliding capsule, stable viewport, no extra Scan button, dedicated loading copy, synthetic camera readiness and cleanup');
}, { fakeCamera: true }).catch(error => { console.error(error); process.exitCode = 1; });
