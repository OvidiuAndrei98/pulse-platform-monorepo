// Every account and DELETE request in this test is a local fixture.
const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');

withBrowser(async ({ base, call, evaluate, until, input, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = fetch.bind(window), params = new URLSearchParams(location.search);
    const user = { id: '00000000-0000-4000-8000-000000000001', username: 'Account QA', email: 'qa@example.test',
      role: params.get('role') || 'user', preferredLanguage: params.get('lang') || 'en', hasPassword: !params.has('google'), createdAt: '2026-01-01T00:00:00Z' };
    localStorage.clear();
    localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'deletion-qa-only', user }));
    const qa = window.__qa = { user, deletes: [], reports: [], unexpected: [], failure: 401 };
    window.fetch = async (input, options = {}) => {
      const url = new URL(String(input), location.origin), route = url.pathname.split('/api/v1')[1];
      if (!route) { if (url.origin === location.origin) return original(input, options); throw Error('External request blocked'); }
      const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      if (route === '/diagnostics/errors' && options.method === 'POST') {
        qa.reports.push({ ...JSON.parse(options.body), auth: new Headers(options.headers).get('Authorization') });
        return new Response(null, { status: 204 });
      }
      if (route === '/users/me' && options.method === 'DELETE') {
        qa.deletes.push(JSON.parse(options.body));
        await new Promise(resolve => setTimeout(resolve, 250));
        return qa.failure ? reply({ error: 'Fixture failure' }, qa.failure) : new Response(null, { status: 204 });
      }
      if (options.method && options.method !== 'GET') { qa.unexpected.push(route); return reply({}, 400); }
      if (route === '/users/me') return reply(user);
      if (route === '/wardrobe/mine') return reply({ deposits: [], staffAccess: false });
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      if (route.startsWith('/dashboard/organizer/profile/')) return reply({ verificationStatus: 'approved', companyName: 'QA SRL', cui: '123456' });
      if (['/events', '/promotions/active', '/users/me/saved-events', '/users/me/tickets', '/users/me/orders', '/users/me/hidden-categories', '/dashboard/events', '/dashboard/ticket-validation/events', '/friends', '/feed'].includes(route)) return reply([]);
      qa.unexpected.push(route); return reply({}, 404);
    };
  }.toString()})();` });
  const el = id => `document.querySelector('[data-testid="${id}"]')`;
  const press = async id => { await until(el(id)); await evaluate(`${el(id)}.click()`); };
  const disabled = `${el('delete-account-confirm')}.getAttribute('aria-disabled')==='true'`;
  const userSheet = async (extra = '') => {
    await call('Page.navigate', { url: base + '/users/me' + extra });
    await press('profile-delete-account');
    await until(el('delete-account-sheet')); await delay(600);
  };
  await userSheet();
  assert.equal(await evaluate(disabled), true);
  assert.equal(await evaluate(`document.activeElement.tagName==='INPUT'`), false, 'Opening explains consequences before opening the keyboard');
  const text = await evaluate(`${el('delete-account-sheet')}.textContent`);
  for (const phrase of ['What will be deleted', 'What happens to your tickets', 'What is kept separately', 'How to confirm deletion', 'unused tickets', 'does not refund', 'If you used them:', 'Current password']) assert.ok(text.includes(phrase), phrase);
  assert.ok(!text.includes('company name') && !text.includes('outstanding payments'), 'Participant copy excludes organizer obligations');
  await capture('account-deletion-user');
  await input('delete-account-email', 'wrong@example.test');
  await input('delete-account-password', 'qa-password');
  assert.equal(await evaluate(disabled), true);
  await input('delete-account-password', '');
  await input('delete-account-email', 'QA@EXAMPLE.TEST');
  assert.equal(await evaluate(disabled), true);
  assert.equal(await evaluate('window.__qa.deletes.length'), 0);
  await input('delete-account-password', 'qa-password');
  await until(`!(${disabled})`);
  await evaluate(`${el('delete-account-confirm')}.click();${el('delete-account-confirm')}.click()`);
  await until(`${el('delete-account-error')}?.textContent.includes('password is incorrect')`);
  assert.equal(await evaluate('window.__qa.deletes.length'), 1, 'Rapid confirmation submits once');
  assert.ok(await evaluate(`!!localStorage.getItem('spottr-native.session.v1')`), 'Failed deletion leaves session intact');
  await capture('account-deletion-form-error');
  await evaluate('window.__qa.failure=503'); await press('delete-account-confirm');
  await until(`${el('delete-account-error')}?.textContent.includes('could not be deleted')`);
  await until(`window.__qa.reports.some(report=>report.operation==='api_request' && report.httpStatus===503 && report.auth===null)`);
  assert.ok(await evaluate(`window.__qa.reports.every(report=>report.httpStatus===503)`), 'Incorrect passwords are not technical errors');
  assert.ok(await evaluate(`!JSON.stringify(window.__qa.reports).includes('qa-password') && !JSON.stringify(window.__qa.reports).includes('qa@example.test')`), 'Deletion credentials stay outside diagnostics');
  await evaluate('window.__qa.failure=0'); await press('delete-account-confirm');
  await until(`localStorage.getItem('spottr-native.session.v1')===null`);
  assert.equal(await evaluate('window.__qa.deletes.length'), 3);
  assert.deepEqual(await evaluate('window.__qa.unexpected'), []);

  await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 1, mobile: true });
  await userSheet('?lang=ro');
  assert.ok(await evaluate(`${el('delete-account-sheet')}.textContent.includes('Dacă le-ai folosit:')`));
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`));
  await capture('account-deletion-user-ro-small');
  await press('delete-account-cancel'); await until(`!${el('delete-account-sheet')}`);
  assert.equal(await evaluate('window.__qa.deletes.length'), 0, 'Cancel never submits');

  await userSheet('?google=1');
  assert.equal(await evaluate(`!!${el('delete-account-password')}`), false);
  assert.ok(await evaluate(`${el('delete-account-sheet')}.textContent.includes('10 minutes')`));
  await input('delete-account-email', 'qa@example.test'); await press('delete-account-confirm');
  await until(`${el('delete-account-error')}?.textContent.includes('Sign in with Google again')`);
  assert.deepEqual(await evaluate('window.__qa.deletes[0]'), { confirmation: 'qa@example.test' }, 'Google confirmation sends no password');
  await press('delete-account-cancel');

  for (const role of ['organizer', 'admin']) {
    await call('Page.navigate', { url: base + '/dashboard/profile?role=' + role });
    await press('organizer-account-closure');
    await until(el('organizer-account-closure-sheet')); await delay(600);
    const copy = await evaluate(`${el('organizer-account-closure-sheet')}.textContent`);
    for (const phrase of ['contact@code-lab.ro', 'qa@example.test', 'company name', 'outstanding payments', 'does not submit']) assert.ok(copy.includes(phrase), phrase);
    assert.equal(await evaluate(`!!${el('delete-account-confirm')} || !!${el('delete-account-email')} || !!${el('delete-account-password')}`), false, 'Managed account has no automatic deletion form');
    assert.equal(await evaluate('window.__qa.deletes.length'), 0);
    assert.deepEqual(await evaluate('window.__qa.unexpected'), []);
    if (role === 'organizer') await capture('account-closure-organizer');
  }
  assert.deepEqual(errors, []);
  console.log('PASS deletion: participant-only consequences, visible labels, email/password validation, single submit, errors, logout after success, cancellation, Google reauth, organizer/admin support-only flow and small RO layout');
}).catch(error => { console.error(error); process.exitCode = 1; });
