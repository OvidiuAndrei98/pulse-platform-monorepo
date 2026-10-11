// Keep the scene's navbar mounted underneath overlays, without putting it above
// their backdrop. Uses the exported app and isolated API fixtures only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withBrowser } = require('./browser-harness.cjs');

withBrowser(async ({ base, call, evaluate, until, click, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function bootstrap() {
    const original = fetch.bind(window), id = n => '12345678-abcd-abcd-abcd-' + String(n).padStart(12, '0');
    const user = { id: id(999), username: 'Sheet QA', email: 'sheets@example.test', role: 'user', preferredLanguage: 'en', hasPassword: true, createdAt: '2026-01-01T00:00:00Z' };
    localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'sheet-test-only', user }));
    const event = { id: id(1), organizerId: id(2), title: 'Navbar sheet QA', status: 'published', category: 'TECHNO', locationName: 'Test venue', city: 'Bucuresti', startTime: '2099-10-08T18:00:00Z', endTime: '2099-10-09T02:00:00Z', description: 'Event content behind checkout. '.repeat(60), ticketTypes: [{ id: id(3), name: 'General access', description: 'Admission', priceRon: 50, capacity: 100, ticketsSold: 0, startSales: '2020-01-01T00:00:00Z', endSales: '2099-10-09T02:00:00Z' }], lineup: [] };
    const qa = window.__sheetNavbarQA = { me: false, requests: [], writes: [], unexpected: [], samples: [], frame: 0 };
    window.fetch = async (url, options = {}) => {
      const parsed = new URL(typeof url === 'string' ? url : url.url, location.href);
      if (!parsed.pathname.includes('/api/v1/')) {
        if (parsed.origin === location.origin) return original(url, options);
        throw Error('Unexpected external request in isolated sheet test');
      }
      const route = parsed.pathname.split('/api/v1')[1], method = options.method || 'GET';
      qa.requests.push({ route, method }); if (method !== 'GET') qa.writes.push({ route, method });
      const reply = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
      if (route === '/users/me') { qa.me = true; return reply(user); }
      if (route === '/events') return reply([event]);
      if (route === '/events/' + event.id) return reply(event);
      if (route.endsWith('/social')) return reply({ goingCount: 1, interestedCount: 0 });
      if (route.startsWith('/profiles/')) return reply({ id: id(2), username: 'Organizer QA' });
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      if (route === '/users/me/billing-details') return reply({ details: null });
      if (/^\/(users\/me\/(saved-events|hidden-categories|tickets|orders)|promotions\/active|friends|friends\/requests|feed|dashboard\/ticket-validation\/events)$/.test(route) || route.endsWith('/attendees') || route.endsWith('/updates')) return reply([]);
      qa.unexpected.push({ route, method }); return reply([]);
    };
    qa.visibleBar = () => Array.from(document.querySelectorAll('[data-testid="tab-bar"]')).reverse().find(node => {
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && node.contains(document.elementFromPoint(r.right - 30, r.y + r.height / 2));
    });
    qa.remember = () => {
      qa.bar = qa.visibleBar(); qa.indicator = qa.bar?.querySelector('[data-testid="tab-indicator"]');
      qa.startX = qa.indicator?.getBoundingClientRect().x - qa.bar?.getBoundingClientRect().x;
      qa.samples = []; qa.recording = true;
      const tick = () => { if (!qa.recording) return; qa.samples.push(qa.read()); qa.frame = requestAnimationFrame(tick); };
      tick();
    };
    qa.read = () => {
      const bar = qa.bar, indicator = qa.indicator, r = bar?.getBoundingClientRect();
      const connected = !!bar?.isConnected && !!indicator?.isConnected;
      return { t: performance.now(), connected, sameIndicator: bar?.querySelector('[data-testid="tab-indicator"]') === indicator, x: connected ? indicator.getBoundingClientRect().x - r.x : null, exposed: connected && bar.contains(document.elementFromPoint(r.right - 30, r.y + r.height / 2)), selected: bar?.querySelector('[aria-selected="true"]')?.dataset.testid, path: location.pathname };
    };
    qa.stop = () => { qa.recording = false; cancelAnimationFrame(qa.frame); qa.samples.push(qa.read()); return qa.samples; };
  }.toString()})();` });
  const failures = [], results = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  const inspect = async (label, covered) => {
    const state = await evaluate('window.__sheetNavbarQA.read()');
    check(state.connected, label + ': original navbar and indicator stay connected');
    check(state.sameIndicator, label + ': original indicator is not replaced');
    if (covered) check(!state.exposed, label + ': backdrop/content covers the background navbar');
    results.push({ label, state }); await capture('navbar-sheets-' + label);
  };
  const finish = async (label, active) => {
    const samples = await evaluate('window.__sheetNavbarQA.stop()');
    check(samples.length > 6, label + ': observe animation frames');
    check(samples.every(sample => sample.connected && sample.sameIndicator), label + ': no unmount during open/close transition');
    check(samples.filter(sample => sample.connected).every(sample => Math.abs(sample.x - samples[0].x) < 1), label + ': indicator never resets or jumps under the overlay');
    check(await evaluate('window.__sheetNavbarQA.visibleBar() === window.__sheetNavbarQA.bar'), label + ': original navbar is visible after dismiss');
    check(samples.at(-1)?.selected === 'tab-' + active, label + ': preserve selected ' + active + ' tab');
    results.push({ label, samples }); console.log(label, JSON.stringify({ frames: samples.length, disconnectedFrames: samples.filter(s => !s.connected).length }));
  };
  await call('Page.navigate', { url: base });
  await until(`window.__sheetNavbarQA?.me && window.__sheetNavbarQA.visibleBar() && document.body.innerText.toLowerCase().includes('navbar sheet qa')`); await delay(450);
  await evaluate(`window.__sheetNavbarQA.home=document.querySelector('[data-testid="home-list"]'); window.__sheetNavbarQA.remember(); true`);
  await evaluate(`Array.from(document.querySelectorAll('[role=button]')).find(el=>el.getAttribute('aria-label')?.toLowerCase().includes('navbar sheet qa')).click()`);
  await until(`document.querySelector('[data-testid="event-content"]')`); await delay(650);
  await inspect('event-open', true);
  await evaluate(`window.__sheetNavbarQA.event=document.querySelector('[data-testid="event-sheet"]'); document.querySelector('[data-testid="event-content"]').scrollTop=220; true`);
  await click('event-continue'); await until(`document.querySelector('[data-testid="checkout-screen"]')`); await delay(500);
  await inspect('checkout-open', true);
  await click('checkout-close'); await until(`!document.querySelector('[data-testid="checkout-screen"]')`); await delay(650);
  await inspect('checkout-return', true);
  check(await evaluate(`window.__sheetNavbarQA.event === document.querySelector('[data-testid="event-sheet"]')`), 'Checkout return retains the original event sheet');
  check(await evaluate(`document.querySelector('[data-testid="event-content"]').scrollTop === 220`), 'Checkout return preserves event sheet scroll');
  await click('sheet-handle'); await until(`!document.querySelector('[data-testid="event-sheet"]')`); await delay(650);
  await inspect('event-dismissed', false); await finish('event-checkout-round-trip', 'Home');
  check(await evaluate(`window.__sheetNavbarQA.home === document.querySelector('[data-testid="home-list"]')`), 'Event/checkout round trip retains Home component');

  await click('tab-Feed'); await until(`document.querySelector('[data-testid="feed-friends"]')`); await delay(450);
  await evaluate('window.__sheetNavbarQA.remember()'); await click('feed-friends');
  await until(`document.querySelector('[data-testid="friends-sheet"]')`); await delay(650);
  await inspect('friends-open', true); await click('sheet-handle'); await until(`!document.querySelector('[data-testid="friends-sheet"]')`); await delay(650);
  await finish('friends-round-trip', 'Feed');

  await click('tab-Profile'); await until(`document.querySelector('[data-testid="profile-list"]')`); await delay(450);
  await evaluate('window.__sheetNavbarQA.remember()');
  await evaluate(`Array.from(document.querySelectorAll('[role=button]')).find(el=>el.textContent.trim()==='My code').click()`);
  await until(`document.querySelector('[data-testid="quick-connect-sheet"]')`); await delay(650);
  await inspect('quick-connect-open', true); await click('sheet-handle'); await until(`!document.querySelector('[data-testid="quick-connect-sheet"]')`); await delay(650);
  await finish('quick-connect-round-trip', 'Profile');
  check((await evaluate('window.__sheetNavbarQA.unexpected')).length === 0, 'All sheet API requests are covered by explicit fixtures');
  check((await evaluate('window.__sheetNavbarQA.writes')).length === 0, 'Navigation never mutates accounts, tickets or events');
  fs.writeFileSync(path.join(__dirname, '../artifacts/navbar-sheets-motion.json'), JSON.stringify({ results, failures }, null, 2));
  assert.deepEqual(errors, [], 'No browser runtime errors');
  assert.deepEqual(failures, [], 'Background navbar remains mounted through overlays');
  console.log('PASS Event/checkout, Friends and Quick Connect preserve navbar/indicator without overlaying sheets');
}).catch(error => { console.error(error); process.exitCode = 1; });
