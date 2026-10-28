// Isolated production web bundle + fake API; never sends a remote push.
const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
withBrowser(async ({ base, call, evaluate, until, click, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = fetch.bind(window), id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
    const user = { id: id(100), username: 'QA', role: 'user', email: 'qa@example.test', hasPassword: true, preferredLanguage: new URL(location.href).searchParams.get('lang') || 'en' };
    localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'notifications-qa-only', user }));
    const item = (n, type, read = false) => ({ id: id(n), type, title: 'Server title', body: 'A notification', actorId: id(101), actorUsername: 'Alex', eventId: type === 'friend_request' ? undefined : id(10), createdAt: new Date().toISOString(), isRead: read });
    const qa = window.__qa = { items: [item(1, 'friend_request'), item(2, 'ticket_purchased'), item(3, 'organizer_event', true)], count: 9, calls: [], fail: false, hold: false, release: null };
    window.fetch = async (input, options = {}) => {
      const url = new URL(String(input), location.origin), route = url.pathname.split('/api/v1')[1];
      if (!route) { if (url.origin === location.origin) return original(input, options); throw Error('External request blocked'); }
      qa.calls.push(route);
      const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      if (route === '/wardrobe/mine') return reply({ deposits: [], staffAccess: false });
      if (route === '/diagnostics/errors') return new Response(null, { status: 204 });
      if (route === '/users/me') return reply(user);
      if (route === '/notifications') return reply({ items: qa.items, unreadCount: qa.count });
      if (route === '/notifications/read-all') {
        if (qa.fail) return reply({}, 503);
        if (qa.hold) await new Promise(resolve => { qa.release = resolve; });
        qa.items.forEach(row => { row.isRead = true; });
        qa.items.unshift(item(4, 'friend_request')); qa.count = 1;
        return reply({ success: true });
      }
      if (route.startsWith('/notifications/') && route.endsWith('/read')) {
        const row = qa.items.find(row => route.includes(row.id)); if (row && !row.isRead) { row.isRead = true; qa.count--; }
        return reply({ success: true });
      }
      return reply([]);
    };
  }.toString()})();` });
  const panel = `document.querySelector('[data-testid="notifications-panel"]')`;
  await call('Page.navigate', { url: base });
  await click('home-notifications');
  await until(`${panel}?.textContent.includes('Alex sent you a friend request.')`);
  assert.ok(await evaluate(`${panel}.textContent.includes('9 unread')`));
  await evaluate('window.__qa.fail=true'); await click('notifications-read-all');
  await until(`${panel}.textContent.includes("The change couldn't be saved.")`);
  assert.equal(await evaluate('window.__qa.count'), 9);
  await evaluate(`window.__qa.fail=false;window.__qa.hold=true;document.querySelector('[data-testid="notifications-read-all"]').click();document.querySelector('[data-testid="notifications-read-all"]').click()`);
  await until('window.__qa.release');
  assert.equal(await evaluate(`window.__qa.calls.filter(path=>path==='/notifications/read-all').length`), 2, 'One failed request and one double-tap request');
  await evaluate('window.__qa.hold=false;window.__qa.release()');
  await until(`${panel}.textContent.includes('1 unread')`);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="notification-unread"]')`), true, 'Arrival during mark-all remains unread');
  await delay(250); await capture('notifications-new-mobile');
  await click('notification-' + id(2)); await until(`location.pathname==='/users/me/tickets'`);
  await click('account-back'); await click('tab-Home'); await click('home-notifications');
  await click('notification-' + id(4)); await until(`location.pathname==='/users/${id(101)}'`);
  await evaluate('history.back()'); await until(`document.querySelector('[data-testid="home-notifications"]')`);
  await evaluate('window.__qa.items=[];window.__qa.count=0');
  await click('home-notifications'); await until(`${panel}?.textContent.includes('No notifications yet.')`);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="notifications-read-all"]')`), false);
  await click('notifications-close'); await click('home-search'); await until(`location.pathname==='/search'`);
  for (const [width, height, language, name] of [[1280, 900, 'en', 'desktop'], [320, 568, 'ro', 'small-ro']]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await call('Page.navigate', { url: base + '?lang=' + language }); await click('home-notifications');
    await until(`${panel}?.textContent.includes(${JSON.stringify(language === 'ro' ? 'Alex ți-a trimis' : 'Alex sent you')})`);
    const bounds = await evaluate(`{const r=${panel}.getBoundingClientRect();({left:r.left,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight})}`);
    assert.ok(bounds.left >= 0 && bounds.right <= bounds.width + 1 && bounds.bottom <= bounds.height + 1, JSON.stringify(bounds));
    await delay(250); await capture('notifications-new-' + name);
  }
  assert.deepEqual(errors, []);
  console.log('PASS notifications: localized copy, fresh opening, mark-all errors/double-taps/concurrent arrivals, ticket/profile navigation, immediate backdrop release and responsive layouts');
}).catch(error => { console.error(error); process.exitCode = 1; });
