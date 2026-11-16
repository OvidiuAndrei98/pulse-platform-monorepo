// Targeted continuation of the canonical-reference API scenario. Reuses only
// its explicitly synthetic group and the existing isolated fixture server.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {withBrowser}=require('./browser-harness.cjs');
const artifacts=path.resolve(__dirname,'../artifacts');
const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../api/.tmp/friends-browser-fixture.json'),'utf8'));
assert.equal(fixture.testOnly,true);assert.equal(new URL(fixture.baseUrl).hostname,'127.0.0.1');
const previousPath=path.join(artifacts,fs.existsSync(path.join(artifacts,'groups-reference-real-api-results.json'))?'groups-reference-real-api-results.json':'groups-reference-real-api-failure.json');
const previous=JSON.parse(fs.readFileSync(previousPath,'utf8'));
const groupId=process.env.REFERENCE_HISTORY_GROUP||previous.groupId||previous.requests.find(request=>/^\/outings\/groups\/[^/]+\/messages/.test(request.route))?.route.split('/')[3];
assert.match(groupId,/^[a-f\d-]{36}$/i);
const source=fs.readFileSync(path.join(__dirname,'browser-friends-coherence-api.cjs'),'utf8'),begin=source.indexOf('{source:`')+9,end=source.indexOf('`});',begin);
const bootstrap=source.slice(begin,end).replaceAll('\\\\','\\').replace('${JSON.stringify(fixture)}',JSON.stringify(fixture));
const results={scope:'Actual RN Web history navigation and isolated local Go/PostgreSQL; synthetic actors/history; no UIKit',groupId,checks:[],trace:[]};
const api=async(route)=>{const response=await fetch(fixture.baseUrl+'/api/v1'+route,{headers:{authorization:'Bearer '+fixture.actors[1].token}});assert.equal(response.status,200);return response.json()};
withBrowser(async({call,evaluate,until,capture,delay,errors})=>{
 const group=await api('/outings/groups/'+groupId);assert.match(group.name,/^Reference QA /);
 const references=group.outings.flatMap(plan=>plan.options.map(event=>({planId:plan.id,id:event.referenceMessageId,eventId:event.eventId}))).filter(item=>item.id);
 const target=references.find(item=>group.outings.find(plan=>plan.id===item.planId)?.chosenEventId===item.eventId);assert.ok(target);
 await call('Page.addScriptToEvaluateOnNewDocument',{source:bootstrap+`{const original=window.fetch.bind(window);window.__historyQa=[];window.fetch=async(input,init)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname.endsWith('/messages'))window.__historyQa.push(url.pathname+url.search);return original(input,init)}}`});
 await call('Page.navigate',{url:'http://localhost:8083/groups/'+groupId+'?qaActor=1'});
 await until(`document.querySelector('[data-testid="group-add"]')`,60000);await delay(700);
 const metrics=async()=>evaluate(`(()=>{const list=document.querySelector('[data-testid="group-messages"]'),older=[...document.querySelectorAll('[role=button],button')].find(button=>button.textContent.trim()==='Earlier messages'),ref=document.querySelector('[data-testid="group-event-reference-${target.id}"]');const rect=n=>{if(!n)return null;const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};return {top:list.scrollTop,height:list.clientHeight,content:list.scrollHeight,older:rect(older),ref:rect(ref),refState:ref?.dataset.referenceState,body:document.body.innerText.slice(-200)}})()`);
 let m=await metrics();results.trace.push({phase:'initial',...m});
 // Wheel input is used instead of scrollIntoView: the list is inverted with a
 // transform, so DOM layout coordinates are not physical scroll coordinates.
 for(let attempt=0;attempt<30;attempt++){
  m=await metrics();results.trace.push({phase:'wheel',attempt,...m});
  if(m.older&&m.older.y>=130&&m.older.y+m.older.height<=775)break;
  await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:200,y:400,deltaX:0,deltaY:-600});await delay(100);
 }
 m=await metrics();console.log('BEFORE HISTORY',m);await capture('groups-reference-history-before-action');
 assert.ok(m.older&&m.older.y>=120&&m.older.y+m.older.height<=780,'Explicit history control can be reached using the actual scroll surface');
 const point={x:m.older.x+m.older.width/2,y:m.older.y+m.older.height/2,button:'left',clickCount:1};
 await call('Input.dispatchMouseEvent',{type:'mousePressed',...point});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point});
 await until(`window.__historyQa.some(route=>new URL(route,location.origin).searchParams.has('before'))&&document.querySelector('[data-testid="group-event-reference-${target.id}"]')`,60000);
 results.checks.push('Explicit Earlier messages loads the canonical source beyond the latest50');
 await until(`![...document.querySelectorAll('[role=button],button')].some(button=>button.textContent.trim()==='Earlier messages')`,30000);
 results.checks.push('A final historical page removes the history action despite targeted old references');
 m=await metrics();results.trace.push({phase:'loaded',...m});
 for(let attempt=0;attempt<20&&(!m.ref||m.ref.y<130||m.ref.y+m.ref.height>775);attempt++){
  await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:200,y:400,deltaX:0,deltaY:m.ref&&m.ref.y<130?-160:160});await delay(100);m=await metrics();results.trace.push({phase:'position-reference',attempt,...m});
 }
 assert.equal(m.refState,'chosen');assert.ok(m.ref.height>150&&m.ref.height<500);
 assert.equal(await evaluate(`document.querySelectorAll('[data-testid="group-message-${target.id}"]').length`),1);
 results.checks.push('Loaded reference retains the correct outing state and one bounded cell');
 await capture('groups-reference-history-current-reference');
 assert.equal(errors.length,0);results.errors=errors;results.requests=await evaluate('window.__realGroups.requests');results.queries=await evaluate('window.__historyQa');results.target=target;
 fs.writeFileSync(path.join(artifacts,'groups-reference-history-results.json'),JSON.stringify(results,null,2));console.log('COMPLETE',results.checks);
}).catch(error=>{results.error=error.message;fs.writeFileSync(path.join(artifacts,'groups-reference-history-failure.json'),JSON.stringify(results,null,2));console.error(error);process.exitCode=1});
