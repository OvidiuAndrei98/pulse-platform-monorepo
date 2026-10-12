// Uses the actual production export; every API response is isolated and simulated.
const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');

withBrowser(async ({ base, call, evaluate, until, errors, capture }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = window.fetch.bind(window);
    const params = new URL(location.href).searchParams, role = params.get('role') || 'admin';
    const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
    const user = { id: id(1), role, username: 'QA', email: 'qa@example.test', preferredLanguage: 'en', hasPassword: true, createdAt: '2026-10-12T00:00:00Z' };
    localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'diagnostics-qa-only', user }));
    const qa = window.__qa = { requests: [], reports: [], offline: params.has('offline'), failList: false, empty: false, export: null, unexpected: [] };
    const row = (n, platform = 'ios') => ({ id: id(n), occurredAt: new Date().toISOString(), receivedAt: new Date().toISOString(), platform, appVersion: '1.0.0', buildVersion: '12', osVersion: '26.0', errorType: 'TypeError', category: 'property_access', screen: 'Checkout', fatal: true, breadcrumbs: ['Home', 'Checkout'], frames: [{ file: 'index.bundle', function: 'showTicket', line: 1, column: 1234 }], fingerprint: 'a'.repeat(64) });
    const objectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { if (blob.type === 'application/json') void blob.text().then(raw => { qa.export = JSON.parse(raw); }); return objectURL(blob); };
    // Capture the export content without downloading into the developer's Downloads directory.
    const anchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download === 'spottr-errors.json') return; return anchorClick.call(this); };
    window.fetch = async (input, options = {}) => {
      const url = new URL(String(input), location.origin), route = url.pathname.split('/api/v1')[1];
      if (!route) { if (url.origin === location.origin) return original(input, options); throw Error('Unexpected external request'); }
      const auth = new Headers(options.headers).get('Authorization');
      qa.requests.push({ route, platform: url.searchParams.get('platform'), cursor: url.searchParams.get('cursor'), auth });
      const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      if (route === '/diagnostics/errors') {
        qa.reports.push({ report: JSON.parse(options.body), auth, credentials: options.credentials });
        if (qa.offline) throw Error('offline');
        return new Response(null, { status: 204 });
      }
      if (route === '/admin/client-errors') {
        if (role !== 'admin') return reply({}, 403);
        if (qa.failList) return reply({}, 503);
        if (qa.empty) return reply({ items: [], nextCursor: '' });
        const platform = url.searchParams.get('platform') || 'ios';
        return reply({ items: [row(url.searchParams.get('cursor') ? 11 : 10, platform)], nextCursor: url.searchParams.get('cursor') ? '' : 'page2' });
      }
      if (route === '/users/me') return reply(user);
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      if (route.startsWith('/admin/') || ['/events', '/users/me/hidden-categories', '/users/me/saved-events', '/users/me/tickets', '/users/me/orders', '/friends', '/feed', '/promotions/active'].includes(route)) return reply([]);
      qa.unexpected.push(route); return reply({}, 404);
    };
  }.toString()})();` });
  const open = path => call('Page.navigate', { url: base + path });
  const button = label => `Array.from(document.querySelectorAll('[data-testid="client-errors-panel"] [role="button"]')).find(el=>el.textContent.trim()===${JSON.stringify(label)})`;
  const press = async label => { await until(button(label)); await evaluate(`${button(label)}.click()`); };

  await open('/admin?role=user');
  await until(`document.body.innerText.includes('Administrator access required')`);
  assert.equal(await evaluate(`window.__qa.requests.filter(r=>r.route.startsWith('/admin/')).length`), 0);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="client-errors-panel"]')`), false);
  await open('/admin?offline=1'); await until(button('Application errors'));
  assert.equal(await evaluate(`window.__qa.requests.filter(r=>r.route==='/admin/client-errors').length`), 0, 'Collapsed panel does not fetch');
  await evaluate(`{const error=new TypeError('Cannot read properties of undefined person@example.test sk_test_private'); error.stack='TypeError: sensitive\\n    at showTicket (https://private.test/index.bundle?token=secret:1:200)';window.dispatchEvent(new ErrorEvent('error',{error}));}`);
  await until('window.__qa.reports.length===1');
  const first = await evaluate('window.__qa.reports[0]');
  assert.equal(first.auth, null); assert.equal(first.credentials, 'omit');
  assert.equal(first.report.screen, 'Admin');
  assert.equal(JSON.stringify(first.report).includes('private'), false);
  assert.equal(first.report.frames[0].file, 'index.bundle');
  await open('/admin'); await until('window.__qa.reports.length===1');
  assert.equal(await evaluate('window.__qa.reports[0].report.id'), first.report.id, 'Restart retries the same report');
  console.log('PASS production error listener, no bearer/cookies, offline persistence and restart delivery');

  await press('Application errors'); await until('document.body.innerText.includes("property_access")');
  await press('Technical details'); await until(`document.body.innerText.includes('showTicket (index.bundle:1:1234)')`);
  await press('More'); await until(`document.querySelectorAll('[data-testid="client-error-details"]').length===2`);
  await press('Export JSON (loaded reports)'); await until('window.__qa.export');
  assert.equal(await evaluate('window.__qa.export.reports.length'), 2);
  assert.equal(await evaluate('window.__qa.export.reports[0].frames[0].column'), 1234);
  await capture('diagnostics-admin-reports');
  await press('android'); await until(`document.querySelectorAll('[data-testid="client-error-details"]').length===1 && document.body.innerText.includes('android · v1.0.0')`);
  assert.ok(await evaluate(`window.__qa.requests.filter(r=>r.route==='/admin/client-errors').every(r=>r.auth==='Bearer diagnostics-qa-only')`));
  await evaluate('window.__qa.failList=true'); await press('Refresh'); await until(`document.body.innerText.includes('Reports could not be loaded.')`);
  await evaluate('window.__qa.failList=false;window.__qa.empty=true'); await press('Refresh'); await until(`document.body.innerText.includes('No reported errors.')`);
  await capture('diagnostics-admin-empty');
  assert.deepEqual(await evaluate('window.__qa.unexpected'), []);
  assert.deepEqual(errors, []);
  console.log('PASS admin-only panel, details, pagination, export, filters and error/retry/empty states');
}).catch(error => { console.error(error); process.exitCode = 1; });
