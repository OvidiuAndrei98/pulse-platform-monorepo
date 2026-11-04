const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');
const preview = process.env.NAVIGATION_TEST_URL;
if (preview && !['localhost', '127.0.0.1'].includes(new URL(preview).hostname)) throw Error('LOCAL_TEST_SERVER_REQUIRED');

withBrowser(async ({ base, call, evaluate, until, click, input, delay, errors }) => {
  const origin = preview || base;
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
      if (path === '/users/me/tickets') return reply([{id:account(qa.role).id,eventId:'00000000-0000-4000-8000-000000000098',
        eventTitle:qa.role==='admin'?'Admin private ticket':'Basic private ticket',ticketTypeName:'General',locationName:'QA Club',
        validationHash:'fixture-ticket',startTime:'2035-01-01T20:00:00Z',endTime:'2035-01-02T05:00:00Z',isValidated:false}]);
      if (path === '/notifications') return reply({items:[],unreadCount:0});
      if (path === '/wardrobe/mine') return reply({deposits:[],staffAccess:false});
      if (path === '/users/me/billing-details') return reply({details:null});
      if (path === '/diagnostics/errors') return new Response(null,{status:204});
      if (path === '/events') return reply([{ id:'00000000-0000-4000-8000-000000000099', title:'Public night fixture', category:'HOUSE', city:'Bucuresti',
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
  await call('Page.navigate', { url: origin + '/' });
  // Public discovery is unauthenticated. Its cached event views should survive
  // account changes while every private query and role-specific route is reset.
  await pressTab('Explore');
  await until(`[...document.querySelectorAll('[data-testid="events-list"]')].some(el=>el.innerText.includes('Public night fixture'))`);
  await evaluate(`window.__switchQA.eventList=[...document.querySelectorAll('[data-testid="events-list"]')].find(el=>el.innerText.includes('Public night fixture')); window.__switchQA.eventNode=[...window.__switchQA.eventList.querySelectorAll('*')].find(el=>el.textContent==='Public night fixture'); true`);
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
  await until(`document.querySelector('[data-testid="profile-list"]').textContent.includes('Basic private ticket')`);
  assert.ok(!await evaluate(`document.querySelector('[data-testid="profile-list"]').textContent.includes('Admin private ticket')`),
    'The new account never displays the previous account tickets');
  assert.deepEqual(await evaluate(`window.__switchQA.requests.filter(r=>r.role==='user'&&r.path==='/events')`), [],
    'Login into Profile must not reload the hidden Home event list');
  await pressTab('Explore');
  await until(`[...document.querySelectorAll('[data-testid="events-list"]')].some(el=>el.innerText.includes('Public night fixture'))`);
  assert.ok(await evaluate(`window.__switchQA.eventList.isConnected && window.__switchQA.eventNode.isConnected`),
    'Login/logout preserves public event views without a skeleton or remount');
  for (let i = 0; i < 3; i++) {
    await pressTab('Home'); await until(`location.pathname==='/'`);
    await pressTab('Profile'); await until(`location.pathname==='/users/me'`);
    await delay(150);
    assert.ok(!await evaluate(`document.body.innerText.includes('Administrator access required')`));
  }
  assert.deepEqual(await evaluate(`window.__switchQA.requests.filter(r=>r.role==='user'&&r.path.startsWith('/admin/'))`),[]);
  assert.ok(await evaluate(`window.__switchQA.requests.some(r=>r.role==='admin'&&r.path==='/events')`),
    'Public events loaded before the account switch remain available');
  await click('profile-tickets-all');
  await until(`document.querySelector('[data-testid="tickets-page"]')`);
  await click('tickets-tab-history');
  assert.equal(await evaluate('location.pathname'),'/users/me/tickets','History filters tickets without triggering Back');
  await click('account-back');
  await until(`location.pathname==='/users/me' && document.querySelector('[data-testid="profile-list"]')`);
  assert.deepEqual(await evaluate(`window.__switchQA.warnings.filter(w=>w.includes("argument to 'navigate'"))`),[]);
  assert.deepEqual(errors,[]);
  console.log('PASS account switch: public event views retained, private tickets isolated, role routes reset, rapid tabs and History/Back preserved');
}).catch(error => { console.error(error); process.exitCode = 1; });
