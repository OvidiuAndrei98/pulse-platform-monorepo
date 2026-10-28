// Mocked API only: opening checkout is not proof of payment. The same scenarios
// can also run against Next with SPOTTR_NEXT_QA_URL=http://localhost:3100.
const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
withBrowser(async ({ base, call, evaluate, until, click, capture, errors }) => {
  const next = process.env.SPOTTR_NEXT_QA_URL;
  const origin = next || base;
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = fetch.bind(window), params = new URLSearchParams(location.search);
    const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
    const user = { id: id(1), role: params.get('role') || 'user', username: 'Invoices QA', email: 'qa@example.test', hasPassword: true, preferredLanguage: 'en', createdAt: '2026-01-01T00:00:00Z' };
    localStorage.setItem('pulse_token', 'orders-qa');
    localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'orders-qa', user }));
    const order = (n, status, extra = {}) => ({ id: id(n), eventId: id(50), eventTitle: 'Order ' + n, locationName: 'QA Club', createdAt: '2026-10-14T00:00:00Z', status, paidTotalBani: 21800, refundedAmountBani: 0, invoiceRequested: true, stripePaymentIntentId: 'pi_mock_' + n, ...extra });
    const abandoned = [order(2, 'pending'), order(3, 'failed'), order(4, 'unknown')];
    const qa = window.__orders = { user, reads: 0, writes: [], rows: params.has('empty') ? abandoned : [...abandoned,
      order(5, 'completed', { invoiceStatus: 'dispatching', orderTotalBani: 16350 }),
      order(6, 'refunded', { refundedAmountBani: 21800, invoiceDocumentUrl: 'https://example.test/invoice.pdf', invoiceSeries: 'QA', invoiceNumber: '6' }),
      order(7, 'completed', { invoiceRequested: false }), order(8, 'completed', { paidTotalBani: 0 }),
      order(9, 'pending', { paymentAttemptedAt: '2026-10-14T19:00:00Z' }), order(10, 'failed', { paymentAttemptedAt: '2026-10-14T19:01:00Z' })] };
    window.fetch = async (input, options = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.origin), route = url.pathname.split('/api/v1')[1];
      if (!route) { if (url.origin === location.origin) return original(input, options); throw Error('External request blocked'); }
      const reply = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
      if (options.method && options.method !== 'GET') qa.writes.push(route);
      if (route === '/users/me') return reply(user);
      if (route === '/wardrobe/mine') return reply({ deposits: [], staffAccess: false });
      if (route === '/users/me/orders') { qa.reads++; return reply(qa.rows); }
      if (route.startsWith('/dashboard/organizer/profile/')) return reply({ verificationStatus: 'approved', companyName: 'QA SRL', cui: '123456' });
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      return reply([]);
    };
  }.toString()})();` });
  const row = (kind, n) => `document.querySelector('[data-testid="${kind}-${id(n)}"]')`;
  const navigate = path => call('Page.navigate', { url: origin + path });
  const snapshot = async name => {
    if (!next) await until(`!document.querySelector('[data-testid="startup-cover"]')`);
    await capture((next ? 'next' : 'native') + name);
  };
  await navigate('/users/me/invoices');
  await until(row('invoice', 5), 60000);
  for (const n of [2, 3, 4]) assert.equal(await evaluate(`!!${row('invoice', n)}`), false, 'Unsubmitted order must stay invisible');
  for (const n of [9, 10]) {
    assert.ok(await evaluate(`${row('invoice', n)}.textContent.includes('Order total')`));
    assert.equal(await evaluate(`${row('invoice', n)}.textContent.includes('Total paid') || ${row('invoice', n)}.textContent.includes('Waiting to be issued') || !!${row('invoice', n)}.querySelector('a,[role="link"]')`), false);
  }
  assert.ok(await evaluate(`!!${row('invoice', 7)}`), 'Paid transactions remain visible without an invoice');
  assert.ok(await evaluate(`${row('invoice', 5)}.textContent.includes('Being issued')`));
  assert.ok(await evaluate(`${row('invoice', 5)}.textContent.includes('163,50')`), 'Uses accurate order-total alias');
  assert.ok(await evaluate(`${row('invoice', 6)}.textContent.includes('Refunded') && !!${row('invoice', 6)}.querySelector('a,[role="link"]')`));
  assert.ok(await evaluate(`!!${row('invoice', 8)}`), 'Free completed orders are not removed by amount checks');
  assert.deepEqual(await evaluate('window.__orders.writes'), []);
  await snapshot('-invoices-confirmed-only');

  // Submission, confirmation and invoice arrival are separate transitions.
  // Keep this page open: updates must arrive without remounting or another Pay.
  await evaluate(`Object.assign(window.__orders.rows.find(o=>o.id==='${id(9)}'), {status:'completed',invoiceStatus:'processing'})`);
  await until(`${row('invoice', 9)}?.textContent.includes('Total paid') && ${row('invoice', 9)}?.textContent.includes('Being issued')`, 20000);
  await evaluate(`Object.assign(window.__orders.rows.find(o=>o.id==='${id(9)}'), {invoiceStatus:'issued',invoiceDocumentUrl:'https://example.test/invoice9.pdf',invoiceSeries:'QA',invoiceNumber:'9'})`);
  await until(`${row('invoice', 9)}?.querySelector('a,[role="link"]')`, 20000);
  assert.deepEqual(await evaluate('window.__orders.writes'), [], 'Refreshing status never creates another payment');

  if (!next) {
    // Mounted account screens may keep their cache. Reentering invoices must
    // request fresh server state rather than keep a paid/refund status forever.
    await evaluate(`window.__orders.rows[0].status='completed'`);
    await click('account-back'); await until(`location.pathname==='/users/me'`);
    await click('profile-tickets-tab-history');
    const ordersButton = `Array.from(document.querySelectorAll('[role="button"]')).find(e=>e.textContent.includes('View orders'))`;
    await until(ordersButton); await evaluate(`${ordersButton}.click()`);
    await until(row('invoice', 2));
    assert.ok(await evaluate('window.__orders.reads>=2'), 'Opening the list again refreshes confirmation');
    await evaluate(`window.__orders.rows[0].status='refunded'; window.__orders.rows[0].refundedAmountBani=21800;
      Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange',{bubbles:true}));
      Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange',{bubbles:true}));`);
    await until(`${row('invoice', 2)}?.textContent.includes('Refunded')`);
  }
  await navigate('/users/me/invoices?empty=1');
  await until(`document.body.innerText.includes('No payment attempts yet.')`, 60000);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid^="invoice-"]')`), false);
  assert.equal(await evaluate(`document.body.innerText.includes('Total paid') || document.body.innerText.includes('Waiting to be issued')`), false);
  await snapshot('-invoices-abandoned-empty');

  await navigate('/dashboard/purchases?role=organizer');
  const tab = `Array.from(document.querySelectorAll('button,[role="tab"]')).find(e=>/^Orders\s*6$/.test(e.textContent.trim()))`;
  await until(tab, 60000); await evaluate(`${tab}.click()`); await until(row('order', 9));
  for (const n of [2, 3, 4]) {
    assert.equal(await evaluate(`!!${row('order', n)}`), false, 'Unsubmitted reservation must stay invisible');
  }
  for (const n of [9, 10]) {
    assert.ok(await evaluate(`${row('order', n)}.textContent.includes('Order total')`));
    assert.equal(await evaluate(`${row('order', n)}.textContent.includes('Total paid')`), false);
  }
  assert.ok(await evaluate(`${row('order', 9)}.textContent.includes('Payment not confirmed')`));
  assert.ok(await evaluate(`${row('order', 10)}.textContent.includes('Purchase not completed')`));
  assert.ok(await evaluate(`${row('order', 5)}.textContent.includes('Total paid')`));
  assert.ok(await evaluate(`!!${row('order', 7)}`), 'Purchase history retains orders without invoices');
  assert.deepEqual(await evaluate('window.__orders.writes'), []);
  await snapshot('-orders-unconfirmed');
  assert.deepEqual(errors, []);
  console.log('PASS ' + (next ? 'Next' : 'Native') + ': invoice eligibility, abandoned-only empty state, refund/free orders, truthful order history' + (next ? '' : ', reopen and foreground refresh'));
}).catch(error => { console.error(error); process.exitCode = 1; });
