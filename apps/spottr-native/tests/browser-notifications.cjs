// Isolated production web bundle + fake API; never sends a remote push.
const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
withBrowser(async ({ base, call, evaluate, until, delay, capture, errors }) => {
  const click = async id => {
    const point = `(()=>{for(const el of [...document.querySelectorAll('[data-testid="${id}"]')].reverse()){const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(r.width&&r.height&&x>=0&&x<innerWidth&&y>=0&&y<innerHeight&&el.contains(document.elementFromPoint(x,y)))return {x,y};}})()`;
    await until(point); const coords = await evaluate(point);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...coords, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...coords, button: 'left', clickCount: 1 });
  };
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = fetch.bind(window), id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
    const user = { id: id(100), username: 'QA', role: 'user', email: 'qa@example.test', hasPassword: true, preferredLanguage: new URL(location.href).searchParams.get('lang') || 'en' };
    localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'notifications-qa-only', user }));
    const item = (n, type, read = false, days = 0) => ({ id: id(n), type, title: 'Server title', body: 'A notification', actorId: id(101), actorUsername: 'Alex', eventId: type === 'friend_request' ? undefined : id(10), createdAt: new Date(Date.now() - days * 86400000).toISOString(), isRead: read });
    const qa = window.__qa = { items: [item(1, 'friend_request'), item(2, 'ticket_purchased'), item(3, 'organizer_event', true, 4), item(5, 'friend_accepted', true, 15),
      { ...item(6, 'friend_request'), actorId: id(102), actorUsername: 'Mara' }, { ...item(7, 'friend_request', true), actorId: id(103), actorUsername: 'Resolved' }],
      requests: [{ id: id(101), username: 'Alex' }, { id: id(102), username: 'Mara' }], friendFail: false, friendCalls: [],
      count: 9, calls: [], fail: false, hold: false, release: null };
    const backendKey = 'notifications-qa-backend:' + location.search;
    const saved = sessionStorage.getItem(backendKey);
    if (saved) Object.assign(qa, JSON.parse(saved));
    const persist = () => sessionStorage.setItem(backendKey, JSON.stringify({ items: qa.items, requests: qa.requests, count: qa.count }));
    window.fetch = async (input, options = {}) => {
      const url = new URL(String(input), location.origin), route = url.pathname.split('/api/v1')[1];
      if (!route) { if (url.origin === location.origin) return original(input, options); throw Error('External request blocked'); }
      qa.calls.push(route);
      const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      if (route === '/wardrobe/mine') return reply({ deposits: [], staffAccess: false });
      if (route === '/diagnostics/errors') return new Response(null, { status: 204 });
      if (route === '/users/me') return reply(user);
      if (route === '/notifications') return reply({ items: qa.items, unreadCount: qa.count });
      if (route === '/events/' + id(10)) return reply({ id: id(10), title: 'After hours', category: 'TECHNO',
        bannerUrl: location.origin + '/assets/assets/party-event.9ff7ef76614a79d5a475f57bf9f48fdb.webp',
        startTime: '2030-11-01T20:00:00Z', endTime: '2030-11-02T04:00:00Z', ticketTypes: [], lineup: [] });
      if (route === '/friends/requests') return reply(qa.requests);
      if (route.startsWith('/friends/request/')) {
        const actor = route.split('/').at(-1), { status, notificationId } = JSON.parse(options.body);
        qa.friendCalls.push({ actor, status });
        if (qa.friendFail) return reply({}, 503);
        qa.requests = qa.requests.filter(friend => friend.id !== actor);
        const removedNotificationIds = [];
        if (status === 'declined') {
          const row = qa.items.find(item => item.id === notificationId && item.actorId === actor && item.type === 'friend_request');
          if (row) { removedNotificationIds.push(row.id); if (!row.isRead) qa.count--; qa.items = qa.items.filter(item => item.id !== row.id); }
        }
        persist();
        return reply({ relationship: status === 'accepted' ? 'friends' : 'none', removedNotificationIds });
      }
      if (route === '/notifications/read-all') {
        if (qa.fail) return reply({}, 503);
        if (qa.hold) await new Promise(resolve => { qa.release = resolve; });
        qa.items.forEach(row => { row.isRead = true; });
        qa.items.unshift(item(4, 'friend_request')); qa.count = 1;
        persist();
        return reply({ success: true });
      }
      if (route.startsWith('/notifications/') && route.endsWith('/read')) {
        const row = qa.items.find(row => route.includes(row.id)); if (row && !row.isRead) { row.isRead = true; qa.count--; }
        persist();
        return reply({ success: true });
      }
      return reply([]);
    };
  }.toString()})();` });
  const panel = `[...document.querySelectorAll('[data-testid="notifications-screen"]')].at(-1)`;
  await call('Page.navigate', { url: base });
  await click('home-notifications');
  await until(`location.pathname==='/notifications'`);
  await until(`${panel}?.textContent.includes('Alex sent you a friend request.')`);
  await until(`document.querySelector('[data-testid="notifications-section-today"]') && document.querySelector('[data-testid="notifications-section-week"]') && document.querySelector('[data-testid="notifications-section-month"]')`);
  assert.ok(await evaluate(`${panel}.textContent.includes('9 unread')`));
  await until(`document.querySelector('[data-testid="notification-${id(3)}"]').textContent.includes('After hours') && document.querySelector('[data-testid="notification-preview-${id(3)}"]')`);
  await until(`document.querySelector('[data-testid="notification-${id(2)}"]').textContent.includes('Your tickets for After hours are confirmed')`);
  await until(`document.querySelector('[data-testid="notification-accept-${id(1)}"]') && document.querySelector('[data-testid="notification-delete-${id(6)}"]')`);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="notification-accept-${id(7)}"]')`), false, 'Resolved requests have no action buttons');
  const actionBounds = await evaluate(`{const row=document.querySelector('[data-testid="notification-${id(1)}"]').getBoundingClientRect(),button=document.querySelector('[data-testid="notification-accept-${id(1)}"]'),r=button.getBoundingClientRect(),fill=button.firstElementChild.getBoundingClientRect();({left:r.left,rowLeft:row.left,width:r.width,targetHeight:r.height,fillHeight:fill.height})}`);
  assert.ok(actionBounds.left > actionBounds.rowLeft + 120, JSON.stringify(actionBounds));
  assert.ok(actionBounds.targetHeight >= 44 && actionBounds.fillHeight <= 34, JSON.stringify(actionBounds));
  await capture('notifications-new-requests');
  await evaluate('window.__qa.friendFail=true'); await click('notification-accept-' + id(1));
  await until(`${panel}.textContent.includes("The change couldn't be saved.")`);
  assert.equal(await evaluate('window.__qa.requests.length'), 2);
  await evaluate(`window.__qa.friendFail=false;document.querySelector('[data-testid="notification-accept-${id(1)}"]').click();document.querySelector('[data-testid="notification-accept-${id(1)}"]').click()`);
  await until(`!document.querySelector('[data-testid="notification-accept-${id(1)}"]') && window.__qa.count===8`);
  assert.equal(await evaluate('window.__qa.friendCalls.length'), 2, 'A failed request and one accepted double tap');
  await click('notification-delete-' + id(6));
  await until(`window.__qa.requests.length===0 && window.__qa.count===7`);
  assert.deepEqual(await evaluate('window.__qa.friendCalls.map(call=>call.status)'), ['accepted','accepted','declined']);
  assert.equal(await evaluate('location.pathname'), '/notifications', 'Actions never bubble to profile navigation');
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="notification-${id(1)}"]')`), true, 'Accepting preserves its notification');
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="notification-${id(6)}"]')`), false, 'Declining removes only that interaction');
  await call('Page.reload');
  await until(`${panel}?.textContent.includes('7 unread')`);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="notification-${id(6)}"]')`), false, 'Decline stays deleted after a full reload');
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="notification-${id(1)}"]')`), true, 'Accepted interaction remains after a full reload');
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="notification-${id(7)}"]')`), true, 'Unrelated historical interaction is preserved');
  await evaluate('window.__qa.fail=true'); await click('notifications-read-all');
  await until(`${panel}.textContent.includes("The change couldn't be saved.")`);
  assert.equal(await evaluate('window.__qa.count'), 7);
  await evaluate(`window.__qa.fail=false;window.__qa.hold=true;document.querySelector('[data-testid="notifications-read-all"]').click();document.querySelector('[data-testid="notifications-read-all"]').click()`);
  await until('window.__qa.release');
  assert.equal(await evaluate(`window.__qa.calls.filter(path=>path==='/notifications/read-all').length`), 2, 'One failed request and one double-tap request');
  await evaluate('window.__qa.hold=false;window.__qa.release()');
  await until(`${panel}.textContent.includes('1 unread')`);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="notification-unread"]')`), true, 'Arrival during mark-all remains unread');
  await delay(250); await capture('notifications-new-mobile');
  await click('notification-' + id(2)); await until(`location.pathname==='/users/me/tickets'`);
  await click('account-back'); await click('tab-Home'); await click('home-notifications'); await until(`location.pathname==='/notifications'`);
  await click('notification-' + id(4)); await until(`location.pathname==='/users/${id(101)}'`);
  await evaluate('history.back()'); await until(`location.pathname==='/notifications'`);
  await click('notifications-back'); await until(`location.pathname==='/'`);
  await evaluate('window.__qa.items=[];window.__qa.count=0');
  await click('home-notifications'); await until(`${panel}?.textContent.includes('No notifications yet.')`);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="notifications-read-all"]')`), false);
  await click('notifications-back'); await click('home-search'); await until(`location.pathname==='/search'`);
  for (const [width, height, language, name] of [[1280, 900, 'en', 'desktop'], [320, 568, 'ro', 'small-ro']]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await call('Page.navigate', { url: base + '?lang=' + language }); await click('home-notifications');
    await until(`${panel}?.textContent.includes(${JSON.stringify(language === 'ro' ? 'Alex ți-a trimis' : 'Alex sent you')})`);
    const bounds = await evaluate(`{const r=${panel}.getBoundingClientRect();({left:r.left,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight})}`);
    assert.ok(bounds.left >= 0 && bounds.right <= bounds.width + 1 && bounds.bottom <= bounds.height + 1, JSON.stringify(bounds));
    await delay(250); await capture('notifications-new-' + name);
  }
  assert.deepEqual(errors, []);
  console.log('PASS notifications: separate inbox, calendar groups, localized copy, mark-all errors/double-taps/concurrent arrivals, ticket/profile return navigation and responsive layouts');
}).catch(error => { console.error(error); process.exitCode = 1; });
