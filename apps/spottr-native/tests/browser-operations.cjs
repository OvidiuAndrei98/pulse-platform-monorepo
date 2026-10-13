// Exercises the exported app with isolated, simulated accounts and API only.
const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

withBrowser(async ({ base, call, evaluate, until, click, input, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = window.fetch.bind(window), id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const query = new URL(location.href).searchParams, role = query.get('role') || 'user';
    const user = { id: id(2), username: 'Operations QA', email: 'qa@example.test', role, hasPassword: true, preferredLanguage: 'en', createdAt: '2026-10-07T12:00:00Z' };
    if (query.get('guest')) localStorage.removeItem('spottr-native.session.v1');
    else localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'operations-qa-only', user }));
    const qa = window.__qa = { requests: [], writes: [], unexpected: [], user, failSafety: query.get('failure') === 'safety', failAdmin: false, messageDelay: 0, group: null, scanCount: 0, clipboardFails: true, copied: [], createdAccess: null };
    // Never write to the host clipboard. Exercise Expo's rejected async write
    // and false legacy fallback, then a successful retry with the exact link.
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { if (qa.clipboardFails) throw new DOMException('QA clipboard denied', 'NotAllowedError'); qa.copied.push(text); } } });
    const execCommand = document.execCommand.bind(document);
    document.execCommand = (command, ...args) => command === 'copy' ? false : execCommand(command, ...args);
    const friend = n => ({ userId: id(n), username: 'Friend ' + n });
    const event = { id: id(1), organizerId: id(2), title: 'QA Night', description: 'A simulated event for regression checks.', category: 'TECHNO', city: 'Bucuresti', locationName: 'QA Club', startTime: '2026-01-01T20:00:00Z', endTime: '2035-10-11T04:00:00Z', status: 'published', latitude: 44.43, longitude: 26.1, ticketTypes: [], lineup: [], canManage: role !== 'user' };
    if (query.has('ended')) {
      event.startTime = '2020-01-01T12:00:00Z'; event.endTime = '2020-01-01T20:00:00Z';
      const snapshot = { snapshotId: id(80), eventId: event.id, eventTitle: event.title, generatedAt: '2020-01-01T10:00:00Z', expiresAt: event.endTime, ticketCount: 1, tickets: [{ ticketId: id(90), ticketType: 'General', validationHash: 'b'.repeat(64) }] };
      const scan = { ...snapshot.tickets[0], clientScanId: id(81), snapshotId: snapshot.snapshotId, deviceId: id(82), scannedAt: '2020-01-01T18:00:00Z', status: 'pending' };
      localStorage.setItem('spottr-native:scanner:v1:' + user.id + ':' + event.id, JSON.stringify({ version: 1, eventId: event.id, snapshot, event, revoked: false, scans: [scan], online: {}, attempts: {} }));
    }
    qa.validationEvents = query.has('ended') ? [] : [event];
    if (query.has('mixedAccess')) qa.validationEvents.push({ ...event, id: id(9), organizerId: id(8), title: 'Assigned gate', canManage: false });
    const accepted = () => ({ id: id(5), eventId: id(1), ownerId: id(2), eventTitle: event.title, eventLocation: event.locationName, startTime: event.startTime, endTime: event.endTime, expiresAt: '2035-10-12T04:00:00Z', currentMemberStatus: 'accepted', canSendHelp: true, currentUserNeedsHelp: false, members: [{ ...friend(2), status: 'accepted' }, { ...friend(3), status: 'accepted' }], messages: [] });
    if (query.get('group') === 'accepted') qa.group = accepted();
    if (query.get('group') === 'pending') qa.group = { ...accepted(), currentMemberStatus: 'pending' };
    qa.organizer = { userId: id(20), username: 'Organizer', email: 'org@example.test', cui: '123456', companyName: 'QA Club SRL', verificationStatus: 'pending', submittedAt: '2026-10-10T18:00:00Z', updatedAt: '2026-10-10T18:00:00Z', stripeDetailsSubmitted: false, stripeChargesEnabled: false, stripePayoutsEnabled: false };
    window.fetch = async (url, options = {}) => {
      const parsed = new URL(String(url), location.origin);
      if (!parsed.pathname.includes('/api/v1/')) { if (parsed.origin === location.origin) return original(url, options); throw new Error('Unexpected external fetch'); }
      const route = parsed.pathname.split('/api/v1')[1], method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : undefined;
      qa.requests.push({ route, method }); if (method !== 'GET') qa.writes.push({ route, method, body });
      const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
      if (route === '/users/me') return reply(qa.user);
      if (route === '/auth/login') return reply({ token: 'operations-qa-only' });
      if (route === '/events') return reply([event]);
      if (route === '/events/' + id(1)) return reply(event);
      if (route.endsWith('/social')) return reply({ goingCount: 0, interestedCount: 0 });
      if (route.endsWith('/safety-group')) {
        if (qa.failSafety) return reply({}, 503);
        if (method === 'POST') qa.group = accepted();
        return reply({ canCreate: !qa.group, ticketValidated: true, eligibleFriends: [friend(3), friend(4)].filter(friend => !qa.group?.members.some(member => member.userId === friend.userId)), group: qa.group });
      }
      if (route.includes('/safety-group/')) {
        if (route.endsWith('/respond')) qa.group = body.status === 'accepted' ? accepted() : null;
        else if (route.endsWith('/invite')) for (const userId of body.friendIds) qa.group.members.push({ userId, username: 'Invited friend', status: 'pending' });
        else {
          if (route.endsWith('/messages') && qa.messageDelay) await new Promise(resolve => setTimeout(resolve, qa.messageDelay));
          const kind = route.endsWith('/help') ? 'help' : route.endsWith('/help-resolved') ? 'help_resolved' : 'message';
          qa.group.messages.push({ id: id(100 + qa.group.messages.length), senderId: id(2), senderUsername: user.username, kind, content: body.content, createdAt: new Date().toISOString() });
          if (kind !== 'message') qa.group.currentUserNeedsHelp = kind === 'help';
        }
        return reply({ success: true });
      }
      if (route === '/admin/organizers') return qa.failAdmin ? reply({}, 503) : reply([qa.organizer]);
      if (route.endsWith('/verification')) { qa.organizer.verificationStatus = body.status; await new Promise(resolve => setTimeout(resolve, 150)); return reply(qa.organizer); }
      if (route.startsWith('/admin/')) return reply([]);
      if (route === '/dashboard/events') return reply([event]);
      if (route === '/dashboard/events/' + id(1)) return reply(event);
      if (route.startsWith('/dashboard/organizer/profile/') || route === '/dashboard/stripe/status') return reply({ userId: id(2), companyName: 'QA Club SRL', cui: '123456', fiscalAddress: 'QA Address', isVerified: true, verificationStatus: 'approved' });
      if (route === '/dashboard/ticket-validation/events') return reply(qa.validationEvents);
      if (route.endsWith('/offline-sync')) return reply({ results: body.scans.map(scan => ({ clientScanId: scan.clientScanId, status: 'accepted' })) });
      if (route.endsWith('/my-scans')) return reply({ totalScans: qa.scanCount ? 1 : 0, scans: qa.scanCount ? [{ ticketId: id(90), ticketType: 'General', validatedAt: '2026-10-11T18:00:00Z' }] : [] });
      if (route === '/dashboard/ticket-validation/events/' + id(1) + '/staff') return reply([{ id: id(3), username: 'Gate staff', email: 'staff@example.test' }]);
      if (route === '/dashboard/ticket-validation/events/' + id(1) + '/quick-access') {
        if (method === 'POST') {
          qa.createdAccess = { id: id(40), ...body };
          return reply({ url: 'https://spottr.ro/scan?token=' + 'q'.repeat(64) });
        }
        return reply([{ id: id(41), label: 'Revoked gate', startsAt: event.startTime, endsAt: event.endTime, revokedAt: '2026-10-10T20:00:00Z' }, ...(qa.createdAccess ? [qa.createdAccess] : [])]);
      }
      if (route.endsWith('/tickets/validate')) { qa.scanCount++; return reply({ status: qa.scanCount > 1 ? 'already_validated' : 'valid', ticketId: id(90), ticketType: 'General', eventTitle: event.title, validatedAt: new Date().toISOString() }); }
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      if (route === '/ticket-validation/quick-access/session') return reply({ sessionToken: 'qa-' + body.token, label: 'Quick ' + body.token[0], eventTitle: event.title, locationName: event.locationName, expiresAt: '2035-10-11T04:00:00Z' });
      if (route === '/ticket-validation/quick-access/validate') { await new Promise(resolve => setTimeout(resolve, 2500)); return reply({ status: 'valid', ticketId: id(90), ticketType: 'General', eventTitle: event.title, validatedAt: new Date().toISOString() }); }
      if (/^\/(users\/me\/(saved-events|tickets|orders|hidden-categories)|promotions\/active|friends|feed|profiles\/search)$/.test(route) || route.endsWith('/updates') || route.endsWith('/attendees')) return reply([]);
      qa.unexpected.push({ route, method }); return reply({}, 404);
    };
  }.toString()})();` });
  const open = async path => { await call('Page.navigate', { url: base + path }); };
  const textButton = label => `Array.from(document.querySelectorAll('[role="button"]')).find(el => el.textContent.trim() === ${JSON.stringify(label)})`;
  const pressText = async label => { const expression = textButton(label); await until(expression); await evaluate(`${expression}.click()`); };
  const point = async name => evaluate(`{const el=document.querySelector('[data-testid="${name}"]');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();({x:r.x+r.width/2,y:r.y+r.height/2})}`);
  const hold = async (milliseconds) => { const p = await point('safety-hold-help'); await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await delay(milliseconds); await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); };

  await open('/events/' + id(1) + '/group?failure=safety'); await until(`document.querySelector('[data-testid="safety-retry"]')`);
  await evaluate('window.__qa.failSafety=false'); await click('safety-retry'); await until(`document.querySelector('[data-testid="safety-create"]')`);
  assert.equal(await evaluate(`document.querySelector('[data-testid="safety-create"]').getAttribute('aria-disabled')`), 'true');
  await click('safety-friend-' + id(3)); await click('safety-create'); await until(`document.querySelector('[data-testid="safety-hold-help"]')`);
  assert.equal(await evaluate(`window.__qa.writes.filter(v=>v.route.endsWith('/safety-group')).length`), 1);
  await hold(350); await delay(1550); assert.equal(await evaluate(`window.__qa.writes.filter(v=>v.route.endsWith('/help')).length`), 0, 'Releasing a short hold must cancel help');
  await hold(1600); await until(`document.querySelector('[data-testid="safety-resolve-help"]')`);
  assert.equal(await evaluate(`window.__qa.writes.filter(v=>v.route.endsWith('/help')).length`), 1);
  await click('safety-resolve-help'); await until(`document.querySelector('[data-testid="safety-hold-help"]')`);
  await evaluate(`document.querySelector('[data-testid="safety-hold-help"]').focus()`);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await delay(300);
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await delay(1500);
  assert.equal(await evaluate(`window.__qa.writes.filter(v=>v.route.endsWith('/help')).length`), 1, 'A short keyboard press must not dispatch help');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 }); await delay(1550);
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await until(`document.querySelector('[data-testid="safety-resolve-help"]')`);
  assert.equal(await evaluate(`window.__qa.writes.filter(v=>v.route.endsWith('/help')).length`), 2, 'A held Space key dispatches exactly one help request');
  await click('safety-resolve-help'); await until(`document.querySelector('[data-testid="safety-hold-help"]')`);
  await input('safety-message-input', 'First message'); await evaluate('window.__qa.messageDelay=750'); await click('safety-send'); await input('safety-message-input', 'New draft');
  await until(`document.querySelector('[data-testid="safety-messages"]').textContent.includes('First message')`);
  assert.equal(await evaluate(`document.querySelector('[data-testid="safety-message-input"]').value`), 'New draft');
  if (await evaluate(`!!document.querySelector('[data-testid="safety-feedback"]')`)) await click('safety-feedback');
  await click('safety-invite-open'); await click('safety-friend-' + id(4)); await click('safety-invite-send'); await until(`!document.querySelector('[data-testid="safety-invite-panel"]')`);
  await capture('safety-group-operations');
  assert.deepEqual(await evaluate('window.__qa.unexpected'), []);
  console.log('PASS safety error/retry, creation, cancelled/full help hold, resolve, message race and invitation');

  await open('/events/' + id(1) + '/group?group=pending'); await until(`document.querySelector('[data-testid="safety-accept"]')`); await click('safety-accept'); await until(`document.querySelector('[data-testid="safety-message-input"]')`);
  await open('/events/' + id(1) + '/group?group=pending'); await until(`document.querySelector('[data-testid="safety-decline"]')`); await click('safety-decline'); await until(`document.querySelector('[data-testid="safety-create"]')`);
  console.log('PASS safety accept/decline return to the correct state');

  await open('/admin?role=user'); await until(`document.body.innerText.includes('Administrator access required')`); await delay(300);
  assert.equal(await evaluate(`window.__qa.requests.filter(v=>v.route.startsWith('/admin/')).length`), 0);
  await open('/admin?role=admin'); await until(textButton('Approve'));
  await pressText('Approve'); await until(textButton('Confirm')); await evaluate(`${textButton('Confirm')}.click();${textButton('Confirm')}.click()`);
  await until(`window.__qa.organizer.verificationStatus==='approved' && !${textButton('Confirm')}`);
  assert.equal(await evaluate(`window.__qa.writes.filter(v=>v.route.endsWith('/verification')).length`), 1);
  await capture('admin-operations');
  assert.deepEqual(await evaluate('window.__qa.unexpected'), []);
  console.log('PASS admin role gate and confirmation duplicate-tap protection');

  await open('/dashboard/events?role=organizer'); await until(`document.querySelector('[data-testid="organizer-dashboard"]') && document.body.innerText.includes('QA Night')`);
  await capture('organizer-dashboard-operations');
  assert.deepEqual(await evaluate('window.__qa.unexpected'), []);
  console.log('PASS organizer dashboard route, account and event loading');

  await open('/ticket-validation'); await until(`document.querySelector('[data-testid="scanner-event-selector"]') && document.body.innerText.includes('QA Night')`);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="scanner-tabs"]')`), false, 'Scan-only staff must not see an empty Management tab');
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="scanner-panel"]')`), true, 'Scan-only staff land directly on the scanner');
  assert.equal(await evaluate(`window.__qa.requests.filter(v=>v.route.endsWith('/staff') || v.route.endsWith('/quick-access')).length`), 0, 'Scan-only staff must not load management data');
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="scanner-code-input"]')`), false, 'Manual entry is initially collapsed');
  await click('scanner-event-selector'); await until(`document.querySelector('[data-testid="scanner-event-menu"]')`);
  const menu = await evaluate(`{const r=document.querySelector('[data-testid="scanner-event-menu"]').getBoundingClientRect();({x:r.x,y:r.y,right:r.right,bottom:r.bottom})}`);
  assert.ok(menu.x >= 8 && menu.right <= 382 && menu.y >= 8 && menu.bottom <= 836, 'Scanner menu stays within the mobile viewport');
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 4, y: 4, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 4, y: 4, button: 'left', clickCount: 1 });
  await until(`!document.querySelector('[data-testid="scanner-event-menu"]')`);
  await click('scanner-event-selector'); await until(`document.querySelector('[data-testid="scanner-event-menu"]')`);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await until(`!document.querySelector('[data-testid="scanner-event-menu"]')`);
  await click('scanner-event-selector'); await until(`document.querySelector('[data-testid="scanner-event-menu"]')`);
  await evaluate(`document.querySelector('[data-testid="scanner-event-menu"] [role="button"]').click()`); await until(`!document.querySelector('[data-testid="scanner-event-menu"]')`);
  await click('scanner-manual-toggle'); await until(`document.querySelector('textarea')`);
  await evaluate(`{const el=document.querySelector('textarea');el.setAttribute('data-testid','qa-scan-input');}`);
  await input('qa-scan-input', 'a'.repeat(64)); await pressText('Validate ticket'); await until(`window.__qa.scanCount===1`);
  await until(`document.querySelector('[data-testid="scanner-panel"]').textContent.includes('Valid ticket')`);
  assert.equal(await evaluate(`!!${textButton('Scan next ticket')}`), false);
  await until(`document.querySelector('[data-testid="scanner-validate"]').getAttribute('aria-disabled') !== 'true'`);
  await input('qa-scan-input', 'a'.repeat(64)); await pressText('Validate ticket'); await until(`window.__qa.scanCount===2`);
  await until(`document.querySelector('[data-testid="scanner-panel"]').textContent.includes('Ticket already used')`);
  await capture('scanner-operations');
  assert.deepEqual(await evaluate('window.__qa.unexpected'), []);
  console.log('PASS staff scanner loads without organizer role and submits ticket validation');
  for (const width of [390, 1024]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 768 }); await delay(150);
    await click('scanner-open-history'); await until(`document.querySelector('[data-testid="scanner-history-drawer"]')`); await delay(650);
    const panel = await evaluate(`{const r=document.querySelector('[data-testid="scanner-history-drawer"]').getBoundingClientRect();({x:r.x,width:r.width,height:r.height})}`);
    assert.ok(Math.abs(panel.width - Math.min(448, width)) < 1, 'Scan history preserves the original right panel width');
    assert.ok(Math.abs(panel.height - 844) < 1, 'Scan history fills the viewport height');
    assert.ok(Math.abs(panel.x + panel.width - width) < 1, 'Scan history is anchored to the right viewport edge');
    await capture('scanner-history-parity-' + width);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await until(`!document.querySelector('[data-testid="scanner-history-drawer"]')`);
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  console.log('PASS original scanner selector, collapsed manual entry and responsive history drawer');
  await open('/ticket-validation?role=organizer'); await until(`Array.from(document.querySelectorAll('[role="tab"]')).some(el=>el.textContent==='Management')`);
  await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(el=>el.textContent==='Management').click()`);
  await until(`document.querySelector('[role="button"][aria-label="Active from"]')`);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="scanner-management"]')`), true);
  await evaluate(`document.querySelector('[role="button"][aria-label="Active from"]').click()`); await until(`document.querySelector('[data-testid="editor-date-popover"]')`);
  await click('editor-date-done'); await until(`!document.querySelector('[data-testid="editor-date-popover"]')`);
  assert.equal(await evaluate(`document.body.innerText.includes('YYYY-MM-DDTHH:mm')`), false);
  console.log('PASS scanner management uses the shared calendar popover for access intervals');
  await until(`document.querySelector('[data-testid="scanner-staff-list"]').textContent.includes('Gate staff') && document.querySelector('[data-testid="scanner-access-list"]').textContent.includes('Revoked gate')`);
  await pressText('Create link'); await until(textButton('Copy'));
  assert.equal(await evaluate(`window.__qa.writes.filter(v=>v.route.endsWith('/quick-access')).length`), 1);
  await pressText('Copy'); await until(`document.body.innerText.includes('The link could not be copied automatically.')`);
  assert.equal(await evaluate(`document.body.innerText.includes('The quick-access link was copied.')`), false, 'Failed clipboard writes must not claim success');
  assert.deepEqual(await evaluate('window.__qa.copied'), []);
  await evaluate('window.__qa.clipboardFails=false'); await pressText('Copy');
  await until(`document.body.innerText.includes('The quick-access link was copied.')`);
  assert.equal(await evaluate(`document.body.innerText.includes('The link could not be copied automatically.')`), false, 'Retry clears the stale clipboard error');
  assert.deepEqual(await evaluate('window.__qa.copied'), ['https://spottr.ro/scan?token=' + 'q'.repeat(64)]);
  await capture('scanner-management-operations');
  assert.deepEqual(await evaluate('window.__qa.unexpected'), []);
  console.log('PASS scanner staff/access rows, link creation and clipboard denied/fallback/retry feedback');
  await open('/ticket-validation?role=organizer&mixedAccess=true');
  await click('scanner-tab-management'); await until(`document.querySelector('[data-testid="scanner-management"]')`);
  await click('scanner-event-selector'); await until(`document.querySelector('[data-testid="scanner-event-menu"]')`);
  await evaluate(`Array.from(document.querySelectorAll('[data-testid="scanner-event-menu"] [role="button"]')).find(el=>el.textContent.includes('Assigned gate')).click()`);
  await until(`document.querySelector('[data-testid="scanner-panel"]')?.textContent.includes('Assigned gate')`);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="scanner-tabs"]')`), false, 'Organizer role does not imply management access to an assigned event');
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="scanner-management"]')`), false);
  assert.equal(await evaluate(`window.__qa.requests.filter(v=>v.route.includes('${id(9)}') && (v.route.endsWith('/staff') || v.route.endsWith('/quick-access'))).length`), 0);
  await click('scanner-event-selector'); await until(`document.querySelector('[data-testid="scanner-event-menu"]')`);
  await evaluate(`Array.from(document.querySelectorAll('[data-testid="scanner-event-menu"] [role="button"]')).find(el=>el.textContent.includes('QA Night')).click()`);
  await until(`document.querySelector('[data-testid="scanner-tab-scan"]') && document.querySelector('[data-testid="scanner-panel"]')?.textContent.includes('QA Night')`);
  await click('scanner-tab-management'); await until(`document.querySelector('[data-testid="scanner-management"]')`);
  await evaluate(`window.__qa.validationEvents[0].canManage=false`);
  await until(`!document.querySelector('[data-testid="scanner-tabs"]') && document.querySelector('[data-testid="scanner-panel"]')`, 20000);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="scanner-management"]')`), false, 'Losing management permission during refetch returns to scanning');
  assert.deepEqual(await evaluate('window.__qa.unexpected'), []);
  console.log('PASS scanner management follows event permissions, including mixed access and permission changes');
  await open('/ticket-validation?ended=true');
  await until(`window.__qa.writes.some(v=>v.route.endsWith('/offline-sync'))`);
  await until(`JSON.parse(localStorage.getItem('spottr-native:scanner:v1:${id(2)}:${id(1)}')).scans[0].status==='synced'`);
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('spottr-native:scanner:v1:${id(2)}:${id(1)}')).revoked`), false);
  console.log('PASS ended event missing from live API still synchronizes its offline admissions');
  await open('/scan?token=' + 'a'.repeat(64)); await until(`document.querySelector('[data-testid="scanner-manual-toggle"]') && document.body.innerText.includes('QUICK A')`); await click('scanner-manual-toggle'); await until(`document.querySelector('textarea')`);
  await evaluate(`document.querySelector('textarea').setAttribute('data-testid','qa-quick-input')`);
  await input('qa-quick-input', 'a'.repeat(64)); await pressText('Validate ticket'); await until(`window.__qa.writes.some(v=>v.route.endsWith('/quick-access/validate'))`);
  await evaluate(`history.pushState({}, '', '/scan?token=${'b'.repeat(64)}');window.dispatchEvent(new PopStateEvent('popstate', {state:{}}))`);
  await until(`document.body.innerText.includes('QUICK B')`);
  if (!await evaluate(`!!document.querySelector('textarea')`)) await click('scanner-manual-toggle');
  await until(`document.querySelector('textarea') && !document.querySelector('textarea').disabled && !document.querySelector('textarea').readOnly`);
  await delay(2700);
  assert.equal(await evaluate(`document.body.innerText.includes('Scan next ticket')`), false, 'Previous quick link response cannot consume the new session UI');
  console.log('PASS switching quick links while validating releases old busy state and discards the old result');
  await open('/register?role=organizer'); await until(`document.querySelector('[data-testid="organizer-dashboard"]')`);
  await open('/register?role=admin'); await until(textButton('Approve'));
  await open('/register?role=user'); await until(`document.querySelector('[data-testid="tab-Profile"][aria-selected="true"]') && document.body.innerText.includes('Operations QA')`);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="auth-screen"]')`), false);
  console.log('PASS authenticated registration returns organizers, admins and users to their correct destination');
  assert.deepEqual(errors, [], 'No unhandled browser exceptions');
}).catch(error => { console.error(error); process.exitCode = 1; });
