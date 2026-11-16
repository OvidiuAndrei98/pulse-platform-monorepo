// Isolated local API/DB, real production groups handlers. Session bootstrap only is a fixture.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {withBrowser}=require('../../spottr-native/tests/browser-harness.cjs');
const config=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../api/.tmp/friends-browser-fixture.json'),'utf8'));
const origin=process.env.GROUPS_NEXT_URL||'http://localhost:8084';
for(const value of [origin,config.baseUrl])if(!['localhost','127.0.0.1'].includes(new URL(value).hostname))throw Error('LOCAL_ONLY');
assert.equal(config.testOnly,true);
const old=fs.readFileSync(path.join(__dirname,'groups-real-api.browser.cjs'),'utf8');
const bootstrap=new Function(old.slice(old.indexOf('function bootstrap('),old.indexOf('async function visit('))+';return bootstrap')();
const api=async(actor,route,body)=>{const response=await fetch(config.baseUrl+'/api/v1'+route,{method:body?'POST':'GET',headers:{authorization:'Bearer '+config.actors[actor].token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert.ok(response.ok,'Local API '+route+' status '+response.status);return response.json()};
const root='/groups/'+config.groupId,results=[];
(async()=>{
 for(let index=0;index<52;index++)await api(index%2,'/outings/groups/'+config.groupId+'/messages',{content:'Local return QA '+index,requestId:randomUUID()});
 for(const actor of [0,1])await withBrowser(async({call,evaluate,until,click,delay,capture,errors})=>{
  await call('Page.addScriptToEvaluateOnNewDocument',{source:'('+bootstrap.toString()+')('+JSON.stringify(config)+','+actor+')'});
  await call('Page.navigate',{url:origin+root});await until('document.querySelector("[data-testid=group-composer]")',40000);await delay(200);
  const geometry=()=>evaluate(`(()=>{const v=document.querySelector('[data-testid=group-messages]'),r=v.getBoundingClientRect(),rows=[...v.querySelectorAll('[data-chat-row]')],visible=rows.filter(e=>e.getBoundingClientRect().bottom>r.top&&e.getBoundingClientRect().top<r.bottom);return{viewport:v.clientHeight,content:v.scrollHeight,offset:v.scrollTop,first:visible[0]?.dataset.chatRow,firstOffset:visible[0]?.getBoundingClientRect().top-r.top,mounted:rows.length,visible:visible.length}})()`);
  const picker=async()=>{await click('group-add');await click('group-open-events');await until('document.querySelector("[data-testid=group-event-search]")')};
  for(const position of ['bottom','middle']){
   if(position==='middle')await evaluate(`{const v=document.querySelector('[data-testid=group-messages]');v.dispatchEvent(new Event('wheel',{bubbles:true}));v.scrollTop=(v.scrollHeight-v.clientHeight)*.45;v.dispatchEvent(new Event('scroll'));}`);
   await delay(120);const initial=await geometry();
   for(let index=0;index<5;index++){await picker();await click('group-page-back');await until('document.querySelector("[data-testid=group-composer]")');await delay(100);const returned=await geometry();assert.ok(returned.visible>0);assert.equal(returned.first,initial.first);assert.ok(Math.abs(returned.firstOffset-initial.firstOffset)<12);results.push({actor,position,index,initial,returned});}
  }
  if(actor===0){await evaluate(`{const v=document.querySelector('[data-testid=group-messages]');v.dispatchEvent(new Event('wheel',{bubbles:true}));v.scrollTop=v.scrollHeight;v.dispatchEvent(new Event('scroll'));}`);await delay(120);const before=(await api(actor,'/outings/groups/'+config.groupId+'/messages')).items.filter(m=>m.eventId===config.eventIds[0]).length;await picker();await until('document.querySelector("[data-testid=group-send-event-'+config.eventIds[0]+']")');await click('group-send-event-'+config.eventIds[0]);await until('document.querySelector("[data-testid=group-composer]")');await delay(150);const messages=(await api(actor,'/outings/groups/'+config.groupId+'/messages')).items;assert.equal(messages.filter(m=>m.eventId===config.eventIds[0]).length,before+1,'Sharing issues exactly one persisted message');const samples=[await geometry()];await delay(250);samples.push(await geometry());await delay(500);samples.push(await geometry());const geometryAfter=samples.at(-1);console.log('SHARE_GEOMETRY',JSON.stringify(samples));await capture('groups-2208-real-share-diagnostic');assert.ok(geometryAfter.content-geometryAfter.viewport-geometryAfter.offset<3,'Sharing returns to newest real content when already at end');results.push({actor,sharedEvent:true,...geometryAfter});}
  await capture('groups-2208-real-'+(actor?'member':'creator')+'-return');assert.deepEqual(errors.filter(e=>!e.includes('Failed to load resource')&&!e.includes('fonts.googleapis')),[]);
 });
 fs.mkdirSync(path.join(__dirname,'../.tmp'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../.tmp/groups-2208-real.json'),JSON.stringify(results,null,2));
 console.log('PASS real local Go/PostgreSQL: 52 messages, two browser identities, 20 Back returns at end/middle preserve visible anchor; one event share persists exactly once and returns to real content. No iPhone swipe/keyboard or paid Stripe claim.');
})().catch(error=>{console.error(error);process.exitCode=1});
