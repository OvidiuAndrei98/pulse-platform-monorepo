// Original Next.js dashboard geometry/behavior contracts, rendered by the native web export.
// APIs are fixture-only: no real event publication, payments, or account changes.
const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');
const eventId = '00000000-0000-4000-8000-000000000010';
const widths = values => process.env.SPOTTR_PARITY_MOBILE_ONLY ? [390] : values;

withBrowser(async ({ base, call, evaluate, until, click, input, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = window.fetch.bind(window), id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
    const user = { id: id(1), username: 'Dashboard QA', email: 'qa@example.test', role: 'organizer', hasPassword: true, preferredLanguage: 'en', createdAt: '2026-01-01T00:00:00Z' };
    localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'dashboard-parity-fixture', user }));
    const event = { id: id(10), organizerId: id(1), title: 'Parity night', status: 'published', category: 'TECHNO', locationName: 'QA Club', city: 'Bucuresti', vibe: 'Chill', description: 'The organizer event used by isolated dashboard tests.', startTime: '2035-10-15T18:00:00Z', endTime: '2035-10-16T06:00:00Z', latitude: 44.432, longitude: 26.106, googlePlaceId: 'ChIJ-qa-club', vatPercentage: 21, organizerAbsorbsServiceFee: false, ticketTypes: [{ id: id(11), name: 'General access', priceRon: 50, capacity: 100, ticketsSold: 1, startSales: '2020-01-01T00:00:00Z', endSales: '2035-10-16T06:00:00Z' }], lineup: [] };
    const qa = window.__dashboard = { calls: [], writes: [], unexpected: [], event };
    const profile = { id: id(2), userId: id(1), companyName: 'QA Club SRL', cui: 'RO123456', fiscalAddress: 'Club Street 1', verificationStatus: 'approved', isVerified: true, stripeAccountId: 'acct_fixture', stripeChargesEnabled: true, stripePayoutsEnabled: true, organizerAgreementVersion: '2026-07-27' };
    window.fetch = async (url, options = {}) => {
      if (!String(url).includes('/api/v1/')) {
        if (new URL(url, location.href).origin === location.origin) return original(url, options);
        throw new Error('Unexpected external request in dashboard parity test');
      }
      const parsed = new URL(url, location.href), route = parsed.pathname.split('/api/v1')[1], method = options.method || 'GET';
      const request = { route, method, query: parsed.search, body: options.body }; qa.calls.push(request);
      if (!['GET', 'HEAD'].includes(method)) qa.writes.push(request);
      const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
      if (route === '/users/me') { if (method === 'PUT') { await new Promise(resolve => setTimeout(resolve, 100)); Object.assign(user, JSON.parse(options.body)); } return reply(user); }
      if (route === '/events') return reply([event]);
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      if (route.startsWith('/dashboard/organizer/profile/')) return reply(profile);
      if (route === '/dashboard/stripe/status') return reply(profile);
      if (route === '/dashboard/events' && method === 'POST') { qa.created = JSON.parse(options.body); return reply({ ...event, ...qa.created, id: id(12) }); }
      if (route === '/dashboard/events') return reply([event, { ...event, id: id(20), title: 'Second parity night', startTime: '2035-10-17T18:00:00Z', endTime: '2035-10-18T06:00:00Z' }]);
      if (route === '/dashboard/events/' + id(10)) return reply(event);
      if (route === '/events/' + id(10)) return reply(event);
      if (route.endsWith('/cancellation-request')) return new Response(null, { status: 204 });
      if (route === '/dashboard/places/autocomplete') return reply([{ placeId: 'ChIJ-qa-club', name: 'QA Club', description: 'QA Club, Bucuresti' }]);
      if (route === '/dashboard/places/details') return reply({ placeId: 'ChIJ-qa-club', name: 'QA Club', description: 'QA Club, Bucuresti', lat: 44.432, lng: 26.106 });
      if (route.endsWith('/invitations')) return reply([
        { id: id(31), batchId: id(30), batchIndex: 1, label: 'Guestlist A', ticketTypeId: id(11), ticketType: 'General access', status: 'active', createdAt: '2026-10-11T18:00:00Z', eventId: event.id },
        { id: id(32), batchId: id(30), batchIndex: 2, label: 'Guestlist A', ticketTypeId: id(11), ticketType: 'General access', status: 'used', createdAt: '2026-10-11T18:00:00Z', eventId: event.id },
        { id: id(34), batchId: id(33), batchIndex: 1, label: 'Guestlist B', ticketTypeId: id(11), ticketType: 'General access', status: 'revoked', createdAt: '2026-10-11T19:00:00Z', eventId: event.id },
      ]);
      if (route === '/users/me/tickets' || route === '/users/me/orders' || route.endsWith('/promo-codes') || route.endsWith('/updates')) return reply([]);
      if (route === '/users/me/billing-details') return reply({ details: null });
      if (/^\/(users\/me\/(saved-events|hidden-categories)|promotions\/active|friends|feed|profiles\/search)$/.test(route) || route.endsWith('/attendees')) return reply([]);
      if (route.endsWith('/social')) return reply({ goingCount: 0, interestedCount: 0 });
      if (route === '/dashboard/finance') return reply([
        { eventId: event.id, eventTitle: 'Paid parity night', startTime: event.startTime, ticketsSold: 5, grossRevenueRon: 1000, customerTicketingFeeBani: 5000, platformFeeBani: 15000, refundsNeedingAttention: 0 },
        { eventId: id(20), eventTitle: 'No sales yet', startTime: event.startTime, ticketsSold: 0, grossRevenueRon: 0, customerTicketingFeeBani: 0, platformFeeBani: 0, refundsNeedingAttention: 0 },
      ]);
      if (route === '/dashboard/finance/invoices' || route === '/dashboard/finance/refunds-attention') return reply([]);
      if (route === '/dashboard/invoicing/settings') return reply({ connected: false, provider: 'oblio', accountEmail: '', companyVatCode: '', seriesName: '', vatName: '', vatPercentage: 0 });
      if (route === '/dashboard/invoicing/invoices') return reply([]);
      qa.unexpected.push(request); return reply([]);
    };
  }.toString()})();` });
  const exists = id => `document.querySelector('[data-testid="${id}"]')`;
  const geometry = id => evaluate(`{const el=${exists(id)},r=el.getBoundingClientRect(),s=getComputedStyle(el);({x:r.x,y:r.y,width:r.width,height:r.height,radius:parseFloat(s.borderRadius),paddingLeft:parseFloat(s.paddingLeft),paddingRight:parseFloat(s.paddingRight),paddingTop:parseFloat(s.paddingTop)})}`);
  const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1.1, message + ': ' + actual + ' vs ' + expected);
  const pressText = async text => {
    const selector = `Array.from(document.querySelectorAll('[role="button"],[role="radio"]')).find(el=>el.textContent.trim()===${JSON.stringify(text)})`;
    await until(selector); await evaluate(`(${selector}).click()`);
  };
  const fillLabel = async (label, text) => {
    const selector = `document.querySelector('input[aria-label=${JSON.stringify(label)}],textarea[aria-label=${JSON.stringify(label)}]')`;
    await until(selector); await evaluate(`{const el=${selector};el.focus();el.select();}`); await call('Input.insertText', { text });
  };
  const pick = async (label, value) => {
    const selector = `document.querySelector('[role="button"][aria-label=${JSON.stringify(label)}]')`;
    await until(selector); await evaluate(`(${selector}).click()`); await pressText(value);
    await until(`!document.querySelector('[data-testid="sheet-handle"]')`);
  };
  const setDay = async (label, day) => {
    await evaluate(`document.querySelector('[role="button"][aria-label=${JSON.stringify(label)}]').click()`);
    await until(exists('editor-date-popover')); await delay(100);
    await evaluate(`Array.from(document.querySelectorAll('[role="button"]')).find(el=>el.getAttribute('aria-label')===${JSON.stringify(String(day))}).click()`);
    await click('editor-date-done'); await until(`!${exists('editor-date-popover')}`);
  };

  for (const width of widths([390, 639, 640, 767, 768, 1024, 1440])) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    await call('Page.navigate', { url: base + '/dashboard' });
    await until(exists('organizer-dashboard')); await until(exists('dashboard-header')); await delay(500);
    assert.equal(await evaluate(`!!${exists('dashboard-sidebar')}`), width >= 768, 'Original sidebar breakpoint is exactly 768px');
    assert.equal(await evaluate(`!!${exists('dashboard-mobile-tabs')}`), width < 768, 'Mobile uses horizontal top tabs, never a sidebar');
    const header = await geometry('dashboard-header');
    if (Math.abs(header.x - (width >= 768 ? 240 : 0)) >= 1.1) { await capture('dashboard-parity-header-failure'); console.log(await evaluate(`{let el=${exists('dashboard-header')};const a=[];while(el){const r=el.getBoundingClientRect(),s=getComputedStyle(el);a.push({id:el.dataset.testid,x:r.x,width:r.width,transform:s.transform,padding:s.padding,margin:s.margin});el=el.parentElement;}a}`)); }
    close(header.x, width >= 768 ? 240 : 0, 'Header is aligned beside original 240px sidebar');
    if (width >= 768) close((await geometry('dashboard-sidebar')).width, 240, 'Original sidebar width');
    else {
      const tab = await geometry('dashboard-nav-overview'); close(tab.height, 36, 'Original mobile tab height'); close(tab.radius, 12, 'Original mobile tab corner radius');
      const indicator = await geometry('dashboard-tab-indicator'); close(indicator.x, tab.x, 'Active tab highlight aligns with button rather than adding padding twice'); close(indicator.width, tab.width, 'Highlight follows complete active button width');
    }
    const page = await geometry('dashboard-page'); close(page.paddingLeft, width >= 640 ? 32 : 20, 'Original responsive page gutter'); close(page.paddingTop, 32, 'Original page top spacing');
    assert.ok(page.width <= 1025, 'Standard dashboard page max width is 1024px');
    await until(`document.querySelectorAll('[data-testid="dashboard-mini-event"]').length===2`);
    const eventRows = await evaluate(`Array.from(document.querySelectorAll('[data-testid="dashboard-mini-event"]')).map(el=>({x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y}))`);
    if (width >= 640) close(eventRows[0].y, eventRows[1].y, 'Original event overview has two columns from640px, including narrow desktop content');
    else assert.ok(eventRows[1].y > eventRows[0].y + 30, 'Overview events stack on mobile');
    const bounds = await evaluate(`{const d=document.documentElement;({width:d.clientWidth,scroll:d.scrollWidth})}`); assert.ok(bounds.scroll <= bounds.width + 1, 'Dashboard must not overflow horizontally');
    if ([390, 768, 1440].includes(width)) await capture('dashboard-parity-overview-' + width);
  }
  console.log('PASS dashboard mobile/tablet/desktop shell: 768px sidebar, original top tabs, 640px gutters and content width');

  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call('Page.navigate', { url: base + '/dashboard' }); await until(exists('dashboard-mobile-tabs')); await delay(500);
  const tabs = await geometry('dashboard-mobile-tabs'), dragY = tabs.y + 18;
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 290, y: dragY, button: 'left', buttons: 1, clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: dragY, button: 'left', buttons: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 100, y: tabs.y + tabs.height + 15, button: 'left', buttons: 0, clickCount: 1 });
  await delay(100);
  assert.equal(await evaluate(`document.querySelectorAll('[data-testid="dashboard-mini-event"]').length`), 2, 'Dragging top tabs does not navigate away from overview');
  await evaluate(`${exists('dashboard-nav-events')}.focus()`);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await until(exists('dashboard-event-' + eventId));
  console.log('PASS top tabs accept keyboard navigation after dragging and releasing outside the strip');

  for (const width of widths([390, 800, 1440])) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    await call('Page.navigate', { url: base + '/dashboard/finance' }); await until(exists('finance-grossRevenue')); await delay(500);
    const money = n => new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 2 }).format(n).replace(/\s/g, '');
    assert.equal((await evaluate(`${exists('finance-grossRevenue')}.textContent`)).replace(/\s/g, ''), money(1050), 'Customer total includes ticketing fee');
    assert.equal((await evaluate(`${exists('finance-estimatedPayout')}.textContent`)).replace(/\s/g, ''), money(900), 'Payout subtracts platform fee from customer total');
    assert.equal(await evaluate(`${exists('finance-ticketsSold')}.textContent`), '5');
    const metrics = await evaluate(`Array.from(${exists('finance-metrics')}.querySelectorAll('[data-testid]')).filter(el=>/^finance-(grossRevenue|glowFee|estimatedPayout|ticketsSold)$/.test(el.dataset.testid)).map(el=>({x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y}))`);
    assert.equal(new Set(metrics.map(value => Math.round(value.x))).size, width >= 1024 ? 4 : width >= 640 ? 2 : 1, 'Original metric columns1/2/4');
    assert.equal(await evaluate(`document.querySelectorAll('[data-testid="finance-sale-row"]').length`), 1, 'Unsold events do not enter sales table');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-testid="finance-sale-row"]')).flexDirection`), width >= 768 ? 'row' : 'column', 'Original sales table breakpoint');
    await capture('dashboard-parity-finance-' + width);
  }
  console.log('PASS finance original responsive metric/table layout and correct customer-fee accounting');

  for (const width of widths([390, 640, 1440])) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    await call('Page.navigate', { url: base + '/dashboard/invoicing' }); await until(exists('dashboard-invoicing')); await delay(500);
    const providers = `Array.from(${exists('dashboard-invoicing')}.querySelectorAll('[role="radio"]'))`;
    await until(`${providers}.length===2`);
    const boxes = await evaluate(`${providers}.map(el=>({x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y,label:el.textContent}))`);
    assert.match(boxes[0].label, /Oblio/); assert.match(boxes[1].label, /SmartBill/);
    if (width >= 640) close(boxes[0].y, boxes[1].y, 'Invoice providers use original two columns from640px');
    else assert.ok(boxes[1].y > boxes[0].y + 30, 'Invoice providers stack on mobile');
    await evaluate(`${providers}[1].click()`);
    assert.equal(await evaluate(`getComputedStyle(${providers}[1]).backgroundColor`), 'rgba(255, 0, 68, 0.08)');
    assert.equal(await evaluate('window.__dashboard.writes.length'), 0, 'Provider selection alone does not save credentials');
    await capture('dashboard-parity-invoicing-' + width);
  }
  console.log('PASS invoicing original responsive provider radio cards and local selection');

  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call('Page.navigate', { url: base + '/dashboard/profile' });
  await fillLabel('Display name', 'x'); await pressText('Save changes');
  assert.equal(await evaluate('window.__dashboard.writes.length'), 0, 'Invalid profile name cannot mutate the API');
  await fillLabel('Display name', 'Updated QA name'); await fillLabel('Bio', 'Updated dashboard profile.');
  const saveProfile = `Array.from(document.querySelectorAll('[role="button"]')).find(el=>el.textContent.trim()==='Save changes')`;
  await evaluate(`{const el=${saveProfile};el.click();el.click();}`);
  await until(`JSON.parse(localStorage.getItem('spottr-native.session.v1')).user.username==='Updated QA name'`); await delay(100);
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('[role="button"]')).some(el=>el.textContent.trim()==='Saved')`), 'Successful profile edit retains the original Saved feedback');
  assert.equal(await evaluate(`window.__dashboard.writes.filter(v=>v.route==='/users/me'&&v.method==='PUT').length`), 1, 'Double submit updates profile only once');
  await capture('dashboard-parity-profile-mobile');
  console.log('PASS organizer profile invalid/valid inputs, duplicate-submit guard, session update and Saved feedback');

  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call('Page.navigate', { url: base + '/dashboard/events/new' });
  await until(exists('event-editor'));
  await capture('dashboard-parity-create-about-mobile');
  assert.equal(await evaluate(`${exists('editor-step-1')}.getAttribute('aria-disabled')`), 'true', 'Empty wizard cannot skip to schedule');
  assert.equal(await evaluate(`${exists('editor-step-2')}.getAttribute('aria-disabled')`), 'true', 'Empty wizard cannot skip to access');
  assert.equal(await evaluate(`${exists('editor-next')}.getAttribute('aria-disabled')`), 'true', 'Next is disabled until the current step is complete');
  await click('editor-next');
  assert.equal(await evaluate(`!!${exists('event-venue-input')}`), false, 'Invalid basics stay on step0');
  assert.equal(await evaluate(`window.__dashboard.writes.length`), 0);
  await fillLabel('Title', 'A real parity night'); await fillLabel('Description', 'A valid event description for the parity wizard.');
  const key = async (name, code) => { await call('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: code }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: code }); };
  await click('editor-vibe'); await until(exists('editor-vibe-options'));
  const popup = await evaluate(`{const r=${exists('editor-vibe-options')}.getBoundingClientRect();({x:r.x,y:r.y,right:r.right,bottom:r.bottom})}`);
  assert.ok(popup.x >= 8 && popup.right <= 382 && popup.y >= 8 && popup.bottom <= 836, 'Dropdown placement stays inside mobile viewport');
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 4, y: 4, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 4, y: 4, button: 'left', clickCount: 1 });
  await until(`!${exists('editor-vibe-options')}`);
  await click('editor-vibe'); await until(exists('editor-vibe-options'));
  await key('Escape', 27); await until(`!${exists('editor-vibe-options')}`); await delay(100);
  assert.equal(await evaluate('document.activeElement?.dataset.testid'), 'editor-vibe', 'Closing dropdown restores trigger focus');
  await click('editor-vibe'); await until(exists('editor-vibe-options'));
  const keyboardChoice = await evaluate(`${exists('editor-vibe-options')}.querySelectorAll('[role="button"]')[1].getAttribute('aria-label')`);
  await key('ArrowDown', 40); await delay(50); await key('Enter', 13); await delay(150);
  assert.equal(await evaluate(`!!${exists('editor-vibe-options')}`), false, 'Keyboard selection must not reopen the dropdown on keyup');
  assert.ok((await evaluate(`${exists('editor-vibe')}.textContent`)).includes(keyboardChoice), 'Arrow key selection chooses the highlighted option');
  await click('editor-vibe'); await until(exists('editor-vibe-options')); await key('Tab', 9); await until(`!${exists('editor-vibe-options')}`);
  await pick('Vibe', 'Chill');
  await click('editor-next'); await until(exists('event-venue-input'));
  await delay(500);
  await capture('dashboard-parity-create-schedule-mobile');
  assert.equal(await evaluate(`${exists('editor-next')}.getAttribute('aria-disabled')`), 'true', 'Schedule cannot advance before dates and venue are complete');
  await click('editor-next'); assert.equal(await evaluate(`!!${exists('event-venue-input')}`), true, 'Invalid schedule stays on step1');
  await setDay('Start date', 15); await setDay('End date', 16);
  await input('event-venue-input', 'QA Club'); await click('event-venue-ChIJ-qa-club'); await pick('City', 'Bucuresti');
  await click('editor-next'); await until(exists('editor-submit'));
  await delay(500);
  await capture('dashboard-parity-create-access-mobile');
  await pressText('Sell on another platform');
  await fillLabel('External ticket link', 'https://tickets.example.test/night');
  await evaluate(`{const button=${exists('editor-submit')};button.click();button.click();}`);
  await until('window.__dashboard.created');
  const created = await evaluate('window.__dashboard.created');
  assert.equal(created.title, 'A real parity night'); assert.equal(created.googlePlaceId, 'ChIJ-qa-club'); assert.equal(created.externalTicketUrl, 'https://tickets.example.test/night'); assert.equal(created.status, 'draft');
  assert.ok(Date.parse(created.endTime) > Date.parse(created.startTime));
  assert.equal(await evaluate(`window.__dashboard.writes.filter(v=>v.route==='/dashboard/events').length`), 1, 'Rapid submit creates exactly one event');
  await until(`!${exists('event-editor')} && ${exists('dashboard-event-' + eventId)}`);
  console.log('PASS three-step create wizard validates before navigation, retains venue/dates and submits once');

  await call('Page.navigate', { url: base + '/dashboard/events/' + eventId }); await until(exists('event-editor'));
  const crumbs = await evaluate(`${exists('dashboard-breadcrumbs')}.textContent`);
  assert.match(crumbs, /Dashboard.*Events.*Details/, 'Event editing retains original three breadcrumb levels');
  for (const section of ['details', 'lineup', 'tickets', 'admin']) assert.equal(await evaluate(`!!${exists('editor-section-' + section)}`), true, 'Original edit section ' + section + ' is present');
  await fillLabel('Title', 'x'); await click('editor-section-tickets'); await click('editor-submit');
  await until(`document.querySelector('input[aria-label="Title"]')`);
  assert.equal(await evaluate(`window.__dashboard.writes.length`), 0, 'Invalid edit cannot mutate API');
  await capture('dashboard-parity-edit-errors-mobile');
  await click('editor-section-admin'); await until(exists('management-open-invitations'));
  assert.equal(await evaluate(`!!${exists('editor-submit')}`), false, 'Administration has its own actions, not the event Save footer');
  await capture('dashboard-parity-edit-admin-mobile');
  assert.ok((await evaluate(`${exists('management-open-promo')}.textContent`)).includes('0 active codes'), 'Zero promo codes use the plural translation rather than exposing the resource key');
  for (const width of widths([390, 1024])) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 768 });
    await click('management-open-invitations'); await until(exists('management-drawer')); await delay(350);
    const panel = await geometry('management-drawer'); close(panel.width, width < 640 ? width : 480, 'Management panel keeps original responsive width'); close(panel.height, 844, 'Management panel is full height');
    await until(`document.querySelectorAll('[data-testid="invitation-batch"]').length===2`);
    assert.equal(await evaluate(`${exists('management-drawer')}.textContent.includes('#2')`), false, 'Invitation batches begin collapsed');
    await evaluate(`document.querySelector('[data-testid="invitation-batch"] [role="button"]').click()`);
    await until(`${exists('management-drawer')}.textContent.includes('#2')`);
    await capture('dashboard-parity-invitations-' + width);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await until(`!${exists('management-drawer')}`);
  }
  assert.equal(await evaluate('window.__dashboard.writes.length'), 0, 'Reviewing invitation batches never changes tickets');
  assert.deepEqual(errors, []);
  assert.deepEqual(await evaluate('window.__dashboard.unexpected'), [], 'All new dashboard API requests are covered by fixtures');
  console.log('PASS edit breadcrumbs, original four sections, visible invalid-field routing and separate administration actions');
}).catch(error => { console.error(error); process.exitCode = 1; });
