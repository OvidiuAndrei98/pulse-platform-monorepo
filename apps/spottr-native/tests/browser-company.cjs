// Production export UI with local fixtures only: no company verification or legal acceptance is sent to a server.
const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');

withBrowser(async ({ base, call, evaluate, until, click, input, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = fetch.bind(window), id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
    const user = { id: id(1), username: 'Company QA', email: 'qa@example.test', role: 'organizer', hasPassword: true, preferredLanguage: 'en' };
    const mode = new URL(location.href).searchParams.get('mode');
    if (mode === 'member') user.role = 'user';
    if (mode === 'guest') localStorage.removeItem('spottr-native.session.v1');
    else localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'company-fixture', user }));
    const profile = { id: id(2), userId: id(1), cui: 'RO123456', companyName: 'Fixture Club', verificationStatus: 'approved', isVerified: true, stripeChargesEnabled: false, stripePayoutsEnabled: false, organizerAgreementVersion: mode === 'old-agreement' ? 'old' : '2026-10-18' };
    const qa = window.__company = { profile: mode === 'empty' ? null : profile, writes: [], privateReads: [], fail: false, failProfile: mode === 'error', nextStatus: 'pending' };
    window.fetch = async (url, options = {}) => {
      if (!String(url).includes('/api/v1/')) return original(url, options);
      const route = new URL(url, location.origin).pathname.split('/api/v1')[1], method = options.method || 'GET';
      const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
      if (route === '/diagnostics/errors' && method === 'POST') return new Response(null, { status: 204 });
      if (method !== 'GET') qa.writes.push({ route, body: options.body });
      if (method === 'GET' && route.startsWith('/dashboard/')) qa.privateReads.push(route);
      if (route === '/users/me') return reply(user);
      if (route.startsWith('/dashboard/organizer/profile/')) return qa.failProfile ? reply({}, 503) : qa.profile ? reply(qa.profile) : reply({ error: 'Organizer profile not found' }, 404);
      if (route === '/dashboard/organizer/profile') {
        await new Promise(resolve => setTimeout(resolve, 200));
        if (qa.fail) return reply({}, 503);
        qa.profile = { ...profile, ...JSON.parse(options.body), verificationStatus: qa.nextStatus, isVerified: qa.nextStatus === 'approved' };
        return reply(qa.profile);
      }
      if (route === '/dashboard/organizer/agreement') {
        await new Promise(resolve => setTimeout(resolve, 200));
        if (qa.fail) return reply({}, 503);
        qa.profile = { ...qa.profile, organizerAgreementVersion: JSON.parse(options.body).version };
        return reply(qa.profile);
      }
      if (route === '/dashboard/stripe/status') return reply(qa.profile);
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      return reply([]);
    };
  }.toString()})();` });
  const node = id => `document.querySelector('[data-testid="${id}"]')`;
  const pressTwice = id => evaluate(`{ const button=${node(id)}; button.click(); button.click(); }`);
  await call('Page.navigate', { url: base + '/dashboard/company?mode=empty' });
  await until(node('company-cui'));
  assert.equal(await evaluate(`${node('company-submit')}.getAttribute('aria-disabled')`), 'true');
  await input('company-cui', '  RO123456  '); await input('company-name', '  Fixture Club  ');
  assert.equal(await evaluate(`${node('company-submit')}.getAttribute('aria-disabled')`), 'true', 'Company cannot submit without explicit agreement');
  await capture('dashboard-company-form-mobile');
  await call('Emulation.setDeviceMetricsOverride', { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false });
  await until(`${node('company-cui')}.getBoundingClientRect().top === ${node('company-name')}.getBoundingClientRect().top`);
  await capture('dashboard-company-form-desktop');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await until(`${node('company-name')}.getBoundingClientRect().top > ${node('company-cui')}.getBoundingClientRect().bottom`);
  await click('company-agreement'); await evaluate('window.__company.fail=true');
  await pressTwice('company-submit');
  await until(`document.body.innerText.includes("The change couldn't be saved")`);
  assert.equal(await evaluate('window.__company.writes.length'), 1, 'Duplicate Verify taps send one mutation');
  assert.equal(await evaluate(`${node('company-name')}.value`), '  Fixture Club  ', 'Failed verification preserves inputs');
  await evaluate('window.__company.fail=false'); await click('company-submit');
  await until(node('company-pending'));
  assert.deepEqual(await evaluate('JSON.parse(window.__company.writes[1].body)'), { cui: 'RO123456', companyName: 'Fixture Club', organizerAgreementVersion: '2026-10-18' });
  await capture('dashboard-company-pending-mobile');
  await click('company-retry');
  assert.equal(await evaluate(`${node('company-cui')}.value`), 'RO123456');
  await evaluate("window.__company.nextStatus='approved'"); await click('company-submit');
  await until(node('company-verified'));
  assert.equal(await evaluate(`!!${node('company-submit')}`), false, 'Verified companies show their status instead of the unverified form');

  await call('Page.navigate', { url: base + '/organizers/agreement?mode=empty' });
  await until(node('organizer-agreement-company'));
  assert.equal(await evaluate(`!!${node('organizer-agreement-submit')}`), false, 'Agreement explains company details are needed before acceptance');
  await click('organizer-agreement-company'); await until(node('company-cui'));
  await call('Page.navigate', { url: base + '/organizers/agreement?mode=old-agreement' });
  await until(node('organizer-agreement-submit'));
  assert.equal(await evaluate(`${node('organizer-agreement-submit')}.getAttribute('aria-disabled')`), 'true');
  await click('organizer-agreement-checkbox'); await evaluate('window.__company.fail=true'); await pressTwice('organizer-agreement-submit');
  await until(`document.body.innerText.includes("The change couldn't be saved")`);
  assert.equal(await evaluate('window.__company.writes.length'), 1);
  await evaluate('window.__company.fail=false'); await click('organizer-agreement-submit');
  await until(`window.__company.profile.organizerAgreementVersion==='2026-10-18'`);
  await until(`!${node('organizer-agreement')}`);

  await call('Page.navigate', { url: base + '/dashboard/company?mode=error' });
  await until(`document.body.innerText.includes("We couldn't load this information")`);
  assert.equal(await evaluate(`!!${node('company-submit')}`), false, 'Profile errors cannot masquerade as a new company');
  await evaluate(`window.__company.failProfile=false; Array.from(document.querySelectorAll('[role=button]')).find(el=>el.textContent==='Try again').click()`);
  await until(node('company-verified'));

  for (const width of [390, 1024]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    await call('Page.navigate', { url: base + '/organizers/stripe-connect' });
    await until(node('stripe-information-steps'));
    assert.equal(await evaluate(`getComputedStyle(${node('stripe-information-steps')}).flexDirection`), width >= 640 ? 'row' : 'column');
    assert.equal(await evaluate(`!!${node('dashboard-sidebar')}`), false, 'Original public information page has no dashboard sidebar');
    await capture('organizer-stripe-information-' + width);
  }
  await call('Page.navigate', { url: base + '/organizers/agreement?mode=guest' });
  await until(node('organizer-agreement-guest'));
  assert.equal(await evaluate(`!!${node('organizer-agreement-submit')}`), false, 'Guests can read the document but cannot accept on behalf of an organizer');
  assert.deepEqual(await evaluate('window.__company.privateReads'), [], 'Public organizer documents never request private dashboard data for guests');
  await click('organizer-agreement-signin'); await until(node('auth-screen'));
  await call('Page.navigate', { url: base + '/organizers/stripe-connect?mode=guest' });
  await until(node('stripe-information-steps'));
  assert.equal(await evaluate(`!!${node('auth-screen')}`), false, 'Stripe information is readable without a session');
  assert.deepEqual(await evaluate('window.__company.privateReads'), []);
  await call('Page.navigate', { url: base + '/organizers/agreement?mode=member' });
  await until(node('organizer-agreement-company'));
  assert.equal(await evaluate(`!!${node('organizer-agreement-submit')}`), false, 'A signed-in member without a company can read the agreement without waiting forever on a disabled profile query');
  assert.deepEqual(await evaluate('window.__company.privateReads'), [], 'Ordinary members do not request organizer-only dashboard data to read public documents');
  assert.deepEqual(errors, []);
  console.log('PASS company required fields/agreement, duplicate submit, API error retention, pending retry/approval, agreement prerequisite and acceptance, responsive standalone Stripe information, public guest documents and sign-in');
}).catch(error => { console.error(error); process.exitCode = 1; });
