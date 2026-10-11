// Isolated production UI and fake organizer/Places; never calls Google or publishes a real event.
const assert = require('node:assert/strict');
const path = require('node:path');
const { withBrowser } = require('./browser-harness.cjs');
withBrowser(async ({ base, call, evaluate, until, click, input, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = fetch.bind(window), id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
    const user = { id: id(1), username: 'Organizer QA', email: 'qa@example.test', role: 'organizer', hasPassword: true, preferredLanguage: 'en', createdAt: '2026-01-01T00:00:00Z' };
    const qa = window.__places = { calls: [], uploads: [], fail: false, detailDelay: 0 };
    const venue = { placeId: 'ChIJ-qa-club', name: 'QA Club', description: 'QA Club, Bucuresti' };
    window.fetch = async (url, options = {}) => {
      if (!String(url).includes('/api/v1/')) return original(url, options);
      const parsed = new URL(url, location.origin), route = parsed.pathname.split('/api/v1')[1];
      const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
      qa.calls.push({ route, query: parsed.search });
      if (route === '/auth/login') return reply({ token: 'qa-places-token' });
      if (route === '/users/me') return reply(user);
      if (route === '/dashboard/uploads/event-banner') { qa.uploads.push({ type: new Headers(options.headers).get('content-type'), bytes: options.body.byteLength }); return reply({ url: location.origin + '/assets/assets/party-event.9ff7ef76614a79d5a475f57bf9f48fdb.webp' }); }
      if (route === '/dashboard/places/autocomplete') {
        const q = parsed.searchParams.get('q');
        if (qa.fail) return reply({}, 503);
        if (q === 'slow') { await new Promise(resolve => setTimeout(resolve, 1000)); return reply([{ ...venue, placeId: 'ChIJ-slow', name: 'Stale club' }]); }
        return reply(q === 'empty' ? [] : [venue]);
      }
      if (route === '/dashboard/places/details') { await new Promise(resolve => setTimeout(resolve, qa.detailDelay)); return reply({ ...venue, lat: 44.432, lng: 26.106 }); }
      if (route.startsWith('/dashboard/organizer/profile/')) return reply({ userId: id(1), name: 'Organizer QA', isVerified: true });
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      return reply([]);
    };
  }.toString()})();` });
  await call('Page.navigate', { url: base + '/login' });
  await click('auth-email-choice'); await input('auth-email', 'qa@example.test'); await input('auth-password', 'test-password'); await click('auth-submit');
  await until(`document.querySelector('[data-testid="organizer-dashboard"]')`);
  await call('Page.navigate', { url: base + '/dashboard/new' });
  await until(`document.body.innerText.includes('When & where')`);
  await input('editor-title', 'A venue regression night');
  await input('editor-description', 'A complete event description for venue regression.');
  await click('editor-vibe');
  await until(`document.querySelector('[data-testid="editor-vibe-options"] [role=button]')`);
  await evaluate(`document.querySelector('[data-testid="editor-vibe-options"] [role=button]').click()`);
  await click('editor-lineup-toggle');
  await click('editor-artist-mode-manual');
  await call('Page.setInterceptFileChooserDialog', { enabled: true });
  await click('editor-artist-photo');
  await until(`document.querySelector('input[type=file]')`);
  const dom = await call('DOM.getDocument');
  const file = await call('DOM.querySelector', { nodeId: dom.root.nodeId, selector: 'input[type=file]' });
  await call('DOM.setFileInputFiles', { nodeId: file.nodeId, files: [path.resolve(__dirname, '../assets/party-event.webp')] });
  await until(`window.__places.uploads.length===1 && document.querySelector('[data-testid="editor-artist-photo"]').getAttribute('aria-disabled')!=='true'`);
  assert.equal(await evaluate('window.__places.uploads[0].type'), 'image/webp');
  assert.ok(await evaluate('window.__places.uploads[0].bytes > 0 && window.__places.uploads[0].bytes <= 2*1024*1024'));
  assert.equal(await evaluate(`!!document.querySelector('input[aria-label="Image URL"]')`), false);
  await input('editor-artist-name', 'QA Artist');
  await click('editor-artist-add');
  await until(`document.querySelector('[data-testid="editor-artist-0"]')`);
  await click('editor-next');
  await until(`document.querySelector('[data-testid="event-venue-input"]')`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-testid="event-venue-input"]')).borderTopWidth`), '0px', 'Venue input uses only the outer event-field border');
  assert.equal(await evaluate(`!!document.querySelector('input[aria-label="Latitude"],input[aria-label="Longitude"]')`), false);
  await input('event-venue-input', 'slow');
  await until(`window.__places.calls.some(r=>r.query.includes('q=slow'))`);
  await input('event-venue-input', 'Club');
  await until(`document.querySelector('[data-testid="event-venue-ChIJ-qa-club"]')`);
  await delay(1100);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="event-venue-ChIJ-slow"]')`), false);
  await click('event-venue-ChIJ-qa-club');
  await until(`document.querySelector('[data-testid="event-venue-input"]').value==='QA Club' && !document.querySelector('[data-testid="event-venue-results"]')`);
  assert.equal(await evaluate(`window.__places.calls.filter(r=>r.route.endsWith('/details')).length`), 1);
  await input('event-venue-input', 'empty');
  await until(`document.body.innerText.includes('No locations found')`);
  await evaluate('window.__places.fail=true'); await input('event-venue-input', 'failure');
  await until(`document.body.innerText.includes("We couldn't load this information")`);
  await evaluate(`window.__places.fail=false;Array.from(document.querySelectorAll('[role=button]')).find(el=>el.textContent==='Try again').click()`);
  await until(`document.querySelector('[data-testid="event-venue-ChIJ-qa-club"]')`);
  await evaluate('window.__places.detailDelay=800'); await click('event-venue-ChIJ-qa-club');
  await input('event-venue-input', 'Other venue'); await delay(1000);
  assert.equal(await evaluate(`document.querySelector('[data-testid="event-venue-input"]').value`), 'Other venue');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-testid="event-venue-input"]')).outlineStyle`), 'none', 'Focused venue input uses the outer accent border without a browser rectangle');
  await capture('dashboard-venue-search');
  await evaluate(`Array.from(document.querySelectorAll('[role=button]')).find(el=>el.getAttribute('aria-label')==='Start date').click()`);
  await until(`document.querySelector('[data-testid="editor-date-popover"]')`);
  await evaluate(`Array.from(document.querySelectorAll('[role=button]')).find(el=>el.getAttribute('aria-label')==='15').click()`);
  await click('editor-date-done');
  await until(`!document.querySelector('[data-testid="editor-date-popover"]')`);
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('[role=button]')).find(el=>el.getAttribute('aria-label')==='Start date').textContent.includes('15')`));
  assert.deepEqual(errors, []);
  console.log('PASS artist photo picker/WebP upload, organizer venue autocomplete, stale search/details, one-tap selection, empty/error/retry and original datetime popover');
}).catch(error => { console.error(error); process.exitCode = 1; });
