const assert=require('node:assert/strict');
const {withBrowser}=require('./browser-harness.cjs');
withBrowser(async({base,call,evaluate,until,click,delay,errors})=>{
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`(${function(){
    const original=fetch.bind(window), id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
    const user={id:id(1),role:'organizer',username:'Account QA',email:'qa@example.test',preferredLanguage:'en',hasPassword:true,createdAt:'2026-01-01T00:00:00Z'};
    localStorage.setItem('spottr-native.session.v1',JSON.stringify({token:'account-test-token',user}));
    const qa=window.__account={user,writes:[],unexpected:[],failSave:false};
    window.fetch=async(url,opts={})=>{
      const value=String(url);if(!value.includes('/api/v1/')){if(new URL(value,location.href).origin===location.origin)return original(url,opts);throw Error('External request blocked');}
      const path=new URL(value,location.href).pathname.split('/api/v1')[1],method=opts.method||'GET',reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
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

  await call('Page.navigate',{url:base+'/users/me/tickets'});await until(`document.querySelector('[data-testid="tickets-page"]')`);
  await click('account-back');await delay(600);
  console.log('Direct tickets Back:',await evaluate('location.pathname'));
  assert.equal(await evaluate('location.pathname'),'/users/me','Direct ticket link returns to Profile, not Home');
  await until(`document.querySelector('[data-testid="profile-tickets-all"]')`);await click('profile-tickets-all');await until('location.pathname==="/users/me/tickets"');
  await click('account-back');await until('location.pathname==="/users/me"');
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="profile-list"]')`),true);
  await click('profile-tickets-all');await until('location.pathname==="/users/me/tickets"');await evaluate('history.back()');await until('location.pathname==="/users/me"');
  for(const path of ['/users/me/invoices','/users/me/saved-events']){await call('Page.navigate',{url:base+path});await until(`document.querySelector('[data-testid="account-back"]')`);await click('account-back');await until('location.pathname==="/users/me"');}
  assert.deepEqual(errors,[]);console.log('PASS account navigation: direct links and Profile?Tickets?Back return exactly one step; browser Back and sibling lists also return to Profile');
});
