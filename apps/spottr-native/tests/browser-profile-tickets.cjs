// Actual exported UI, isolated accounts/API; no real ticket credentials or servers.
const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

withBrowser(async ({ base, call, evaluate, until, click, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = fetch.bind(window), id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
    const params = new URL(location.href).searchParams;
    const user = { id: id(100), username: 'Franco', role: 'user', email: 'qa@example.test', preferredLanguage: params.get('lang') || 'en', hasPassword: true, createdAt: '2026-01-01T00:00:00Z' };
    localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'tickets-qa-only', user }));
    const ticket = (n, day, title) => ({ id: id(n), eventId: id(n + 10), eventTitle: title, ticketTypeName: 'General Access', locationName: 'Piata Unirii · Bucuresti', validationHash: 'test-admission-' + n, startTime: '2099-10-' + day + 'T18:30:00Z', endTime: '2099-10-' + day + 'T23:00:00Z', isValidated: false });
    const first = ticket(1, '02', 'AFTER DARK');
    const rows = [ticket(5, '20', 'Last night'), ticket(3, '06', 'ROOFTOP SESSIONS WITH A VERY LONG EVENT NAME'), first, ticket(2, '04', 'NOCTURNE'), ticket(4, '08', 'Pool party'), { ...first, id: id(20), ticketTypeName: 'VIP' }, ticket(6, '21', 'Warehouse'), ticket(7, '22', 'Closing party'), { ...ticket(8, '01', 'Older night'), startTime: '2024-10-01T18:30:00Z', endTime: '2024-10-02T04:00:00Z' }, { ...ticket(9, '01', 'Recent night'), startTime: '2025-10-01T18:30:00Z', endTime: '2025-10-02T04:00:00Z', isValidated: true }];
    const qa = window.__qa = { unexpected: [], ticketRequests: 0, fail: params.has('fail'), empty: params.has('empty'), single: params.has('single') };
    window.fetch = async (input, options = {}) => {
      const url = new URL(String(input), location.origin), route = url.pathname.split('/api/v1')[1];
      if (!route) { if (url.origin === location.origin) return original(input, options); throw Error('External request blocked'); }
      const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      if (route === '/users/me') return reply(user);
      if (route === '/users/me/tickets') { qa.ticketRequests++; return qa.fail ? reply({}, 503) : reply(qa.empty ? [] : qa.single ? [first] : rows); }
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      if (['/events', '/promotions/active', '/users/me/saved-events', '/users/me/hidden-categories', '/users/me/orders', '/dashboard/ticket-validation/events', '/friends', '/feed'].includes(route)) return reply([]);
      qa.unexpected.push(route); return reply({}, 404);
    };
  }.toString()})();` });
  const cards = `Array.from(document.querySelectorAll('[data-testid="profile-ticket-rail"] [role="button"]'))`;
  const rail = `document.querySelector('[data-testid="profile-ticket-rail"]')`;
  const open = async query => { await call('Page.navigate', { url: base + '/users/me' + query }); };
  const card = n => 'profile-ticket-' + id(n + 10);
  await open(''); await until(`${cards}.length>=4`);
  assert.equal(await evaluate(`${cards}[0].getAttribute('data-testid')`), card(1));
  assert.ok(await evaluate(`${cards}[0].textContent.includes('2 tickets')`));
  assert.ok(await evaluate(`${cards}[0].textContent.includes('General Access · VIP')`));
  await evaluate(`${rail}.scrollIntoView({block:'center'})`);
  const geometry = await evaluate(`{const cards=${cards}, first=cards[0].getBoundingClientRect(), next=cards[1].getBoundingClientRect();({first:{left:first.left,right:first.right,width:first.width},nextLeft:next.left,window:innerWidth})}`);
  assert.ok(geometry.first.left >= 19 && geometry.first.right < geometry.window - 20);
  assert.ok(geometry.nextLeft < geometry.window && geometry.nextLeft > geometry.first.right, 'Next card peeks into the viewport');
  await capture('profile-ticket-carousel-mobile');
  await click(card(1)); await until(`document.querySelector('[data-testid="ticket-preview"]')`);
  await delay(700);
  await until(`document.body.innerText.includes('Ticket 1 of 2')`);
  await evaluate(`document.querySelector('[aria-label="Next ticket"]').click()`);
  await until(`document.body.innerText.includes('Ticket 2 of 2')`);
  await click('sheet-handle'); await until(`!document.querySelector('[data-testid="ticket-preview"]')`);
  await delay(350);
  // RN Web decorates the node's scrollTo with the React Native {x, y} API.
  await evaluate(`${rail}.scrollLeft=338`); await delay(300);
  const before = await evaluate(`${rail}.scrollLeft`);
  assert.ok(before > 200);
  await click(card(2)); await until(`document.querySelector('[data-testid="ticket-preview"]')`);
  await delay(700);
  await click('sheet-handle'); await until(`!document.querySelector('[data-testid="ticket-preview"]')`); await delay(350);
  assert.ok(Math.abs(await evaluate(`${rail}.scrollLeft`) - before) < 2, 'Opening QR preserves the carousel position');
  await click('profile-tickets-tab-history'); await until(`${cards}.length===2`);
  assert.ok(await evaluate(`${cards}[0].textContent.includes('Recent night')`));
  assert.ok(await evaluate(`${cards}[1].textContent.includes('Older night')`));
  await click('profile-tickets-tab-active'); await until(`${cards}.length>=4`);
  assert.equal(await evaluate(`${rail}.scrollLeft`), 0, 'Returning to active starts with the next event');

  await call('Emulation.setDeviceMetricsOverride', { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false });
  await until(`document.querySelector('[data-testid="profile-ticket-next"]')`);
  await click('profile-ticket-next'); await until(`${rail}.scrollLeft>200`);
  await click('profile-ticket-prev'); await until(`${rail}.scrollLeft<2`);
  await evaluate(`${rail}.scrollIntoView({block:'center'})`); await capture('profile-ticket-carousel-desktop');
  assert.deepEqual(await evaluate('window.__qa.unexpected'), []);
  console.log('PASS chronological grouping, mobile peek, all QRs, preserved position, history order and desktop arrows');

  await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true });
  await open('?lang=ro'); await until(`${cards}.length>=4`);
  await evaluate(`${rail}.scrollIntoView({block:'center'})`); await capture('profile-ticket-carousel-small-ro');
  assert.ok(await evaluate(`${cards}[0].textContent.includes('2 bilete')`));
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), 'No horizontal page overflow at 320px');
  await open('?single=1'); await until(`${cards}.length===1`);
  assert.ok(await evaluate(`${rail}.scrollWidth<=${rail}.clientWidth+1`), 'One ticket does not leave a phantom next page');
  await open('?empty=1'); await until(`document.body.innerText.includes('You have no active tickets')`);
  assert.equal(await evaluate(`!!${rail}`), false);
  await click('profile-tickets-tab-history'); await until(`document.body.innerText.includes('No tickets in this category yet.')`);
  await open('?fail=1'); await until(`document.body.innerText.includes("We couldn't load this information.")`);
  assert.equal(await evaluate(`!!${rail}`), false);
  await evaluate(`window.__qa.fail=false;Array.from(document.querySelectorAll('[role="button"]')).find(el=>el.textContent.trim()==='Try again').click()`);
  await until(`${cards}.length>=4`);
  assert.deepEqual(await evaluate('window.__qa.unexpected'), []);
  assert.deepEqual(errors, []);
  console.log('PASS Romanian/narrow viewport, single ticket, empty/history and failed API states');
}).catch(error => { console.error(error); process.exitCode = 1; });
