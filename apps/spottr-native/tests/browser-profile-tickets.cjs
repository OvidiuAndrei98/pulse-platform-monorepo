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
    const rows = [ticket(5, '20', 'Last night'), ticket(3, '06', 'ROOFTOP SESSIONS WITH A VERY LONG EVENT NAME'), first, ticket(2, '04', 'NOCTURNE'), ticket(4, '08', 'Pool party'), { ...first, id: id(20), ticketTypeName: 'VIP', validationHash: 'test-admission-20' }, ticket(6, '21', 'Warehouse'), ticket(7, '22', 'Closing party'), { ...ticket(8, '01', 'Older night'), startTime: '2024-10-01T18:30:00Z', endTime: '2024-10-02T04:00:00Z' }, { ...ticket(9, '01', 'Recent night'), startTime: '2025-10-01T18:30:00Z', endTime: '2025-10-02T04:00:00Z', isValidated: true }];
    if (params.has('many')) {
      rows.push(...Array.from({length: 400}, (_, i) => ({ ...first, id: id(1000 + i), validationHash: 'qa-only-' + i })));
      rows.push(...Array.from({length: 250}, (_, i) => ({ ...ticket(2000 + i, '01', 'Archived event ' + i), startTime: '2025-10-01T18:30:00Z', endTime: '2025-10-02T04:00:00Z' })));
    }
    if (params.has('admission')) first.isValidated = true;
    const qa = window.__qa = { unexpected: [], ticketRequests: 0, fail: params.has('fail'), empty: params.has('empty'), single: params.has('single') };
    window.fetch = async (input, options = {}) => {
      const url = new URL(String(input), location.origin), route = url.pathname.split('/api/v1')[1];
      if (!route) { if (url.origin === location.origin) return original(input, options); throw Error('External request blocked'); }
      const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      if (route === '/wardrobe/mine') return reply({ deposits: [], staffAccess: false });
      if (route === '/diagnostics/errors') return new Response(null, { status: 204 });
      if (route === '/users/me') return reply(user);
      if (route === '/users/me/tickets') { qa.ticketRequests++; return qa.fail ? reply({}, 503) : reply(qa.empty ? [] : qa.single ? [first] : rows.map(row => row.id === qa.usedTicketId ? { ...row, isValidated: true } : row)); }
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      if (['/events', '/promotions/active', '/users/me/saved-events', '/users/me/hidden-categories', '/users/me/orders', '/dashboard/ticket-validation/events', '/friends', '/feed'].includes(route)) return reply([]);
      qa.unexpected.push(route); return reply({}, 404);
    };
  }.toString()})();` });
  const el = name => `document.querySelector('[data-testid="${name}"]')`;
  const pass = el('profile-featured-pass'), preview = el('ticket-preview'), status = el('ticket-admission-status');
  const open = async query => { await call('Page.navigate', { url: base + '/users/me' + query }); };
  const closeQr = async () => { await delay(600); await click('sheet-handle'); await until(`!${preview}`); await delay(350); };
  const drag = async (dx, dy = 0) => {
    const point = await evaluate(`{const r=${el('ticket-fit-area')}.getBoundingClientRect();({x:r.x+r.width/2,y:r.y+r.height*.42})}`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    for (let step = 1; step <= 10; step++) { await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x+dx*step/10, y: point.y+dy*step/10, button: 'left', buttons: 1 }); await delay(16); }
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x+dx, y: point.y+dy, button: 'left', clickCount: 1 }); await delay(300);
  };
  await open(''); await until(pass);
  assert.ok(await evaluate(`${pass}.textContent.includes('AFTER DARK') && ${pass}.textContent.includes('2 tickets')`));
  assert.ok(await evaluate(`${pass}.textContent.includes('1 × General Access · 1 × VIP')`));
  assert.equal(await evaluate(`!!${el('profile-ticket-carousel')}`), false);
  assert.ok(await evaluate(`${el('profile-tickets-heading')}.textContent.includes('My tickets')`));
  assert.ok(await evaluate(`document.body.innerText.includes('View orders')`));
  await evaluate(`${pass}.scrollIntoView({block:'center'})`); await capture('wallet-profile');
  await click('profile-featured-pass-qr'); await until(`${preview}?.textContent.includes('Ticket 1 of 2')`); await delay(500);
  await click('ticket-picker-toggle'); await until(el('ticket-picker'));
  await click('ticket-picker-' + id(20)); await until(`!${el('ticket-picker')} && ${preview}?.textContent.includes('Ticket 2 of 2')`);
  await closeQr();
  await click('profile-tickets-all'); await until(el('tickets-page')); await until(el('tickets-event-' + id(11)));
  assert.equal(await evaluate(`!!${el('tickets-open-' + id(1))}`), false, 'Admissions stay collapsed initially');
  await capture('wallet-active');
  await click('tickets-expand-' + id(11)); await until(el('tickets-open-' + id(20))); await delay(450);
  await click('tickets-open-' + id(20)); await until(`${preview}?.textContent.includes('Ticket 2 of 2')`); await closeQr();
  const switchY = await evaluate(`${el('tickets-switch')}.getBoundingClientRect().top`);
  await evaluate(`${el('tickets-active-list')}.scrollTop=550`); await delay(200);
  assert.ok(Math.abs(await evaluate(`${el('tickets-switch')}.getBoundingClientRect().top`) - switchY) < 1);
  await click('tickets-tab-history'); await until(`document.body.innerText.includes('Recent night')`);
  assert.equal(await evaluate('location.pathname'), '/users/me/tickets');
  assert.equal(await evaluate(`!!${el('tickets-event-' + id(18))}`), false, 'Older month starts collapsed');
  await capture('wallet-history');
  await click('tickets-month-2024-10'); await until(el('tickets-event-' + id(18)));
  await click('tickets-expand-' + id(19)); await until(el('tickets-open-' + id(9)));
  assert.ok(await evaluate(`${el('tickets-open-' + id(9))}.textContent.includes('Used')`));
  await click('tickets-filter-expired'); await until(el('tickets-event-' + id(18)));
  assert.equal(await evaluate(`!!${el('tickets-event-' + id(19))}`), false);
  await click('account-back'); await until(pass);
  console.log('PASS one featured pass, direct QR/picker, grouped admissions, sticky switch and month history');

  await open('?admission=1'); await until(pass);
  assert.ok(await evaluate(`${pass}.textContent.includes('2 tickets')`), 'Used and valid admissions stay in one event');
  await click('profile-featured-pass-qr'); await until(`${preview}?.textContent.includes('Ticket 2 of 2')`); await delay(650);
  await drag(110); await until(`${preview}?.textContent.includes('Ticket 1 of 2') && ${status}?.textContent.includes('Used')`);
  await drag(110); assert.ok(await evaluate(`${preview}?.textContent.includes('Ticket 1 of 2')`));
  await drag(-110); await until(`${preview}?.textContent.includes('Ticket 2 of 2')`);
  await evaluate(`window.__qa.usedTicketId=${JSON.stringify(id(20))}`);
  await until(`${status}?.textContent.includes('Used')`, 8000);
  assert.ok(await evaluate(`${preview}?.textContent.includes('Ticket 2 of 2')`), 'Admission never switches the visible QR');
  await capture('wallet-qr-used');
  // Cross the sheet's distance threshold; a short synthetic flick depends on
  // Chrome/CDP scheduling and is not a reliable test of release velocity.
  await drag(0, 400); await until(`!${preview}`);
  const requests = await evaluate('window.__qa.ticketRequests'); await delay(5300);
  assert.equal(await evaluate('window.__qa.ticketRequests'), requests);
  await call('Page.navigate', { url: base + '/users/me/tickets?admission=1' });
  await until(el('tickets-event-' + id(11)));
  await click('tickets-expand-' + id(11)); await delay(450); await click('tickets-open-' + id(20)); await until(preview);
  await evaluate(`window.__qa.usedTicketId=${JSON.stringify(id(20))}`);
  await until(`${status}?.textContent.includes('Used')`, 8000);
  assert.ok(await evaluate(`${preview}?.textContent.includes('Ticket 2 of 2')`)); await closeQr();
  console.log('PASS valid-ticket priority, horizontal swipe, no wrapping, admission updates and bounded polling');

  await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true });
  await open('?lang=ro'); await until(pass); await evaluate(`${pass}.scrollIntoView({block:'center'})`);
  assert.ok(await evaluate(`${pass}.textContent.includes('2 bilete')`));
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
  await capture('wallet-profile-small-ro');
  await click('profile-tickets-all'); await until(el('tickets-page')); await delay(400);
  await click('tickets-qr-' + id(13)); await until(preview); await delay(650);
  const fit = await evaluate(`({area:${el('ticket-fit-area')}.getBoundingClientRect().height,bottom:${el('ticket-download')}.getBoundingClientRect().bottom})`);
  assert.ok(fit.area > 100 && fit.bottom <= 740, 'Long title QR and secondary PDF fit a narrow screen');
  await capture('wallet-qr-small-ro'); await closeQr();

  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call('Page.navigate', { url: base + '/users/me/tickets?many=1' }); await until(el('tickets-event-' + id(11)));
  await click('tickets-expand-' + id(11)); await delay(700);
  assert.ok(await evaluate(`document.querySelectorAll('[data-testid^="tickets-open-"]').length < 50`), '400-ticket event remains virtualized');
  await click('tickets-qr-' + id(11)); await until(preview); await delay(650); await click('ticket-picker-toggle'); await until(el('ticket-picker'));
  assert.ok(await evaluate(`document.querySelectorAll('[data-testid^="ticket-picker-000"]').length < 30`), 'Picker is virtualized');
  await capture('wallet-qr-picker'); await click('ticket-picker-close'); await closeQr();
  await click('tickets-tab-history'); await until(el('tickets-event-' + id(19))); await delay(600);
  assert.ok(await evaluate(`document.querySelectorAll('[data-testid^="tickets-event-"]').length < 50`), 'Large history remains virtualized');
  console.log('PASS Romanian, narrow viewport, large event picker and virtualized history');

  await open('?empty=1'); await until(`document.body.innerText.includes('You have no active tickets')`);
  assert.equal(await evaluate(`!!${pass}`), false);
  await click('profile-tickets-all'); await click('tickets-tab-history'); await until(`document.body.innerText.includes('No tickets in this category yet.')`);
  await open('?fail=1'); await until(`document.body.innerText.includes("We couldn't load this information.")`);
  await evaluate(`window.__qa.fail=false;Array.from(document.querySelectorAll('[role="button"]')).find(el=>el.textContent.trim()==='Try again').click()`);
  await until(pass);
  assert.deepEqual(await evaluate('window.__qa.unexpected'), []);
  assert.deepEqual(errors, []);
  console.log('PASS empty wallet, API failure/retry and no browser errors');
}).catch(error => { console.error(error); process.exitCode = 1; });
