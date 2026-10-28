// Real exported UI and pointer events. API, sessions and images stay local.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { withBrowser } = require('./browser-harness.cjs');
const dist = path.resolve(__dirname, '../dist');
const banner = '/assets/' + fs.readdirSync(path.join(dist, 'assets'), { recursive: true }).find(name => /party-event\..*\.webp$/.test(name)).replaceAll('\\', '/');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

withBrowser(async ({ base, call, evaluate, until, click, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock(banner) {
    const original = fetch.bind(window), id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
    const user = { id: id(100), username: 'QA', role: 'user', email: 'qa@example.test', hasPassword: true, preferredLanguage: 'en', createdAt: '2026-01-01T00:00:00Z' };
    localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'motion-qa-only', user }));
    const tier = (n, price) => ({ id: id(n), name: n === 11 ? 'General' : 'VIP', priceRon: price, capacity: 100, ticketsSold: 0, startSales: '2020-01-01T00:00:00Z', endSales: '2099-10-09T02:00:00Z' });
    const events = [1, 2, 3].map(n => ({ id: id(n), organizerId: id(50), title: 'Motion QA ' + n, category: 'TECHNO', city: 'Bucuresti', locationName: 'Test venue', startTime: '2020-10-08T18:00:00Z', endTime: '2099-10-09T02:00:00Z', bannerUrl: location.origin + (n === 3 ? '/invalid-test-image.png' : banner), ticketTypes: [tier(11, 50), tier(12, 100)], lineup: [], description: 'QA event' }));
    const qa = window.__qa = { writes: [], failSave: false, saved: false, frames: [], recording: true };
    function sample() {
      const card = document.querySelector('[data-testid="event-card-' + id(1) + '"]');
      const art = card?.querySelector('[data-testid="event-artwork"]');
      // Observe the image's reserved area, independently of asynchronously
      // loaded social details and fonts elsewhere in the card.
      if (card && art) qa.frames.push({ height: art.getBoundingClientRect().height, opacity: Number(getComputedStyle(art).opacity) });
      if (qa.recording) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
    window.fetch = async (input, options = {}) => {
      const url = new URL(String(input), location.origin), route = url.pathname.split('/api/v1')[1];
      if (!route) { if (url.origin === location.origin) return original(input, options); throw Error('External request blocked'); }
      const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      if (route === '/wardrobe/mine') return reply({ deposits: [], staffAccess: false });
      if (route === '/diagnostics/errors') return new Response(null, { status: 204 });
      if (route === '/users/me') return reply(user);
      if (route === '/users/me/saved-events') return reply(qa.saved ? [events[0]] : []);
      if (route.endsWith('/favorite')) { qa.writes.push(options.method); await new Promise(resolve => setTimeout(resolve, 180)); if (qa.failSave) return reply({}, 503); qa.saved = options.method === 'POST'; return reply({}); }
      if (route === '/events') return reply(events);
      if (route.endsWith('/social')) return reply({ friends: [], goingCount: 0, interestedCount: 0 });
      if (route.endsWith('/updates')) return reply([]);
      if (route.startsWith('/profiles/')) return reply({ id: id(50), username: 'Organizer QA' });
      const event = events.find(event => route === '/events/' + event.id);
      if (event) return reply(event);
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      if (route === '/users/me/billing-details') return reply({ details: null });
      return reply([]);
    };
  }.toString()})(${JSON.stringify(banner)});` });
  const cardId = 'event-card-' + id(1), bookmarkId = 'event-bookmark-' + id(1);
  const el = testId => `document.querySelector('[data-testid="${testId}"]')`;
  const card = el(cardId), bookmark = el(bookmarkId);
  await call('Page.navigate', { url: base });
  await until(`${card}?.querySelector('img')?.naturalWidth>0`);
  await delay(400); await evaluate('window.__qa.recording=false');
  const frames = await evaluate('window.__qa.frames');
  assert.ok(frames.some(frame => frame.opacity > 0 && frame.opacity < 1), 'Loaded artwork appears progressively');
  assert.ok(frames.every(frame => Math.abs(frame.height - frames[0].height) < 1), 'Image load never shifts the card geometry');
  await until(`${el('event-card-' + id(3))}?.querySelector('img')?.naturalWidth>0`);
  assert.ok(await evaluate(`${el('event-card-' + id(3))}.querySelector('img').src.includes('party-event')`), 'Failed images use the existing fallback');
  console.log('PASS image fade, fixed geometry and broken-image fallback');

  await evaluate(`${card}.scrollIntoView({block:'center'})`); await delay(200);
  const point = await evaluate(`{const r=${card}.getBoundingClientRect();({x:r.x+80,y:r.y+70})}`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 }); await delay(130);
  const pressed = await evaluate(`({transform:getComputedStyle(${card}).transform,hit:document.elementFromPoint(${point.x},${point.y})?.outerHTML.slice(0,500),point:${JSON.stringify(point)}})`);
  await capture('card-pressed');
  assert.ok(await evaluate(`new DOMMatrix(getComputedStyle(${card}).transform).a<.995`), 'Press feedback starts while the finger is down: ' + JSON.stringify(pressed));
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 385, y: 10, button: 'left', buttons: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 385, y: 10, button: 'left', clickCount: 1 });
  await delay(250);
  assert.equal(await evaluate(`new DOMMatrix(getComputedStyle(${card}).transform).a`), 1);
  assert.equal(await evaluate(`!!${el('event-content')}`), false, 'Cancelling a press does not navigate');

  await call('Emulation.setTouchEmulationEnabled', { enabled: true });
  await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
  for (let i = 1; i <= 8; i++) { await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x - i * 10, y: point.y, id: 1 }] }); await delay(20); }
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await delay(300);
  assert.equal(await evaluate(`!!${el('event-content')}`), false, 'Horizontal rail drag is not a card tap');
  assert.equal(await evaluate(`new DOMMatrix(getComputedStyle(${card}).transform).a`), 1, 'Scroll cancellation releases press feedback');
  console.log('PASS immediate press feedback, cancelled presses and horizontal scroll');

  await evaluate(`${bookmark}.scrollIntoView({block:'center'})`); await delay(200);
  await evaluate(`window.__bookmarkFrames=[];window.__sampling=true;(function sample(){const b=${bookmark};window.__bookmarkFrames.push({fill:Number(getComputedStyle(b.querySelector('[data-testid="bookmark-fill"]')).opacity),scale:new DOMMatrix(getComputedStyle(b.querySelector('[data-testid="bookmark-motion"]')).transform).a});if(window.__sampling)requestAnimationFrame(sample);})();`);
  await click(bookmarkId); await until(`${bookmark}.getAttribute('aria-label')==='Remove from favorites'`); await delay(400);
  await evaluate('window.__sampling=false');
  const bookmarkFrames = await evaluate('window.__bookmarkFrames');
  assert.ok(bookmarkFrames.some(frame => frame.fill > 0 && frame.fill < 1));
  assert.ok(bookmarkFrames.some(frame => frame.scale > 1.02));
  assert.equal(bookmarkFrames.at(-1).fill, 1);
  assert.equal(await evaluate(`!!${el('event-content')}`), false, 'Bookmark never opens the event');
  await evaluate(`${bookmark}.click();${bookmark}.click();${bookmark}.click()`);
  await until(`${bookmark}.getAttribute('aria-label')==='Add to favorites' && window.__qa.saved===false`); await delay(250);
  assert.equal(await evaluate(`Number(getComputedStyle(${bookmark}.querySelector('[data-testid="bookmark-fill"]')).opacity)`), 0);
  const writesBeforeFailure = await evaluate('window.__qa.writes.length');
  await evaluate('window.__qa.failSave=true'); await click(bookmarkId);
  await until(`window.__qa.writes.length>${writesBeforeFailure}`);
  await until(`${bookmark}.getAttribute('aria-label')==='Add to favorites' && Number(getComputedStyle(${bookmark}.querySelector('[data-testid="bookmark-fill"]')).opacity)===0`);
  assert.equal(await evaluate(`Number(getComputedStyle(${bookmark}.querySelector('[data-testid="bookmark-fill"]')).opacity)`), 0, 'Failed save rolls the animation back to the confirmed state');
  await until(el('toast-dismiss'));
  await click('toast-dismiss');
  await until(`!${el('app-toast')}`);
  console.log('PASS bookmark pop/fill, rapid toggles and API failure rollback');

  await evaluate(`${card}.querySelector('[role="button"]').click()`); await until(el('event-content')); await delay(500);
  const vip = 'event-ticket-' + id(12);
  const oldBorder = await evaluate(`getComputedStyle(${el(vip)}).borderColor`);
  await click(vip);
  assert.ok(await evaluate(`${el('event-continue')}.textContent.includes('106,50') || ${el('event-continue')}.textContent.includes('106.50')`), 'Selected price updates before its animation finishes');
  await delay(250);
  assert.notEqual(await evaluate(`getComputedStyle(${el(vip)}).borderColor`), oldBorder);
  await click('event-continue'); await until(el('checkout-screen'));
  await evaluate(`${el('checkout-plus')}.click();${el('checkout-plus')}.click()`);
  await until(`${el('checkout-quantity')}.textContent==='3'`);
  assert.ok(await evaluate(`${el('checkout-total')}.textContent.includes('319,50') || ${el('checkout-total')}.textContent.includes('319.50')`), 'Actual total follows rapid quantity changes without counting through old prices');
  await delay(250); await capture('checkout-microinteractions');
  console.log('PASS ticket selection and accurate checkout totals during rapid interaction');

  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await call('Page.navigate', { url: base }); await until(`${card}?.querySelector('img')?.naturalWidth>0`); await delay(100);
  assert.equal(await evaluate(`Number(getComputedStyle(${card}.querySelector('[data-testid="event-artwork"]')).opacity)`), 1);
  await click(bookmarkId); await until(`${bookmark}.getAttribute('aria-label')==='Remove from favorites'`);
  assert.equal(await evaluate(`new DOMMatrix(getComputedStyle(${bookmark}.querySelector('[data-testid="bookmark-motion"]')).transform).a`), 1, 'Reduced motion skips the bookmark bounce');
  assert.deepEqual(errors, []);
  console.log('PASS reduced-motion preference and no runtime errors');
}).catch(error => { console.error(error); process.exitCode = 1; });
