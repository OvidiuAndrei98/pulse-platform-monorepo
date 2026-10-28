// Local UI regression: real pages/IndexedDB, isolated fake API and payment provider.
const assert = require('node:assert/strict');
const { withBrowser } = require('../../spottr-native/tests/browser-harness.cjs');
const base = process.env.NAVIGATION_TEST_URL || 'http://localhost:3206';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw Error('LOCAL_TEST_SERVER_REQUIRED');
const eventId = '00000000-0000-4000-8000-000000000001';

withBrowser(async ({ call, evaluate, until, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = window.fetch.bind(window), id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
    const params = new URLSearchParams(location.search);
    localStorage.setItem('pulse_token', 'isolated-flow-test');
    localStorage.setItem('i18nextLng', 'en');
    const qa = window.__qa = { offline: false, status: params.get('outcome') || 'pending', purchases: [], scans: [], syncs: [], reconciles: [], accepted: [], requests: [], priceChanged: false };
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !qa.offline });
    const event = { id: id(1), organizerId: id(2), title: 'Flow QA Night', description: 'Local checkout and scanner verification.', locationName: 'QA Venue', city: 'Cluj-Napoca', latitude: 46.77, longitude: 23.59, category: 'TECHNO', status: 'published', startTime: '2020-01-01T18:00:00Z', endTime: '2099-01-02T04:00:00Z', commissionRateBps: 500, commissionPerTicketBani: 150, canManage: true, stats: { isFavorited: false, goingCount: 0 }, ticketTypes: [{ id: id(3), name: 'General QA', priceRon: 50, capacity: 100, ticketsSold: 0, startSales: '2020-01-01T00:00:00Z', endSales: '2099-01-01T23:00:00Z' }], lineup: [] };
    const billing = { type: 'individual', name: 'Buyer QA', taxId: '', registrationNumber: '', address: 'Test Street 10', city: 'Cluj-Napoca', county: 'Cluj', sector: '', country: 'Romania' };
    window.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname === '/health') return new Response('', { status: qa.offline ? 503 : 200 });
      if (!url.pathname.includes('/api/v1/')) {
        if (url.origin === location.origin) return original(input, init);
        throw Error('Unexpected external fetch: ' + url.origin);
      }
      const route = url.pathname.split('/api/v1')[1], body = init.body ? JSON.parse(init.body) : {};
      qa.requests.push(route);
      if (qa.offline) throw new TypeError('Network request failed');
      const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
      if (route === '/users/me') return reply({ id: id(9), username: 'Buyer QA', email: 'buyer@example.test', role: 'organizer', preferredLanguage: 'en', hasPassword: true, createdAt: '2026-01-01T00:00:00Z' });
      if (route === '/users/me/billing-details') return reply({ details: billing });
      if (route === '/events' || route === '/dashboard/events' || route === '/dashboard/ticket-validation/events') return reply([event]);
      if (route === '/events/' + id(1)) return reply(event);
      if (route.includes('/organizer/profile/') || route === '/dashboard/stripe/status') return reply({ isVerified: true, verificationStatus: 'approved', companyName: 'QA Venue', stripeChargesEnabled: true, stripePayoutsEnabled: true });
      if (route.startsWith('/profiles/')) return reply({ id: id(2), username: 'QA Venue', role: 'organizer', followsOrganizer: false, relationship: 'none' });
      if (route.endsWith('/social')) return reply({ friends: [], goingCount: 0, interestedCount: 0 });
      if (route.endsWith('/tickets/purchase')) {
        qa.purchases.push({ body, key: new Headers(init.headers).get('Idempotency-Key') });
        await new Promise(resolve => setTimeout(resolve, 200));
        if (qa.priceChanged) return reply({ error: 'CHECKOUT_PRICE_CHANGED', detail: 'CHECKOUT_PRICE_CHANGED', title: 'CHECKOUT_PRICE_CHANGED' }, 409);
        // Stay local while exercising the real browser redirect and confirmation page.
        sessionStorage.setItem('flow-qa-purchase', JSON.stringify(qa.purchases));
        return reply({ orderId: id(8), sessionId: 'cs_test_flow', checkoutUrl: location.origin + '/checkout/success?session_id=cs_test_flow&event_id=' + id(1) + '&outcome=completed' }, 201);
      }
      if (route === '/checkout/reconcile') { qa.reconciles.push(body); return reply({ status: qa.status, orderId: id(8) }); }
      if (route.endsWith('/offline-snapshot')) return reply({ snapshotId: id(80), eventId: id(1), eventTitle: event.title, generatedAt: new Date().toISOString(), expiresAt: '2099-01-02T04:00:00Z', ticketCount: 2, tickets: ['a', 'b'].map((char, index) => ({ ticketId: id(90 + index), ticketType: 'General QA', validationHash: char.repeat(64) })) });
      if (route.endsWith('/offline-sync')) { qa.syncs.push(body); return reply({ results: body.scans.map(scan => ({ clientScanId: scan.clientScanId, status: 'accepted' })) }); }
      if (route.endsWith('/tickets/validate')) {
        qa.scans.push(body.validationHash);
        const valid = ['a'.repeat(64), 'b'.repeat(64)].includes(body.validationHash);
        const duplicate = qa.accepted.includes(body.validationHash);
        if (valid && !duplicate) qa.accepted.push(body.validationHash);
        return reply({ status: !valid ? 'invalid' : duplicate ? 'already_validated' : 'valid', ticketType: 'General QA', eventTitle: event.title });
      }
      if (route.endsWith('/my-scans')) return reply({ totalScans: qa.accepted.length, scans: [] });
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      return reply([]);
    };
  }.toString()})();` });
  const press = async text => {
    const selector = `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
    await until(selector, 60000); await evaluate(`${selector}.click()`);
  };
  const open = async route => { await call('Page.navigate', { url: base + route }); await until('window.__qa && document.readyState === "complete"', 60000); };
  await open('/dashboard/ticket-validation');
  await until(`document.body.innerText.includes('Flow QA Night') && document.querySelector('textarea')`, 60000);
  const scan = async (code, message) => {
    await evaluate(`{ const input=document.querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(code.repeat(64))}); input.dispatchEvent(new Event('input',{bubbles:true})); }`);
    await until(`!document.querySelector('textarea').closest('form').querySelector('button').disabled`);
    await evaluate(`document.querySelector('textarea').closest('form').requestSubmit()`);
    await until(`document.body.textContent.includes(${JSON.stringify(message)})`);
  };
  await evaluate(`document.querySelector('details').open=true`);
  await scan('a', 'Valid ticket');
  await scan('a', 'Ticket already');
  await scan('z', 'The ticket is invalid');
  assert.equal(await evaluate('window.__qa.accepted.length'), 1);
  console.log('PASS Next scanner online validation, duplicate and invalid ticket');
  await press('Prepare offline');
  await until(`document.body.textContent.includes('Offline package ready with 2 tickets.')`, 7000);
  await evaluate(`window.__qa.offline=true;window.dispatchEvent(new Event('offline'))`);
  await scan('b', 'Ticket accepted offline');
  await scan('b', 'Ticket already scanned on this device');
  await scan('z', 'Ticket is not in the offline package');
  assert.equal(await evaluate('window.__qa.scans.length'), 3, 'Offline validations must stay local');
  await evaluate(`window.__qa.offline=false;window.dispatchEvent(new Event('online'))`);
  await until(`window.__qa.syncs.length>0 && document.body.textContent.includes('Offline scans were synchronized.')`);
  assert.equal(await evaluate('window.__qa.syncs[0].scans.length'), 1);
  await capture('flow-qa-next-scanner');
  console.log('PASS Next offline preparation, durable admission, duplicate detection and reconnect sync');

  await open('/events/' + eventId);
  await until(`document.querySelector('main input[type=radio]')`, 60000);
  await evaluate(`document.querySelector('main input[type=radio]').click()`);
  await evaluate(`Array.from(document.querySelectorAll('main button')).find(b=>b.textContent.trim().startsWith('Continue')).click()`);
  await until(`document.querySelector('aside[role=dialog]')`);
  const nextStep = async () => { await until(`!document.querySelector('aside[role=dialog] footer button').disabled`); await evaluate(`document.querySelector('aside[role=dialog] footer button').click()`); };
  await nextStep(); await until(`document.querySelector('aside[role=dialog] input[type=email]')`);
  await nextStep(); await until(`document.querySelector('aside[role=dialog] footer button').textContent.toLowerCase().includes('pay')`);
  assert.equal(await evaluate('window.__qa.purchases.length'), 0, 'Opening checkout does not create a payment');
  await evaluate(`{const button=document.querySelector('aside[role=dialog] footer button');button.click();button.click();}`);
  await until(`document.querySelector('[data-testid="checkout-view-tickets"]')`, 60000);
  const purchases = await evaluate(`JSON.parse(sessionStorage.getItem('flow-qa-purchase'))`);
  assert.equal(purchases.length, 1); assert.equal(purchases[0].body.expectedTotalBani, 5400);
  assert.match(purchases[0].key, /^[a-f\d-]{36}$/i);
  assert.equal(await evaluate('window.__qa.reconciles.length > 0'), true);
  console.log('PASS Next checkout billing, 5% + 1.50 fee, double-click protection, redirect and server-confirmed success');
  for (const status of ['pending', 'failed', 'refunded']) {
    await open('/checkout/success?session_id=cs_test_flow&event_id=' + eventId + '&outcome=' + status);
    await until(`document.querySelector('[data-testid="checkout-return"]') && window.__qa.reconciles.length>0`, 60000);
    await delay(status === 'pending' ? 5200 : 400);
    assert.equal(await evaluate(`Boolean(document.querySelector('[data-testid="checkout-view-tickets"]'))`), false, status + ' must not show success');
    assert.equal(await evaluate('window.__qa.purchases.length'), 0);
  }
  await open('/checkout/success'); await until(`document.body.textContent.includes('incomplete')`, 60000);
  assert.equal(await evaluate('window.__qa.reconciles.length'), 0);
  assert.deepEqual(errors, []);
  console.log('PASS Next pending, failed, refunded and missing callbacks never issue false success or create purchases');
}).catch(error => { console.error(error); process.exitCode = 1; });
