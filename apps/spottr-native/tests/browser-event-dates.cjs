const assert=require('node:assert/strict');
const {withBrowser}=require('./browser-harness.cjs');
const origin=process.env.EVENT_DATES_TEST_URL||'http://127.0.0.1:8083';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
withBrowser(async({call,evaluate,until,click,errors,capture})=>{
  await call('Emulation.setDeviceMetricsOverride',{width:402,height:874,deviceScaleFactor:1,mobile:true});
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`(${function(){
    const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
    const user={id:id(1),username:'Picker QA',email:'qa@example.test',role:'organizer',hasPassword:true,preferredLanguage:'en'};
    localStorage.setItem('spottr-native.session.v1',JSON.stringify({token:'isolated-picker-fixture',user}));localStorage.setItem('i18nextLng','en');
    const profile={userId:id(1),companyName:'QA Club',verificationStatus:'approved',isVerified:true,stripeAccountId:'acct_fixture',stripeChargesEnabled:true,stripePayoutsEnabled:true,organizerAgreementVersion:'2026-10-18'};
    const event={id:id(10),organizerId:id(1),title:'Date picker QA',status:'published',category:'TECHNO',vibe:'Chill',city:'Bucuresti',locationName:'QA Club',description:'Local date picker regression fixture.',startTime:'2035-11-15T21:45:00Z',endTime:'2035-11-16T05:00:00Z',latitude:44.4,longitude:26.1,googlePlaceId:'ChIJ-qa',vatPercentage:21,ticketTypes:[],lineup:[]};
    const original=fetch.bind(window);window.__dateQA={writes:[]};
    window.fetch=async(url,options={})=>{
      const u=new URL(String(url),location.origin);if(!u.pathname.includes('/api/v1/'))return original(url,options);
      const route=u.pathname.split('/api/v1')[1],method=options.method||'GET';
      if(!['GET','HEAD'].includes(method)){__dateQA.writes.push(route);throw Error('Unexpected mutation');}
      const data=route==='/users/me'?user:route.startsWith('/dashboard/organizer/profile/')||route==='/dashboard/stripe/status'?profile:route==='/dashboard/events/'+event.id||route==='/events/'+event.id?event:route==='/events'||route==='/dashboard/events'?[event]:route==='/notifications'?{items:[],unreadCount:0}:[];
      return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
    };
  }.toString()})();`});
  await call('Page.navigate',{url:origin+'/dashboard/events/00000000-0000-4000-8000-000000000010'});
  await until(`document.querySelector('[data-testid="event-editor"]')`,90000);
  await until(`document.querySelector('[role="button"][aria-label="Start date"]')`);
  await evaluate(`document.querySelector('[role="button"][aria-label="Start date"]').click()`);
  await until(`document.querySelector('[data-testid="editor-date-popover"]')`);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="editor-native-date-picker"]')`),false,'Browser retains the existing custom calendar');
  await evaluate(`document.querySelector('[data-testid="editor-date-popover"] [role="button"][aria-label="20"]').click()`);
  await click('editor-date-done');
  await until(`!document.querySelector('[data-testid="editor-date-popover"]')`);
  const label=await evaluate(`document.querySelector('[role="button"][aria-label="Start date"]').textContent`);
  assert.ok(label.includes('20')&&label.includes('2035'),label);
  assert.deepEqual(await evaluate('__dateQA.writes'),[],'Picking a date does not publish or save the event');
  assert.deepEqual(errors,[]);
  await capture('event-dates-browser');
  console.log('PASS browser event dates: custom picker retained, local draft changes only, no native-module errors');
}).catch(error=>{console.error(error);process.exitCode=1;});
