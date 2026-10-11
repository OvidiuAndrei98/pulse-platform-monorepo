// Regression for role-specific Profile destinations and animation continuity.
// Every request uses isolated fixtures; no real account or event is changed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withBrowser } = require('./browser-harness.cjs');

withBrowser(async ({ base, call, evaluate, until, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function bootstrap() {
    const originalFetch = window.fetch.bind(window);
    const id = number => '00000000-0000-4000-8000-' + String(number).padStart(12, '0');
    const role = new URL(location.href).searchParams.get('role') || 'organizer';
    const user = { id: id(1), username: 'Navbar QA', email: 'navbar@example.test', role, preferredLanguage: 'en', hasPassword: true, createdAt: '2026-01-01T00:00:00Z' };
    localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'navbar-role-fixture-only', user }));
    const qa = window.__navbarQA = { user, requests: [], writes: [], unexpected: [], me: false, samples: [], recording: false, frame: 0 };
    const event = { id: id(10), organizerId: user.id, title: 'Navbar fixture event', status: 'published', category: 'TECHNO', locationName: 'QA Club', city: 'Bucuresti', description: 'A fixture event used only by isolated navigation tests.', startTime: '2035-10-15T18:00:00Z', endTime: '2035-10-16T06:00:00Z', latitude: 44.432, longitude: 26.106, ticketTypes: [], lineup: [] };
    const profile = { userId: user.id, companyName: 'Navbar QA SRL', cui: 'RO123456', fiscalAddress: 'QA Address', verificationStatus: 'approved', isVerified: true, stripeChargesEnabled: true, stripePayoutsEnabled: true };
    window.fetch = async (url, options = {}) => {
      const parsed = new URL(String(url), location.href);
      if (!parsed.pathname.includes('/api/v1/')) {
        if (parsed.origin === location.origin) return originalFetch(url, options);
        throw new Error('Unexpected external fetch in isolated navbar regression');
      }
      const route = parsed.pathname.split('/api/v1')[1], method = options.method || 'GET';
      qa.requests.push({ route, method });
      if (method !== 'GET') qa.writes.push({ route, method });
      const reply = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
      if (route === '/users/me') {
        if (new URL(location.href).searchParams.has('pending')) await new Promise(resolve => { qa.resolveMe = resolve; });
        qa.me = true; return reply(user);
      }
      if (route === '/events' || route === '/dashboard/events') return reply([event]);
      if (route === '/events/' + event.id) return reply(event);
      if (route.startsWith('/dashboard/organizer/profile/') || route === '/dashboard/stripe/status') return reply(profile);
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      if (route.endsWith('/social')) return reply({ goingCount: 0, interestedCount: 0 });
      if (route === '/users/me/billing-details') return reply({ details: null });
      if (/^\/(users\/me\/(saved-events|hidden-categories|tickets|orders)|promotions\/active|friends|friends\/requests|feed|profiles\/search|dashboard\/ticket-validation\/events)$/.test(route) || route.endsWith('/attendees') || route.endsWith('/updates')) return reply([]);
      qa.unexpected.push({ route, method }); return reply([]);
    };
    const ids = new WeakMap(); let nextId = 0;
    const nodeId = node => { if (!ids.has(node)) ids.set(node, ++nextId); return ids.get(node); };
    const visible = node => {
      if (!node) return false;
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight && getComputedStyle(node).visibility !== 'hidden';
    };
    qa.visible = testID => Array.from(document.querySelectorAll('[data-testid="' + testID + '"]')).some(node => {
      if (!visible(node)) return false;
      const r = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(Math.max(1, r.x) + Math.min(24, r.width / 2), Math.max(1, r.y) + Math.min(36, r.height / 2)));
    });
    qa.bar = () => Array.from(document.querySelectorAll('[data-testid="tab-bar"]')).reverse().find(node => {
      if (!visible(node)) return false;
      const r = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(r.right - 30, r.y + r.height / 2));
    });
    qa.read = () => {
      const bar = qa.bar(), indicator = bar?.querySelector('[data-testid="tab-indicator"]');
      if (!bar || !indicator) return { t: performance.now(), missing: true, path: location.pathname };
      const r = indicator.getBoundingClientRect(), b = bar.getBoundingClientRect();
      return { t: performance.now(), x: r.x - b.x, width: r.width, node: nodeId(indicator), path: location.pathname, dashboard: qa.visible('organizer-dashboard'), profile: qa.visible('profile-list'), selected: bar.querySelector('[aria-selected="true"]')?.dataset.testid };
    };
    qa.start = () => {
      cancelAnimationFrame(qa.frame); qa.samples = [qa.read()]; qa.recording = true;
      const tick = () => { if (!qa.recording) return; qa.samples.push(qa.read()); qa.frame = requestAnimationFrame(tick); };
      qa.frame = requestAnimationFrame(tick);
    };
    qa.stop = () => { qa.recording = false; cancelAnimationFrame(qa.frame); qa.samples.push(qa.read()); return qa.samples; };
  }.toString()})();` });

  const results = [], failures = [];
  const open = async url => {
    await call('Page.navigate', { url: base + url });
    await until('window.__navbarQA?.me && window.__navbarQA.bar()');
    await delay(500);
  };
  const press = async name => {
    const point = await evaluate(`{const el=window.__navbarQA.bar().querySelector('[data-testid="tab-${name}"]'),r=el.getBoundingClientRect();({x:r.x+r.width/2,y:r.y+r.height/2})}`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  };
  const check = (condition, message) => { if (!condition) failures.push(message); };
  const analyze = (label, samples, expectedTab) => {
    const present = samples.filter(sample => !sample.missing), first = present[0], last = present.at(-1);
    check(samples.length >= 6, label + ': record enough animation frames');
    check(present.length === samples.length, label + ': navbar must remain visible throughout route transition');
    // Separate native stack scenes own their own navbar views, so modals cover
    // them correctly. They share motion state: judge visual continuity below,
    // not DOM identity between Home and Dashboard. Sheet DOM identity is tested
    // separately in browser-navbar-sheets.cjs.
    check(last?.selected === 'tab-' + expectedTab, label + ': final active icon is ' + expectedTab);
    const distance = Math.abs((last?.x ?? 0) - (first?.x ?? 0));
    if (distance > 30) {
      const low = Math.min(first.x, last.x), high = Math.max(first.x, last.x);
      const intermediate = present.filter(sample => sample.x > low + 4 && sample.x < high - 4);
      check(intermediate.length >= 3, label + ': indicator traverses intermediate positions, not an immediate jump');
      for (let index = 1; index < present.length; index++) {
        const previous = present[index - 1], current = present[index], dt = current.t - previous.t;
        const limit = Math.max(48, distance * Math.min(0.9, 4 * dt / 320));
        check(Math.abs(current.x - previous.x) <= limit, label + ': no discontinuity across route boundary (' + Math.round(Math.abs(current.x - previous.x)) + 'px in ' + Math.round(dt) + 'ms)');
      }
    }
    results.push({ label, samples, intermediateFrames: distance > 30 ? present.filter(sample => sample.x > Math.min(first.x, last.x) + 4 && sample.x < Math.max(first.x, last.x) - 4).length : null });
  };
  const transition = async (label, target, expectedPage) => {
    await evaluate('window.__navbarQA.start()'); await press(target); await delay(550);
    const samples = await evaluate('window.__navbarQA.stop()');
    analyze(label, samples, target);
    check(await evaluate(`window.__navbarQA.visible(${JSON.stringify(expectedPage)})`), label + ': expected destination ' + expectedPage);
    await capture('organizer-navbar-' + label);
    console.log(label, JSON.stringify({ start: samples[0], end: samples.at(-1), distinctNodes: [...new Set(samples.filter(s=>!s.missing).map(s=>s.node))], frames: samples.length }));
  };

  await open('/?role=organizer');
  await evaluate(`window.__navbarQA.home=document.querySelector('[data-testid="home-list"]'); true`);
  await transition('cold-organizer-profile', 'Profile', 'organizer-dashboard');
  check(!(await evaluate(`window.__navbarQA.visible('profile-list')`)), 'Cold organizer Profile must not show ordinary account page');
  await transition('dashboard-restores-home', 'Home', 'home-list');
  check(await evaluate(`window.__navbarQA.home===document.querySelector('[data-testid="home-list"]')`), 'Dashboard round trip preserves the original Home component');

  await call('Page.navigate', { url: base + '/?role=organizer&pending=1' });
  await until('window.__navbarQA?.resolveMe && window.__navbarQA.bar()'); await delay(100);
  await evaluate('window.__navbarQA.start()'); await press('Profile'); await delay(75);
  await evaluate('window.__navbarQA.resolveMe()'); await until('window.__navbarQA.me'); await delay(650);
  const hydration = await evaluate('window.__navbarQA.stop()'); analyze('profile-before-session-hydrates', hydration, 'Profile');
  check(await evaluate(`window.__navbarQA.visible('organizer-dashboard')`), 'Profile pressed while session is loading resolves to organizer dashboard');
  check(!await evaluate(`window.__navbarQA.visible('profile-list')`), 'Hydrated organizer does not remain on consumer profile after early tap');
  console.log('profile-before-session-hydrates', JSON.stringify(hydration.at(-1)));
  await capture('organizer-navbar-session-hydration');

  await call('Page.navigate', { url: base + '/?role=organizer&pending=1' });
  await until('window.__navbarQA?.resolveMe && window.__navbarQA.bar()'); await delay(100);
  await press('Profile'); await delay(35); await press('Home'); await evaluate('window.__navbarQA.resolveMe()'); await until('window.__navbarQA.me'); await delay(600);
  check(await evaluate(`window.__navbarQA.bar()?.querySelector('[aria-selected="true"]')?.dataset.testid==='tab-Home' && window.__navbarQA.visible('home-list')`), 'Home tapped during hydration cancels the earlier pending Profile intent');
  check(!await evaluate(`window.__navbarQA.visible('organizer-dashboard')`), 'Late account resolution does not override the latest Home tap');

  // A direct dashboard URL must behave the same as a dashboard opened from Home.
  await open('/dashboard?role=organizer'); await until(`window.__navbarQA.visible('organizer-dashboard')`);
  await transition('dashboard-to-home', 'Home', 'home-list');
  await transition('home-back-to-dashboard', 'Profile', 'organizer-dashboard');
  await transition('dashboard-to-feed', 'Feed', 'feed-list');
  await transition('feed-back-to-dashboard', 'Profile', 'organizer-dashboard');

  // Interrupt the running animation in both directions; last contact wins.
  await transition('dashboard-before-interruption', 'Home', 'home-list');
  await evaluate('window.__navbarQA.start()');
  await press('Profile'); await delay(75); await press('Feed'); await delay(55); await press('Home'); await delay(55); await press('Profile'); await delay(600);
  const rapid = await evaluate('window.__navbarQA.stop()'); analyze('rapid-role-route-interruptions', rapid, 'Profile');
  check(await evaluate(`window.__navbarQA.visible('organizer-dashboard')`), 'Rapid taps end on organizer dashboard');
  check(!await evaluate(`window.__navbarQA.visible('auth-screen')`), 'Rapid organizer tabs never open Auth');
  await capture('organizer-navbar-rapid-interruptions');
  check((await evaluate('window.__navbarQA.writes')).length === 0, 'Navbar navigation must never mutate account or event data');
  check((await evaluate('window.__navbarQA.unexpected')).length === 0, 'Organizer navbar fixtures cover all API requests');

  // Explicit ticket/account links are intentional consumer-stack destinations,
  // even for organizers. Only the bottom Profile tab routes to Dashboard.
  await open('/users/me/tickets?role=organizer'); await until(`window.__navbarQA.visible('tickets-page')`);
  check(await evaluate(`window.__navbarQA.bar()?.querySelector('[aria-selected="true"]')?.dataset.testid==='tab-Profile'`), 'Organizer ticket deep link keeps Profile highlighted');
  await evaluate(`document.querySelector('[data-testid="account-back"]').click()`);
  await until(`window.__navbarQA.visible('profile-list')`);
  check(!await evaluate(`window.__navbarQA.visible('organizer-dashboard')`), 'Account Back keeps the intentional Profile destination');
  await transition('organizer-account-profile-to-dashboard', 'Profile', 'organizer-dashboard');

  await open('/?role=user');
  await transition('ordinary-user-profile', 'Profile', 'profile-list');
  check(!await evaluate(`window.__navbarQA.visible('organizer-dashboard')`), 'Ordinary user still opens the consumer profile');
  await transition('ordinary-user-home', 'Home', 'home-list');
  await transition('ordinary-user-profile-again', 'Profile', 'profile-list');
  check((await evaluate('window.__navbarQA.unexpected')).length === 0, 'Ordinary account fixtures cover all API requests');
  check((await evaluate('window.__navbarQA.writes')).length === 0, 'Ordinary navigation has no mutation side effects');
  fs.writeFileSync(path.join(__dirname, '../artifacts/organizer-navbar-motion.json'), JSON.stringify({ results, failures }, null, 2));
  assert.deepEqual(errors, [], 'No unhandled browser exceptions');
  assert.deepEqual(failures, [], 'Role-aware navbar routing and animation regressions');
  console.log('PASS cold organizer destination, dashboard tab returns, interruptible indicator motion and ordinary user behavior');
}).catch(error => { console.error(error); process.exitCode = 1; });
