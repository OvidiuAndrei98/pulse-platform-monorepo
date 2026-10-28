// Runs the real UI against local fixtures. Never changes a real account or sends email.
const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');

withBrowser(async ({ base, call, evaluate, until, click, input, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = fetch.bind(window);
    const user = { id: '00000000-0000-4000-8000-000000000100', username: 'Franco', email: 'qa@example.test', role: 'user', preferredLanguage: 'en', hasPassword: true, showAttendancePublicly: false, createdAt: '2026-01-01T00:00:00Z' };
    localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'settings-qa-only', user }));
    const qa = window.__qa = { user, writes: [], unexpected: [], failUpdate: false, failPassword: false };
    window.fetch = async (input, options = {}) => {
      const url = new URL(String(input), location.origin), route = url.pathname.split('/api/v1')[1];
      if (!route) { if (url.origin === location.origin) return original(input, options); throw Error('Unexpected external request'); }
      const method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : undefined;
      const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
      if (route === '/wardrobe/mine') return reply({ deposits: [], staffAccess: false });
      if (route === '/diagnostics/errors') return new Response(null, { status: 204 });
      if (method !== 'GET') qa.writes.push({ route, method, body });
      if (route === '/users/me') {
        if (method === 'PUT') {
          await new Promise(resolve => setTimeout(resolve, 180));
          if (qa.failUpdate) return reply({}, 503);
          Object.assign(user, body);
        }
        return reply(user);
      }
      if (route === '/auth/forgot-password') return reply({ success: !qa.failPassword }, qa.failPassword ? 503 : 200);
      if (route === '/notifications') return reply({ items: [], unreadCount: 0 });
      if (['/events', '/promotions/active', '/users/me/saved-events', '/users/me/tickets', '/users/me/orders', '/users/me/hidden-categories', '/dashboard/ticket-validation/events', '/friends', '/feed'].includes(route)) return reply([]);
      qa.unexpected.push(route); return reply({}, 404);
    };
  }.toString()})();` });
  const el = id => `document.querySelector('[data-testid="${id}"]')`;
  const height = id => `${el(id)}.getBoundingClientRect().height`;
  const animate = async (toggle, content, following) => {
    await evaluate(`${el(toggle)}.scrollIntoView({block:'start'})`);
    return evaluate(`new Promise(resolve=>{
      const content=${el(content)}, following=${el(following)}, samples=[], start=performance.now();
      const tick=()=>{samples.push({height:content.getBoundingClientRect().height,following:following.getBoundingClientRect().top,opacity:Number(getComputedStyle(content).opacity)});if(performance.now()-start<450)requestAnimationFrame(tick);else resolve(samples);};
      tick();${el(toggle)}.click();
    })`);
  };
  await call('Page.navigate', { url: base + '/users/me' });
  await until(`${el('profile-details-toggle')} && document.body.innerText.includes('Franco')`);
  await evaluate(`${el('profile-account-settings')}.scrollIntoView({block:'start'})`);
  await capture('profile-settings-closed');
  assert.equal(await evaluate(`!!document.querySelector('input[aria-label="Display name"]')`), false);
  const opening = await animate('profile-details-toggle', 'profile-details-content', 'profile-password-toggle');
  const finalHeight = opening.at(-1).height;
  assert.ok(finalHeight > 200);
  assert.ok(opening.some(frame => frame.height > 5 && frame.height < finalHeight - 5), 'Form expands across animation frames');
  assert.ok(new Set(opening.map(frame => Math.round(frame.following))).size > 3, 'Following rows move continuously');
  assert.ok(opening.some(frame => frame.opacity > 0 && frame.opacity < 1), 'Content fades in during expansion');
  assert.equal(await evaluate(`${el('profile-details-toggle')}.getAttribute('aria-expanded')`), 'true');
  await capture('profile-settings-details-open');
  const bounds = await evaluate(`{const r=${el('profile-details-toggle')}.getBoundingClientRect();({x:r.x,y:r.y,width:r.width,height:r.height})}`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, button: 'left', clickCount: 1 });
  await delay(120);
  assert.ok(await evaluate(`Math.abs(${el('profile-details-toggle')}.getBoundingClientRect().width - ${bounds.width}) < 0.5`), 'Pressing a settings row must not shrink its colored background away from the panel edges');
  await capture('profile-settings-details-pressed');
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, button: 'left', clickCount: 1 });
  await until(`${height('profile-details-content')}<1`);
  await click('profile-details-toggle'); await until(`${height('profile-details-content')}>200`); await delay(350);
  await evaluate(`document.querySelector('input[aria-label="Display name"]').setAttribute('data-testid','qa-name')`);
  await input('qa-name', 'Franco updated');
  await click('profile-details-toggle'); await delay(70); await click('profile-details-toggle');
  await until(`${height('profile-details-content')}>200`); await delay(400);
  assert.equal(await evaluate(`document.querySelector('input[aria-label="Display name"]').value`), 'Franco updated', 'Quick close/reopen retains the draft and content');
  await evaluate('window.__qa.failUpdate=true'); await evaluate(`${el('profile-details-save')}.click()`);
  await until(`${el('profile-details-feedback')}?.textContent.includes('Your details could not be updated.')`);
  assert.equal(await evaluate(`${el('profile-details-content')}.contains(${el('profile-details-feedback')})`), true, 'Save errors stay next to the form');
  assert.equal(await evaluate(`document.querySelector('input[aria-label="Display name"]').value`), 'Franco updated');
  await evaluate('window.__qa.failUpdate=false'); await evaluate(`${el('profile-details-save')}.click()`);
  await until(`window.__qa.user.username==='Franco updated' && ${el('profile-details-save')}.getAttribute('aria-disabled')!=='true'`);
  assert.equal(await evaluate(`!!${el('profile-details-feedback')}`), false, 'Saving details clears errors without adding an updated notice');
  await input('qa-name', 'Franco draft');
  assert.equal(await evaluate(`!!${el('profile-details-feedback')}`), false, 'Editing does not add a saved confirmation');
  const writesBeforeInvalid = await evaluate('window.__qa.writes.length');
  await input('qa-name', 'A'); await click('profile-details-save');
  await until(`${el('profile-details-feedback')}?.textContent.includes('at least 3 characters')`);
  assert.equal(await evaluate('window.__qa.writes.length'), writesBeforeInvalid, 'Invalid names never reach the API');
  assert.ok(await evaluate(`${el('profile-details-feedback')}.compareDocumentPosition(document.querySelector('textarea')) & Node.DOCUMENT_POSITION_FOLLOWING`), 'Name validation appears below the name, before the bio');
  await input('qa-name', 'Franco updated');
  await delay(350);
  const closing = await animate('profile-details-toggle', 'profile-details-content', 'profile-password-toggle');
  assert.ok(closing.some(frame => frame.height > 5 && frame.height < finalHeight - 5), 'Closing also animates the layout');
  await until(`${height('profile-details-content')}<1 && !document.querySelector('input[aria-label="Display name"]')`);
  assert.equal(await evaluate(`${el('profile-details-toggle')}.getAttribute('aria-expanded')`), 'false');

  await click('profile-details-toggle'); await delay(60); await click('profile-password-toggle');
  await until(`${height('profile-details-content')}<1 && ${height('profile-password-content')}>60`);
  await evaluate('window.__qa.failPassword=true'); await evaluate(`${el('profile-password-send')}.click()`);
  await until(`${el('profile-password-feedback')}?.textContent.includes('The link could not be sent.')`);
  assert.equal(await evaluate(`${el('profile-password-content')}.contains(${el('profile-password-feedback')})`), true);
  await evaluate('window.__qa.failPassword=false'); await evaluate(`${el('profile-password-send')}.click()`);
  await until(`${el('profile-password-feedback')}?.textContent.includes('Reset link sent. Check your email.')`);
  assert.equal(await evaluate(`window.__qa.writes.filter(v=>v.route==='/auth/forgot-password').length`), 2);
  await click('profile-help-toggle');
  await until(`${height('profile-password-content')}<1 && ${height('profile-help-content')}>30`);
  assert.ok(await evaluate(`${el('profile-help-content')}.textContent.includes('official support channel')`));
  await capture('profile-settings-help-open');
  await click('profile-help-toggle'); await until(`${height('profile-help-content')}<1`);

  const languageWrites = `window.__qa.writes.filter(v=>v.body?.preferredLanguage).length`;
  await click('profile-language-toggle'); await until(`${height('profile-language-content')}>90`); await delay(350);
  assert.equal(await evaluate(languageWrites), 0, 'Opening language does not change it');
  assert.equal(await evaluate(`${el('profile-language-en')}.getAttribute('aria-checked')`), 'true');
  assert.equal(await evaluate(`${el('profile-language-ro')}.textContent`), 'Română');
  await capture('profile-settings-language');
  await click('profile-language-en'); await until(`${height('profile-language-content')}<1`);
  assert.equal(await evaluate(languageWrites), 0, 'Selecting the active language makes no request');
  await click('profile-language-toggle'); await until(`${height('profile-language-content')}>90`); await delay(350);
  await evaluate(`window.__qa.failUpdate=true;${el('profile-language-ro')}.click();${el('profile-language-ro')}.click()`);
  await until(`${el('profile-language-feedback')}?.textContent.includes("The language couldn't be changed.")`);
  assert.equal(await evaluate(languageWrites), 1, 'Rapid selections cannot save twice');
  assert.equal(await evaluate(`${el('profile-language-en')}.getAttribute('aria-checked')`), 'true', 'Failed save leaves the old language selected');
  assert.equal(await evaluate(`${el('profile-language-toggle')}.getAttribute('aria-expanded')`), 'true', 'Failed selection remains available for retry');
  await capture('profile-settings-language-error');
  await evaluate(`window.__qa.failUpdate=false;${el('profile-language-ro')}.click()`);
  await until(`window.__qa.user.preferredLanguage==='ro' && ${height('profile-language-content')}<1`);
  assert.equal(await evaluate(`!!${el('profile-language-feedback')}`), false, 'Successful language retry clears the error without adding a notice');
  assert.equal(await evaluate(`window.__qa.user.preferredLanguage`), 'ro');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('spottr-native.session.v1')).user.preferredLanguage`), 'ro', 'Language is persisted with the session');
  await click('profile-language-toggle'); await until(`${height('profile-language-content')}>90`); await delay(350);
  assert.equal(await evaluate(`${el('profile-language-ro')}.getAttribute('aria-checked')`), 'true');
  await click('profile-language-en');
  await until(`window.__qa.user.preferredLanguage==='en' && ${height('profile-language-content')}<1`);
  assert.equal(await evaluate(languageWrites), 3);
  await evaluate('window.__qa.failUpdate=true'); await click('profile-privacy-switch');
  await until(`${el('profile-privacy-feedback')}?.textContent.includes('This privacy setting could not be updated.')`);
  assert.equal(await evaluate('window.__qa.user.showAttendancePublicly'), false);
  assert.equal(await evaluate(`${el('profile-privacy-switch')}.querySelector('input').checked`), false, 'Failed privacy save restores the switch');
  assert.equal(await evaluate(`!!${el('profile-language-feedback')}`), false, 'Privacy errors do not add a language notice');
  await evaluate('window.__qa.failUpdate=false'); await click('profile-privacy-switch');
  await until(`window.__qa.user.showAttendancePublicly && ${el('profile-privacy-switch')}.getAttribute('aria-disabled')!=='true'`);
  assert.equal(await evaluate(`!!${el('profile-privacy-feedback')}`), false, 'Saving privacy clears errors without adding a notice');
  assert.equal(await evaluate(`${el('profile-privacy-switch')}.querySelector('input').checked`), true);
  console.log('PASS feedback stays with each action, validation prevents writes, language selection/save/failure/retry/persistence, privacy rollback and rapid taps');
  assert.equal(await evaluate(`${el('profile-account-settings')}.contains(${el('profile-delete-account')})`), true);
  await click('profile-delete-account'); await until(`document.querySelector('input[type="password"]')`);
  await delay(650); // Wait for the existing sheet entrance before tapping its moving handle.
  assert.equal(await evaluate(`window.__qa.writes.filter(v=>v.method==='DELETE').length`), 0, 'Opening the delete action never deletes the account');
  await click('sheet-handle'); await until(`!document.querySelector('input[type="password"]')`);
  console.log('PASS animated open/close, rapid taps, section switching, draft preservation, failed save/retry and password reset');

  await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true });
  await click('profile-details-toggle'); await until(`${height('profile-details-content')}>200`); await delay(350);
  await evaluate(`${el('profile-account-settings')}.scrollIntoView({block:'start'})`);
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`));
  await capture('profile-settings-small');
  await click('profile-details-toggle'); await until(`${height('profile-details-content')}<1`);
  await click('profile-language-toggle'); await until(`${height('profile-language-content')}>90`); await delay(350);
  await evaluate(`${el('profile-language-toggle')}.scrollIntoView({block:'start'})`);
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`));
  await capture('profile-settings-language-small');
  await click('profile-language-toggle'); await until(`${height('profile-language-content')}<1`);
  await call('Emulation.setDeviceMetricsOverride', { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false });
  await evaluate(`${el('profile-account-settings')}.scrollIntoView({block:'start'})`);
  await capture('profile-settings-desktop');
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await call('Page.navigate', { url: base + '/users/me?reduced=1' }); await until(el('profile-details-toggle'));
  await click('profile-details-toggle'); await until(`${height('profile-details-content')}>200`);
  await click('profile-details-toggle'); await until(`${height('profile-details-content')}<1 && !document.querySelector('input[aria-label="Display name"]')`);
  assert.deepEqual(await evaluate('window.__qa.unexpected'), []);
  assert.deepEqual(errors, [], 'No browser errors');
  console.log('PASS narrow/desktop layouts, collapsed inputs unmounted, and reduced-motion open/close');
}).catch(error => { console.error(error); process.exitCode = 1; });
