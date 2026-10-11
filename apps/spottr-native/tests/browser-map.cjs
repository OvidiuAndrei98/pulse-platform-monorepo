const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');

withBrowser(async ({ base, call, evaluate, until, click, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = window.fetch.bind(window), qa = window.__qa = { requests: [], positions: 0, denyLocation: false };
    const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    localStorage.removeItem('spottr-native.session.v1');
    const position = { coords: { latitude: 44.4323, longitude: 26.1063, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(success, failure) { qa.positions++; qa.denyLocation ? failure({ code: 1, message: 'Denied' }) : success(position); }, watchPosition(success) { success(position); return 1; }, clearWatch() {} } });
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: qa.denyLocation ? 'denied' : 'granted', addEventListener() {}, removeEventListener() {} }) } });
    // Raster imagery is not under test: replace map tiles with an inert local pixel.
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', { ...descriptor, set(value) { descriptor.set.call(this, String(value).includes('basemaps.cartocdn.com') ? 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZAAAAABJRU5ErkJggg==' : value); } });
    const event = n => ({ id: id(n), title: 'Map event ' + n, category: 'TECHNO', locationName: 'QA Club', city: 'Bucuresti', description: 'Map event test description', latitude: 44.4323, longitude: 26.1063, startTime: '2020-01-01T20:00:00Z', endTime: '2035-10-11T04:00:00Z', ticketTypes: [], lineup: [] });
    window.fetch = async (url, options = {}) => {
      const parsed = new URL(String(url), location.origin);
      if (!parsed.pathname.includes('/api/v1/')) { if (parsed.origin === location.origin) return original(url, options); throw new Error('Unexpected external fetch'); }
      const route = parsed.pathname.split('/api/v1')[1]; qa.requests.push(route);
      const reply = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
      if (route === '/events') return reply([event(1), event(2)]);
      if (route.endsWith('/social')) return reply({ goingCount: 0, interestedCount: 0 });
      if (route.endsWith('/updates') || route === '/promotions/active' || route.endsWith('/attendees')) return reply([]);
      if (route.startsWith('/events/')) return reply(event(Number(route.slice(-1))));
      return reply([]);
    };
  }.toString()})();` });
  await call('Page.navigate', { url: base + '/events' });
  await click('events-map-toggle'); await until(`document.querySelector('[data-testid="event-map"] .event-map-cluster')`);
  assert.equal(await evaluate(`Math.round(document.querySelector('[data-testid="event-map"]').getBoundingClientRect().top)`), 0, 'Map extends to top of screen');
  assert.ok(await evaluate(`document.querySelector('[data-testid="event-map"]').getBoundingClientRect().height >= innerHeight - 1`), 'Map remains underneath floating navbar');
  assert.equal(await evaluate(`document.querySelector('.event-map-cluster').textContent`), '2');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.leaflet-marker-pane')).zIndex`), '600', 'Leaflet stylesheet must be loaded, so real marker layering is tested');
  await evaluate(`document.querySelector('.event-map-cluster').click()`);
  await until(`document.querySelectorAll('.event-map-pin--spiderfied').length===2`);
  await evaluate(`document.querySelector('[title="Map event 1"]').click()`); await until(`document.querySelector('[data-testid="map-event-preview"]')`);
  const geometry = await evaluate(`{const marker=document.querySelector('[title="Map event 1"]').getBoundingClientRect(), preview=document.querySelector('[data-testid="map-event-preview"]').getBoundingClientRect();({marker:{left:marker.left,top:marker.top,bottom:marker.bottom},preview:{left:preview.left,top:preview.top,bottom:preview.bottom,right:preview.right}})}`);
  assert.ok(geometry.preview.bottom <= geometry.marker.bottom + 8, 'Preview is anchored above its selected event pin');
  assert.ok(geometry.preview.left >= 0 && geometry.preview.right <= 390, 'Preview stays inside narrow viewport');
  await capture('map-mobile-cluster-preview');
  await click('map-open-event'); await until(`document.querySelector('[data-testid="event-sheet"]')`); await delay(650);
  await click('sheet-handle'); await until(`!document.querySelector('[data-testid="event-sheet"]')`);
  await until(`document.querySelector('[data-testid="map-event-preview"]')`);
  console.log('PASS fullscreen map, colocated cluster expansion, anchored preview, event drawer and return');

  await click('map-zoom-out'); await delay(300);
  await click('map-zoom-in'); await delay(300);
  await until(`document.querySelectorAll('.event-map-pin--spiderfied').length===2`);
  await evaluate(`document.querySelector('[data-testid="event-map"]').dispatchEvent(new WheelEvent('wheel',{deltaY:120,clientX:190,clientY:440,bubbles:true,cancelable:true}))`); await delay(400);
  await click('map-zoom-in'); await delay(350);
  await until(`document.querySelectorAll('.event-map-pin--spiderfied').length===2`);
  console.log('PASS zoom controls remain consistent after map gesture zoom');
  await click('events-list-toggle'); await until(`!document.querySelector('[data-testid="event-map"]')`);
  await click('events-map-toggle'); await until(`document.querySelector('[data-testid="event-map"] .event-map-cluster')`);
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }); await delay(350);
  assert.equal(await evaluate(`Math.round(document.querySelector('[data-testid="event-map"]').getBoundingClientRect().top)`), 0);
  await capture('map-desktop');
  console.log('PASS map/list remount and desktop responsive viewport');
  assert.deepEqual(errors, [], 'No unhandled browser exceptions');
}).catch(error => { console.error(error); process.exitCode = 1; });
