// The exported UI runs only against local fixtures; no account or payment writes.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { withBrowser } = require('./browser-harness.cjs');
const dist = path.resolve(__dirname, '../dist');
const banner = '/assets/' + fs.readdirSync(path.join(dist, 'assets'), { recursive: true }).find(name => /party-event\..*\.webp$/.test(name)).replaceAll('\\', '/');
const id = '00000000-0000-4000-8000-000000000001';

withBrowser(async ({ base, call, evaluate, until, click, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock(banner, id) {
    const original = fetch.bind(window), params = new URL(location.href).searchParams;
    const user = { id: '00000000-0000-4000-8000-000000000100', username: 'QA', role: 'user', email: 'qa@example.test', hasPassword: true, preferredLanguage: params.get('lang') || 'en', createdAt: '2026-01-01T00:00:00Z' };
    localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'polish-qa-only', user }));
    const event = { id, title: 'After dark', organizerId: '00000000-0000-4000-8000-000000000050', category: 'TECHNO', city: 'Bucuresti', locationName: 'Test venue', startTime: '2020-10-08T18:00:00Z', endTime: '2099-10-09T02:00:00Z', bannerUrl: location.origin + banner, ticketTypes: [], lineup: [], description: 'QA event' };
    const qa = window.__qa = { saved: false, writes: [], failSave: false, failCopy: false, copied: [], eventRequests: 0, unexpected: [], empty: params.has('empty') };
    let releaseFonts, releaseEvents;
    const fontGate = new Promise(resolve => releaseFonts = resolve), eventsGate = new Promise(resolve => releaseEvents = resolve);
    qa.releaseFonts = releaseFonts; qa.releaseEvents = releaseEvents;
    const loadFonts = document.fonts.load.bind(document.fonts);
    document.fonts.load = (...args) => loadFonts(...args).then(result => fontGate.then(() => result));
    if (params.has('empty')) { releaseFonts(); releaseEvents(); }
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { if (qa.failCopy) throw Error('Permission denied'); qa.copied.push(text); } } });
    window.fetch = async (input, options = {}) => {
      const url = new URL(String(input), location.origin), route = url.pathname.split('/api/v1')[1];
      if (!route) { if (url.origin === location.origin) return original(input, options); throw Error('External request blocked'); }
      const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
      if (route === '/users/me') return reply(user);
      if (route === '/users/me/saved-events') return reply(qa.saved ? [event] : []);
      if (route === '/events') { qa.eventRequests++; await eventsGate; return reply(qa.empty ? [] : [event]); }
      if (route === '/promotions/active') { await eventsGate; return reply([]); }
      if (route === '/events/' + id) return reply(event);
      if (route.endsWith('/favorite')) {
        qa.writes.push(options.method); await new Promise(resolve => setTimeout(resolve, 220));
        if (qa.failSave) return reply({}, 503);
        qa.saved = options.method === 'POST'; return reply({});
      }
      if (route.endsWith('/social')) return reply({ friends: [], goingCount: 0, interestedCount: 0 });
      if (route.startsWith('/profiles/')) return reply({ id: event.organizerId, username: 'QA Organizer' });
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      if (route.endsWith('/updates') || ['/users/me/tickets', '/users/me/orders', '/users/me/hidden-categories', '/dashboard/ticket-validation/events', '/friends', '/feed'].includes(route)) return reply([]);
      qa.unexpected.push(route); return reply({}, 404);
    };
  }.toString()})(${JSON.stringify(banner)},${JSON.stringify(id)});` });
  const el = id => `document.querySelector('[data-testid="${id}"]')`;
  await call('Page.navigate', { url: base });
  await until(`${el('startup-cover')}?.querySelector('img')?.naturalWidth>0`);
  assert.ok(await evaluate(`${el('startup-cover')}.getBoundingClientRect().height >= innerHeight-1`));
  await capture('startup-logo');
  await evaluate('window.__qa.releaseFonts()');
  await until(`!${el('startup-cover')} && ${el('home-loading-rails')} && ${el('home-loading-hero')}`);
  await capture('home-loading-skeleton');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Skeleton rails cannot overflow the screen');
  await evaluate('window.__qa.releaseEvents()');
  await until(`${el('event-card-' + id)} && !${el('home-loading-rails')}`); await delay(350);
  console.log('PASS startup covers font loading, releases without waiting for API, skeleton becomes real cards');

  const bookmark = 'event-bookmark-' + id;
  await click(bookmark);
  assert.equal(await evaluate(`!!${el('app-toast')}`), false, 'No success before the server confirms');
  await until(`${el('app-toast')}?.textContent.includes('Event saved')`); await delay(200);
  assert.equal(await evaluate('window.__qa.saved'), true);
  const toastPlacement = await evaluate(`{const toast=${el('app-toast')}.getBoundingClientRect(),nav=${el('tab-bar')}.getBoundingClientRect();({dx:Math.abs(toast.x+toast.width/2-nav.x-nav.width/2),dy:Math.abs(toast.y+toast.height/2-nav.y-nav.height/2),narrower:toast.width<nav.width})}`);
  assert.ok(toastPlacement.dx < 1 && toastPlacement.dy < 1 && toastPlacement.narrower, 'Compact feedback is centered over the navbar without moving it');
  assert.equal(await evaluate(`{const e=${el('toast-action')},r=e.getBoundingClientRect();e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}`), true, 'Undo receives the touch above navbar tabs');
  await capture('event-saved-toast');
  await click('toast-action');
  await until(`!window.__qa.saved && ${el('app-toast')}?.textContent.includes('Event removed')`);
  assert.equal(await evaluate(`!!${el('toast-action')}`), false, 'Undo confirmation does not start another undo chain');
  await until(`!${el('app-toast')}`, 2600);
  assert.equal(await evaluate(`{const e=${el('tab-Explore')},r=e.getBoundingClientRect();e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}`), true, 'Auto-dismiss releases the navbar without an invisible overlay');
  await evaluate(`${el(bookmark)}.click();${el(bookmark)}.click();${el(bookmark)}.click()`);
  await until(`window.__qa.saved && ${el('app-toast')}?.textContent.includes('Event saved')`);
  await delay(220);
  assert.equal(await evaluate(`document.querySelectorAll('[data-testid="app-toast"]').length`), 1, 'Rapid taps never stack messages');
  await click('toast-action');
  await evaluate(`${el(bookmark)}.click()`);
  await until(`window.__qa.saved && ${el('app-toast')}?.textContent.includes('Event saved') && ${el('toast-action')}`);
  await evaluate('window.__qa.failSave=true'); await click(bookmark);
  await until(`${el('app-toast')}?.textContent.includes("Couldn't update saved events")`);
  assert.equal(await evaluate('window.__qa.saved'), true, 'Failed removal preserves the confirmed bookmark');
  assert.equal(await evaluate(`!!${el('toast-action')}`), false, 'Failed writes have no Undo');
  await click('toast-dismiss'); await delay(160); await evaluate('window.__qa.failSave=false');

  await evaluate(`${el('event-card-' + id)}.querySelector('[role="button"]').click()`);
  await until(el('event-content')); await delay(600);
  await click('event-sheet-bookmark');
  await until(`${el('app-toast')}?.textContent.includes('Event removed')`); await delay(220);
  assert.equal(await evaluate(`document.querySelectorAll('[data-testid="app-toast"]').length`), 1, 'Only the focused presentation displays the toast');
  const hit = await evaluate(`{const e=${el('toast-action')},r=e.getBoundingClientRect();e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}`);
  assert.equal(hit, true, 'Undo is reachable above the event sheet');
  await capture('event-sheet-toast');
  await click('toast-dismiss'); await delay(160);
  await click('event-share');
  await until(`${el('app-toast')}?.textContent.includes('Link copied')`);
  assert.equal(await evaluate('window.__qa.copied.length'), 1);
  await until(`!${el('app-toast')}`, 6000);
  await evaluate('window.__qa.failCopy=true'); await click('event-share');
  await until(`${el('app-toast')}?.textContent && !${el('app-toast')}.textContent.includes('Link copied')`);
  assert.equal(await evaluate('window.__qa.copied.length'), 1, 'Denied clipboard permission never reports a successful copy');
  console.log('PASS confirmed saves, undo, rapid taps, rollback, sheet layering, copy success/failure and auto-dismiss');

  await call('Page.navigate', { url: base + '/users/me?empty=1' });
  await until(el('profile-empty-tickets')); await until(`!${el('startup-cover')}`);
  await evaluate(`${el('profile-empty-tickets')}.scrollIntoView({block:'start'})`);
  await capture('profile-empty-states');
  assert.ok(await evaluate(`${el('profile-empty-tickets')}.getBoundingClientRect().height<125`));
  assert.equal(await evaluate(`!!${el('profile-tickets-all')}`), false, 'No redundant link to an empty ticket list');
  assert.equal(await evaluate(`getComputedStyle(${el('profile-empty-tickets')}).borderStyle`), 'solid');
  await click('profile-empty-saved-explore');
  await until(`${el('tab-Explore')}?.getAttribute('aria-selected')==='true'`);
  await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true });
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await call('Page.navigate', { url: base + '/users/me?empty=1&lang=ro' });
  await until(`${el('profile-empty-saved')}?.textContent.includes('Descoperă evenimente') && !${el('startup-cover')}`);
  await evaluate(`${el('profile-empty-tickets')}.scrollIntoView({block:'start'})`);
  await capture('profile-empty-states-small-ro');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
  assert.deepEqual(await evaluate('window.__qa.unexpected'), []);
  assert.deepEqual(errors, []);
  console.log('PASS compact empty states, Explore navigation, Romanian/narrow layout and reduced motion');
}).catch(error => { console.error(error); process.exitCode = 1; });
