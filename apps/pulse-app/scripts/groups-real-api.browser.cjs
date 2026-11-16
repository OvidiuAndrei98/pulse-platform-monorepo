// Real local Go/PostgreSQL groups API. Only session/bootstrap and unrelated modules
// use fixtures; no production login, deployment, or payment is performed here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {withBrowser} = require('../../spottr-native/tests/browser-harness.cjs');
const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../api/.tmp/friends-browser-fixture.json'),'utf8'));
const origin = process.env.GROUPS_NEXT_URL || 'http://localhost:8084';
for (const value of [origin,fixture.baseUrl]) if (!['localhost','127.0.0.1'].includes(new URL(value).hostname)) throw Error('LOCAL_ONLY');
if (!fixture.testOnly) throw Error('ISOLATED_FIXTURE_REQUIRED');
const groupPath = '/groups/'+fixture.groupId;
const planPath = groupPath+'/outings/'+fixture.planId;
async function api(actor,route,body) {
 const response = await fetch(fixture.baseUrl+'/api/v1'+route,{method:body?'POST':'GET',headers:{authorization:'Bearer '+fixture.actors[actor].token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 return {status:response.status,data:await response.json()};
}
function bootstrap(config,actorIndex) {
 const original = fetch.bind(window),actor=config.actors[actorIndex],qa=window.__groupsRealQA={requests:[],actor:actor.id};
 localStorage.setItem('pulse_token',actor.token);localStorage.setItem('i18nextLng','en');
 const hide=()=>{const style=document.createElement('style');style.textContent='nextjs-portal{display:none!important}';document.head.append(style)};
 document.head?hide():document.addEventListener('DOMContentLoaded',hide,{once:true});
 window.fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(!url.pathname.includes('/api/v1/'))return original(input,init);
  const route=url.pathname.split('/api/v1')[1],method=init.method||(input instanceof Request?input.method:'GET');
  const reply=data=>Promise.resolve(new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}}));
  if(route==='/users/me')return reply({...actor,role:'user',hasPassword:true,preferredLanguage:'en',createdAt:'2026-01-01T00:00:00Z'});
  if(route.startsWith('/outings/')||route.startsWith('/events')||route==='/friends'||route==='/event-feed'||route==='/feed'||route==='/users/me/tickets'||route==='/users/me/orders') {
   const headers=new Headers(init.headers||(input instanceof Request?input.headers:undefined));headers.set('authorization','Bearer '+actor.token);headers.delete('cache-control');
   const response=await original(config.baseUrl+'/api/v1'+route+url.search,{...init,method,headers});
   qa.requests.push({route,method,status:response.status});return response;
  }
  if(route==='/notifications')return reply({items:[],unreadCount:0});
  if(route==='/wardrobe/mine')return reply({deposits:[],staffAccess:false});
  if(route==='/users/me/billing-details')return reply({details:null});
  return reply([]);
 };
}
async function visit(actor,run) {
 await withBrowser(async tools=>{
  const {call,evaluate,until,delay,capture,errors}=tools;
  await call('Page.addScriptToEvaluateOnNewDocument',{source:'('+bootstrap.toString()+')('+JSON.stringify(fixture)+','+actor+')'});
  const open=async route=>{await call('Page.navigate',{url:origin+route});await until('window.__groupsRealQA',30000)};
  const shot=async name=>{await delay(300);await capture('groups-audit-next-real-'+name)};
  const click=async id=>{await until('document.querySelector('+JSON.stringify('[data-testid="'+id+'"]')+') && !document.querySelector('+JSON.stringify('[data-testid="'+id+'"]')+').disabled');await tools.click(id)};
  await run({...tools,click,open,shot});
  assert.deepEqual(errors.filter(e=>!e.includes('Failed to load resource')&&!e.includes('fonts.googleapis')),[]);
  assert.equal(await evaluate('window.__groupsRealQA.requests.some(r=>r.method==="POST"&&r.status>=400)'),false);
 });
}
(async()=>{
 // Reset only this local fixture outing through its authorized production APIs;
 // retained messages and other groups are intentionally left untouched.
 let baseline=(await api(0,'/outings/plans/'+fixture.planId)).data;
 if(baseline.chosenEventId){const reopened=await api(0,'/outings/plans/'+fixture.planId+'/reopen',{revision:baseline.revision,reason:'other'});assert.equal(reopened.status,200)}
 for(const actor of [0,1])for(const eventId of fixture.eventIds){baseline=(await api(actor,'/outings/plans/'+fixture.planId)).data;if(baseline.options.find(option=>option.eventId===eventId)?.reactions?.some(r=>r.userId===fixture.actors[actor].id)){const removed=await api(actor,'/outings/plans/'+fixture.planId+'/vote',{eventId,remove:true,revision:baseline.revision});assert.equal(removed.status,200)}}
 await visit(0,async({open,until,click,input,evaluate,shot})=>{
  await open('/friends');await until('document.querySelector("[data-testid=group-row-'+fixture.groupId+']")',40000);await shot('creator-friends');
  await click('group-row-'+fixture.groupId);await until('document.querySelector("[data-testid=group-composer]")');await shot('creator-chat');
  await open(planPath);await until('document.querySelector("[data-testid=group-preference-'+fixture.eventIds[0]+'-toggle]")',30000);
  const toggle=async(index,on=true)=>{const key='group-preference-'+fixture.eventIds[index]+'-toggle';await click(key);await until('document.querySelector("[data-testid='+key+']")?.getAttribute("aria-pressed")==="'+on+'"')};
  const order=await evaluate('[...document.querySelectorAll("[data-testid^=group-proposal-]")].map(n=>n.dataset.testid)');
  await toggle(0);await toggle(1);await toggle(0,false);await shot('current-creator-preferences');
  assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-testid^=group-proposal-]")].map(n=>n.dataset.testid)'),order);
  const saved=await api(0,'/outings/plans/'+fixture.planId);assert.equal(saved.status,200);assert.equal(saved.data.chosenEventId,undefined);assert.equal(saved.data.options[0].reactions.some(r=>r.userId===fixture.actors[0].id),false);assert.equal(saved.data.options[1].reactions.find(r=>r.userId===fixture.actors[0].id).answer,'yes');
  await open(groupPath);await until('document.querySelector("[data-testid=group-composer]")');assert.equal(await evaluate('!!document.querySelector("[data-testid^=group-message-response-20]")'),false);
  await input('group-composer','Real local two-account message QA');await click('group-send');await until('document.querySelector("[data-testid=group-composer]")?.value===""');
 });
 await visit(1,async({open,until,click,evaluate,shot})=>{
  await open('/friends');await until('document.querySelector("[data-testid=group-row-'+fixture.groupId+']")',30000);await shot('member-friends');await click('group-row-'+fixture.groupId);await until('document.body.innerText.includes("Real local two-account message QA")');
  await shot('current-member-chat');
  await open(groupPath+'/outings/'+fixture.availabilityPlanId);await until('document.querySelector("[data-testid=group-outing]")');assert.equal(await evaluate('!!document.querySelector("[data-testid^=group-availability-]")'),false);await shot('current-legacy-context');
  await open(planPath);await until('document.querySelector("[data-testid=group-preference-'+fixture.eventIds[0]+'-toggle]")');assert.equal(await evaluate('!!document.querySelector("[data-testid^=group-choose-]")'),false);await click('group-preference-'+fixture.eventIds[0]+'-toggle');await until('document.querySelector("[data-testid=group-preference-'+fixture.eventIds[0]+'-toggle]")?.getAttribute("aria-pressed")==="true"');await shot('current-member-preferences');
 });
 const unauthorized=await api(1,'/outings/plans/'+fixture.planId+'/choose',{eventId:fixture.eventIds[0],revision:(await api(1,'/outings/plans/'+fixture.planId)).data.revision});assert.ok([403,404].includes(unauthorized.status),'Member cannot choose another creator’s destination');assert.equal((await api(0,'/outings/plans/'+fixture.planId)).data.chosenEventId,undefined);
 await visit(0,async({open,until,click,shot})=>{
  await open(planPath);await until('document.querySelector("[data-testid=group-choose-destination]")');await click('group-choose-destination');await until('document.querySelector("[data-testid=group-destination-sheet]")');await shot('choose-destination');await click('group-destination-'+fixture.freeEventId);await click('group-confirm-choice');await until('document.querySelector("[data-testid=group-attendance]")');await click('group-attendance-yes');await until('document.querySelector("[data-testid=group-attendance-yes]")?.getAttribute("aria-pressed")==="true"');await shot('creator-chosen');
 });
 await visit(1,async({open,until,click,evaluate,shot})=>{
  await open(planPath);await until('document.querySelector("[data-testid=group-attendance]")');assert.equal(await evaluate('document.querySelector("[data-testid=group-attendance]").dataset.value'),'');assert.equal(await evaluate('!!document.querySelector("[data-testid=group-attendance-maybe]")'),false);await click('group-attendance-yes');await until('document.querySelector("[data-testid=group-attendance-yes]")?.getAttribute("aria-pressed")==="true"');await click('group-attendance-no');await until('document.querySelector("[data-testid=group-attendance-no]")?.getAttribute("aria-pressed")==="true"');await shot('current-member-attendance');
  await open(groupPath);await until('document.querySelector("[data-testid=group-message-response-no]")?.getAttribute("aria-pressed")==="true"');await shot('current-member-updated-chat');
 });
 const final=await api(1,'/outings/plans/'+fixture.planId);assert.equal(final.data.chosenEventId,fixture.freeEventId);assert.equal(final.data.members.find(m=>m.userId===fixture.actors[0].id).attendance,'yes');assert.equal(final.data.members.find(m=>m.userId===fixture.actors[1].id).attendance,'no');
 await visit(0,async({open,until,click,evaluate,shot})=>{
  const initialOwn=(await api(0,'/users/me/tickets')).data.filter(t=>t.eventId===fixture.freeEventId&&(!t.assignedRecipientId||t.assignedRecipientId===fixture.actors[0].id));
  if(!initialOwn.length){await open(planPath);await until('document.querySelector("[data-testid=group-buy]")');await click('group-buy');await until('document.querySelector("[data-testid=outing-recipient-'+fixture.actors[1].id+']")');await click('outing-recipient-'+fixture.actors[1].id);await until('!document.querySelector("[data-testid=outing-recipients-continue]").disabled');
  await shot('self-and-friend-recipients');assert.equal(await evaluate('document.querySelectorAll("[data-testid=group-ticket-recipients] input[type=checkbox]:checked").length'),2);await click('outing-recipients-continue');await until('location.pathname==="/users/me/tickets"',30000);}
  const own=await api(0,'/users/me/tickets');assert.equal(own.status,200);assert.equal(own.data.filter(t=>t.eventId===fixture.freeEventId&&(!t.assignedRecipientId||t.assignedRecipientId===fixture.actors[0].id)).length,Math.max(1,initialOwn.length));const other=await api(1,'/users/me/tickets');assert.equal(other.data.filter(t=>t.eventId===fixture.freeEventId).length,0,'Friend must accept before their ticket enters their wallet');await open('/users/me/tickets');await until('document.body.innerText.includes("QA")');await shot('self-wallet');const beforeExtra=own.data.filter(t=>t.eventId===fixture.freeEventId&&(!t.assignedRecipientId||t.assignedRecipientId===fixture.actors[0].id)).length;
  await open(planPath);await until('document.querySelector("[data-testid=group-my-ticket]")');await click('group-buy-more');await until('document.querySelector("[data-testid=outing-recipient-'+fixture.actors[0].id+']")');await click('outing-recipient-'+fixture.actors[0].id);await until('document.querySelector("[data-testid=outing-extra-confirmation]")');assert.equal(await evaluate('document.querySelector("[data-testid=outing-recipients-continue]").disabled'),true);await shot('extra-explicit-confirmation');await click('outing-extra-confirmation');await until('!document.querySelector("[data-testid=outing-recipients-continue]").disabled');await click('outing-recipients-continue');await until('location.pathname==="/users/me/tickets"',30000);assert.equal((await api(0,'/users/me/tickets')).data.filter(t=>t.eventId===fixture.freeEventId&&(!t.assignedRecipientId||t.assignedRecipientId===fixture.actors[0].id)).length,beforeExtra+1);
 });
 await visit(1,async({open,until,click,evaluate,shot})=>{
  await open(planPath);await until('document.querySelector("[data-testid=group-accept-ticket]")');await shot('member-pending-ticket');await click('group-accept-ticket');await until('document.querySelector("[data-testid=group-my-ticket]")',30000);assert.equal((await api(1,'/users/me/tickets')).data.filter(t=>t.eventId===fixture.freeEventId).length,1);assert.equal((await api(1,'/outings/plans/'+fixture.planId)).data.members.find(m=>m.userId===fixture.actors[1].id).attendance,'no','Receiving a ticket does not change attendance');await click('group-attendance-yes');await until('document.querySelector("[data-testid=group-attendance-yes]")?.getAttribute("aria-pressed")==="true"');await shot('member-own-ticket');
 });
 console.log('PASS actual local Go/PostgreSQL API: two isolated browser identities; Friends/chat/detail; multi-event support and deselection; member cannot choose; common destination sheet; attendance chat/detail reconciliation; free self/friend registration; private transfer acceptance; additional ticket requires explicit confirmation. Bootstrap identity fixtures only, no production JWT login or Stripe charge.');
})().catch(error=>{console.error(error);process.exitCode=1});
