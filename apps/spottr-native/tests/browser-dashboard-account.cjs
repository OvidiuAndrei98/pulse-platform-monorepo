// Account dashboard regression coverage: isolated mocked API, never real account changes.
const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');
withBrowser(async ({base,call,evaluate,until,delay,capture,errors}) => {
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`(${function(){
    const original=fetch.bind(window), id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
    const user={id:id(1),role:'organizer',username:'Account QA',email:'qa@example.test',preferredLanguage:'en',hasPassword:true,createdAt:'2026-01-01T00:00:00Z'};
    localStorage.setItem('spottr-native.session.v1',JSON.stringify({token:'account-test-token',user}));
    const qa=window.__account={user,writes:[],unexpected:[],failSave:false};
    window.fetch=async(url,opts={})=>{
      const value=String(url);if(!value.includes('/api/v1/')){if(new URL(value,location.href).origin===location.origin)return original(url,opts);throw Error('External request blocked');}
      const path=new URL(value,location.href).pathname.split('/api/v1')[1],method=opts.method||'GET',reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
      if(path==='/diagnostics/errors'&&method==='POST')return new Response(null,{status:204});
      if(path==='/wardrobe/mine')return reply({deposits:[],staffAccess:false});
      if(method!=='GET')qa.writes.push({path,method,body:opts.body&&JSON.parse(opts.body)});
      if(path==='/users/me'&&method==='PUT'){await new Promise(r=>setTimeout(r,150));if(qa.failSave)return reply({error:'Temporary failure'},500);Object.assign(user,JSON.parse(opts.body));return reply(user);}
      if(path==='/users/me')return reply(user);
      if(path==='/auth/forgot-password')return reply({success:true});
      if(path.startsWith('/dashboard/organizer/profile/'))return reply({verificationStatus:'approved',companyName:'QA SRL',cui:'123456'});
      if(path==='/promotions/active'||path==='/dashboard/events'||path==='/dashboard/ticket-validation/events'||path==='/events'||path==='/users/me/saved-events'||path==='/users/me/hidden-categories')return reply([]);
      if(path==='/notifications')return reply({items:[],unreadCount:0});
      if(path==='/users/me/tickets')return reply([{id:id(2),eventId:id(3),eventTitle:'Ticket night',ticketTypeName:'General',locationName:'QA Club',validationHash:'test-ticket-hash',startTime:'2035-01-01T20:00:00Z',endTime:'2035-01-02T05:00:00Z',isValidated:false}]);
      if(path==='/users/me/orders')return reply([{id:id(4),eventId:id(3),eventTitle:'Order without invoice',locationName:'QA Club',createdAt:'2026-01-01T12:00:00Z',status:'completed',paidTotalBani:5500,refundedAmountBani:0,invoiceRequested:false}]);
      qa.unexpected.push({path,method});return reply({error:'unmocked'},404);
    };
  }.toString()})();`});
  const button = text=>`Array.from(document.querySelectorAll('[role="button"]')).find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
  const press=async text=>{await until(button(text));await evaluate(`${button(text)}.click()`);};
  const fill=async(label,text)=>{await evaluate(`{const el=document.querySelector('input[aria-label="${label}"],textarea[aria-label="${label}"]');el.focus();el.select();}`);await call('Input.insertText',{text});};
  await call('Page.navigate',{url:base+'/dashboard/profile'});await until(`document.querySelector('input[aria-label="Display name"]')`);
  await fill('Display name','ab');await press('Save changes');await until(`document.body.innerText.includes('at least 3 characters')`);
  assert.equal(await evaluate('window.__account.writes.length'),0,'Invalid profile never reaches API');
  await fill('Display name','Updated QA');await evaluate(`${button('Save changes')}.click();${button('Save changes')}.click()`);
  await until(button('Saved'));await delay(400);assert.equal(await evaluate(`!!${button('Saved')}`),true,'Save feedback persists through session refresh');
  assert.equal(await evaluate(`window.__account.writes.filter(r=>r.path==='/users/me').length`),1,'Rapid save taps submit once');
  await delay(1400);await until(button('Save changes'));
  await evaluate('window.__account.failSave=true');await fill('Bio','Unsaved profile text');await press('Save changes');await until(`document.body.innerText.includes("couldn't be saved")`);
  assert.equal(await evaluate(`document.querySelector('textarea[aria-label="Bio"]').value`),'Unsaved profile text','Failed save keeps editable draft');
  await press('Reset password');await until(button('Link sent'));assert.equal(await evaluate(`${button('Link sent')}.getAttribute('aria-disabled')`),'true');
  assert.equal(await evaluate(`window.__account.writes.filter(r=>r.path==='/auth/forgot-password').length`),1);
  await capture('dashboard-account-profile');
  await call('Page.navigate',{url:base+'/dashboard/purchases'});await until(`document.body.innerText.includes('Ticket night')`);
  await evaluate(`Array.from(document.querySelectorAll('[role="button"]')).find(e=>e.textContent.includes('Ticket night')).click()`);
  await until(`document.querySelector('[data-testid="ticket-preview"]')`);
  await call('Page.navigate',{url:base+'/dashboard/purchases'});await until(`Array.from(document.querySelectorAll('[role="tab"]')).some(e=>e.textContent.includes('Orders'))`);
  await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(e=>e.textContent.includes('Orders')).click()`);
  await until(`document.body.innerText.includes('Order without invoice')`);assert.ok((await evaluate('document.body.innerText')).includes('55'),'Shows every order, including those without requested invoice');
  await capture('dashboard-account-purchases');
  await evaluate(`document.querySelector('[data-testid="dashboard-nav-logout"]').click()`);await delay(800);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="organizer-dashboard"]')`),false,'Logout leaves protected dashboard');
  assert.equal(await evaluate(`location.pathname`),'/','Logout lands on Home, not auth redirect loop');
  assert.equal(await evaluate(`localStorage.getItem('spottr-native.session.v1')`),null,'Logout clears session');
  assert.deepEqual(await evaluate('window.__account.unexpected'),[]);assert.deepEqual(errors,[]);
  console.log('PASS dashboard account: validation, single submit, save feedback, error draft, password reset, ticket QR, all orders and logout');
});
