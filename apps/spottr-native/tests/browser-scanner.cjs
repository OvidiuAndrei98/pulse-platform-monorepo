// Only simulated accounts, tickets and transport. Chrome uses a fake camera.
const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const journalKey = `spottr-native:scanner:v1:${id(2)}:${id(1)}`;

withBrowser(async ({ base, call, evaluate, until, click, input, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = window.fetch.bind(window), id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const query = new URL(location.href).searchParams;
    if (!query.has('resume')) localStorage.clear();
    const qa = window.__qa = { offline: query.has('offline'), snapshotFailure: true, qr: '', requests: [], unexpected: [], sounds: [], awake: 0 };
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { if (this instanceof HTMLAudioElement) { qa.sounds.push(this.src); return Promise.resolve(); } return originalPlay.call(this); };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
      qa.awake++; let released = false;
      return { release: async () => { if (!released) qa.awake--; released = true; } };
    } } });
    window.BarcodeDetector = class { async detect() { return qa.qr ? [{ rawValue: qa.qr, format: 'qr_code', boundingBox: { x: 0, y: 0, width: 100, height: 100 }, cornerPoints: [] }] : []; } };
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !qa.offline });
    const user = { id: id(2), username: 'Scanner QA', email: 'qa@example.test', role: 'organizer', hasPassword: true, preferredLanguage: 'en', createdAt: '2026-01-01T00:00:00Z' };
    const event = { id: id(1), organizerId: user.id, title: 'Offline QA Night', description: 'Isolated scanner regression', category: 'TECHNO', city: 'Bucuresti', locationName: 'QA Club', startTime: '2020-01-01T20:00:00Z', endTime: '2035-10-11T04:00:00Z', status: 'published', latitude: 44.43, longitude: 26.1, ticketTypes: [], lineup: [], canManage: true };
    window.fetch = async (url, options = {}) => {
      const parsed = new URL(String(url), location.origin);
      if (!parsed.pathname.includes('/api/v1/')) { if (parsed.origin === location.origin) return original(url, options); throw Error('Unexpected external fetch'); }
      const route = parsed.pathname.split('/api/v1')[1], method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : undefined;
      qa.requests.push({ route, method, body });
      if (qa.offline) throw new TypeError('Network request failed');
      const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
      if (route === '/auth/login') return reply({ token: 'scanner-qa-only' });
      if (route === '/users/me') return reply(user);
      if (route === '/events' || route === '/dashboard/events' || route === '/dashboard/ticket-validation/events') return reply([event]);
      if (route.startsWith('/dashboard/organizer/profile/') || route === '/dashboard/stripe/status') return reply({ userId: user.id, companyName: 'QA Club SRL', cui: '123456', fiscalAddress: 'QA Address', isVerified: true, verificationStatus: 'approved' });
      if (route.endsWith('/offline-snapshot')) return qa.snapshotFailure ? reply({}, 503) : reply({ snapshotId: id(80), eventId: event.id, eventTitle: event.title, generatedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: event.endTime, ticketCount: 3, tickets: ['a', 'b', 'c'].map((char, index) => ({ ticketId: id(90 + index), ticketType: 'General', validationHash: char.repeat(64) })) });
      if (route.endsWith('/offline-sync')) return reply({ results: body.scans.map(scan => ({ clientScanId: scan.clientScanId, status: 'accepted' })) });
      if (route.endsWith('/my-scans')) return reply({ totalScans: 0, scans: [] });
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      if (route.endsWith('/social')) return reply({ goingCount: 0, interestedCount: 0 });
      if (/^\/(users\/me\/(saved-events|tickets|orders|hidden-categories)|promotions\/active|friends|feed|profiles\/search)$/.test(route) || route.endsWith('/updates') || route.endsWith('/attendees')) return reply([]);
      qa.unexpected.push({ route, method }); return reply({}, 404);
    };
  }.toString()})();` });
  const open = path => call('Page.navigate', { url: base + path });
  const pressText = async label => {
    const expression = `Array.from(document.querySelectorAll('[role="button"],button')).find(el=>el.textContent.trim()===${JSON.stringify(label)})`;
    await until(expression); await evaluate(`${expression}.click()`);
  };
  const connectivity = async online => {
    await evaluate(`window.__qa.offline=${!online};window.dispatchEvent(new Event('${online ? 'online' : 'offline'}'))`);
  };
  const journal = `JSON.parse(localStorage.getItem(${JSON.stringify(journalKey)}))`;
  const openCamera = async () => {
    await click('scanner-open-camera');
    await until(`document.querySelector('[data-testid="scanner-camera-viewport"]') || document.body.innerText.includes('Allow camera')`);
    if (!await evaluate(`!!document.querySelector('[data-testid="scanner-camera-viewport"]')`)) await pressText('Allow camera');
    await until(`document.querySelector('[data-testid="scanner-camera-frame"]')?.getBoundingClientRect().width > 0`);
    await delay(350); // Wait for the modal to reach its interactive position.
  };
  const closeCamera = async () => {
    await evaluate(`Array.from(document.querySelectorAll('[aria-label="Close"]')).find(el=>el.getBoundingClientRect().width>0).click()`);
    await until(`!document.querySelector('[data-testid="scanner-camera-viewport"]')`);
    await delay(350); // Full-screen Modal's native/web dismissal transition.
  };
  const scan = async (char, expected) => {
    await input('scanner-code-input', char.repeat(64));
    assert.equal(await evaluate(`document.querySelector('[data-testid="scanner-code-input"]').value`), char.repeat(64));
    await until(`document.querySelector('[data-testid="scanner-validate"]').getAttribute('aria-disabled') !== 'true'`);
    await click('scanner-validate');
    await until(`document.querySelector('[data-testid="scanner-result"]')?.textContent.includes(${JSON.stringify(expected)})`);
  };

  await open('/'); await click('tab-Profile'); await click('auth-email-choice');
  await input('auth-email', 'qa@example.test'); await input('auth-password', 'qa-password'); await click('auth-submit');
  await until(`document.querySelector('[data-testid="organizer-dashboard"]')`);
  assert.ok(await evaluate(`location.pathname.startsWith('/dashboard')`));
  console.log('PASS organizer login from the Profile tab lands in Dashboard');

  await open('/ticket-validation?resume=1');
  await until(`document.querySelector('[data-testid="scanner-open-camera"]')?.getAttribute('aria-disabled') !== 'true' && document.body.innerText.includes('Offline QA Night')`);
  await click('scanner-prepare');
  await until(`document.querySelector('[data-testid="scanner-preparation-error"]')`);
  assert.equal(await evaluate(`${journal}?.snapshot ?? null`), null);
  await evaluate('window.__qa.snapshotFailure=false'); await click('scanner-prepare');
  await until(`${journal}?.snapshot?.ticketCount===3`);
  await until(`document.querySelector('[data-testid="scanner-prepared"]')?.textContent.includes('Scanner ready')`);
  assert.ok(await evaluate(`document.querySelector('[data-testid="scanner-package-status"]').textContent.includes('Updated just now')`));
  await openCamera(); await connectivity(false);
  await until(`document.querySelector('[data-testid="scanner-connection"]').textContent==='Offline'`);
  await delay(400);
  assert.ok(await evaluate(`!!document.querySelector('[data-testid="scanner-camera-viewport"]')`), 'Losing internet must not close the camera');
  assert.equal(await evaluate(`document.querySelector('[data-testid="scanner-gate-event"]').textContent`), 'Offline QA Night');
  assert.equal(await evaluate(`document.querySelector('[data-testid="scanner-gate-network"]').textContent`), 'Offline');
  await until(`window.__qa.awake===1`);
  for (const [width, height] of [[390, 844], [320, 568], [844, 390]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true }); await delay(250);
    const sizes = await evaluate(`{const frame=document.querySelector('[data-testid="scanner-camera-frame"]').getBoundingClientRect(), view=document.querySelector('[data-testid="scanner-camera-viewport"]').getBoundingClientRect();({w:frame.width,h:frame.height,vw:view.width,vh:view.height})}`);
    assert.ok(sizes.w > 0 && Math.abs(sizes.w - sizes.h) < 1 && sizes.w <= sizes.vw && sizes.h <= sizes.vh, JSON.stringify(sizes));
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`window.__qa.qr='a'.repeat(64)`);
  await until(`${journal}.scans.length===1 && document.body.textContent.includes('Ticket accepted offline')`);
  await until(`window.__qa.sounds.length===1`);
  assert.ok(await evaluate(`window.__qa.sounds[0].includes('success')`));
  await until(`document.querySelector('[data-testid="scanner-gate-pending"]').textContent==='1 unsynced scans'`);
  await delay(3500);
  assert.equal(await evaluate(`window.__qa.sounds.length`), 1, 'The same visible QR cannot replay the sound');
  assert.equal(await evaluate(`document.body.textContent.includes('Ticket already scanned on this device')`), false, 'A QR held in front of the camera must not keep rescanning');
  await click('scanner-sound');
  assert.equal(await evaluate(`document.querySelector('[data-testid="scanner-sound"]').getAttribute('aria-checked')`), 'false');
  await evaluate(`window.__qa.qr='b'.repeat(64)`);
  await until(`${journal}.scans.length===2`);
  await evaluate(`window.__qa.qr=''`);
  assert.ok(await evaluate(`!!document.querySelector('[data-testid="scanner-camera-viewport"]')`));
  await delay(300); assert.equal(await evaluate(`window.__qa.sounds.length`), 1, 'Muted scans stay silent');
  await capture('scanner-offline-camera'); await closeCamera(); await until(`window.__qa.awake===0`);
  await openCamera(); assert.equal(await evaluate(`document.querySelector('[data-testid="scanner-sound"]').getAttribute('aria-checked')`), 'false');
  await click('scanner-sound');
  await until(`document.querySelector('[data-testid="scanner-sound"]').getAttribute('aria-checked')==='true'`);
  await closeCamera();
  await click('scanner-manual-toggle'); await scan('a', 'Ticket already scanned on this device');
  await until(`window.__qa.sounds.some(source=>source.includes('duplicate'))`);
  for (let retry = 0; retry < 2; retry++) {
    await input('scanner-code-input', 'z'.repeat(64));
    await until(`document.querySelector('[data-testid="scanner-validate"]').getAttribute('aria-disabled') !== 'true'`);
    const before = await evaluate('window.__qa.sounds.length');
    await click('scanner-validate');
    await until(`window.__qa.sounds.length===${before + 1}`);
    assert.ok(await evaluate(`window.__qa.sounds.at(-1).includes('error')`));
  }
  assert.equal(await evaluate(`${journal}.scans.filter(scan=>scan.status==='pending').length`), 2);
  assert.equal(await evaluate(`window.__qa.requests.filter(request=>request.route.endsWith('/tickets/validate')).length`), 0);
  assert.equal(await evaluate(`document.body.innerText.includes('Scan next ticket')`), false);
  await capture('scanner-offline-admission');
  assert.deepEqual(await evaluate('window.__qa.unexpected'), []);
  console.log('PASS package error/retry, loss of internet with camera open, square frame at three sizes, camera reopening, offline acceptance and duplicate suppression');
  await openCamera(); await click('scanner-sound');
  await until(`JSON.parse(localStorage.getItem('spottr-native.scanner-feedback.v1')).sound===false`);
  await closeCamera();

  await open('/ticket-validation?resume=1&offline=1');
  await until(`document.querySelector('[data-testid="scanner-open-camera"]')?.getAttribute('aria-disabled') !== 'true' && document.body.innerText.includes('Offline QA Night')`);
  assert.equal(await evaluate(`document.body.innerText.includes('Validation events could not be loaded')`), false);
  await openCamera();
  assert.equal(await evaluate(`document.querySelector('[data-testid="scanner-sound"]').getAttribute('aria-checked')`), 'false', 'Mute preference survives a full app reload');
  await closeCamera();
  await click('scanner-manual-toggle'); await scan('c', 'Ticket accepted offline');
  assert.equal(await evaluate(`${journal}.scans.filter(scan=>scan.status==='pending').length`), 3);
  await connectivity(true);
  await until(`${journal}.scans.length===3 && ${journal}.scans.every(scan=>scan.status==='synced')`);
  assert.equal(await evaluate(`window.__qa.requests.filter(request=>request.route.endsWith('/offline-sync')).length`), 1);
  assert.deepEqual(await evaluate('window.__qa.unexpected'), []);
  console.log('PASS offline app reopening restores session, event and pending scans; reconnect syncs all three exactly once');

  await evaluate(`localStorage.removeItem(${JSON.stringify(journalKey)})`);
  await open('/ticket-validation?resume=1');
  await until(`document.querySelector('[data-testid="scanner-connection"]')?.textContent==='Online' && document.body.innerText.includes('Offline QA Night')`);
  await openCamera(); await connectivity(false);
  await until(`document.querySelector('[data-testid="scanner-connection"]').textContent==='Offline'`);
  await evaluate(`window.__qa.qr='a'.repeat(64)`);
  await until(`document.body.textContent.includes('Prepare this event for offline validation first')`);
  assert.ok(await evaluate(`!!document.querySelector('[data-testid="scanner-camera-viewport"]')`), 'An unprepared package must not tear down the camera either');
  assert.equal(await evaluate(`${journal}?.scans?.length ?? 0`), 0);
  await closeCamera();
  await open('/ticket-validation?resume=1&offline=1');
  await until(`document.body.innerText.includes('Prepare this event for offline validation first')`);
  assert.equal(await evaluate(`document.body.innerText.includes('Validation events could not be loaded')`), false);
  assert.deepEqual(errors, []);
  console.log('PASS an unprepared device explains the missing offline package instead of claiming online or showing a generic API error');
  console.log('PASS gate event/connection/pending count, preparation progress, package age, distinct audio cues, mute persistence and wake lock cleanup');
}, { fakeCamera: true }).catch(error => { console.error(error); process.exitCode = 1; });
