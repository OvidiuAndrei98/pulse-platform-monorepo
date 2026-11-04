const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');
const origin = process.env.DATE_RIBBON_TEST_URL || 'http://127.0.0.1:8083';
const next = process.env.DATE_RIBBON_TEST_APP === 'next';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));

withBrowser(async ({ call, evaluate, until, click, delay, capture, errors }) => {
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    localStorage.removeItem('pulse_token'); localStorage.removeItem('spottr-native.session.v1'); localStorage.setItem('i18nextLng', 'en');
    const original = fetch.bind(window); window.__ribbonQA = { requests: [], haptics: 0 };
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => { window.__ribbonQA.haptics++; return true; } });
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const shift = by => { const date = new Date(day + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + by); return date.toISOString().slice(0, 10); };
    window.__ribbonQA.day = shift;
    const event = by => ({ id: '00000000-0000-4000-8000-' + String(by).padStart(12, '0'), organizerId: '00000000-0000-4000-8000-000000000099', title: 'Calendar night ' + by, category: 'HOUSE', city: 'Bucuresti', vibe: 'Indoor', locationName: 'Calendar Club', latitude: 44.4268, longitude: 26.1025, startTime: shift(by) + 'T18:00:00Z', endTime: shift(by) + 'T22:00:00Z', description: 'Calendar preview', ticketTypes: [], lineup: [] });
    window.fetch = async (url, options) => {
      const parsed = new URL(String(url), location.origin);
      if (!parsed.pathname.includes('/api/v1/')) return original(url, options);
      const route = parsed.pathname.split('/api/v1')[1], reply = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
      if (route === '/events') {
        const q = Object.fromEntries(parsed.searchParams); window.__ribbonQA.requests.push(q);
        return reply([2, 3].map(event).filter(row => (!q.startsAfter || row.endTime > q.startsAfter) && (!q.startsBefore || row.startTime < q.startsBefore)));
      }
      if (route.endsWith('/social')) return reply({ friends: [], goingCount: 0, interestedCount: 0 });
      return reply([]);
    };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(success, failure) { failure({ code: 1, message: 'Test permission denied' }); } } });
  }.toString()})();` });
  await call('Page.navigate', { url: origin + '/events' }).catch(error => { console.log('Navigation is still compiling:', error.message); });
  await until(`document.querySelector('[data-testid="discovery-calendar-toggle"]')`, 90000);
  await until(`window.__ribbonQA.requests.length>0`);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="discovery-date-ribbon"]')`), false, 'The band starts closed');
  const listTop = await evaluate(`document.querySelector('[data-testid="events-list"]')?.getBoundingClientRect().top??document.querySelector('[data-nav-scroll="events-list"]')?.getBoundingClientRect().top`);
  await evaluate(`document.querySelector('[data-testid="discovery-date-surface"]').dataset.qaIdentity='same'`);
  const recordMorph = () => evaluate(`(()=>{
    __ribbonQA.frames=[];const deadline=performance.now()+550;
    const opacity=node=>{let value=1;for(;node&&node!==document.body;node=node.parentElement)value*=Number(getComputedStyle(node).opacity);return value;};
    const sample=()=>{__ribbonQA.frames.push(opacity(document.querySelector('[data-testid="discovery-calendar-morph-icon"]')));if(performance.now()<deadline)requestAnimationFrame(sample);};requestAnimationFrame(sample);
  })()`);
  await recordMorph();
  await click('discovery-calendar-toggle');
  await until(`document.querySelector('[data-testid="discovery-date-ribbon"]')`);
  await delay(300);
  assert.ok(await evaluate('__ribbonQA.frames.every(opacity=>opacity>0.65)'), 'The calendar glyph remains visible throughout the material handoff');
  assert.equal(await evaluate(`document.querySelector('[data-testid="discovery-date-surface"]').dataset.qaIdentity`), 'same', 'One material morphs instead of remounting');
  assert.equal(await evaluate(`document.querySelector('[data-testid="events-list"]')?.getBoundingClientRect().top??document.querySelector('[data-nav-scroll="events-list"]')?.getBoundingClientRect().top`), listTop, 'Opening does not push events down');
  assert.equal(await evaluate(`window.__ribbonQA.requests.some(q=>q.startsBefore)`), false, 'Opening does not silently select today');
  const yesterday=await evaluate('__ribbonQA.day(-1)');
  assert.equal(await evaluate(`(()=>{const node=document.querySelector('[data-testid="ribbon-context-day-${yesterday}"]');return !!node&&node.tagName!=='BUTTON'&&node.getAttribute('role')!=='button';})()`),true,'Previous days are decoration outside the selectable dates');
  await evaluate(`document.querySelector('[data-testid="discovery-date-scroll"]').scrollLeft=-500`);
  assert.equal(await evaluate(`document.querySelector('[data-testid="discovery-date-scroll"]').scrollLeft`),0,'The scroll range starts at today');
  await capture((next ? 'next-' : 'native-') + 'date-ribbon-open');
  let day = await evaluate('__ribbonQA.day(2)');
  await until(`document.querySelector('[data-testid="ribbon-day-${day}"]')`);
  const beforeTap=await evaluate('__ribbonQA.haptics');
  await evaluate(`document.querySelector('[data-testid="ribbon-day-${day}"]').click()`);
  await until(`__ribbonQA.requests.some(q=>q.startsBefore)`);
  await delay(350);
  if(!next)assert.equal(await evaluate('__ribbonQA.haptics'),beforeTap+1,'An intentional day tap produces one immediate tick, without replaying its animated scroll');
  let selectedRange = await evaluate('({...__ribbonQA.requests.at(-1)})');
  assert.ok(selectedRange.startsAfter && selectedRange.startsBefore);
  assert.equal((Date.parse(selectedRange.startsBefore) - Date.parse(selectedRange.startsAfter)) / 3600000, 24);
  const centering = await evaluate(`(()=>{const day=document.querySelector('[data-testid="ribbon-day-${day}"]').getBoundingClientRect(),surface=document.querySelector('[data-testid="discovery-date-surface"]').getBoundingClientRect();return Math.abs(day.left+day.width/2-surface.left-surface.width/2);})()`);
  assert.ok(centering < 2, 'Selected day is centered: ' + centering);
  await capture((next ? 'next-' : 'native-') + 'date-ribbon-mobile');
  assert.equal(await evaluate(`document.querySelector('[data-testid="ribbon-day-${day}"]').getBoundingClientRect().width`),44,'Date centers are spaced 44px apart');
  await click('discovery-calendar-reset');
  await until(`!__ribbonQA.requests.at(-1).startsBefore&&!document.querySelector('[data-testid="discovery-date-track"] [aria-pressed="true"]')`);
  assert.ok(await evaluate(`!!document.querySelector('[data-testid="discovery-date-ribbon"]')`),'Reset clears the date without closing the ribbon');
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="discovery-calendar"]')`),false,'Undo never opens the monthly calendar');
  day = await evaluate('__ribbonQA.day(3)');
  await evaluate(`document.querySelector('[data-testid="ribbon-day-${day}"]').click()`);
  await until(`!!__ribbonQA.requests.at(-1).startsBefore&&__ribbonQA.requests.at(-1).startsBefore!==${JSON.stringify(selectedRange.startsBefore)}`);
  selectedRange = await evaluate('({...__ribbonQA.requests.at(-1)})');
  await recordMorph();
  await click('discovery-calendar-close');
  await until(`!document.querySelector('[data-testid="discovery-date-ribbon"]')`);
  await delay(550);
  assert.ok(await evaluate('__ribbonQA.frames.every(opacity=>opacity>0.65)'), 'The glyph returns without disappearing during collapse');
  assert.equal(await evaluate(`document.querySelectorAll('[data-testid="discovery-calendar-morph-icon"]').length`),1,'The icon lives inside the single morphing material');
  const calendarStroke=await evaluate(`getComputedStyle(document.querySelector('[data-testid="discovery-calendar-glyph"] svg')).stroke`);
  const channels=calendarStroke.match(/\d+/g)?.map(Number)??[];
  assert.ok(channels.length>=3&&Math.min(...channels.slice(0,3))>220&&Math.max(...channels.slice(0,3))-Math.min(...channels.slice(0,3))<5,'Selecting a date retains the neutral calendar glyph: '+calendarStroke);
  await click('events-map-toggle');
  await until(`document.querySelector('[data-testid="event-map"]')`, 60000);
  await click('discovery-calendar-toggle');
  await until(`document.querySelector('[data-testid="discovery-date-ribbon"]')`);
  assert.equal(await evaluate(`document.querySelector('[data-testid="ribbon-day-${day}"]')?.getAttribute('aria-pressed')`), 'true', 'Map retains the selected list date');
  const last = await evaluate('({...__ribbonQA.requests.at(-1)})');
  assert.equal(last.startsBefore, selectedRange.startsBefore);
  await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true });
  await delay(250);
  assert.ok(await evaluate(`(()=>{const r=document.querySelector('[data-testid="discovery-date-ribbon"]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+.5;})()`), 'The band fits a narrow phone');
  await capture((next ? 'next-' : 'native-') + 'date-ribbon-map-narrow');
  await delay(200);
  if(!next){
    await evaluate(`(async()=>{const scroll=document.querySelector('[data-testid="discovery-date-scroll"]');scroll.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,pointerType:'touch'}));__ribbonQA.haptics=0;for(const index of [4,5,6,5,4,3]){scroll.scrollLeft=index*44;await new Promise(resolve=>setTimeout(resolve,80));}})()`);
    assert.equal(await evaluate('__ribbonQA.haptics'),6,'Slow movement and reversals trigger each crossed day once');
  }
  await evaluate(`(()=>{const scroll=document.querySelector('[data-testid="discovery-date-scroll"]');scroll.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,pointerType:'touch'}));__ribbonQA.haptics=0;scroll.scrollLeft=80*44;})()`);
  await until(`__ribbonQA.requests.at(-1).startsBefore!==${JSON.stringify(selectedRange.startsBefore)}&&!!__ribbonQA.requests.at(-1).startsBefore`);
  await delay(250);
  const haptics=await evaluate('__ribbonQA.haptics');
  if(next)assert.ok(haptics>=77,'Fast scrolling requests each crossed day, received '+haptics);
  else{
    assert.ok(haptics>=1&&haptics<=2,'A batched scroll jump reports the current selection without a catch-up burst: '+haptics);
    await delay(250);assert.equal(await evaluate('__ribbonQA.haptics'),haptics,'No haptic tail after scrolling stops');
  }
  const centeredDay=await evaluate(`document.querySelector('[data-testid="discovery-date-track"] [aria-pressed="true"]')?.getAttribute('data-testid')`);
  assert.equal(centeredDay,'ribbon-day-'+await evaluate('__ribbonQA.day(80)'),'Recentering preserves the selected day beyond the initial visible dates');
  assert.ok(await evaluate(`document.querySelector('[data-testid="discovery-calendar-reset"]').textContent.includes(__ribbonQA.day(80).slice(0,4))`),'Year is shown once, outside the narrow day cells');
  await click('discovery-calendar-reset');
  await until(`!__ribbonQA.requests.at(-1).startsBefore`);
  assert.deepEqual(errors, [], 'No browser exceptions');
  console.log('PASS ' + (next ? 'Next' : 'Native web') + ': single material, continuous icon, 44px dates, centered selection, map/list continuity, 320px layout, direct undo');
}).catch(error => { console.error(error); process.exitCode = 1; });
