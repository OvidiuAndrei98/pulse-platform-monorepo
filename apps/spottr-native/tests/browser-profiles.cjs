// Real production UI, isolated browser, entirely simulated API and accounts.
const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

withBrowser(async ({ base, call, evaluate, until, click, input, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = window.fetch.bind(window), id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const fixture = new URL(location.href).searchParams.get('fixture');
    const qa = window.__qa = { requests: [], writes: [], failFollow: false, failProfile: fixture === 'failure', followDelay: 150, relationship: 'none', follows: false, profileSearches: [], profileDelay: 0 };
    const user = { id: id(999), username: 'Native QA', email: 'qa@example.test', role: 'user', hasPassword: true, preferredLanguage: 'en', createdAt: '2026-10-07T12:00:00Z' };
    qa.user = user;
    qa.organizer = (authorized) => ({ id: id(2), username: 'spottr_club', role: 'organizer', organizerName: 'SPOTTR Club', organizerVerified: true,
      bio: fixture === 'long' ? 'Nights to remember. Music, friends and dance. '.repeat(80) : 'Nights to remember.\nMusic, friends and dance.', relationship: authorized && qa.user.id === id(2) ? 'self' : 'none', followsOrganizer: authorized && qa.follows, followerCount: 120 + Number(qa.follows), eventCount: 12, ticketsSoldCount: 2460 });
    qa.person = () => ({ id: id(3), username: 'Alex', role: 'user', relationship: qa.relationship, bio: 'House & techno.' });
    const event = (n, title, start, end) => ({ id: id(n), organizerId: id(2), title, category: 'TECHNO', locationName: 'Club QA', city: 'Bucuresti', description: 'Native profile QA event.',
      bannerUrl: location.origin + '/assets/assets/party-event.9ff7ef76614a79d5a475f57bf9f48fdb.webp', startTime: start, endTime: end,
      ticketTypes: [{ id: id(50), name: 'General', priceRon: 50, capacity: 500, ticketsSold: 10, startSales: '2020-01-01T00:00Z', endSales: '2035-10-10T23:00Z' }], lineup: [] });
    const events = [event(10, 'Next night', '2035-10-11T21:00Z', '2035-10-12T06:00Z'), event(11, 'First night', '2035-10-10T21:00Z', '2035-10-11T06:00Z'), event(12, 'Past night', '2025-10-10T21:00Z', '2025-10-11T06:00Z')];
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { qa.copied = value; } } });
    window.fetch = async (url, options = {}) => {
      if (!String(url).includes('/api/v1/')) return original(url, options);
      const parsed = new URL(url, location.origin), route = parsed.pathname.split('/api/v1')[1], method = options.method || 'GET', auth = new Headers(options.headers).has('authorization');
      const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
      if (route === '/wardrobe/mine') return reply({ deposits: [], staffAccess: false });
      if (route === '/diagnostics/errors') return new Response(null, { status: 204 });
      qa.requests.push({ route, method, query: parsed.search, auth });
      if (method !== 'GET') qa.writes.push({ route, method, body: options.body });
      if (route === '/auth/login') return reply({ token: 'profile-qa-only' });
      if (route === '/users/me') return reply(qa.user);
      if (route === '/profiles/search') {
        const q = parsed.searchParams.get('q'); qa.profileSearches.push(q);
        if (q === 'slow') { await new Promise(resolve => setTimeout(resolve, 900)); return reply([qa.person()]); }
        if (q === 'empty') return reply([]);
        return reply([qa.organizer(auth), qa.person()]);
      }
      if (route.startsWith('/profiles/')) {
        if (qa.profileDelay) await new Promise(resolve => setTimeout(resolve, qa.profileDelay));
        if (qa.failProfile) return reply({}, 503);
        return route.endsWith(id(2)) ? reply(qa.organizer(auth)) : route.endsWith(id(3)) ? reply(qa.person()) : reply({}, 404);
      }
      if (route.endsWith('/follow')) {
        const fail = qa.failFollow; await new Promise(resolve => setTimeout(resolve, qa.followDelay));
        if (fail) return reply({}, 503);
        qa.follows = method === 'POST'; return reply({ followsOrganizer: qa.follows });
      }
      if (route === '/friends/request/' + id(3)) { qa.relationship = method === 'PUT' || qa.relationship === 'pending_received' ? 'friends' : 'pending_sent'; return reply({ relationship: qa.relationship }); }
      if (route === '/friends/' + id(3) && method === 'DELETE') { qa.relationship = 'none'; return reply({ relationship: 'none' }); }
      if (route.endsWith('/updates')) return reply(route.startsWith('/organizers/') ? [{ id: id(70), eventId: id(11), organizerId: id(2), eventTitle: 'First night', caption: 'See you tonight', imageUrl: events[0].bannerUrl, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() }] : []);
      if (route.endsWith('/social')) return reply({ goingCount: 2, interestedCount: 1 });
      if (route === '/events') return reply(fixture === 'empty' ? [] : events);
      if (route.startsWith('/events/')) return reply(events.find(event => route === '/events/' + event.id) || events[0]);
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      return reply([]);
    };
  }.toString()})();` });
  const open = async path => { await call('Page.navigate', { url: base + path }); };
  const screen = '[data-testid="public-profile-screen"]';
  const pressProfileTab = async name => { await evaluate(`document.querySelector('${screen} [data-testid="tab-${name}"]').click()`); };
  await open('/users/' + id(2)); await until(`document.querySelector('[data-testid="organizer-info"]')`);
  await until(`document.querySelector('${screen} [data-testid="tab-Profile"][aria-selected="true"]')`);
  assert.match(await evaluate(`document.querySelector('[data-testid="public-profile-action"]').textContent`), /Sign in/);
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[data-testid="organizer-upcoming-rail"] [role=button]')).map(node=>node.getAttribute('aria-label'))`), ['First night', 'Next night']);
  assert.ok(await evaluate(`document.querySelector('[data-testid="organizer-past"]').textContent.includes('Past night')`));
  await click('public-profile-share'); assert.match(await evaluate('window.__qa.copied'), /\/users\/00000000-0000-4000-8000-000000000002$/);
  await capture('organizer-profile-mobile');
  await click('organizer-info'); await until(`document.querySelector('[data-testid="organizer-info-sheet"]')`); await delay(700);
  assert.ok(await evaluate(`document.querySelector('[data-testid="organizer-info-sheet"] [data-testid="sheet-handle"]').getBoundingClientRect().top > innerHeight * .25`), 'Short Info content should fit its content instead of opening to90%');
  await capture('organizer-profile-info');
  assert.ok(await evaluate(`document.querySelector('[data-testid="organizer-info-sheet"]').textContent.includes('2,460')`));
  await click('sheet-handle'); await until(`!document.querySelector('[data-testid="organizer-info-sheet"]')`);
  await click('public-profile-action'); await until(`document.querySelector('[data-testid="auth-screen"]')`);
  await click('auth-back'); await until(`!document.querySelector('[data-testid="auth-screen"]')`);
  await click('public-profile-action'); await click('auth-email-choice'); await input('auth-email', 'qa@example.test'); await input('auth-password', 'test-password'); await click('auth-submit');
  await until(`document.querySelector('[data-testid="public-profile-action"]')?.textContent==='Follow'`);
  await evaluate('window.__qa.failFollow=true'); await click('public-profile-action');
  await until(`document.querySelector('[data-testid="public-profile-action-error"]')`);
  assert.equal(await evaluate(`document.querySelector('[data-testid="public-profile-action"]').textContent`), 'Follow');
  assert.ok(await evaluate(`document.querySelector('[data-testid="organizer-stats"]').textContent.includes('120')`));
  await evaluate('window.__qa.failFollow=false;window.__qa.writes=[]');
  await evaluate(`document.querySelector('[data-testid="public-profile-action"]').click();document.querySelector('[data-testid="public-profile-action"]').click()`);
  await until(`window.__qa.follows && document.querySelector('[data-testid="public-profile-action"]')?.textContent==='Following' && document.querySelector('[data-testid="public-profile-action"]')?.getAttribute('aria-disabled')!=='true'`);
  assert.equal(await evaluate(`window.__qa.writes.filter(item=>item.route.endsWith('/follow')).length`), 1);
  await click('public-profile-action'); await until(`document.querySelector('[data-testid="public-profile-action"]')?.textContent==='Follow'`);
  console.log('PASS organizer layout, event ordering, Info dismissal, share fallback, auth return, follow rollback and duplicate tap');
  await evaluate(`document.querySelector('[data-testid="public-profile-scroll"]').scrollTop=260;window.__org=document.querySelector('[data-testid="public-profile-screen"]');window.__scroll=document.querySelector('[data-testid="public-profile-scroll"]');document.querySelector('[data-testid="organizer-upcoming-rail"] [role=button]').click()`);
  await until(`document.querySelector('[data-testid="event-continue"]')`); await delay(600);
  await click('event-continue'); await until(`document.querySelector('[data-testid="checkout-screen"]')`);
  await click('checkout-close'); await until(`!document.querySelector('[data-testid="checkout-screen"]')`); await delay(500);
  await click('sheet-handle'); await until(`!document.querySelector('[data-testid="event-sheet"]')`);
  assert.equal(await evaluate(`window.__org===document.querySelector('[data-testid="public-profile-screen"]') && window.__scroll.scrollTop===260`), true);
  // The highlighted Profile tab still navigates to the current user's account.
  await pressProfileTab('Profile'); await until(`!document.querySelector('[data-testid="public-profile-screen"]')`);
  await until(`document.body.innerText.includes('Native QA')`);
  console.log('PASS organizer → event drawer → checkout → return preserves mounted profile/scroll; selected navbar tab opens own profile');
  await open('/users/' + id(3)); await until(`document.querySelector('[data-testid="public-profile-action"]')?.textContent==='Add friend'`);
  await click('public-profile-action'); await until(`document.querySelector('[data-testid="public-profile-action"]')?.textContent==='Request sent'`);
  assert.equal(await evaluate(`document.querySelector('[data-testid="public-profile-action"]').getAttribute('aria-disabled')`), 'true');
  await pressProfileTab('Home'); await until(`!document.querySelector('[data-testid="public-profile-screen"]')`);
  await click('home-search'); await input('event-search', 'slow'); await until(`window.__qa.profileSearches.includes('slow')`);
  await input('event-search', 'club'); await until(`document.querySelector('[data-testid="search-profile-${id(2)}"]')`); await delay(1000);
  assert.ok(await evaluate(`!!document.querySelector('[data-testid="search-profile-${id(2)}"]')`));
  await evaluate(`window.__qa.relationship='pending_received'`); await click('search-profile-' + id(3));
  await until(`document.querySelector('[data-testid="public-profile-action"]')?.textContent==='Accept'`);
  await click('public-profile-action'); await until(`document.querySelector('[data-testid="public-profile-action"]')?.textContent==='Remove friend'`);
  await click('public-profile-action'); await until(`document.querySelector('[data-testid="public-profile-action"]')?.textContent==='Add friend'`);
  await capture('public-user-profile');
  console.log('PASS friend request/pending/accept/remove and late old search cannot replace new results');
  await pressProfileTab('Home'); await until(`!document.querySelector('[data-testid="public-profile-screen"]')`);
  await evaluate(`Array.from(document.querySelectorAll('[data-testid="home-list"] [role=button]')).find(el=>el.getAttribute('aria-label')==='First night').click()`);
  await until(`document.querySelector('[data-testid="event-content"]')`); await delay(600);
  await evaluate(`document.querySelector('[data-testid="event-content"]').scrollTop=120;window.__originalSheet=document.querySelector('[data-testid="event-sheet"]');Array.from(document.querySelectorAll('[data-testid="event-sheet"] [role=button]')).find(el=>el.textContent.includes('SPOTTR Club')).click()`);
  await until(`document.querySelector('[data-testid="organizer-info"]')`);
  // The profile header can render before the separate organizer-events request.
  await until(`document.querySelector('[data-testid="organizer-upcoming-rail"] [role=button]')`);
  await evaluate(`document.querySelector('[data-testid="organizer-upcoming-rail"] [role=button]').click()`);
  await until(`document.querySelectorAll('[data-testid="event-sheet"]').length===2`); await delay(600);
  await evaluate(`Array.from(document.querySelectorAll('[data-testid="event-continue"]')).at(-1).click()`);
  await until(`document.querySelector('[data-testid="checkout-screen"]')`); await click('checkout-close'); await until(`!document.querySelector('[data-testid="checkout-screen"]')`); await delay(500);
  await evaluate(`Array.from(document.querySelectorAll('[data-testid="sheet-handle"]')).at(-1).click()`); await until(`document.querySelectorAll('[data-testid="event-sheet"]').length===1`);
  await click('public-profile-back'); await until(`!document.querySelector('[data-testid="public-profile-screen"]')`);
  assert.equal(await evaluate(`window.__originalSheet===document.querySelector('[data-testid="event-sheet"]')`), true);
  console.log('PASS Home event → organizer → second event → checkout → back restores each layer');
  await open('/users/not-valid'); await until(`document.body.innerText.includes('unavailable')`);
  assert.equal(await evaluate(`window.__qa.requests.some(item=>item.route==='/profiles/not-valid')`), false);
  await click('public-profile-back'); await until(`!document.querySelector('[data-testid="public-profile-screen"]')`);
  await open('/users/' + id(2) + '?fixture=failure');
  await until(`document.body.innerText.includes("couldn't load")`);
  await evaluate(`window.__qa.failProfile=false;Array.from(document.querySelectorAll('${screen} [role=button]')).find(el=>el.textContent==='Try again').click()`);
  await until(`document.querySelector('[data-testid="organizer-info"]')`);
  await open('/users/' + id(2) + '?fixture=empty'); await until(`document.body.innerText.includes('No upcoming')`);
  assert.ok(await evaluate(`document.querySelector('[data-testid="organizer-stats"]').textContent.includes('2,460')`), 'Stats must not be derived from empty event rails');
  await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 1, mobile: true });
  await open('/users/' + id(2) + '?fixture=long'); await until(`document.querySelector('[data-testid="organizer-info"]')`); await click('organizer-info'); await delay(800);
  assert.ok(await evaluate(`document.querySelector('[data-testid="organizer-info-sheet"] [data-testid="sheet-handle"]').getBoundingClientRect().top >= innerHeight * .09`), 'Long Info must stay within its90% maximum');
  assert.ok(await evaluate(`{const el=document.querySelector('[data-testid="organizer-info-content"]');el.scrollHeight>el.clientHeight}`), 'Long bio stays readable by scrolling');
  await capture('organizer-info-small-phone'); await click('sheet-handle'); await until(`!document.querySelector('[data-testid="organizer-info-sheet"]')`);
  console.log('PASS profile retry/empty states, independent stats, content-fit Info and small-screen long biography');
  assert.deepEqual(errors, []);
  console.log('PASS invalid links have an exit, no invalid API call and no browser exceptions');
}).catch(error => { console.error(error); process.exitCode = 1; });
