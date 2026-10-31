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
    const event = n => ({ id: id(n), organizerId:id(3), title: 'Map event ' + n, category: 'TECHNO', locationName: 'QA Club', city: 'Bucuresti', description: 'Map event test description', latitude: n===3?44.4723:44.4323, longitude: n===3?26.1663:26.1063, startTime: '2020-01-01T20:00:00Z', endTime: '2035-10-11T04:00:00Z', ticketTypes: [], lineup: [] });
    window.fetch = async (url, options = {}) => {
      const parsed = new URL(String(url), location.origin);
      if (!parsed.pathname.includes('/api/v1/')) { if (parsed.origin === location.origin || parsed.hostname === 'tiles.openfreemap.org') return original(url, options); throw new Error('Unexpected external fetch'); }
      const route = parsed.pathname.split('/api/v1')[1]; qa.requests.push(route);
      const reply = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
      if (route === '/events') return reply([event(1), event(2), event(3)]);
      if (route.startsWith('/profiles/')) return reply({id:id(3),username:'QA organizer',companyName:'QA Events',followersCount:0});
      if (route.endsWith('/social')) return reply({ goingCount: 0, interestedCount: 0 });
      if (route.endsWith('/updates') || route === '/promotions/active' || route.endsWith('/attendees')) return reply([]);
      if (route.startsWith('/events/')) return reply(event(Number(route.slice(-1))));
      return reply([]);
    };
  }.toString()})();` });
  await call('Page.navigate', { url: origin + '/events' + (next?'?view=map':'') });
  if(!next){await until(`document.querySelector('[data-testid="events-map-toggle"]')`);await evaluate(`document.querySelector('[data-testid="events-map-toggle"]').click()`);}
  await until(`document.querySelector('[data-testid="event-map"] .spottr-map-cluster')`);
  if(!next){assert.equal(await evaluate(`Math.round(document.querySelector('[data-testid="event-map"]').getBoundingClientRect().top)`),0);assert.ok(await evaluate(`document.querySelector('[data-testid="event-map"]').getBoundingClientRect().height>=innerHeight-1`));}
  assert.equal(await evaluate(`document.querySelector('.spottr-map-cluster').textContent`), '2');
  assert.equal(await evaluate(`document.querySelector('.maplibregl-canvas').getBoundingClientRect().width>0`),true,'MapLibre WebGL canvas is present');
  await until(`document.querySelector('.maplibregl-ctrl-attrib').textContent.includes('OpenFreeMap')&&document.querySelector('.maplibregl-ctrl-attrib').textContent.includes('OpenMapTiles')&&document.querySelector('.maplibregl-ctrl-attrib').textContent.includes('OpenStreetMap')`);
  assert.equal(await evaluate(`document.querySelector('.maplibregl-ctrl-attrib').textContent.includes('Â')`),false);
  await evaluate(`document.querySelector('.spottr-map-cluster').focus()`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await until(`document.querySelectorAll('.spottr-map-pin').length>=1`);
  const first='map-event-card-00000000-0000-4000-8000-000000000001',second='map-event-card-00000000-0000-4000-8000-000000000002';
  await until(`document.querySelector('[data-testid="map-events-carousel"]')`);
  const handle=await evaluate(`(()=>{const node=document.querySelector('[data-testid="map-carousel-toggle"]'),r=node.getBoundingClientRect(),s=getComputedStyle(node);return{width:r.width,height:r.height,border:s.borderTopWidth,fill:s.backgroundColor,icons:node.querySelectorAll('svg').length};})()`);
  assert.equal(handle.width,52,'Expanded handle has a compact frame');assert.equal(handle.height,44,'The transparent button retains a full touch target');
  assert.equal(handle.fill,'rgba(0, 0, 0, 0)');assert.equal(parseFloat(handle.border),0);assert.equal(handle.icons,0,'Only the grip is visible, no oversized pill or chevron');
  assert.deepEqual(await evaluate(`(()=>{const node=document.querySelector('[data-testid="map-carousel-toggle"]'),grip=node.firstElementChild.getBoundingClientRect();return{width:grip.width,height:grip.height};})()`),{width:28,height:3},'The visible handle is only a discreet line');
  const hit=await evaluate(`(()=>{const node=document.querySelector('[data-testid="map-carousel-toggle"]'),r=node.getBoundingClientRect(),y=r.top+5,x=r.left+r.width/2;return{x,y,hits:node.contains(document.elementFromPoint(x,y))};})()`);
  assert.equal(hit.hits,true,'The transparent touch area extends well beyond the visible grip');
  await call('Input.dispatchMouseEvent',{type:'mousePressed',x:hit.x,y:hit.y,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:hit.x,y:hit.y,button:'left',clickCount:1});
  await until(`document.querySelector('[data-testid="map-carousel-toggle"]').getAttribute('aria-expanded')==='false'`);
  assert.ok(await evaluate(`document.querySelector('[data-testid="map-carousel-toggle"]').getBoundingClientRect().height>=44`),'Collapsed control remains a labeled touch target');
  await click('map-carousel-toggle');await delay(300);
  const geometry=await evaluate(`{const card=document.querySelector('[data-testid="${first}"]').getBoundingClientRect(),bar=document.querySelector('[data-bottom-nav] [data-bottom-nav-glass]')||document.querySelector('[data-testid="tab-bar"]'),nav=bar?.getBoundingClientRect();({left:card.left,right:card.right,top:card.top,bottom:card.bottom,navTop:nav?.top??innerHeight-86})}`);
  assert.ok(geometry.left>=0&&geometry.right<=390,'The first card fits the narrow viewport');
  assert.ok(geometry.bottom<=geometry.navTop-4,'Cards remain above bottom navigation');
  assert.equal(await evaluate(`document.querySelector('.maplibregl-ctrl-attrib').getBoundingClientRect().bottom<=document.querySelector('[data-testid="map-events-carousel"]').getBoundingClientRect().top-4`),true,'Map attribution remains above the carousel');
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
  // Tapping the visible neighbor selects and brings it into view, never opens it.
  const neighbor=await evaluate(`(()=>{const r=document.querySelector('[data-testid="${second}"]').getBoundingClientRect();return{x:r.left+Math.min(20,(innerWidth-r.left)/2),y:r.top+r.height/2};})()`);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...neighbor,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...neighbor,button:'left',clickCount:1});
  await until(`(()=>{const r=document.querySelector('[data-testid="${second}"]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})()`);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="event-sheet"]')||!!document.querySelector('dialog[open],[aria-modal="true"]')`),false,'Neighbor tap selects without opening details');
  await evaluate(`document.querySelector('[data-testid="${first}"]').click()`);await delay(600);
  await click('map-carousel-toggle');await delay(150);
  assert.equal(await evaluate(`document.querySelector('[data-testid="map-carousel-toggle"]').getAttribute('aria-expanded')`),'false');
  assert.equal(await evaluate(`(()=>{const r=document.querySelector('[data-testid="map-events-carousel"]')?.getBoundingClientRect();return !!r&&r.height>0;})()`),false,'Cards can be hidden');
  assert.ok(await evaluate(`document.querySelector('.maplibregl-ctrl-attrib').getBoundingClientRect().bottom<=document.querySelector('[data-testid="map-carousel-toggle"]').getBoundingClientRect().top-4`),'Attribution stays visible above the collapsed tray');
  await capture((next?'next-':'')+'map-collapsed-tray');
  await click('map-carousel-toggle');await delay(350);
  // A downward gesture starts near the card bottom and ends outside the tray.
  await call('Emulation.setTouchEmulationEnabled',{enabled:true});
  const drag=await evaluate(`(()=>{const r=document.querySelector('[data-testid="${first}"]').getBoundingClientRect();return{x:r.left+70,y:r.bottom-14};})()`);
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...drag,id:1}]});
  for(let step=1;step<=8;step++){await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:drag.x,y:drag.y+step*8,id:1}]});await delay(16);}
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await until(`document.querySelector('[data-testid="map-carousel-toggle"]')?.getAttribute('aria-expanded')==='false'`);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="event-sheet"]')||!!document.querySelector('dialog[open],[aria-modal="true"]')`),false,'Drag-to-hide does not activate a card');
  await delay(300);await evaluate(`document.querySelector('[data-testid="map-pin-00000000-0000-4000-8000-000000000001"]').click()`);
  await until(`document.querySelector('[data-testid="map-carousel-toggle"]')?.getAttribute('aria-expanded')==='true'`);
  await delay(400);
  await call('Emulation.setTouchEmulationEnabled',{enabled:true});
  const touch=await evaluate(`{const r=document.querySelector('[data-testid="${first}"]').getBoundingClientRect();({x:r.left+r.width*.75,y:r.top+r.height*.5})}`);
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touch,id:1}]});
  for(let step=1;step<=10;step++){await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x-step*18,y:touch.y,id:1}]});await delay(16);}
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(300);
  await until(`document.querySelector('[data-testid="map-pin-00000000-0000-4000-8000-000000000002"]')?.getAttribute('aria-pressed')==='true'||document.querySelector('[data-testid="map-pin-00000000-0000-4000-8000-000000000003"]')?.getAttribute('aria-pressed')==='true'`);
  await until(`Number(document.querySelector('[data-testid="event-map"]').dataset.zoom)>17`);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="event-sheet"]')||!!document.querySelector('[role="dialog"]')`),false,'A swipe never opens an event');
  await evaluate(`document.querySelector('[title="Map event 2"]').click()`);
  await until(`(()=>{const r=document.querySelector('[data-testid="${second}"]')?.getBoundingClientRect();return r&&r.left>=0&&r.right<=innerWidth})()`);
  await click(second);
  await until(next?`!!document.querySelector('[role="dialog"]')`:`!!document.querySelector('[data-testid="event-sheet"]')`);await delay(650);
  await capture((next?'next-':'')+'map-carousel-event-sheet');
  if(next){await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until(`!document.querySelector('[role="dialog"]')`);}
  else{await click('sheet-handle');await until(`!document.querySelector('[data-testid="event-sheet"]')`);}
  await until(`document.querySelector('[data-testid="map-events-carousel"]')`);
  const swipe=await evaluate(`{const r=document.querySelector('[data-testid="${second}"]').getBoundingClientRect();({x:r.left+r.width*.75,y:r.top+r.height*.5})}`);
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...swipe,id:1}]});
  for(let step=1;step<=10;step++){await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:swipe.x-step*24,y:swipe.y,id:1}]});await delay(16);}
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await until(`document.querySelector('[data-testid="map-pin-00000000-0000-4000-8000-000000000003"]')?.getAttribute('aria-pressed')==='true'`);
  await until(`Math.abs(Number(document.querySelector('[data-testid="event-map"]').dataset.latitude)-44.4723)<.001&&Math.abs(Number(document.querySelector('[data-testid="event-map"]').dataset.longitude)-26.1663)<.001`);
  assert.ok(await evaluate(`Number(document.querySelector('[data-testid="event-map"]').dataset.pitch)>=45`),'Event focus keeps the 3D pitch');
  await delay(600);await capture((next?'next-':'')+'map-vector-3d-focus');
  console.log('PASS '+(next?'Next':'Native web')+' bottom carousel, cluster expansion, pin/card synchronization, swipe safety, sheet and return');

  await click('map-zoom-out'); await delay(300);
  await click('map-zoom-in'); await delay(300);
  await until(`document.querySelectorAll('.spottr-map-pin').length>=1`);
  await evaluate(`document.querySelector('[data-testid="event-map"]').dispatchEvent(new WheelEvent('wheel',{deltaY:120,clientX:190,clientY:440,bubbles:true,cancelable:true}))`); await delay(400);
  await click('map-zoom-in'); await delay(350);
  await until(`document.querySelectorAll('.spottr-map-pin').length>=1`);
  console.log('PASS zoom controls remain consistent after map gesture zoom');
  await evaluate(`document.querySelector('[data-testid="events-list-toggle"]').click()`);await until(`!document.querySelector('[data-testid="event-map"]')`);
  await evaluate(`document.querySelector('[data-testid="events-map-toggle"]').click()`);await until(`document.querySelector('[data-testid="map-events-carousel"]')`);
  await call('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:true});
  await until(`(()=>{const r=document.querySelector('[data-testid="${first}"]')?.getBoundingClientRect();return r&&r.left>=0&&r.right<=320})()`);
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=320`),true,'A 320px viewport has no horizontal page overflow');
  assert.equal(await evaluate(`document.querySelector('.maplibregl-ctrl-attrib').getBoundingClientRect().bottom<=document.querySelector('[data-testid="map-events-carousel"]').getBoundingClientRect().top-4`),true,'Attribution remains above cards at 320px');
  await capture((next?'next-':'')+'map-narrow-carousel');
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }); await delay(350);
  assert.equal(await evaluate(`{const e=document.querySelector('[data-testid="map-events-carousel"]');!!e&&e.getBoundingClientRect().height>0}`),false,'Desktop retains its existing map layout');
  if(!next)assert.equal(await evaluate(`Math.round(document.querySelector('[data-testid="event-map"]').getBoundingClientRect().top)`),0);
  await capture((next?'next-':'')+'map-desktop');
  console.log('PASS map/list remount and desktop responsive viewport');
  assert.deepEqual(errors, [], 'No unhandled browser exceptions');
}).catch(error => { console.error(error); process.exitCode = 1; });
