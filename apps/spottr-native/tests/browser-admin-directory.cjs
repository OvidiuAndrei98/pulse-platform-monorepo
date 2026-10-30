// Exported client, simulated administrator/API only. No production access.
const assert=require('node:assert/strict');
const {withBrowser}=require('./browser-harness.cjs');
const id='11111111-1111-4111-8111-111111111111';
const item={userId:id,companyName:'Legal Company',cui:'12345678',username:'organizer',email:'company@example.invalid',verificationStatus:'approved',accountActive:true,stripeStatus:'active',createdAt:'2026-10-01T10:00:00Z',updatedAt:'2026-10-01T10:00:00Z'};
const detail={...item,fiscalAddress:'Fiscal address',verifiedAt:'',stripeAccountId:'acct_public_identifier',stripeChargesEnabled:true,stripePayoutsEnabled:true,stripeDetailsSubmitted:true,agreementVersion:'2026-10-18',agreementAcceptedAt:'',standard:{rateBps:400,perTicketBani:250,revision:1},commissionOverride:null,commissionRevision:0,eventCount:2,upcomingCount:1,liveRefundsAttention:1,testRefundsAttention:2,unknownRefundsAttention:3,recentEvents:[{id,title:'Event A',startTime:'2026-11-01T10:00:00Z',status:'published',location:'Venue'}]};
withBrowser(async({base,call,evaluate,until,delay,capture,errors,click,input})=>{
 const next=!!process.env.ADMIN_TEST_URL,origin=process.env.ADMIN_TEST_URL||base,organizer=next?'a[href*="/admin/organizers/view?id="]':'[aria-label="Open organizer Legal Company"]',editor=next?'form':'[data-testid="commission-editor"]',searchField=next?'[name="organizer-search"]':'[aria-label="Company, tax ID or email"]';
 await call('Page.addScriptToEvaluateOnNewDocument',{source:`(${function mock(item,detail){
  const original=window.fetch.bind(window),role=new URL(location.href).searchParams.get('role')||'admin';
  const user={id:'22222222-2222-4222-8222-222222222222',username:'Admin QA',email:'admin@example.invalid',role,preferredLanguage:'en',hasPassword:true,createdAt:'2026-10-01T10:00:00Z'};
  localStorage.setItem('spottr-native.session.v1',JSON.stringify({token:'admin-ui-test-only',user}));localStorage.setItem('i18nextLng','en');localStorage.setItem('pulse_token','admin-ui-test-only');
  const qa=window.__adminQA={requests:[],writes:[],fail:false};
  window.fetch=async(input,options={})=>{
   const url=new URL(String(input),location.origin),route=url.pathname.split('/api/v1')[1];
   if(!route){if(url.origin===location.origin)return original(input,options);throw Error('Unexpected external request');}
   const method=options.method||'GET',body=options.body?JSON.parse(options.body):null;qa.requests.push({route,method,body,url:String(url)});
   const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
   if(route==='/auth/me'||route==='/users/me')return reply(user);
   if(route==='/notifications')return reply({items:[],unreadCount:0});
   if(route==='/admin/organizer-directory'){if(qa.fail)return reply({},503);return reply({items:body.search==='empty'?[]:[item],nextCursor:''});}
   if(route==='/admin/organizer-directory/'+item.userId)return reply(detail);
   if(route==='/admin/organizers/'+item.userId+'/commission'&&method==='PUT'){qa.writes.push(body);detail.commissionRevision++;detail.commissionOverride=body.useStandard?null:{rateBps:body.rateBps,perTicketBani:body.perTicketBani};return reply({ok:true});}
   if(route==='/diagnostics/errors')return new Response(null,{status:204});
   return reply([]);
  };
 }.toString()})(${JSON.stringify(item)},${JSON.stringify(detail)});`});
 const button=text=>`Array.from(document.querySelectorAll('button,a,[role="button"]')).find(e=>e.textContent.trim()===${JSON.stringify(text)}&&e.getBoundingClientRect().width>0)`;
 const press=async text=>{if(next&&!await evaluate('Boolean('+button(text)+')'))await evaluate(`{const menu=document.querySelector('details[data-admin-menu]');if(menu)menu.open=true;}`);await until(button(text));await evaluate(`${button(text)}.click()`);};
 const open=async suffix=>{const params=new URLSearchParams(suffix),section=params.get('section');params.delete('section');await call('Page.navigate',{url:next?origin+'/admin'+(section?'/'+section:'')+(params.size?'?'+params:''):base+'/admin'+suffix});await until(`document.body?.innerText.includes('SPOTTR')||document.body?.innerText.includes('Administrator access required')`);await delay(200);};
 await open('?role=user');assert.equal(await evaluate(`window.__adminQA.requests.some(r=>r.route.startsWith('/admin/'))`),false);
 await open('');await until(button('Organizers'));assert.equal(await evaluate(`window.__adminQA.requests.some(r=>r.route.startsWith('/admin/'))`),false,'Overview does not fetch inactive sections');
 if(next)await until(`document.activeElement===document.querySelector('#admin-content h1')||document.activeElement===document.querySelector('#admin-content')`);
 await press('Organizers');await until(`document.querySelector('${organizer}')`);
 if(next)assert.equal(await evaluate(`!!document.querySelector('button[aria-label="Profile"]')`),false,'Admin uses its own navigation, not the customer bottom bar');
 assert.equal(await evaluate(`window.__adminQA.requests.find(r=>r.route==='/admin/organizer-directory').method`),'POST');
 await capture((next?'web-':'')+'admin-directory-mobile');
 await evaluate(`document.querySelector('${organizer}').click()`);await until(button('Company'));
 await press('Events');await until(`document.body.innerText.includes('Event A')`);await press('Issues');
 await until(`document.body.innerText.includes('Live refunds to review: 1')&&document.body.innerText.includes('Test refunds to review: 2')&&document.body.innerText.includes('Refunds with unverified environment: 3')`);
 assert.equal(await evaluate(`document.body.innerText.includes('Application errors are anonymous')`),true);
 await press('Settings');await press('Edit');await until(`document.querySelector('${editor}')`);
 await capture((next?'web-':'')+'admin-organizer-settings');
 await call('Emulation.setDeviceMetricsOverride',{width:320,height:760,deviceScaleFactor:1,mobile:true});await delay(200);
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'No 320px horizontal overflow');
 await capture((next?'web-':'')+'admin-organizer-320');
 await open('?section=organizers');await until(`document.querySelector('${searchField}')`);
 await evaluate(`{const el=document.querySelector('${searchField}');el.focus();el.select();}`);await call('Input.insertText',{text:'empty'});await press('Search');await until(`document.body.innerText.includes('No organizers found')`);
 const request=await evaluate(`window.__adminQA.requests.find(r=>r.body?.search==='empty')`);assert.equal(request.url.includes('empty'),false);
 await capture((next?'web-':'')+'admin-directory-empty');
 await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await open('');await until(button('Organizers'));await capture((next?'web-':'')+'admin-overview-desktop');
 assert.deepEqual(errors.filter(e=>!/props.pointerEvents|React DevTools|Failed to load resource|favicon/.test(e)),[]);
 console.log('PASS '+(next?'Next.js':'Native web')+' admin role gate, lazy sections, POST directory search, organizer details/events/settings/issues, empty state, desktop and 320px layout');
}).catch(error=>{console.error(error);process.exitCode=1;});
