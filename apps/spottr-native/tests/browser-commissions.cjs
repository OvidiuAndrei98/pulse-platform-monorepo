// Exported application, simulated accounts and API only. No real admin writes.
const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');
withBrowser(async ({ base, call, evaluate, until, click, input, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = window.fetch.bind(window), id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
    const user = { id: id(1), username: 'Commission QA', email: 'qa@example.invalid', role: 'admin', preferredLanguage: 'en', createdAt: '2026-10-07T12:00:00Z', hasPassword: true };
    localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'commission-local-test-only', user }));
    const state = window.__commissionQA = { standard: { rateBps: 500, perTicketBani: 150, revision: 1 }, organizers: [{ organizerId: id(2), companyName: 'Standard Club', email: 'standard@example.invalid', override: null, revision: 0 }, { organizerId: id(3), companyName: 'Negotiated Club', email: 'negotiated@example.invalid', override: null, revision: 0 }], writes: [], fail: false };
    window.fetch = async (url, options = {}) => {
      const address = new URL(typeof url === 'string' ? url : url.url || String(url), location.href);
      if (!address.pathname.includes('/api/v1/')) return original(url, options);
      const route = address.pathname.split('/api/v1')[1], method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : null;
      const reply = (value, status = 200) => Promise.resolve(new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }));
      if (route === '/users/me' || route === '/auth/me') return reply(user);
      if (route === '/admin/commissions') return reply({ standard: state.standard, organizers: state.organizers });
      if (method === 'PUT' && route.startsWith('/admin/')) {
        state.writes.push({ route, body });
        if (state.fail) return reply({ error: 'COMMISSION_CHANGED' }, 409);
        if (route.endsWith('/standard')) state.standard = { ...body, revision: state.standard.revision + 1 };
        else { const organizer = state.organizers.find(o => route.includes(o.organizerId)); organizer.override = body.override; organizer.revision++; }
        return reply({ saved: true });
      }
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      return reply([]);
    };
  }.toString()})();` });
  await call('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });
  await call('Page.navigate', { url: base + '/admin?section=commissions' });
  await until(`!!document.querySelector('[data-testid="admin-commissions"]')`);
  await until(`document.body.innerText.includes('Standard Club')`);
  await until(`document.body.innerText.includes('5% + 1.5 RON / ticket')`);
  const org = '00000000-0000-4000-8000-000000000003';
  await click('commission-edit-' + org);
  await until(`!!document.querySelector('[data-testid="commission-editor"]')`);
  const textClick = async text => evaluate(`Array.from(document.querySelectorAll('[role="button"]')).find(e => e.textContent === ${JSON.stringify(text)}).click()`);
  await textClick('Negotiated commission');
  await until(`!!document.querySelector('[data-testid="commission-percent"]')`);
  await input('commission-percent', '2.25'); await input('commission-fixed', '1');
  await click('commission-save');
  await until(`window.__commissionQA.organizers[1].override?.rateBps === 225 && !document.querySelector('[data-testid="commission-editor"]')`);
  await click('commission-edit-standard');
  await input('commission-percent', '6'); await input('commission-fixed', '3');
  await click('commission-save');
  await until(`window.__commissionQA.standard.rateBps === 600 && !document.querySelector('[data-testid="commission-editor"]')`);
  assert.equal(await evaluate(`window.__commissionQA.organizers[0].override === null`), true);
  await until(`document.body.innerText.includes('6% + 3 RON / ticket') && document.body.innerText.includes('2.25% + 1 RON / ticket')`);
  await click('commission-edit-' + org); await textClick('Use standard'); await click('commission-save');
  await until(`window.__commissionQA.organizers[1].override === null && !document.querySelector('[data-testid="commission-editor"]')`);
  await click('commission-edit-standard'); await input('commission-percent', '-1'); await click('commission-save');
  await until(`document.body.innerText.includes('Enter a percentage')`);
  assert.equal(await evaluate('window.__commissionQA.writes.length'), 3);
  await input('commission-percent', '7'); await evaluate('window.__commissionQA.fail = true'); await click('commission-save');
  await until(`document.body.innerText.includes('could not be saved')`);
  assert.equal(await evaluate('window.__commissionQA.standard.rateBps'), 600);
  await textClick('Cancel'); await delay(200);
  await evaluate(`document.querySelector('[data-testid="admin-commissions"]').scrollIntoView({block:'start'})`);
  await capture('commissions-admin-mobile');
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'mobile overflow');
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await delay(250); await capture('commissions-admin-desktop');
  assert.deepEqual(errors, []);
  console.log('PASS admin negotiated commission, standard inheritance, reset, invalid values and save conflict on mobile and desktop');
}).catch(error => { console.error(error); process.exitCode = 1; });
