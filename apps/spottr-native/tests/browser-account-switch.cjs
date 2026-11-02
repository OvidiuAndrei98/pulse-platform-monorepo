const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');

withBrowser(async ({ base, call, evaluate, until, click, input, delay, errors }) => {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(${function () {
    const original = fetch.bind(window);
    const account = role => ({ id: role === 'admin' ? '00000000-0000-4000-8000-000000000001' : '00000000-0000-4000-8000-000000000002',
      role, username: role === 'admin' ? 'Admin fixture' : 'Basic fixture', email: role + '@example.test', preferredLanguage: 'en', hasPassword: true, createdAt: '2026-01-01T00:00:00Z' });
    const qa = window.__switchQA = { role: 'admin', requests: [], warnings: [] };
    const warn = console.warn;
    console.warn = (...args) => { qa.warnings.push(args.map(String).join(' ')); warn(...args); };
    localStorage.setItem('spottr-native.session.v1', JSON.stringify({ token: 'admin-fixture-only', user: account('admin') }));
    window.fetch = async (url, options = {}) => {
      const parsed = new URL(String(url), location.href);
      if (!parsed.pathname.includes('/api/v1/')) {
        if (parsed.origin === location.origin) return original(url, options);
        throw Error('External request blocked in account-switch test');
      }
      const path = parsed.pathname.split('/api/v1')[1];
      qa.requests.push({ path, role: qa.role });
      const reply = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
      if (path === '/auth/login') { qa.role = JSON.parse(options.body).email.startsWith('admin') ? 'admin' : 'user'; return reply({token:qa.role+'-fixture-only'}); }
      if (path === '/users/me') return reply(account(qa.role));
      if (path === '/notifications') return reply({items:[],unreadCount:0});
      if (path === '/wardrobe/mine') return reply({deposits:[],staffAccess:false});
      if (path === '/users/me/billing-details') return reply({details:null});
      if (path === '/diagnostics/errors') return new Response(null,{status:204});
      if (path === '/events') return reply([{ id:'00000000-0000-4000-8000-000000000099', title:'Discover '+qa.role+' fixture', category:'HOUSE', city:'Bucuresti',
        locationName:'QA Club', startTime:'2030-11-01T20:00:00Z', endTime:'2030-11-02T04:00:00Z', ticketTypes:[], lineup:[] }]);
      return reply([]);
    };
  }.toString()})();` });
  // A preloaded workspace can also contain a navbar. Press only the actual
  // hit-tested button, never a hidden duplicate selected by querySelector.
  const pressTab = async name => {
    const point = `(()=>{for(const el of [...document.querySelectorAll('[data-testid="tab-${name}"]')].reverse()){const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(r.width&&r.height&&el.contains(document.elementFromPoint(x,y)))return {x,y};}})()`;
    await until(point);
    const coords = await evaluate(point);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...coords,button:'left',clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',...coords,button:'left',clickCount:1});
  };
  await call('Page.navigate', { url: base + '/' });
  // Keep Discover mounted through the cache clear. Its passive list observer
  // must rejoin the fresh query instead of retaining an orphaned loading state.
  await pressTab('Explore');
  await until(`[...document.querySelectorAll('[data-testid="events-list"]')].some(el=>el.innerText.includes('Discover admin fixture'))`);
  await pressTab('Profile');
  await until(`location.pathname==='/admin' && document.querySelector('[data-testid="admin-organizer-account"]')`);
  await evaluate(`{const button=[...document.querySelectorAll('[data-testid="admin-profile"] [role="button"]')].find(el=>el.textContent==='Back to profile');if(!button)throw Error('Missing profile shortcut');button.click();}`);
  await until(`location.pathname==='/users/me' && document.querySelector('[data-testid="profile-logout"]')`);
  await click('profile-logout');
  await until(`location.pathname==='/'`);
  await pressTab('Profile');
  await until(`document.querySelector('[data-testid="auth-email-choice"]')`);
  await click('auth-email-choice');
  await input('auth-email','basic@example.test'); await input('auth-password','fixture-password'); await click('auth-submit');
  await until(`location.pathname==='/users/me' && document.querySelector('[data-testid="profile-list"]')`);
  assert.ok(await evaluate(`document.body.innerText.includes('Basic fixture')`));
  assert.deepEqual(await evaluate(`window.__switchQA.requests.filter(r=>r.role==='user'&&r.path==='/events')`), [],
    'Login into Profile must not reload the hidden Home event list');
  await pressTab('Explore');
  await until(`[...document.querySelectorAll('[data-testid="events-list"]')].some(el=>el.innerText.includes('Discover user fixture'))`);
  assert.ok(!await evaluate(`[...document.querySelectorAll('[data-testid="events-list"]')].some(el=>el.innerText.includes('Discover admin fixture'))`),
    'Discover shows new-account results after its old query was removed');
  for (let i = 0; i < 3; i++) {
    await pressTab('Home'); await until(`location.pathname==='/'`);
    await pressTab('Profile'); await until(`location.pathname==='/users/me'`);
    await delay(150);
    assert.ok(!await evaluate(`document.body.innerText.includes('Administrator access required')`));
  }
  assert.deepEqual(await evaluate(`window.__switchQA.requests.filter(r=>r.role==='user'&&r.path.startsWith('/admin/'))`),[]);
  assert.ok(await evaluate(`window.__switchQA.requests.some(r=>r.role==='user'&&r.path==='/events')`),
    'The event list still loads when Home is actually opened');
  assert.deepEqual(await evaluate(`window.__switchQA.warnings.filter(w=>w.includes("argument to 'navigate'"))`),[]);
  assert.deepEqual(errors,[]);
  console.log('PASS admin → logout → basic login → Discover rebinds results → repeated Profile/Home, no stale admin destination or navigation warnings');
}).catch(error => { console.error(error); process.exitCode = 1; });
