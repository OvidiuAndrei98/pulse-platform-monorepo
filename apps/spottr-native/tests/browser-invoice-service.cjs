// Verify both clients show unlimited free invoicing, even with stale trial fields.
const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');
withBrowser(async ({ base, call, evaluate, until, capture, errors }) => {
  const next = process.env.SPOTTR_NEXT_QA_URL, origin = next || base;
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = fetch.bind(window), id = '00000000-0000-4000-8000-000000000001';
    const user = { id, role: 'organizer', username: 'Invoice QA', email: 'qa@example.test', hasPassword: true, preferredLanguage: 'en', createdAt: '2026-01-01T00:00:00Z' };
    localStorage.setItem('pulse_token', 'invoice-qa'); localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'invoice-qa', user }));
    const settings = { connected: true, provider: 'oblio', enabled: true, accountEmail: 'qa@example.test', companyVatCode: 'RO123456', seriesName: 'TEST', vatName: 'Zero', vatPercentage: 0, sendEmail: true, sendToSpv: false, credentialsConfigured: true,
      service: { freeLimit: 20, freeUsed: 20, freeReserved: 0, freeRemaining: 0, unitPriceBani: 50, paidEnabled: false, trialExhausted: true, termsVersion: 'invoice-service-50-bani-v1' } };
    const qa = window.__invoice = { writes: [], settings };
    window.fetch = async (url, opts = {}) => {
      if (!String(url).includes('/api/v1/')) return original(url, opts);
      const path = new URL(url, location.href).pathname.split('/api/v1')[1], method = opts.method || 'GET';
      const reply = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
      if (method !== 'GET') qa.writes.push({ path, body: JSON.parse(opts.body || '{}') });
      if (path === '/users/me') return reply(user);
      if (path === '/dashboard/invoicing/settings') {
        if (method === 'PUT') Object.assign(settings, JSON.parse(opts.body));
        return reply(settings);
      }
      if (path === '/dashboard/finance') return reply([{ eventId: id, eventTitle: 'Free invoicing QA', startTime: '2026-10-30T18:00:00Z', grossRevenueRon: 100, customerTicketingFeeBani: 650, platformFeeBani: 650, invoiceServiceFeeBani: 0, ticketsSold: 1, refundsNeedingAttention: 0 }]);
      if (path === '/dashboard/invoicing/options') return reply({ series: [{ name: 'TEST', default: true }], vatRates: [{ name: 'Zero', percentage: 0, default: true }] });
      if (path.startsWith('/dashboard/organizer/profile/') || path === '/dashboard/stripe/status') return reply({ userId: id, isVerified: true, verificationStatus: 'approved', companyName: 'Invoice QA SRL', cui: 'RO123456', fiscalAddress: 'Test', stripeChargesEnabled: true, stripePayoutsEnabled: true, organizerAgreementVersion: '2026-10-18' });
      if (path === '/notifications') return reply({ items: [], unreadCount: 0 });
      if (method !== 'GET') throw Error('Unexpected mutation ' + path);
      return reply([]);
    };
  }.toString()})();` });
  await call('Page.navigate', { url: origin + '/dashboard/invoicing' });
  await until(`document.body?.innerText.includes('SPOTTR automatic invoicing is free, with no invoice limit.')`);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="invoice-service"]')`), false);
  assert.equal(await evaluate(`/0[.,]50|20 free|Activate at|free invoices used/.test(document.body.innerText)`), false);
  const save = `Array.from(document.querySelectorAll('button,[role="button"]')).find(e => e.textContent.trim()==='Verify and save')`;
  await until(`(()=>{const e=${save};return e&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'})()`);
  await evaluate(`${save}.click()`);
  await until(`window.__invoice.writes.some(v=>v.path==='/dashboard/invoicing/settings')`);
  assert.equal(await evaluate(`window.__invoice.writes.find(v=>v.path==='/dashboard/invoicing/settings').body.enabled`), true);
  assert.equal(await evaluate(`window.__invoice.writes.some(v=>v.path.endsWith('/activate'))`), false);
  await capture((next ? 'next' : 'native') + '-free-invoicing');
  await call('Page.navigate', { url: origin + '/dashboard/finance' });
  await until(`document.body?.innerText.includes('Free invoicing QA')`);
  assert.equal(await evaluate(`document.body.innerText.includes('Historical invoicing fees')`), false);
  const metrics = next
    ? await evaluate(`Array.from(document.querySelectorAll('main section article')).slice(0,4).map(e=>e.querySelector('p.mt-4')?.textContent?.replace(/\\s/g,''))`)
    : await evaluate(`['grossRevenue','glowFee','estimatedPayout','ticketsSold'].map(key=>document.querySelector('[data-testid="finance-'+key+'"]')?.textContent?.replace(/\\s/g,''))`);
  assert.deepEqual(metrics, ['106,50RON', '6,50RON', '100,00RON', '1']);
  await capture((next ? 'next' : 'native') + '-free-invoicing-finance');
  assert.deepEqual(errors, []);
  console.log('PASS ' + (next ? 'Next' : 'Native') + ': unlimited free invoicing, no paid activation, saving remains enabled after old quota, no invoice fee in finance');
});
