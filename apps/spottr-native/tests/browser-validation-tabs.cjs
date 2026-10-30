// Both exported clients, isolated accounts/API only. No production requests.
const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');

withBrowser(async ({ base, call, evaluate, until, delay, capture, errors }) => {
  const next = !!process.env.VALIDATION_TEST_URL;
  const origin = process.env.VALIDATION_TEST_URL || base;
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = window.fetch.bind(window);
    const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const params = new URLSearchParams(location.search), manager = !params.has('staff');
    const language = params.get('lang') || 'en';
    const user = { id: id(2), username: 'Validation QA', email: 'qa@example.invalid', role: manager ? 'organizer' : 'user', preferredLanguage: language, hasPassword: true, createdAt: '2026-01-01T00:00:00Z' };
    localStorage.clear();
    localStorage.setItem('pulse_token', 'validation-tabs-qa-only');
    localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'validation-tabs-qa-only', user }));
    localStorage.setItem('i18nextLng', language);
    const qa = window.__validationQA = { requests: [], writes: [], staff: [], links: [] };
    const event = { id: id(1), organizerId: id(2), title: 'Validation QA Night', description: '', category: 'TECHNO', city: 'Bucuresti', locationName: 'QA Venue', startTime: '2020-01-01T20:00:00Z', endTime: '2035-10-11T04:00:00Z', status: 'published', canManage: manager, latitude: 44.43, longitude: 26.1, lineup: [], ticketTypes: [] };
    const assigned = { ...event, id: id(5), organizerId: id(77), title: 'Assigned QA event', canManage: false };
    window.fetch = async (input, options = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname === '/health') return new Response('', { status: 200 });
      if (!url.pathname.includes('/api/v1/')) {
        if (url.origin === location.origin) return original(input, options);
        throw Error('Unexpected external request');
      }
      const route = url.pathname.split('/api/v1')[1], method = options.method || 'GET';
      const body = options.body ? JSON.parse(options.body) : null;
      qa.requests.push({ route, method });
      const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      if (route === '/users/me' || route === '/auth/me') return reply(user);
      if (['/events', '/dashboard/events', '/dashboard/ticket-validation/events'].includes(route)) return reply([event, assigned]);
      if (route.includes('/organizer/profile/') || route === '/dashboard/stripe/status') return reply({ userId: user.id, companyName: 'Validation QA Company', cui: '12345678', isVerified: true, verificationStatus: 'approved', agreementVersion: '2026-10-18', agreementAcceptedAt: '2026-10-18T12:00:00Z' });
      if (route.endsWith('/my-scans')) return reply({ totalScans: 0, scans: [] });
      if (/\/(staff|quick-access)(\/[^/]+)?$/.test(route)) {
        if (!manager || route.includes(assigned.id)) return reply({ error: 'FORBIDDEN' }, 403);
        if (method !== 'GET') qa.writes.push({ route, method, body });
        if (route.endsWith('/staff')) {
          if (method === 'POST') qa.staff.push({ id: id(3), username: 'New operator', email: body.email });
          return reply(qa.staff);
        }
        if (route.endsWith('/quick-access')) {
          if (method === 'POST') {
            const access = { id: id(4), label: body.label, startsAt: body.startsAt, endsAt: body.endsAt };
            qa.links.push(access);
            return reply({ ...access, url: location.origin + '/ticket-validation/quick-access?token=' + 'a'.repeat(64) });
          }
          return reply(qa.links);
        }
      }
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      if (route === '/diagnostics/errors') return new Response(null, { status: 204 });
      return reply([]);
    };
  }.toString()})();` });
  const tabId = value => (next ? 'validation-tabs-' : 'scanner-tab-') + value;
  const tab = value => `document.getElementById(${JSON.stringify(tabId(value))})`;
  const panel = next ? 'validation-panel' : 'scanner-panel';
  const activate = async value => { await until(tab(value)); await evaluate(`${tab(value)}.click()`); await until(`${tab(value)}.getAttribute('aria-selected')==='true'`); };
  const fill = async (placeholder, value) => {
    const expression = `Array.from(document.querySelectorAll('input')).find(e=>(e.placeholder===${JSON.stringify(placeholder)}||e.getAttribute('aria-label')===${JSON.stringify(placeholder)})&&e.getBoundingClientRect().width>0)`;
    await until(expression); await evaluate(`{const e=${expression};e.scrollIntoView({block:'center'});e.focus();e.select();}`); await call('Input.insertText', { text: value });
  };
  const press = async label => {
    const expression = `Array.from(document.querySelectorAll('button,[role="button"]')).find(e=>e.textContent.trim()===${JSON.stringify(label)}&&e.getBoundingClientRect().width>0)`;
    await until(expression); await evaluate(`${expression}.click()`);
  };
  const open = async suffix => { await call('Page.navigate', { url: origin + '/ticket-validation' + suffix }); await until(`${tab('scan')}&&document.body.innerText.includes('Validation QA Night')`); await delay(100); };
  await open('');
  await until(tab('links'));
  assert.equal(await evaluate(`document.getElementById('${panel}').getAttribute('aria-labelledby')`), tabId('scan'));
  await evaluate(`${tab('scan')}.focus()`);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'End', code: 'End', windowsVirtualKeyCode: 35 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'End', code: 'End', windowsVirtualKeyCode: 35 });
  assert.equal(await evaluate('document.activeElement.id'), tabId('links'));
  assert.equal(await evaluate(`${tab('scan')}.getAttribute('aria-selected')`), 'true', 'Arrow focus does not activate an expensive workspace');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await until(`${tab('links')}.getAttribute('aria-selected')==='true'`);
  await fill('Gate 1 scanner', 'West entrance');
  await activate('team');
  await fill('name@email.com', 'draft@example.invalid');
  await activate('links'); await activate('team');
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('input')).find(e=>e.placeholder==='name@email.com'||e.getAttribute('aria-label')==='name@email.com').value`), 'draft@example.invalid', 'Switching Team/Links preserves the draft');
  await press('Add access');
  await until(`document.body.innerText.includes('New operator')`);
  await capture((next ? 'next' : 'native') + '-validation-team');
  await activate('links');
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('input')).find(e=>e.placeholder==='Gate 1 scanner'||e.getAttribute('aria-label')==='Gate 1 scanner').value`), 'West entrance');
  await press('Create link');
  await until(`window.__validationQA.writes.some(w=>w.route.endsWith('/quick-access'))`);
  await capture((next ? 'next' : 'native') + '-validation-links');
  for (const width of [320, 1152]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });
    await delay(100);
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'), false, 'Tabs do not overflow the page');
    await capture((next ? 'next' : 'native') + '-validation-tabs-' + width);
  }
  if (next) {
    await evaluate('document.documentElement.style.zoom="2"'); await delay(100);
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'), false);
    await capture('next-validation-tabs-200-percent');
    await evaluate('document.documentElement.style.zoom=""');
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  // Switching from a managed event to an assigned one immediately removes management.
  const chooser = `Array.from(document.querySelectorAll('button,[role="button"]')).find(e=>e.textContent.trim()==='Validation QA Night')`;
  await until(chooser); await evaluate(`${chooser}.click()`); await press('Assigned QA event');
  await until(`!${tab('team')}&&!${tab('links')}&&${tab('scan')}.getAttribute('aria-selected')==='true'`);
  assert.equal(await evaluate(`window.__validationQA.requests.some(r=>r.route.includes('000000000005')&&(r.route.includes('/staff')||r.route.includes('/quick-access')))`), false);
  await open('?staff=1');
  assert.equal(await evaluate(`!!${tab('team')}||!!${tab('links')}`), false);
  assert.equal(await evaluate(`window.__validationQA.requests.some(r=>r.route.includes('/staff')||r.route.includes('/quick-access'))`), false, 'Non-managers never load privileged lists');
  await open('?lang=ro'); await until(tab('links'));
  await activate('links'); await capture((next ? 'next' : 'native') + '-validation-tabs-ro');
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'), false);
  assert.deepEqual(errors, []);
  console.log('PASS ' + (next ? 'Next' : 'Native web') + ' validation tabs: keyboard, scoped management, draft retention, staff/link commands, assigned event fallback, RO, 320px and desktop');
}, { fakeCamera: true }).catch(error => { console.error(error); process.exitCode = 1; });
