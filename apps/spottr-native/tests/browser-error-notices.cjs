// Isolated API failures: checks real error/retry flows without changing server data.
const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');

withBrowser(async ({ base, call, evaluate, until, click, capture, errors }) => {
  const origin = process.env.NATIVE_QA_URL || 'http://localhost:8083';
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = fetch.bind(window);
    const user = { id: '00000000-0000-4000-8000-000000000001', username: 'QA', role: 'user', email: 'qa@example.test', preferredLanguage: 'en', hasPassword: true };
    localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'error-layout-qa-only', user }));
    const qa = window.__qa = { eventsFail: true, notificationsFail: false, notificationCalls: 0, feedFail: true, moreFail: true, likeFail: false };
    qa.feedItems = [2, 3].map(n => ({ id: '00000000-0000-4000-8000-' + String(n).padStart(12, '0'), organizerId: user.id,
      title: 'Feed night ' + n, category: 'HOUSE', city: 'Bucuresti', locationName: 'QA venue', description: 'A night out',
      startTime: '2035-01-01T20:00:00Z', endTime: '2035-01-02T04:00:00Z', externalTickets: false, liked: false, likeCount: 0 }));
    const position = { coords: { latitude: 44.4323, longitude: 26.1063, accuracy: 5 }, timestamp: Date.now() };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(success) { success(position); }, watchPosition(success) { success(position); return 1; }, clearWatch() {} } });
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: 'granted', addEventListener() {}, removeEventListener() {} }) } });
    window.fetch = async (input, options = {}) => {
      const url = new URL(String(input), location.origin), route = url.pathname.split('/api/v1')[1];
      if (!route) {
        if (url.origin === location.origin) return original(input, options);
        // No external tile service is needed to test notice placement and controls.
        throw Error('External map request blocked by QA fixture');
      }
      const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
      if (route === '/users/me') return reply(user);
      if (route === '/events') return reply(qa.eventsFail ? { message: 'Unavailable' } : [], qa.eventsFail ? 503 : 200);
      if (route === '/notifications') { qa.notificationCalls++; return reply(qa.notificationsFail ? { message: 'Unavailable' } : { items: [], unreadCount: 0 }, qa.notificationsFail ? 503 : 200); }
      if (route === '/event-feed') {
        const more = url.searchParams.get('page') === '2', failed = more ? qa.moreFail : qa.feedFail;
        return reply(failed ? {} : more ? { items: [qa.feedItems[1]] } : { items: [qa.feedItems[0]], nextPage: 2 }, failed ? 503 : 200);
      }
      if (route.endsWith('/likes')) {
        if (qa.likeFail) return reply({}, 503);
        const item = qa.feedItems.find(item => route.includes(item.id));
        item.liked = options.method === 'PUT'; item.likeCount = Number(item.liked);
        return reply({ liked: item.liked, likeCount: item.likeCount });
      }
      if (route === '/wardrobe/mine') return reply({ deposits: [], staffAccess: false });
      if (route === '/diagnostics/errors') return new Response(null, { status: 204 });
      return reply([]);
    };
  }.toString()})();` });
  const retry = scope => `${scope}.querySelector('[data-testid="status-notice-retry"]')`;
  const bounds = async selector => evaluate(`(()=>{const e=${selector},r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,text:e.textContent}})()`);
  await call('Page.navigate', { url: origin });
  await until(`document.querySelector('[data-testid="home-search"]') && [...document.querySelectorAll('[data-testid="status-notice-error"]')].some(e=>e.textContent.includes('Events could not'))`, 60000);
  const home = `[...document.querySelectorAll('[data-testid="status-notice-error"]')].find(e=>e.textContent.includes('Events could not'))`;
  const homeBounds = await bounds(home);
  assert.ok(homeBounds.height <= 120 && homeBounds.x >= 16 && homeBounds.right <= 374, JSON.stringify(homeBounds));
  assert.equal(await evaluate(`document.body.innerText.includes('NO EVENTS TONIGHT')`), false, 'A load error must not claim there are no events');
  await capture('errors-home-compact');
  await evaluate(`window.__qa.eventsFail=false;${retry(home)}.click()`);
  await until(`!${home}`);

  await click('home-notifications');
  await until(`document.querySelector('[data-testid="notifications-empty"]')`);
  await click('notifications-back');
  // A failed refetch with cached items=[] used to render both Header and Empty errors.
  await evaluate('window.__qa.notificationsFail=true');
  await click('home-notifications');
  const inbox = `document.querySelector('[data-testid="notifications-screen"]')`;
  await until(`${inbox}?.querySelector('[data-testid="status-notice-error"]')`);
  assert.equal(await evaluate(`${inbox}.querySelectorAll('[data-testid="status-notice-error"]').length`), 1);
  const notice = `${inbox}.querySelector('[data-testid="status-notice-error"]')`;
  assert.ok((await bounds(notice)).height <= 120);
  await capture('errors-notifications-single');
  await evaluate(`window.__qa.notificationsFail=false;${retry(inbox)}.click()`);
  await until(`${inbox}.querySelector('[data-testid="notifications-empty"]') && !${inbox}.querySelector('[data-testid="status-notice-error"]')`);
  await click('notifications-back');

  await evaluate('window.__qa.eventsFail=true');
  await click('tab-Explore');
  await click('events-map-toggle');
  const map = `document.querySelector('[data-testid="events-map-panel"]')`;
  await until(`${map}?.querySelector('[data-testid="map-status-notice"]')`);
  await until(`${map}.querySelector('[data-testid="status-notice-error"]')`);
  assert.equal(await evaluate(`${map}.querySelectorAll('[data-testid="status-notice-error"]').length`), 1);
  const mapNotice = `${map}.querySelector('[data-testid="map-status-notice"]')`;
  for (const width of [390, 320]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
    const box = await bounds(mapNotice);
    assert.ok(box.height <= 135 && box.right <= width - 65 && box.y < 200, JSON.stringify(box));
    const control = `${map}.querySelector('[data-testid="map-zoom-in"]')`;
    assert.equal(await evaluate(`(()=>{const e=${control},r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()`), true, 'The notice must not cover zoom controls');
    const target = await bounds(retry(map));
    assert.ok(target.width >= 44 && target.height >= 44, JSON.stringify(target));
    assert.equal(await evaluate(`(()=>{const e=${map},r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height*.65))&&!document.elementFromPoint(r.x+r.width/2,r.y+r.height*.65).closest('[data-testid="map-status-notice"]')})()`), true, 'The middle of the map is not an error overlay');
    await capture('errors-map-compact-' + width);
  }
  await click('events-list-toggle');
  await until(`document.querySelector('[data-testid="events-list"] [data-testid="status-notice-error"]')`);
  assert.equal(await evaluate(`document.querySelector('[data-testid="events-list"]').querySelectorAll('[data-testid="status-notice-error"]').length`), 1);
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click('tab-Feed');
  const feed = `document.querySelector('[data-testid="event-feed"]')`;
  const feedNotice = `${feed}.querySelector('[data-testid="feed-status-notice"]')`;
  await until(`${feedNotice}?.textContent.includes("The Feed couldn't be loaded.")`);
  assert.ok((await bounds(feedNotice)).height <= 135);
  await capture('errors-feed-initial');
  await evaluate(`window.__qa.feedFail=false;${retry(feed)}.click()`);
  await until(`${feedNotice}?.textContent.includes("We couldn't load more events.")`);
  assert.equal(await evaluate(`!!${feed}.querySelector('[data-testid="feed-slide-00000000-0000-4000-8000-000000000002"]')`), true, 'A paging error preserves loaded posts');
  await capture('errors-feed-post-preserved');
  await evaluate(`window.__qa.moreFail=false;${retry(feed)}.click()`);
  await until(`!${feedNotice} && ${feed}.querySelector('[data-testid="feed-slide-00000000-0000-4000-8000-000000000003"]')`);
  await evaluate('window.__qa.likeFail=true');
  await click('feed-like-00000000-0000-4000-8000-000000000002');
  await until(`${feedNotice}?.textContent.includes('Your like could not be updated')`);
  assert.equal(await evaluate(`${feed}.querySelectorAll('[data-testid="status-notice-error"]').length`), 1);
  await evaluate(`window.__qa.likeFail=false;${retry(feed)}.click()`);
  await until(`!${feedNotice} && window.__qa.feedItems[0].liked`);
  assert.deepEqual(errors, []);
  console.log('PASS compact errors: Home, cached-empty inbox, map/control access at 390/320px, Feed initial/paging/like retries and retained posts');
}).catch(error => { console.error(error); process.exitCode = 1; });
