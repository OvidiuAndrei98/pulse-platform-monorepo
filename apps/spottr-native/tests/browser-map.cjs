const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');

withBrowser(async ({ base, call, evaluate, until, click, delay, capture, errors }) => {
  const next=!!process.env.MAP_TEST_URL,origin=process.env.MAP_TEST_URL||base;
  assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = window.fetch.bind(window), qa = window.__qa = { requests: [], positions: 0, denyLocation: false };
    const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    localStorage.removeItem('spottr-native.session.v1');
    localStorage.removeItem('pulse_token');localStorage.setItem('i18nextLng','en');
    const position = { coords: { latitude: 44.4323, longitude: 26.1063, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(success, failure) { qa.positions++; qa.denyLocation ? failure({ code: 1, message: 'Denied' }) : success(position); }, watchPosition(success) { success(position); return 1; }, clearWatch() {} } });
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: qa.denyLocation ? 'denied' : 'granted', addEventListener() {}, removeEventListener() {} }) } });
    // Raster imagery is not under test: replace map tiles with an inert local pixel.
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', { ...descriptor, set(value) { descriptor.set.call(this, String(value).includes('basemaps.cartocdn.com') ? 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZAAAAABJRU5ErkJggg==' : value); } });
    const event = n => ({ id: id(n), organizerId:id(3), title: 'Map event ' + n, category: 'TECHNO', locationName: 'QA Club', city: 'Bucuresti', description: 'Map event test description', latitude: 44.4323, longitude: 26.1063, startTime: '2020-01-01T20:00:00Z', endTime: '2035-10-11T04:00:00Z', ticketTypes: [], lineup: [] });
    window.fetch = async (url, options = {}) => {
      const parsed = new URL(String(url), location.origin);
      if (!parsed.pathname.includes('/api/v1/')) { if (parsed.origin === location.origin) return original(url, options); throw new Error('Unexpected external fetch'); }
      const route = parsed.pathname.split('/api/v1')[1]; qa.requests.push(route);
      const reply = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
      if (route === '/events') return reply([event(1), event(2)]);
      if (route.startsWith('/profiles/')) return reply({id:id(3),username:'QA organizer',companyName:'QA Events',followersCount:0});
      if (route.endsWith('/social')) return reply({ goingCount: 0, interestedCount: 0 });
      if (route.endsWith('/updates') || route === '/promotions/active' || route.endsWith('/attendees')) return reply([]);
      if (route.startsWith('/events/')) return reply(event(Number(route.slice(-1))));
      return reply([]);
    };
  }.toString()})();` });
  await call('Page.navigate', { url: origin + '/events' + (next?'?view=map':'') });
  if(!next){await until(`document.querySelector('[data-testid="events-map-toggle"]')`);await evaluate(`document.querySelector('[data-testid="events-map-toggle"]').click()`);}
  await until(`document.querySelector('[data-testid="event-map"] .event-map-cluster')`);
  if(!next){assert.equal(await evaluate(`Math.round(document.querySelector('[data-testid="event-map"]').getBoundingClientRect().top)`),0);assert.ok(await evaluate(`document.querySelector('[data-testid="event-map"]').getBoundingClientRect().height>=innerHeight-1`));}
  assert.equal(await evaluate(`document.querySelector('.event-map-cluster').textContent`), '2');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.leaflet-marker-pane')).zIndex`), '600', 'Leaflet stylesheet must be loaded, so real marker layering is tested');
  await evaluate(`document.querySelector('.event-map-cluster').click()`);
  await until(`document.querySelectorAll('.event-map-pin--spiderfied').length===2`);
  const first='map-event-card-00000000-0000-4000-8000-000000000001',second='map-event-card-00000000-0000-4000-8000-000000000002';
  await until(`document.querySelector('[data-testid="map-events-carousel"]')`);
  const geometry=await evaluate(`{const card=document.querySelector('[data-testid="${first}"]').getBoundingClientRect(),bar=document.querySelector('[data-bottom-nav] [data-bottom-nav-glass]')||document.querySelector('[data-testid="tab-bar"]'),nav=bar?.getBoundingClientRect();({left:card.left,right:card.right,top:card.top,bottom:card.bottom,navTop:nav?.top??innerHeight-86})}`);
  assert.ok(geometry.left>=0&&geometry.right<=390,'The first card fits the narrow viewport');
  assert.ok(geometry.bottom<=geometry.navTop-4,'Cards remain above bottom navigation');
  assert.equal(await evaluate(`document.querySelector('.leaflet-control-attribution').getBoundingClientRect().bottom<=document.querySelector('[data-testid="map-events-carousel"]').getBoundingClientRect().top-4`),true,'Map attribution remains above the carousel');
  assert.equal(await evaluate(`!!document.querySelector('.event-preview-popup')||!!document.querySelector('[data-testid="map-event-preview"]')`),false,'Mobile uses the bottom carousel, not anchored popups');
  for(let step=0;step<30;step++){
    if(await evaluate(`document.activeElement?.getAttribute('data-testid')===${JSON.stringify(first)}`))break;
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  }
  assert.equal(await evaluate(`document.activeElement?.getAttribute('data-testid')`),first,'An event card is reachable by Tab');
  await until(`(()=>{const s=getComputedStyle(document.activeElement);return s.outlineStyle==='solid'&&parseFloat(s.outlineWidth)>=2})()`);
  const focusContrast=await evaluate(`(()=>{
    const style=getComputedStyle(document.activeElement),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    const luminance=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)};
    const a=luminance(style.outlineColor),b=luminance(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  })()`);
  assert.ok(focusContrast>=3,'Keyboard focus outline contrasts at least 3:1 with the card');
  await capture((next?'next-':'')+'map-mobile-carousel');
  await call('Emulation.setTouchEmulationEnabled',{enabled:true});
  const touch=await evaluate(`{const r=document.querySelector('[data-testid="${first}"]').getBoundingClientRect();({x:r.left+r.width*.75,y:r.top+r.height*.5})}`);
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touch,id:1}]});
  for(let step=1;step<=10;step++){await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x-step*18,y:touch.y,id:1}]});await delay(16);}
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(250);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="event-sheet"]')||!!document.querySelector('[role="dialog"]')`),false,'A swipe never opens an event');
  await evaluate(`document.querySelector('[title="Map event 2"]').click()`);
  await until(`(()=>{const r=document.querySelector('[data-testid="${second}"]')?.getBoundingClientRect();return r&&r.left>=0&&r.right<=innerWidth})()`);
  await click(second);
  await until(next?`!!document.querySelector('[role="dialog"]')`:`!!document.querySelector('[data-testid="event-sheet"]')`);await delay(650);
  await capture((next?'next-':'')+'map-carousel-event-sheet');
  if(next){await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until(`!document.querySelector('[role="dialog"]')`);}
  else{await click('sheet-handle');await until(`!document.querySelector('[data-testid="event-sheet"]')`);}
  await until(`document.querySelector('[data-testid="map-events-carousel"]')`);
  console.log('PASS '+(next?'Next':'Native web')+' bottom carousel, cluster expansion, pin/card synchronization, swipe safety, sheet and return');

  await click('map-zoom-out'); await delay(300);
  await click('map-zoom-in'); await delay(300);
  await until(`document.querySelectorAll('.event-map-pin--spiderfied').length===2`);
  await evaluate(`document.querySelector('[data-testid="event-map"]').dispatchEvent(new WheelEvent('wheel',{deltaY:120,clientX:190,clientY:440,bubbles:true,cancelable:true}))`); await delay(400);
  await click('map-zoom-in'); await delay(350);
  await until(`document.querySelectorAll('.event-map-pin--spiderfied').length===2`);
  console.log('PASS zoom controls remain consistent after map gesture zoom');
  await evaluate(`document.querySelector('[data-testid="events-list-toggle"]').click()`);await until(`!document.querySelector('[data-testid="event-map"]')`);
  await evaluate(`document.querySelector('[data-testid="events-map-toggle"]').click()`);await until(`document.querySelector('[data-testid="event-map"] .event-map-cluster')`);
  await call('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:true});
  await until(`(()=>{const r=document.querySelector('[data-testid="${first}"]')?.getBoundingClientRect();return r&&r.left>=0&&r.right<=320})()`);
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=320`),true,'A 320px viewport has no horizontal page overflow');
  assert.equal(await evaluate(`document.querySelector('.leaflet-control-attribution').getBoundingClientRect().bottom<=document.querySelector('[data-testid="map-events-carousel"]').getBoundingClientRect().top-4`),true,'Attribution remains above cards at 320px');
  await capture((next?'next-':'')+'map-narrow-carousel');
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }); await delay(350);
  assert.equal(await evaluate(`{const e=document.querySelector('[data-testid="map-events-carousel"]');!!e&&e.getBoundingClientRect().height>0}`),false,'Desktop retains its existing map layout');
  if(!next)assert.equal(await evaluate(`Math.round(document.querySelector('[data-testid="event-map"]').getBoundingClientRect().top)`),0);
  await capture((next?'next-':'')+'map-desktop');
  console.log('PASS map/list remount and desktop responsive viewport');
  assert.deepEqual(errors, [], 'No unhandled browser exceptions');
}).catch(error => { console.error(error); process.exitCode = 1; });
