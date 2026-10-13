// Exported app; all API calls, clipboard writes and downloads are isolated fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { withBrowser } = require('./browser-harness.cjs');
const dist = path.resolve(__dirname, '../dist');
const banner = '/assets/' + fs.readdirSync(path.join(dist, 'assets'), { recursive: true }).find(name => /party-event\..*\.webp$/.test(name)).replaceAll('\\', '/');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
withBrowser(async ({ base, call, evaluate, until, click, input, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock(banner) {
    const original = fetch.bind(window), id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const params = new URL(location.href).searchParams;
    const user = { id: id(params.has('other') ? 101 : 100), username: 'QA', role: 'user', email: 'qa@example.test', hasPassword: true, preferredLanguage: params.has('ro') ? 'ro' : 'en', createdAt: '2026-01-01T00:00:00Z' };
    localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'search-qa-only', user }));
    const qa = window.__qa = { requests: [], writes: [], download: null, failImage: false, copied: '', slowFinished: false };
    const event = { id: id(1), title: params.has('long') ? 'AN EXTRAORDINARILY LONG NIGHT WITH FRIENDS IN BUCHAREST AFTER THE RAIN AND BEFORE THE SUNRISE' : 'After dark', organizerId: id(50), category: 'TECHNO', city: 'Bucuresti', locationName: 'Test venue', startTime: '2035-10-08T18:00:00Z', endTime: '2035-10-09T02:00:00Z', bannerUrl: location.origin + banner, ticketTypes: [], lineup: [], description: 'QA event' };
    const people = [{ id: id(50), username: 'Club', organizerName: 'QA Organizer', role: 'organizer', relationship: 'none' }, { id: id(2), username: 'Alex', role: 'user', relationship: 'none' }];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { qa.copied = text; } } });
    const anchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download === 'spottr-story.png') qa.download = this.href; else anchorClick.call(this); };
    window.fetch = async (input, options = {}) => {
      const url = new URL(String(input), location.origin), route = url.pathname.split('/api/v1')[1];
      if (!route) { if (qa.failImage && url.pathname.includes('party-event')) return new Response('', { status: 503 }); if (url.origin === location.origin) return original(input, options); throw Error('Unexpected external request'); }
      qa.requests.push({ route, query: url.search }); if (options.method && options.method !== 'GET') qa.writes.push(route);
      const reply = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
      if (route === '/users/me') return reply(user);
      if (route === '/profiles/search') { if (url.searchParams.get('q') === 'slow') { await new Promise(resolve => setTimeout(resolve, 1100)); qa.slowFinished = true; } const kind = url.searchParams.get('kind'); return reply(people.filter(p => !kind || (p.role === 'organizer') === (kind === 'organizers'))); }
      if (route === '/events') { if (url.searchParams.get('q') === 'slow') { await new Promise(resolve => setTimeout(resolve, 1000)); return reply([{ ...event, title: 'Stale event' }]); } return reply([event]); }
      if (route === '/events/' + event.id) return reply(event);
      if (route.endsWith('/social')) return reply({ friends: [], goingCount: 0, interestedCount: 0 });
      if (route.startsWith('/profiles/')) return reply(people[0]);
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      return reply([]);
    };
  }.toString()})(${JSON.stringify(banner)});` });
  const el = id => `document.querySelector('[data-testid="${id}"]')`;
  const open = async route => { await call('Page.navigate', { url: base + route }); await until(`!${el('startup-cover')} && ${el('search-screen')}`); };
  const submit = async () => { await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); };
  await open('/search'); await until(`document.body.innerText.toLowerCase().includes('recommended for you') && document.body.innerText.includes('After dark')`);
  await input('event-search', 'tech'); await delay(300); await click('search-clear');
  assert.equal(await evaluate(`!!${el('recent-searches')}`), false, 'Typing alone does not store queries');
  await input('event-search', 'Techno'); await submit(); await click('search-clear');
  await until(`${el('recent-searches')}?.textContent.includes('Techno')`);
  assert.match(await evaluate('document.body.innerText'), /Recommended for you/i);
  await capture('search-recent-recommended');
  await click('recent-search-0'); await click('search-filter-organizers');
  await until(`${el('search-profile-' + id(50))} && !${el('search-profile-' + id(2))}`);
  assert.ok(await evaluate(`window.__qa.requests.some(r=>r.route==='/profiles/search'&&r.query.includes('kind=organizers'))`));
  await click('search-filter-people'); await until(`${el('search-profile-' + id(2))} && !${el('search-profile-' + id(50))}`);
  await capture('search-people-filter');
  await click('search-filter-events'); await input('event-search', 'slow'); await delay(240); await input('event-search', 'new'); await delay(1400);
  assert.equal(await evaluate('document.body.innerText.includes("Stale event")'), false, 'Old results cannot replace new query');
  await submit(); await click('search-clear'); await until(`${el('recent-search-0')}?.textContent==='new'`);
  await open('/search'); await until(`${el('recent-search-0')}?.textContent==='new'`);
  await click('recent-remove-0'); await until(`${el('recent-search-0')}?.textContent==='Techno'`);
  await open('/search?other'); assert.equal(await evaluate(`!!${el('recent-searches')}`), false, 'History isolated per account');
  await open('/search'); await until(el('search-clear-recent')); await click('search-clear-recent'); await until(`!${el('recent-searches')}`);
  assert.match(await evaluate('document.body.innerText'), /Recommended for you/i);
  console.log('PASS recent queries persist, are isolated, removable, coexist with recommendations; filters and stale responses');

  await call('Page.navigate', { url: base + '/events/' + id(1) }); await until(el('event-create-story')); await click('event-create-story');
  await until(`${el('story-export')}?.getAttribute('aria-disabled')!=='true' && ${el('story-artwork')}`, 22000);
  await capture('event-story-preview'); await click('story-export'); await until('window.__qa.download');
  const data = await evaluate('window.__qa.download'), bytes = Buffer.from(data.split(',')[1], 'base64');
  assert.equal(bytes.subarray(1,4).toString(), 'PNG'); assert.equal(bytes.readUInt32BE(16),1080); assert.equal(bytes.readUInt32BE(20),1920);
  fs.writeFileSync(path.resolve(__dirname,'../artifacts/event-story-export.png'),bytes);
  assert.ok(bytes.length>70000,'Export contains embedded event image');
  await click('story-copy-link'); await until(`window.__qa.copied.includes('/events/${id(1)}')`);
  await click('story-close'); await until(`!${el('event-story')}`);
  await evaluate('window.__qa.failImage=true'); await click('event-create-story'); await until(`document.body.innerText.includes("event image couldn't be loaded")`);
  assert.equal(await evaluate(`${el('story-export')}.getAttribute('aria-disabled')`),'true');
  await click('story-close'); await call('Page.navigate',{url:base+'/events/'+id(1)+'?long&ro'}); await until(el('event-create-story')); await click('event-create-story');
  await until(`${el('story-export')}?.getAttribute('aria-disabled')!=='true' && ${el('story-artwork')}`,22000);
  await call('Emulation.setDeviceMetricsOverride',{width:320,height:640,deviceScaleFactor:1,mobile:true}); await delay(250); await capture('event-story-small-ro');
  assert.ok(await evaluate(`${el('story-copy-link')}.getBoundingClientRect().bottom<=innerHeight`), 'Small screen actions remain visible');
  assert.deepEqual(await evaluate('window.__qa.writes'),[]); assert.deepEqual(errors,[]);
  console.log('PASS story preview, embedded PNG 1080x1920, copy link, missing image handling and narrow Romanian layout');
}).catch(error=>{console.error(error);process.exitCode=1;});
