// Isolated production bundle + simulated API/browser payment. No real purchases.
const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');
withBrowser(async ({ base, call, evaluate, until, click, input, delay, capture, errors }) => {
  const id = n => '12345678-abcd-abcd-abcd-' + String(n).padStart(12, '0');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = fetch.bind(window), id = n => '12345678-abcd-abcd-abcd-' + String(n).padStart(12, '0');
    const user = { id: id(999), username: 'Buyer QA', email: 'buyer@example.test', role: 'user', hasPassword: true, preferredLanguage: 'en', showAttendancePublicly: false, createdAt: '2026-10-01T12:00:00Z' };
    const qa = window.__qa = { purchase: [], bookings: [], rsvp: [], reconciliations: [], confirmation: 'pending', paymentCode: 200, paymentError: 'test_error', legacyResponse: true, tierPrice: 50, promoDelay: 0, promoRequests: [], status: null, saved: null, billingWrites: [] };
    const event = () => ({ id: id(1), organizerId: id(2), title: 'Checkout QA', category: 'TECHNO', locationName: 'Test venue', city: 'Bucuresti', startTime: '2099-10-08T18:00:00Z', endTime: '2099-10-09T02:00:00Z', description: 'Event content preserved behind checkout. '.repeat(40), ticketTypes: [{ id: id(3), name: 'General access', description: 'Admission', priceRon: qa.tierPrice, capacity: 100, ticketsSold: 0, startSales: '2020-01-01T00:00:00Z', endSales: '2099-10-09T02:00:00Z' }], lineup: [] });
    const social = () => ({ goingCount: qa.status === 'going' ? 2 : 1, interestedCount: qa.status === 'interested' ? 1 : 0, currentUserStatus: qa.status });
    window.open = () => { if (qa.popupBlocked) return null; qa.popup = { closed: false, document: { title: '', body: { style: {} } }, location: { replace(url) { qa.opened = url; } }, close() { this.closed = true; } }; return qa.popup; };
    window.fetch = async (url, options = {}) => {
      const parsed = new URL(typeof url === 'string' ? url : url.url, location.href);
      if (!parsed.pathname.includes('/api/v1/')) { if (parsed.origin === location.origin) return original(url, options); throw Error('Unexpected external request ' + url); }
      const route = parsed.pathname.split('/api/v1')[1], method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : {};
      const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
      await new Promise(resolve => setTimeout(resolve, 30));
      if (route.endsWith('/tickets/purchase')) { qa.purchase.push({ body, key: new Headers(options.headers).get('Idempotency-Key') }); await new Promise(resolve => setTimeout(resolve, 200)); return response(qa.paymentCode === 200 ? { orderId: id(8), sessionId: qa.invalidResponse ? null : qa.legacyResponse ? undefined : 'cs_test_qa', checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_qa' } : { error: qa.paymentError }, qa.paymentCode); }
      if (route.endsWith('/tickets/book')) { qa.bookings.push(body); return response({ orderId: id(9), alreadyBooked: false }); }
      if (route === '/checkout/reconcile') { qa.reconciliations.push(body); return response({ status: qa.confirmation }); }
      if (route.endsWith('/promo-code/validate')) { qa.promoRequests.push(body.code); await new Promise(resolve => setTimeout(resolve, qa.promoDelay)); return response({ code: body.code, discountPercent: 15 }); }
      if (route === '/users/me/billing-details') { if (method === 'PUT') { qa.saved = body; qa.billingWrites.push(body); return response(body); } if (method === 'DELETE') qa.saved = null; return response({ details: qa.saved }); }
      if (route === '/auth/login') return response({ token: 'checkout-test-only' });
      if (route === '/users/me') return response(user);
      if (route.endsWith('/rsvp')) { qa.rsvp.push({ method, body }); qa.status = method === 'DELETE' ? null : body.status; return response(social()); }
      if (route.endsWith('/social')) return response(social());
      if (route.endsWith('/updates')) return response([]);
      if (route.startsWith('/profiles/')) return response({ id: id(2), username: 'Organizer QA' });
      if (route === '/promotions/active') return response([]);
      if (route === '/events') return response([event()]);
      if (route.startsWith('/events/')) return response(event());
      if (route === '/notifications') return response({ items: [], unreadCount: 0 });
      return response([]);
    };
  }.toString()})();` });
  await call('Page.navigate', { url: base });
  await until(`document.body.innerText.toLowerCase().includes('checkout qa')`);
  await evaluate(`Array.from(document.querySelectorAll('[role=button]')).find(el=>el.getAttribute('aria-label')?.toLowerCase().includes('checkout qa')).click()`);
  await until(`document.querySelector('[data-testid="event-content"]')`); await delay(600);
  await evaluate(`window.__sheet=document.querySelector('[data-testid="event-sheet"]');window.__home=document.querySelector('[data-testid="home-list"]');window.__sheetTop=document.querySelector('[data-testid="sheet-handle"]').getBoundingClientRect().top;document.querySelector('[data-testid="event-content"]').scrollTop=220`);
  await click('event-continue'); await until(`document.querySelector('[data-testid="checkout-screen"]')`);
  await click('checkout-close'); await until(`!document.querySelector('[data-testid="checkout-screen"]')`);
  await delay(700);
  assert.ok(await evaluate(`window.__sheet===document.querySelector('[data-testid="event-sheet"]') && window.__home===document.querySelector('[data-testid="home-list"]')`));
  assert.equal(await evaluate(`document.querySelector('[data-testid="event-content"]').scrollTop`), 220);
  const position = await evaluate(`({before:window.__sheetTop,after:document.querySelector('[data-testid="sheet-handle"]').getBoundingClientRect().top})`);
  assert.ok(Math.abs(position.before-position.after)<1, 'Returning from checkout must not resize or close the sheet: '+JSON.stringify(position));
  await capture('checkout-event-return');
  console.log('PASS Event sheet and Home stay mounted, preserving scroll across checkout');
  await click('event-continue'); await until(`document.querySelector('[data-testid="checkout-screen"]')`); await delay(150);
  await evaluate(`document.querySelector('[data-testid="checkout-plus"]').click();document.querySelector('[data-testid="checkout-plus"]').click()`);
  await until(`document.querySelector('[data-testid="checkout-quantity"]').textContent==='3'`);
  for (let i = 0; i < 12; i++) await click('checkout-plus');
  assert.equal(await evaluate(`document.querySelector('[data-testid="checkout-quantity"]').textContent`), '8');
  for (let i = 0; i < 10; i++) await click('checkout-minus');
  assert.equal(await evaluate(`document.querySelector('[data-testid="checkout-quantity"]').textContent`), '1');
  await evaluate('window.__qa.promoDelay=900'); await input('checkout-promo', 'FIRST'); await click('checkout-promo-apply'); await input('checkout-promo', 'SECOND'); await delay(1000);
  assert.equal(await evaluate(`document.querySelector('[data-testid="checkout-promo"]').value`), 'SECOND');
  assert.equal(await evaluate(`document.querySelector('[data-testid="checkout-promo"]').readOnly`), false);
  await evaluate('window.__qa.promoDelay=0'); await click('checkout-promo-apply'); await until(`document.querySelector('[data-testid="checkout-promo"]').readOnly`);
  await click('checkout-next'); await until(`document.querySelector('[data-testid="billing-name"]')`);
  await click('checkout-next'); assert.equal(await evaluate('window.__qa.purchase.length'), 0);
  assert.equal(await evaluate(`document.querySelector('[data-testid="billing-name"]').getAttribute('aria-invalid')`), 'true');
  await input('checkout-email', 'guest@example.test'); await input('billing-name', 'QA Buyer'); await input('billing-address', 'Strada Test 1'); await input('billing-city', 'Bucuresti');
  await click('checkout-next'); assert.equal(await evaluate(`document.querySelector('[data-testid="billing-sector"]').getAttribute('aria-invalid')`), 'true');
  await click('billing-sector'); await until(`Array.from(document.querySelectorAll('[role=radio]')).some(el=>el.textContent==='Sector 3')`);
  await evaluate(`Array.from(document.querySelectorAll('[role=radio]')).find(el=>el.textContent==='Sector 3').click()`); await delay(400);
  await click('checkout-next'); await until(`document.querySelector('[data-testid="checkout-next"]').textContent.includes('Pay')`);
  await capture('checkout-summary');
  await evaluate(`document.querySelector('[data-testid="checkout-next"]').click();document.querySelector('[data-testid="checkout-next"]').click()`);
  await until('window.__qa.opened'); assert.equal(await evaluate('window.__qa.purchase.length'), 1);
  const order = await evaluate('window.__qa.purchase[0]'); assert.equal(order.body.email, 'guest@example.test'); assert.equal(order.body.billingDetails.sector, 'Sector 3'); assert.equal(order.body.promoCode, 'SECOND'); assert.equal(order.body.client, 'native_web'); assert.equal(order.body.returnOrigin, base); assert.match(order.key, /^[a-f\d-]{36}$/);
  await evaluate(`window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'))`); await until(`document.querySelector('[data-testid="checkout-recheck"]')`);
  assert.equal(await evaluate('window.__qa.popup.closed'), false, 'Returning early must keep the provider tab available');
  assert.equal(await evaluate('window.__qa.reconciliations[0].sessionId'), 'cs_test_qa', 'Legacy session IDs still require server-side confirmation');
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="checkout-view-tickets"]')`), false);
  await evaluate(`window.__qa.confirmation='completed'`); await click('checkout-recheck'); await until(`document.querySelector('[data-testid="checkout-view-tickets"]')`);
  console.log('PASS quantity bounds, promo race, billing/sector validation, one payment intent and authoritative confirmation');
  // Fresh authenticated run uses the actual login UI and same Event flow.
  await call('Page.navigate', { url: base + '/events/' + id(1) + '?presentation=page' });
  await until(`document.querySelector('[data-testid="event-sign-in"]')`); await click('event-sign-in'); await click('auth-email-choice');
  await input('auth-email', 'buyer@example.test'); await input('auth-password', 'test-password'); await click('auth-submit');
  await until(`document.querySelector('[data-testid="event-rsvp-going"]')`);
  await evaluate(`document.querySelector('[data-testid="event-rsvp-going"]').click();document.querySelector('[data-testid="event-rsvp-going"]').click()`);
  await until('window.__qa.rsvp.length===1'); await delay(200);
  await until(`getComputedStyle(document.querySelector('[data-testid="event-rsvp-going"]')).backgroundColor==='rgb(255, 0, 68)'`);
  await click('event-rsvp-going'); await until('window.__qa.rsvp.length===2'); assert.equal(await evaluate('window.__qa.rsvp[1].method'), 'DELETE');
  await click('event-continue'); await until(`document.querySelector('[data-testid="checkout-screen"]')`); await delay(250);
  await click('checkout-next'); await input('billing-address', 'Strada 1'); await input('billing-city', 'Cluj'); await input('billing-county', 'Cluj');
  await click('billing-type-company'); await click('checkout-next'); assert.equal(await evaluate(`document.querySelector('[data-testid="billing-taxId"]').getAttribute('aria-invalid')`), 'true');
  await input('billing-taxId', 'RO123'); await click('checkout-remember'); await click('checkout-next'); await until('window.__qa.billingWrites.length===1');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 568, deviceScaleFactor: 1, mobile: true });
  await delay(200);
  const headerTop = await evaluate(`document.querySelector('[data-testid="checkout-header"]').getBoundingClientRect().top`);
  await evaluate(`window.__qa.paymentCode=503; const scroll=document.querySelector('[data-testid="checkout-scroll"]'); scroll.scrollTop=scroll.scrollHeight`);
  await delay(100);
  assert.ok(await evaluate(`document.querySelector('[data-testid="checkout-scroll"]').scrollTop > 0`));
  assert.equal(await evaluate(`document.querySelector('[data-testid="checkout-header"]').getBoundingClientRect().top`), headerTop, 'Checkout title and step bars stay fixed while summary scrolls');
  await click('checkout-next'); await until(`document.querySelector('[data-testid="checkout-error"]')`);
  assert.equal(await evaluate('window.__qa.popup.closed'), true, 'Failed preparation closes the unused popup');
  assert.ok(await evaluate(`{const el=document.querySelector('[data-testid="checkout-error"]'),r=el.getBoundingClientRect();r.top>=0&&r.bottom<=innerHeight&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}`), 'Payment errors must be visible beside Pay, even when the summary is scrolled down');
  await click('checkout-next'); await until('window.__qa.purchase.length===2'); await delay(300);
  assert.equal(await evaluate('window.__qa.purchase[0].key===window.__qa.purchase[1].key'), true);
  await evaluate('window.__qa.paymentCode=408'); await click('checkout-next'); await until(`document.querySelector('[data-testid="checkout-error"]')?.textContent.includes('took too long')`);
  await evaluate(`window.__qa.paymentCode=409;window.__qa.paymentError='Organizatorul trebuie sa reconecteze contul Stripe inainte de a putea accepta plati'`);
  await click('checkout-next'); await until(`document.querySelector('[data-testid="checkout-error"]')?.textContent.includes('reconnect their Stripe account')`);
  assert.equal(await evaluate('window.__qa.purchase.slice(0,4).every(p=>p.key===window.__qa.purchase[0].key)'), true, '408 must retry the original request too');
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="checkout-reselect"]')`), false, 'Organizer setup conflicts must preserve ticket selection');
  assert.ok(await evaluate(`document.querySelector('[data-testid="checkout-next"]').textContent.includes('Pay')`), 'Organizer setup conflicts must preserve the summary step');
  await capture('checkout-payment-error');
  await evaluate('window.__qa.popupBlocked=true'); await click('checkout-next'); await until(`document.querySelector('[data-testid="checkout-error"]')?.textContent.includes('Allow pop-ups')`);
  assert.equal(await evaluate('window.__qa.purchase.length'), 4, 'A blocked popup must not create a reservation');
  await evaluate('window.__qa.popupBlocked=false;window.__qa.paymentCode=200;window.__qa.invalidResponse=true');
  await click('checkout-next'); await until(`document.querySelector('[data-testid="checkout-error"]')?.textContent.includes('invalid response')`);
  assert.equal(await evaluate('window.__qa.popup.closed'), true);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="checkout-return"]')`), false, 'Malformed responses must never confirm payment');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`window.__qa.paymentCode=409;window.__qa.paymentError='Nu mai exista suficiente bilete disponibile'`); await click('checkout-next'); await until(`document.querySelector('[data-testid="checkout-reselect"]')`);
  assert.equal(await evaluate('window.__qa.purchase[4].key===window.__qa.purchase[5].key'), true, 'Malformed success responses also preserve the original payment intent');
  // The 409 changes step and scrolls to the top; wait for the actual hit target
  // to settle before synthesizing the pointer press/release coordinates.
  await delay(300); await click('checkout-reselect'); await until(`!document.querySelector('[data-testid="checkout-screen"]')`);
  assert.ok(await evaluate(`!!document.querySelector('[data-testid="event-sheet"] [aria-label="Back"]')`), 'Full-page presentation remains full-page after auth/checkout');
  await evaluate('window.__qa.tierPrice=0'); await click('event-continue'); await until('window.__qa.bookings.length===1');
  await until(`!document.querySelector('[data-testid="event-sheet"]')`);
  assert.equal(await evaluate('window.__qa.purchase.length'), 6);
  assert.deepEqual(await evaluate('window.__qa.bookings[0].items'), [{ ticketTypeId: id(3), quantity: 1 }]);
  console.log('PASS visible payment errors, popup blockers, 408/5xx/invalid-response retries, organizer conflicts, stock recovery and free booking');
  await call('Page.navigate', { url: base + '/checkout/return?eventId=' + id(1) + '&cancelled=1' });
  await until(`document.querySelector('[data-testid="checkout-return"]')?.textContent.includes('Payment window closed')`);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="checkout-view-tickets"]')`), false);
  await click('checkout-return-to-event');
  await until(`document.querySelector('[data-testid="event-continue"]')`);
  console.log('PASS cancelled cold-start return opens its event, never a false payment success');
  await click('event-continue'); await until(`document.querySelector('[data-testid="checkout-screen"]')`);
  await click('checkout-next'); await input('billing-address', 'Strada Test 1'); await input('billing-city', 'Cluj'); await input('billing-county', 'Cluj');
  await click('checkout-next'); await until(`document.querySelector('[data-testid="checkout-next"]').textContent.includes('Pay')`);
  await click('checkout-next'); await until('window.__qa.opened');
  await evaluate(`window.__qa.confirmation='completed';window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'))`);
  await until(`document.querySelector('[data-testid="checkout-view-tickets"]')`);
  assert.equal(await evaluate('window.__qa.popup.closed'), false);
  assert.equal(await evaluate('window.__qa.reconciliations.length'), 1, 'Returning after payment checks once rather than waiting for tab closure');
  console.log('PASS completed hosted payment returns to confirmation while the provider tab stays open');
  for (const query of ['', '?eventId=' + id(1) + '&cancelled=1&sessionId=bad', '?eventId=' + id(1) + '&cancelled=1&sessionId=']) {
    await call('Page.navigate', { url: base + '/checkout/return' + query });
    await until(`document.querySelector('[data-testid="checkout-return"]')?.textContent.includes('incomplete')`);
    assert.equal(await evaluate(`!!document.querySelector('[data-testid="checkout-view-tickets"]')`), false);
    assert.equal(await evaluate('window.__qa.reconciliations.length'), 0, 'Malformed callbacks never reach reconciliation');
  }
  console.log('PASS incomplete or malformed payment callbacks make no reconciliation requests');
  assert.deepEqual(errors, []);
}).catch(error => { console.error(error); process.exitCode = 1; });
