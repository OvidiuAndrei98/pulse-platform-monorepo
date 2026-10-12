// Production UI, local fake API. Never create a real reservation or payment.
const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

withBrowser(async ({ base, call, evaluate, until, click, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = fetch.bind(window), params = new URL(location.href).searchParams;
    const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
    const user = { id: id(100), username: 'QA', role: 'user', email: 'qa@example.test', hasPassword: true, preferredLanguage: params.get('lang') || 'en', createdAt: '2026-01-01T00:00:00Z' };
    if (params.has('guest')) localStorage.removeItem('spottr-native.session.v1');
    else localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'confirmation-qa-only', user }));
    const qa = window.__qa = { status: params.get('outcome') || 'pending', requests: [], hold: false, release: null, frames: [], sample: true };
    const event = { id: id(1), title: 'AFTER DARK', category: 'TECHNO', locationName: 'Piata Unirii', city: 'Bucuresti', startTime: '2099-10-08T18:00:00Z', endTime: '2099-10-09T02:00:00Z', ticketTypes: [] };
    window.fetch = async (input, options = {}) => {
      const url = new URL(String(input), location.origin), route = url.pathname.split('/api/v1')[1];
      if (!route) { if (url.origin === location.origin) return original(input, options); throw Error('External request blocked'); }
      qa.requests.push(route);
      const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      if (route === '/users/me') return reply(user);
      if (route === '/checkout/reconcile') {
        if (qa.hold) await new Promise(resolve => { qa.release = resolve; });
        if (qa.status === 'missing') return reply({}, 404);
        if (qa.status === 'offline') return reply({}, 503);
        if (qa.status === 'malformed') return reply({});
        return reply({ status: qa.status, orderId: id(5) });
      }
      if (route === '/events/' + id(1)) return params.has('eventFail') ? reply({}, 503) : reply(event);
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      return reply([]);
    };
    (function sample() {
      const ticket = document.querySelector('[data-testid="checkout-success-ticket"]'), check = document.querySelector('[data-testid="checkout-success-check"] path');
      if (ticket && check) qa.frames.push({ opacity: Number(getComputedStyle(ticket).opacity), dash: Number(check.getAttribute('stroke-dashoffset')) });
      if (qa.sample) requestAnimationFrame(sample);
    })();
  }.toString()})();` });
  const el = testId => `document.querySelector('[data-testid="${testId}"]')`;
  const navigate = async (outcome, extras = '') => {
    await call('Page.navigate', { url: base + '/checkout/return?eventId=' + id(1) + '&sessionId=cs_test_qa&outcome=' + outcome + extras });
    await until(el('checkout-return'));
  };
  const count = () => evaluate(`window.__qa.requests.filter(route=>route==='/checkout/reconcile').length`);
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate('pending'); await until(el('checkout-recheck'));
  assert.equal(await count(), 4);
  assert.equal(await evaluate(`!!${el('checkout-return-to-event')}`), false, 'Pending is not a reason to create a new purchase');
  await capture('confirmation-pending-desktop');
  await evaluate(`window.__qa.hold=true;${el('checkout-recheck')}.click();${el('checkout-recheck')}?.click()`);
  await until('window.__qa.release'); assert.equal(await count(), 5, 'Double tap sends exactly one extra request');
  await evaluate('window.__qa.hold=false;window.__qa.release()');
  await until(`document.body.innerText.includes("We've checked again")`);
  assert.equal(await evaluate(`!!${el('checkout-recheck')}`), false);
  assert.ok(await evaluate(`!!${el('checkout-view-orders')} && !!${el('checkout-contact-support')}`));
  await capture('confirmation-pending-checked-desktop');
  await evaluate(`window.__qa.status='completed';window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'))`);
  await until(el('checkout-success-ticket')); await until(`document.body.innerText.includes('AFTER DARK')`); await delay(700);
  await evaluate('window.__qa.sample=false');
  const frames = await evaluate('window.__qa.frames');
  assert.ok(frames.some(frame => frame.opacity > 0 && frame.opacity < 1), 'Confirmed ticket fades in');
  assert.ok(frames.some(frame => frame.dash > 0 && frame.dash < 50), 'Success check is drawn progressively');
  assert.equal(frames.at(-1).opacity, 1); assert.equal(frames.at(-1).dash, 0);
  assert.equal(await count(), 6, 'Returning from Stripe verifies the same transaction once');
  assert.equal(await evaluate(`window.__qa.requests.some(route=>route.endsWith('/purchase'))`), false);
  await capture('confirmation-success-desktop');
  await click('checkout-view-tickets'); await until(`location.pathname.includes('users/me/tickets')`);
  console.log('PASS one manual check, double taps, delayed payment on focus, success animation and real ticket navigation');

  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate('completed', '&lang=ro'); await until(el('checkout-success-ticket')); await delay(800); await capture('confirmation-success-mobile-ro');
  assert.ok(await evaluate(`document.body.innerText.includes('Ne vedem la eveniment.')`));
  await navigate('pending', '&lang=ro'); await until(el('checkout-recheck')); await capture('confirmation-pending-mobile-ro');
  await evaluate(`window.__qa.status='offline'`); await click('checkout-recheck');
  await until(`document.body.innerText.includes('Serviciul de plăți este încă indisponibil')`);
  assert.equal(await evaluate(`!!${el('checkout-recheck')} || !!${el('checkout-return-to-event')} || !!${el('checkout-success-ticket')}`), false);
  console.log('PASS offline manual check stays unresolved and has a clear next step');

  for (const [outcome, title, restart] of [['missing', "We couldn't find this payment", false], ['refunded', 'This payment was refunded', true], ['failed', "The order wasn't completed", true], ['malformed', "We couldn't check your payment", false]]) {
    await navigate(outcome); await until(`document.body.innerText.includes(${JSON.stringify(title)})`);
    assert.equal(await evaluate(`!!${el('checkout-return-to-event')}`), restart);
    assert.equal(await evaluate(`!!${el('checkout-success-ticket')}`), false);
    if (outcome === 'missing') assert.equal(await count(), 1);
  }
  await call('Page.navigate', { url: base + '/checkout/return?eventId=' + id(1) + '&sessionId=bad' });
  await until(`document.body.innerText.includes('incomplete')`);
  assert.equal(await count(), 0); assert.equal(await evaluate(`!!${el('checkout-recheck')}`), false);
  await call('Page.navigate', { url: base + '/checkout/return?eventId=' + id(1) + '&cancelled=1' });
  await until(el('checkout-return-to-event')); assert.equal(await count(), 0);
  await click('checkout-return-to-event'); await until(el('event-continue'));
  console.log('PASS missing, refunded, failed, malformed and cancelled results stay distinct');

  await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 1, mobile: true });
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await navigate('completed', '&guest=1&eventFail=1'); await until(el('checkout-success-ticket')); await delay(200);
  assert.equal(await evaluate(`Number(getComputedStyle(${el('checkout-success-ticket')}).opacity)`), 1);
  assert.ok(await evaluate(`document.body.innerText.includes('Your tickets are ready')`), 'Event detail failure cannot hide a confirmed purchase');
  assert.ok(await evaluate(`${el('checkout-view-tickets')}.textContent.includes('Create account')`));
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`));
  await capture('confirmation-guest-small');
  await click('checkout-view-tickets'); await until(`document.body.innerText.includes('Create account') && !${el('checkout-return')}`);
  assert.deepEqual(errors, []);
  console.log('PASS small-screen guest, optional event failure, reduced motion and registration navigation');
}).catch(error => { console.error(error); process.exitCode = 1; });
