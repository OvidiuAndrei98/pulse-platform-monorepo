// Exercise the production bundle with local images and an isolated, mocked API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withBrowser } = require('./browser-harness.cjs');
const dist = path.resolve(__dirname, '../dist');
const banner = '/assets/' + fs.readdirSync(path.join(dist, 'assets'), { recursive: true }).find(name => /party-event\..*\.webp$/.test(name)).replaceAll('\\', '/');

withBrowser(async ({ base, call, evaluate, until, click, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock(banner) {
    const original = fetch.bind(window), params = new URL(location.href).searchParams;
    const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
    const events = [1, 2, 3].map(n => ({ id: id(n), title: ['AFTER DARK', 'ROOFTOP SESSIONS', 'NOCTURNE'][n - 1], category: 'TECHNO', city: 'Bucuresti', locationName: 'Test venue', startTime: n === 1 ? '2020-10-08T18:00:00Z' : '2099-10-08T18:00:00Z', endTime: '2099-10-09T02:00:00Z', bannerUrl: location.origin + banner + '?banner=' + n, ticketTypes: [], lineup: [], description: 'Promotion QA' }));
    const qa = window.__qa = { unexpected: [], tracks: [], promotionsRequests: 0, holdPromotions: false, releasePromotions: null, count: params.has('empty') ? 0 : params.has('single') ? 1 : 3 };
    window.fetch = async (input, options = {}) => {
      const url = new URL(String(input), location.origin), route = url.pathname.split('/api/v1')[1];
      if (!route) { if (url.origin === location.origin) return original(input, options); throw Error('External request blocked'); }
      const reply = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
      if (route === '/promotions/active') {
        qa.promotionsRequests++;
        if (qa.holdPromotions) await new Promise(resolve => { qa.releasePromotions = () => { qa.holdPromotions = false; qa.releasePromotions = null; resolve(); }; });
        return reply(events.slice(0, qa.count).map((event, i) => ({ campaignId: id(i + 10), placement: 'home_banner', event })));
      }
      if (/^\/promotions\/.+\/track$/.test(route)) { qa.tracks.push({ id: route.split('/')[2], ...JSON.parse(options.body) }); return reply({}); }
      if (route === '/events') return reply(events);
      if (route.endsWith('/social')) return reply({ friends: [], goingCount: 0, interestedCount: 0 });
      if (route.endsWith('/updates')) return reply([]);
      const event = events.find(event => route === '/events/' + event.id);
      if (event) return reply(event);
      qa.unexpected.push(route); return reply({});
    };
  }.toString()})(${JSON.stringify(banner)});` });
  const hero = `document.querySelector('[data-testid="promotion-hero"]')`;
  const title = `${hero}?.getAttribute('aria-label')`;
  const navigate = async query => {
    await call('Page.navigate', { url: base + '/' + query });
    await until(`document.querySelector('[data-testid="home-search"]')`);
  };
  await navigate(''); await until(`${title}==='AFTER DARK'`);
  await until(`${hero}.querySelector('img')?.naturalWidth > 0`);
  await delay(550);
  const initial = await evaluate(`{const el=${hero},r=el.getBoundingClientRect();window.__hero=el;({x:r.x,y:r.y,width:r.width,height:r.height})}`);
  await evaluate(`window.__samples=[];window.__sampling=true;(function sample(){const el=${hero};if(el){const r=el.getBoundingClientRect();window.__samples.push({x:r.x,y:r.y,width:r.width,title:el.getAttribute('aria-label'),images:Array.from(el.querySelectorAll('[data-testid="promotion-hero-artwork"]')).map(layer=>({opacity:Number(getComputedStyle(layer).opacity),loaded:layer.querySelector('img')?.naturalWidth>0})),transform:getComputedStyle(el.querySelector('[data-testid="promotion-hero-artwork"]')).transform});}if(window.__sampling)requestAnimationFrame(sample);})();`);
  await until(`${title}==='ROOFTOP SESSIONS'`, 6000);
  await delay(650); await evaluate('window.__sampling=false');
  const samples = await evaluate('window.__samples');
  fs.writeFileSync(path.resolve(__dirname, '../artifacts/promotion-hero-samples.json'), JSON.stringify({ samples, markup: await evaluate(`${hero}.outerHTML`) }, null, 2));
  assert.ok(samples.every(s => Math.abs(s.x - initial.x) < .1 && Math.abs(s.y - initial.y) < .1 && Math.abs(s.width - initial.width) < .1), 'Autoplay never slides or resizes the card');
  assert.ok(samples.some(s => s.images.length === 2 && s.images[0].opacity === 1 && s.images[1].loaded && s.images[1].opacity > 0 && s.images[1].opacity < 1), 'New artwork fades over the previous opaque image');
  assert.ok(samples.every(s => s.images.some(img => img.loaded && img.opacity > 0)), 'No blank frame during image replacement');
  assert.equal(await evaluate(`${hero}===window.__hero`), true, 'Keep the card mounted');
  assert.deepEqual(await evaluate('window.__qa.tracks.filter(t=>t.metric==="impression").map(t=>t.id)'), ['00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011']);
  console.log('PASS stationary autoplay, overlapping fade, no blank frame and active-only impressions');

  await call('Emulation.setTouchEmulationEnabled', { enabled: true });
  const swipe = async (dx, dy = 0) => {
    const r = await evaluate(`{const r=${hero}.getBoundingClientRect();({left:r.x,x:r.x+r.width/2,y:r.y+r.height/2})}`);
    await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }] });
    for (let i = 1; i <= 8; i++) {
      await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r.x + dx * i / 8, y: r.y + dy * i / 8, id: 1 }] });
      if (!dy) assert.ok(Math.abs(await evaluate(`${hero}.getBoundingClientRect().x`) - r.left) < .1, 'Card cannot be dragged horizontally');
      await delay(20);
    }
    await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await swipe(-120); await until(`${title}==='NOCTURNE'`);
  await delay(550);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="event-content"]')`), false, 'Swiping does not open an event');
  await swipe(120); await until(`${title}==='ROOFTOP SESSIONS'`);
  await swipe(120); await until(`${title}==='AFTER DARK'`);
  await swipe(120); await until(`${title}==='NOCTURNE'`);
  await delay(550); await capture('promotion-hero-mobile');
  await click('promotion-hero'); await until(`document.querySelector('[data-testid="event-content"]')`);
  assert.ok(await evaluate(`document.querySelector('[data-testid="event-content"]').textContent.includes('NOCTURNE')`));
  assert.equal(await evaluate('window.__qa.tracks.filter(t=>t.metric==="click").at(-1).id'), '00000000-0000-4000-8000-000000000012');
  await delay(4700);
  assert.equal(await evaluate(title), 'NOCTURNE', 'Autoplay pauses while the event sheet is open');
  await click('sheet-handle'); await until(`!document.querySelector('[data-testid="event-content"]')`); await delay(600);
  assert.equal(await evaluate(title), 'AFTER DARK', 'Returning Home from a screen advances once, wrapping at the end');
  await swipe(0, -110); await delay(400);
  assert.equal(await evaluate(title), 'AFTER DARK', 'A vertical scroll does not change the banner');
  assert.ok(await evaluate(`document.querySelector('[data-testid="home-list"]').scrollTop > 20`), 'Vertical Home scroll starts over the hero');
  assert.deepEqual(await evaluate('window.__qa.unexpected'), []);
  console.log('PASS bidirectional swipe/wrap without movement, correct event/campaign click, pause behind sheet and vertical scroll');

  await click('tab-Home'); await until(`document.querySelector('[data-testid="home-list"]').scrollTop===0`);
  assert.equal(await evaluate(title), 'AFTER DARK', 'Tapping the already selected Home tab does not advance');
  for (const expected of ['ROOFTOP SESSIONS', 'NOCTURNE', 'AFTER DARK']) {
    await click('tab-Explore'); await until(`document.querySelector('[data-testid="tab-Explore"]').getAttribute('aria-selected')==='true'`);
    await click('tab-Home'); await until(`${title}===${JSON.stringify(expected)}`);
    await delay(150); assert.equal(await evaluate(title), expected, 'Exactly one advance per return');
  }
  // A completed refresh must advance even when the API returns identical data.
  const pull = async (distance = 180) => {
    await call('Emulation.setTouchEmulationEnabled', { enabled: true });
    await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 108, id: 1 }] });
    for (let i = 1; i <= 10; i++) {
      await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 108 + distance * i / 10, id: 1 }] });
      await delay(20);
    }
    await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const requests = await evaluate('window.__qa.promotionsRequests');
  await pull(45); await delay(300);
  assert.equal(await evaluate('window.__qa.promotionsRequests'), requests);
  assert.equal(await evaluate(title), 'AFTER DARK', 'Cancelled refresh does not rotate the banner');
  await evaluate('window.__qa.holdPromotions=true'); await pull();
  await until('window.__qa.releasePromotions'); await delay(4600);
  assert.equal(await evaluate(title), 'AFTER DARK', 'Slow refresh pauses autoplay');
  await evaluate('window.__qa.releasePromotions()'); await until(`${title}==='ROOFTOP SESSIONS'`);
  await delay(1100); assert.equal(await evaluate(title), 'ROOFTOP SESSIONS');
  // Finishing a refresh while Home is hidden must not consume another unseen banner.
  await evaluate('window.__qa.holdPromotions=true'); await pull(); await until('window.__qa.releasePromotions');
  await click('tab-Explore'); await until(`document.querySelector('[data-testid="tab-Explore"]').getAttribute('aria-selected')==='true'`);
  await evaluate('window.__qa.releasePromotions()'); await delay(300);
  await click('tab-Home'); await until(`${title}==='NOCTURNE'`);
  await delay(400); assert.equal(await evaluate(title), 'NOCTURNE');
  assert.deepEqual(await evaluate('window.__qa.unexpected'), []);
  console.log('PASS return-to-Home rotation/wrap, cancelled/slow/identical refresh and refresh completed while away');

  await navigate('?single=1'); await until(`${title}==='AFTER DARK'`); await delay(5200);
  assert.equal(await evaluate(title), 'AFTER DARK');
  await swipe(-120); await delay(550); assert.equal(await evaluate(title), 'AFTER DARK');
  await click('tab-Explore'); await click('tab-Home'); await pull(); await delay(1100);
  assert.equal(await evaluate(title), 'AFTER DARK', 'Single promotion survives returns and refreshes');
  await navigate('?empty=1'); await until(`document.body.innerText.includes('Upcoming')`);
  assert.equal(await evaluate(`!!${hero}`), false);
  await call('Emulation.setDeviceMetricsOverride', { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(''); await until(`${title}==='AFTER DARK'`);
  await delay(600); await capture('promotion-hero-desktop');
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 500, y: 300 });
  await delay(5000); assert.equal(await evaluate(title), 'AFTER DARK', 'Hover pauses desktop autoplay');
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`));
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await navigate(''); await until(`${title}==='AFTER DARK'`); await delay(550);
  await swipe(-120); await until(`${title}==='ROOFTOP SESSIONS'`); await delay(100);
  assert.equal(await evaluate(`${hero}.querySelectorAll('[data-testid="promotion-hero-artwork"]').length`), 1, 'Reduced motion skips the dissolve');
  assert.equal(await evaluate(`getComputedStyle(${hero}.querySelector('[data-testid="promotion-hero-artwork"]')).transform`), 'matrix(1, 0, 0, 1, 0, 0)');
  assert.deepEqual(errors, []);
  console.log('PASS one/no promotion, desktop hover/responsive layout and reduced motion');
}).catch(error => { console.error(error); process.exitCode = 1; });
