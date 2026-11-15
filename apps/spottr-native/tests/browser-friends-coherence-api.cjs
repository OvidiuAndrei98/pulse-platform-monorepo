// Actual RN Web navigation against the isolated Go/PostgreSQL QA server.
// Authentication bootstrap uses test-only actors; all group/outing/event/friend
// requests reach production handlers and the isolated database, never staging.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {withBrowser}=require('./browser-harness.cjs');
const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../api/.tmp/friends-browser-fixture.json'),'utf8'));
const origin=process.env.GROUPS_NATIVE_URL||'http://localhost:8083';
for(const url of [origin,fixture.baseUrl])if(!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('LOCAL_ONLY');
assert.equal(fixture.testOnly,true);
const results=[],routes=[];
const api=async(actor,route,options={})=>{const response=await fetch(fixture.baseUrl+'/api/v1'+route,{...options,headers:{authorization:'Bearer '+fixture.actors[actor].token,'content-type':'application/json',...options.headers}});const data=await response.json();assert.ok(response.ok,route+' '+response.status+' '+JSON.stringify(data));return data};
withBrowser(async({call,evaluate,until:poll,click,input,delay,capture,errors})=>{
 const until=(expression,timeout=60000)=>poll(expression,timeout);
 await call('Page.addScriptToEvaluateOnNewDocument',{source:`{
  const fixture=${JSON.stringify(fixture)},actor=Number(new URL(location.href).searchParams.get('qaActor')||0),person=fixture.actors[actor];
  const user={...person,role:'user',hasPassword:true,preferredLanguage:'en',createdAt:'2026-01-01T00:00:00Z'};delete user.token;
  localStorage.setItem('spottr-native.session.v1',JSON.stringify({version:1,token:person.token,user}));
  const original=fetch.bind(window),requests=[];window.__realGroups={actor,requests};
  window.fetch=async(input,init={})=>{
   const url=new URL(typeof input==='string'?input:input.url,location.href);if(!url.pathname.includes('/api/v1/'))return original(input,init);
   const route=url.pathname.split('/api/v1')[1],method=init.method||'GET';
   const reply=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json','cache-control':'no-store'}});
   if(/^\\/(outings|events|friends|feed)(\\/|$)/.test(route)||/^\\/users\\/me\\/(tickets|orders)$/.test(route)){
    const headers=new Headers(init.headers);headers.set('authorization','Bearer '+person.token);
    const response=await original(fixture.baseUrl+'/api/v1'+route+url.search,{...init,headers});
    requests.push({route,method,status:response.status});return response;
   }
   if(route==='/users/me')return reply(user);
   if(route==='/notifications')return reply({items:[],unreadCount:0});
   if(route==='/wardrobe/mine')return reply({deposits:[],staffAccess:false});
   if(route==='/users/me/billing-details')return reply({details:null});
   // Unrelated app bootstrap is intentionally isolated; no remote API fallback.
   return reply([]);
  };
 }`});
 const node=key=>`document.querySelector('[data-testid="${key}"]')`;
 const selected=key=>`${node(key)}?.getAttribute('aria-checked')==='true'`;
 const open=async(route,actor=0)=>{await call('Page.navigate',{url:origin+route+(route.includes('?')?'&':'?')+'qaActor='+actor});await until('window.__realGroups',60000)};
 const shot=async(name)=>{await delay(300);await capture('friends-coherence-real-api-'+name);const layout=await evaluate('({width:innerWidth,documentWidth:document.documentElement.scrollWidth,route:location.pathname})');assert.ok(layout.documentWidth<=layout.width+1,'No horizontal route overflow');routes.push({name,...layout})};
 const press=async(key)=>{await until(node(key),60000);await evaluate(`${node(key)}.scrollIntoView({block:'center'})`);let last='';for(let i=0;i<18;i++){const value=await evaluate(`(()=>{const n=${node(key)},r=n.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),hit:n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})})()`),r=JSON.parse(value);if(value===last&&r.hit){const point={x:r.x+r.w/2,y:r.y+r.h/2,button:'left',clickCount:1};await call('Input.dispatchMouseEvent',{type:'mousePressed',...point});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point});return}last=value;await delay(75)}await shot('covered-'+key);throw Error('Covered control '+key)};
 const check=label=>{results.push(label);console.log('PASS '+label)};

 await open('/groups');await until(node('groups-new'),60000);await press('groups-new');
 await until(node('group-friend-'+fixture.actors[1].id));
 await input('group-name','Native coherence '+Date.now());
 await press('group-friend-'+fixture.actors[1].id);await press('group-friend-'+fixture.actors[2].id);
 await press('group-create');await until(node('group-add'));
 const groupId=await evaluate('location.pathname.split("/")[2]');assert.match(groupId,/^[a-f0-9-]{36}$/);
 await shot('created-empty');
 const fresh=await api(0,'/outings/groups/'+groupId);assert.equal(fresh.members.filter(m=>m.status==='pending').length,2);assert.equal(fresh.outings.length,0);
 check('Actual UI creates one group with pending invitations and no automatic outing');

 await open('/groups/'+groupId,1);await until(node('group-accept'));assert.equal(await evaluate('!!'+node('group-messages')),false);await shot('member-pending');
 await press('group-accept');await until(node('group-add'));assert.equal((await api(1,'/outings/groups/'+groupId)).status,'accepted');
 check('Actual membership accept grants conversation access; pending invitation hides messages');

 await open('/groups/'+groupId);await until(node('group-add'));await press('group-add');await press('group-open-events');
 await until(node('group-send-event-'+fixture.eventIds[0]),60000);await shot('selector');await press('group-send-event-'+fixture.eventIds[0]);await until(node('group-event-action-'+fixture.eventIds[0]));
 assert.equal((await api(0,'/outings/groups/'+groupId)).outings.length,0,'Sharing does not silently create an outing');await shot('shared-event');
 await press('group-event-action-'+fixture.eventIds[0]);await until(node('group-attendance-yes'));
 const planId=await evaluate('location.pathname.split("/").pop()');
 const detail='/groups/'+groupId+'/outings/'+planId;
 const priorTicketState=(await api(0,'/outings/groups/'+groupId)).outings.find(p=>p.id===planId).members.find(m=>m.userId===fixture.actors[0].id).hasTicket;
 assert.equal(await evaluate(`${node('group-attendance')}.querySelectorAll('[aria-checked=true]').length`),0);
 await press('group-attendance-yes');await until(selected('group-attendance-yes'));await shot('creator-attendance');
 let canonical=(await api(0,'/outings/groups/'+groupId)).outings.find(p=>p.id===planId);assert.equal(canonical.chosenEventId,fixture.eventIds[0]);assert.equal(canonical.members.find(m=>m.userId===fixture.actors[0].id).hasTicket,priorTicketState);assert.equal(canonical.members.find(m=>m.userId===fixture.actors[0].id).attendance,'yes');
 check('Shared event explicitly becomes known-event outing; direct creator response persists without ticket purchase');

 await open('/groups/'+groupId,1);await until(node('group-chat-response-yes'));assert.equal(await evaluate(`${node('group-chat-response')}.querySelectorAll('[aria-checked=true]').length`),0);
 assert.equal(await evaluate('!!'+node('group-chat-response-maybe')),false);
 await press('group-chat-response-yes');await until(selected('group-chat-response-yes'));await shot('member-chat-vote');
 await press('group-chat-view-outing');await until(selected('group-attendance-yes'));await press('group-attendance-no');await until(selected('group-attendance-no'));assert.equal(await evaluate('!!'+node('group-edit-context')),false);await shot('member-detail');
 await open(detail,0);await until(selected('group-attendance-yes'));canonical=(await api(0,'/outings/groups/'+groupId)).outings.find(p=>p.id===planId);
 assert.equal(canonical.members.find(m=>m.userId===fixture.actors[1].id).attendance,'no');assert.equal(canonical.members.find(m=>m.userId===fixture.actors[0].id).attendance,'yes');
 assert.ok(await evaluate(`${node('group-attendance-poll')}.innerText.includes('1 coming')`));
 check('Two actual isolated API actors reconcile their own responses through chat/detail/reload; invited member excluded from eligibility');

 await open('/groups/'+groupId,2);await until(node('group-accept'));assert.equal(await evaluate('!!'+node('group-chat-response')),false);await shot('third-person-invited');
 await open('/groups/'+groupId,0);await until(node('group-add'));await press('group-add');await press('group-open-events');await until(node('group-send-event-'+fixture.eventIds[1]));await press('group-send-event-'+fixture.eventIds[1]);await until(node('group-event-action-'+fixture.eventIds[1]));await press('group-event-action-'+fixture.eventIds[1]);await until(node('group-outing'));
 canonical=(await api(0,'/outings/groups/'+groupId)).outings;
 assert.equal(canonical.length,1,'Same-night alternative belongs to existing outing');assert.equal(canonical[0].options.length,2);assert.equal(canonical[0].chosenEventId,fixture.eventIds[0]);await shot('same-night-alternative');
 check('Second shared event on same night adds an alternative without duplicate group or automatic destination change');

 const post=async(actor,action,body)=>api(actor,'/outings/plans/'+planId+'/'+action,{method:'POST',body:JSON.stringify(body)});
 let current=await api(0,'/outings/plans/'+planId);
 await post(0,'reopen',{revision:current.revision,reason:'other'});
 await open(detail);await until(node('group-preference-'+fixture.eventIds[0]));
 const preference=index=>'group-preference-'+fixture.eventIds[index];
 const order=await evaluate('[...document.querySelectorAll("[data-testid^=group-proposal-]")].map(n=>n.dataset.testid)');
 await press(preference(0));await until(selected(preference(0)));await press(preference(1));await until(selected(preference(1)));await press(preference(0));await until('!('+selected(preference(0))+')');
 assert.equal(await evaluate(selected(preference(1))),true);assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-testid^=group-proposal-]")].map(n=>n.dataset.testid)'),order);await shot('current-comparison');
 await open('/groups/'+groupId,1);await until(node('group-chat-preference-'+fixture.eventIds[0]));await press('group-chat-preference-'+fixture.eventIds[0]);await until(selected('group-chat-preference-'+fixture.eventIds[0]));
 await press('group-chat-view-outing');await until(selected(preference(0)));assert.equal(await evaluate('!!'+node('group-choose-'+fixture.eventIds[0])),false);
 await open(detail);await until(node('group-choose-'+fixture.eventIds[1]));await press('group-choose-'+fixture.eventIds[1]);await press('group-confirm-choice');await until(node('group-attendance-yes'));
 current=await api(0,'/outings/plans/'+planId);assert.equal(current.chosenEventId,fixture.eventIds[1]);assert.equal(current.members.filter(m=>m.status==='accepted').every(m=>m.attendance==='unanswered'),true);await shot('current-comparison-chosen');
 check('Actual API supports multiple event preferences, deselection, stable order, chat/detail sync and creator choice without automatic attendance');

 const nextDay=new Date(Date.parse(fixture.night+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 await press('group-edit-context');await until(node('group-save-context'));await press('ribbon-day-'+nextDay);await until(`${node('ribbon-day-'+nextDay)}?.getAttribute('aria-pressed')==='true'`);await press('group-save-context');await until(node('group-context-confirm'));await press('group-context-confirm');await until('!'+node('group-night-editor'));
 current=await api(0,'/outings/plans/'+planId);assert.equal(current.outingDate,nextDay);assert.equal(current.chosenEventId,undefined);assert.equal(current.members.filter(m=>m.status==='accepted').every(m=>m.attendance==='unanswered'),true);
 await open('/groups/'+groupId,1);await until(node('group-messages'));assert.equal((await api(1,'/outings/groups/'+groupId)).id,groupId);await shot('current-context-changed');
 check('Actual authorized date editor persists one outing in the same group, clears incompatible destination/responses and synchronizes chat');

 for(const width of [320,390,1024]){await call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<700});await shot('detail-width-'+width)}
 const network=await evaluate('window.__realGroups.requests');assert.ok(network.some(r=>r.route.startsWith('/outings/')&&r.status===200));assert.equal(network.filter(r=>/payment|checkout|tickets\/(book|purchase)/.test(r.route)).length,0);
 assert.deepEqual(errors.filter(e=>!e.includes('Failed to load resource')),[]);
 fs.writeFileSync(path.resolve(__dirname,'../artifacts/friends-coherence-real-api-results.json'),JSON.stringify({scope:'Actual RN Web navigation; local PostgreSQL production handlers; synthetic authentication actors and unrelated bootstrap only; no real payments/device claim',groupId,planId,results,routes},null,2));
}).catch(error=>{console.error(error);process.exitCode=1});
