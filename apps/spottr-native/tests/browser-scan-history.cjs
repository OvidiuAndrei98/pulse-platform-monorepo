const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');

withBrowser(async ({ base, call, evaluate, until, click, input, delay, capture, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function mock() {
    const original = window.fetch.bind(window), id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    if (!location.search.includes('resume')) localStorage.clear();
    const qa = window.__qa = { offline: false, forbidden: false, slowMine: false, pages: [], unexpected: [] };
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !qa.offline });
    const user = { id: id(2), username: 'Franco', email: 'qa@example.test', role: 'user', hasPassword: true, preferredLanguage: 'en', createdAt: '2026-01-01T00:00:00Z' };
    const event = { id: id(1), organizerId: id(3), title: 'Lost Night', description: 'Isolated history QA', category: 'TECHNO', city: 'Bucuresti', locationName: 'Bucharest', startTime: '2020-01-01T20:00:00Z', endTime: '2035-10-11T04:00:00Z', status: 'published', latitude: 44.43, longitude: 26.1, ticketTypes: [], lineup: [], canManage: false };
    const scans = Array.from({ length: 35 }, (_, n) => ({ ticketId: id(100 + n), ticketType: n % 2 ? 'General access' : 'VIP access', validatedAt: new Date(Date.UTC(2026,9,14,1,30-n)).toISOString(), scannedBy: n % 3 === 0 ? { kind: 'user', userId: user.id, name: 'Franco' } : n % 3 === 1 ? { kind: 'user', userId: id(4), name: 'Mara' } : { kind: 'access', scannerAccessId: id(5), name: 'North entrance' } }));
    window.fetch = async (url, options = {}) => {
      const parsed = new URL(String(url), location.origin);
      if (!parsed.pathname.includes('/api/v1/')) { if (parsed.origin === location.origin) return original(url, options); throw Error('External fetch'); }
      if (qa.offline) throw new TypeError('Network request failed');
      const route = parsed.pathname.split('/api/v1')[1], reply = (body, status=200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      if (route === '/auth/login') return reply({token:'history-qa-only'});
      if (route === '/users/me') return reply(user);
      if (route === '/events' || route === '/dashboard/ticket-validation/events') return reply([event]);
      if (route.endsWith('/offline-sync')) return reply({results:[]});
      if (route.endsWith('/my-scans')) return reply({totalScans:12,scans:[]});
      if (route.endsWith('/scans')) {
        const scope=parsed.searchParams.get('scope'), cursor=parsed.searchParams.get('cursor'); qa.pages.push({scope,cursor});
        if (qa.forbidden) return reply({error:'Forbidden'},403);
        if (scope==='mine' && qa.slowMine) await new Promise(resolve => setTimeout(resolve,700));
        const rows=scope==='mine'?scans.filter(scan=>scan.scannedBy.userId===user.id):scans;
        return reply({ totalScans:rows.length, scans:cursor?rows.slice(30):rows.slice(0,30), nextCursor:!cursor && rows.length>30?'older_page':undefined });
      }
      if (route === '/notifications') return reply({items:[],unreadCount:0});
      if (route.endsWith('/social')) return reply({goingCount:0,interestedCount:0});
      if (/^\/(users\/me\/(saved-events|tickets|orders|hidden-categories)|promotions\/active|friends|feed|profiles\/search)$/.test(route) || route.endsWith('/updates') || route.endsWith('/attendees')) return reply([]);
      qa.unexpected.push(route); return reply({},404);
    };
  }.toString()})();` });
  await call('Page.navigate',{url:base+'/'});
  await click('tab-Profile'); await click('auth-email-choice');
  await input('auth-email','qa@example.test'); await input('auth-password','qa-password'); await click('auth-submit');
  await until(`document.body.innerText.includes('Franco')`);
  await call('Page.navigate',{url:base+'/ticket-validation?resume=1'});
  await until(`document.querySelector('[data-testid="scanner-open-history"]')`);
  await click('scanner-open-history');
  await until(`document.querySelector('[data-testid="scanner-history-total"]')?.textContent==='35'`);
  assert.ok(await evaluate(`location.pathname.endsWith('/history')`));
  assert.ok(await evaluate(`document.querySelector('[data-testid="scanner-history-screen"]').textContent.includes('Lost Night')`));
  assert.ok(await evaluate(`document.querySelector('[data-testid="scanner-history-list"]').textContent.includes('Scanned by Mara')`));
  assert.ok(await evaluate(`document.querySelector('[data-testid="scanner-history-list"]').textContent.includes('North entrance')`));
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="scanner-history-drawer"]')`),false);
  await capture('scanner-history-all');
  await click('scanner-history-tab-mine');
  await until(`document.querySelector('[data-testid="scanner-history-total"]')?.textContent==='12'`);
  assert.equal(await evaluate(`document.querySelector('[data-testid="scanner-history-list"]').textContent.includes('Mara')`),false);
  assert.ok(await evaluate(`document.querySelector('[data-testid="scanner-history-list"]').textContent.includes('Scanned by Franco')`));
  await capture('scanner-history-mine');
  await evaluate('window.__qa.slowMine=true');
  await click('scanner-history-tab-all'); await click('scanner-history-tab-mine'); await click('scanner-history-tab-all');
  await delay(900);
  assert.equal(await evaluate(`document.querySelector('[data-testid="scanner-history-total"]').textContent`),'35');
  await evaluate(`{const el=document.querySelector('[data-testid="scanner-history-list"]');el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll'));}`);
  await until(`window.__qa.pages.some(page=>page.cursor==='older_page' && page.scope==='all')`);
  await until(`document.querySelector('[data-testid="scan-history-row-00000000-0000-4000-8000-000000000134"]')`);
  await evaluate(`window.__qa.offline=true;window.dispatchEvent(new Event('offline'))`);
  await until(`document.querySelector('[data-testid="scanner-history-offline"]')?.textContent.includes('last loaded scans')`);
  assert.equal(await evaluate(`document.querySelector('[data-testid="scanner-history-total"]').textContent`),'35');
  await click('scanner-history-back');
  await until(`document.querySelector('[data-testid="scanner-event-selector"]')?.textContent.includes('Lost Night')`);
  await until(`!location.pathname.endsWith('/history')`);
  console.log('PASS all/personal scans, names, delayed tab response, infinite loading, cached offline state, back to the selected event');
  await evaluate(`window.__qa.offline=false;window.dispatchEvent(new Event('online'))`);
  await click('scanner-open-history'); await until(`document.querySelector('[data-testid="scanner-history-total"]')?.textContent==='35'`);
  await evaluate('window.__qa.forbidden=true');
  await evaluate(`document.querySelector('[aria-label="Refresh history"]').click()`);
  await until(`!document.querySelector('[data-testid="scanner-history-list"]').textContent.includes('Scanned by') && document.querySelector('[data-testid="scanner-history-total"]').textContent==='–'`);
  await click('scanner-history-back');
  await evaluate('window.__qa.forbidden=false');
  await click('scanner-open-history'); await until(`document.querySelector('[data-testid="scanner-history-total"]')?.textContent==='35'`);
  // Browser Back must pop the same route, not take the user out of the scanner.
  await evaluate('window.history.back()'); await until(`!location.pathname.endsWith('/history')`);
  await until(`document.querySelector('[data-testid="scanner-event-selector"]')?.textContent.includes('Lost Night')`);
  assert.deepEqual(await evaluate('window.__qa.unexpected'),[]);
  assert.deepEqual(errors,[]);
  console.log('PASS revoked access hides cached scans and browser Back returns to Scanner');
}).catch(error=>{console.error(error);process.exitCode=1;});
