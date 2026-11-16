// Narrow 22:08 regression against real Go handlers and isolated PostgreSQL.
// Browser auth bootstrap is synthetic; group/share/attendance requests are real.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {withBrowser}=require('./browser-harness.cjs');
const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../api/.tmp/friends-browser-fixture.json'),'utf8'));
const origin=process.env.GROUPS_NATIVE_URL||'http://localhost:8083';
for(const url of [origin,fixture.baseUrl])if(!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('LOCAL_ONLY');
assert.equal(fixture.testOnly,true);
const checks=[],measurements=[],requests=[];
const api=async(actor,route,method='GET',body)=>{
 const response=await fetch(fixture.baseUrl+'/api/v1'+route,{method,headers:{authorization:'Bearer '+fixture.actors[actor].token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();assert.ok(response.ok,method+' '+route+' '+response.status);return data;
};
const source=fs.readFileSync(path.join(__dirname,'browser-friends-coherence-api.cjs'),'utf8');
const start=source.indexOf('{source:`')+9,end=source.indexOf('`});',start);
if(start<9||end<start)throw Error('Real API bootstrap unavailable');
// This source sits inside a JS template literal in the shared harness. Decode
// its doubled slashes before injecting the resulting browser program.
const bootstrap=source.slice(start,end).replaceAll('\\\\','\\').replace('${JSON.stringify(fixture)}',JSON.stringify(fixture));
new (require('node:vm').Script)(bootstrap);
const artifacts=path.resolve(__dirname,'../artifacts'),prefix='chat-return-real-api';
withBrowser(async({call,evaluate,until:poll,click,capture,delay,errors})=>{
 const until=(condition,timeout=60000)=>poll(condition,timeout),node=key=>`document.querySelector('[data-testid="${key}"]')`;
 const check=(value,label)=>{checks.push({passed:!!value,label});assert.ok(value,label);console.log('PASS',label)};
 await call('Page.addScriptToEvaluateOnNewDocument',{source:bootstrap});
 const created=await api(0,'/outings/groups','POST',{requestId:crypto.randomUUID(),name:'22:08 return QA '+Date.now(),friendIds:[fixture.actors[1].id]});
 const groupId=created.id;assert.match(groupId,/^[a-f0-9-]{36}$/);
 await api(1,'/outings/groups/'+groupId+'/actions','POST',{action:'accept'});
 for(let i=0;i<6;i++)await api(i%2,'/outings/groups/'+groupId+'/messages','POST',{requestId:crypto.randomUUID(),content:'Local QA message '+i});
 const open=async(actor=0)=>{await call('Page.navigate',{url:origin+'/groups/'+groupId+'?qaActor='+actor});await until(node('group-add'));await until(`${node('group-messages')}?.querySelector('[data-testid^="group-message-"]')`);await delay(200)};
 const measure=async label=>{
  const value=await evaluate(`(()=>{const n=${node('group-messages')},c=${node('group-composer-row')},r=n.getBoundingClientRect(),cr=c.getBoundingClientRect(),rows=[...n.querySelectorAll('[data-testid^="group-message-"]')].map(el=>{const q=el.getBoundingClientRect();return{id:el.dataset.testid,top:q.top,bottom:q.bottom,height:q.height,width:q.width}});return{actor:window.__realGroups.actor,route:location.pathname,offset:n.scrollTop,viewport:n.clientHeight,content:n.scrollHeight,composerTop:cr.top,visible:rows.filter(m=>m.bottom>r.top&&m.top<r.bottom),rows,documentWidth:document.documentElement.scrollWidth,width:innerWidth}})()`);
  measurements.push({label,...value});return value;
 };
 const pick=async()=>{await click('group-add');await until(node('group-open-events'));await click('group-open-events');await until(node('group-event-picker-page'));await until(node('group-send-event-'+fixture.eventIds[0]))};
 await open();
 for(let i=0;i<5;i++){await pick();await click('group-event-picker-page-back');await until(`location.pathname==='/groups/${groupId}'`);await delay(180);const m=await measure('back-'+i);check(m.visible.length>0,'Actual API conversation remains visible on return '+i);check(Math.abs(m.offset)<2,'Actual API latest anchor survives return '+i)}
 const before=await api(0,'/outings/groups/'+groupId+'/messages');
 await pick();await click('group-send-event-'+fixture.eventIds[0]);await until(`location.pathname==='/groups/${groupId}'`);await until(node('group-event-action-'+fixture.eventIds[0]));await delay(220);
 const shared=await api(0,'/outings/groups/'+groupId+'/messages'),event=shared.items.find(m=>m.eventId===fixture.eventIds[0]);
 check(shared.items.length===before.items.length+1&&shared.items.filter(m=>m.eventId===fixture.eventIds[0]).length===1,'Actual share creates exactly one stored event message');
 check((await api(0,'/outings/groups/'+groupId)).outings.length===0,'Sharing does not create an outing');
 const mine=await measure('creator-after-share'),mineRow=mine.rows.find(m=>m.id==='group-message-'+event.id);
 check(!!mineRow&&mineRow.bottom<=mine.composerTop+.5&&mine.visible.length>0,'Shared event and metadata are visible above composer');await capture(prefix+'-creator-shared');
 requests.push(...await evaluate('window.__realGroups.requests'));
 await open(1);await until(node('group-event-action-'+fixture.eventIds[0]));const received=await measure('member-received');
 check(received.visible.some(m=>m.id==='group-message-'+event.id),'Second real actor sees the same shared message');await capture(prefix+'-member-received');
 check((await api(1,'/outings/groups/'+groupId)).outings.length===0,'Received shared event has no invented invitation');
 requests.push(...await evaluate('window.__realGroups.requests'));
 await open();await click('group-create-outing');await until(node('group-attendance-yes'));
 const planId=await evaluate('location.pathname.split("/").pop()');
 let plan=await api(0,'/outings/plans/'+planId);check(plan.chosenEventId===fixture.eventIds[0]&&plan.members.every(m=>m.attendance==='unanswered'),'Explicit proposal creates known destination without automatic attendance');
 requests.push(...await evaluate('window.__realGroups.requests'));
 await open(1);await until(node('group-chat-response-yes'));await click('group-chat-response-yes');await until(`${node('group-chat-response-yes')}?.getAttribute('aria-checked')==='true'`);
 plan=await api(1,'/outings/plans/'+planId);check(plan.members.find(m=>m.userId===fixture.actors[1].id).attendance==='yes','Member responds directly from real invitation');
 check(plan.members.find(m=>m.userId===fixture.actors[0].id).attendance==='unanswered','Member answer does not modify creator answer');
 const memberLayout=await measure('member-invitation');check(memberLayout.visible.length>0&&memberLayout.documentWidth<=memberLayout.width+1,'Real invitation fits and conversation remains visible');await capture(prefix+'-member-invitation');
 requests.push(...await evaluate('window.__realGroups.requests'));
 await open();plan=await api(0,'/outings/plans/'+planId);check(plan.members.find(m=>m.userId===fixture.actors[1].id).attendance==='yes','Creator reload sees canonical member answer');await capture(prefix+'-creator-invitation');
 check(!requests.some(r=>/tickets\/(purchase|book)/.test(r.route)),'No ticketing operation is triggered by sharing or attendance');
 check(errors.length===0,'No browser runtime errors');
 fs.writeFileSync(path.join(artifacts,prefix+'-results.json'),JSON.stringify({scope:'Actual RN Web navigation to local Go/PostgreSQL production handlers; two synthetic authentication actors; no production or payment requests; no UIKit claims',groupId,planId,checks,measurements,requests,errors},null,2));
 console.log('COMPLETE real API return',checks.length);
}).catch(error=>{fs.writeFileSync(path.join(artifacts,prefix+'-failure.json'),JSON.stringify({error:error.message,checks,measurements,requests},null,2));console.error(error);process.exitCode=1});
