// Focused sheet geometry capture. UI routes are real; API responses here are
// explicitly synthetic and never evidence of backend authorization or UIKit.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {withBrowser}=require('./browser-harness.cjs');
const origin=process.env.GROUPS_NATIVE_URL||'http://localhost:8083',phase=process.env.GROUPS_QA_PHASE||'before';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const source=fs.readFileSync(path.resolve(__dirname,'../../pulse-app/scripts/groups.browser.cjs'),'utf8'),start=source.indexOf('function(){'),end=source.indexOf('}.toString()})()`',start),fixture=source.slice(start,end+1).replace(/const actor=(.*?),photo=/,'const actor=1,photo=');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),artifacts=path.resolve(__dirname,'../artifacts'),samples=[];
withBrowser(async({call,evaluate,until:poll,click,delay,capture,errors})=>{
 const until=(condition,ms=60000)=>poll(condition,ms),node=id=>`document.querySelector('[data-testid="${id}"]')`;
 await call('Page.addScriptToEvaluateOnNewDocument',{source:`{
 localStorage.setItem('spottr-native.session.v1',JSON.stringify({version:1,token:'local-surface-qa',user:{id:'${id(1)}',username:'Franco QA',email:'surface@example.invalid',role:'user',hasPassword:true,preferredLanguage:'en'}}));
 }(${fixture})();{
 const qa=window.__permanentGroups,p=qa.group.outings[0],base=qa.group.members[0],count=Number(new URL(location.href).searchParams.get('members'))||1;
 qa.group.members=Array.from({length:count},(_,i)=>({...base,userId:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),username:i?'Alexandru-Mihai Popescu Ionescu '+i:'Franco QA',status:'accepted'}));
 p.members=qa.group.members.map(m=>({...m,attendance:'unanswered',hasTicket:false,ticketState:'none'}));p.confirmedCount=0;p.readyCount=0;p.ownerId=qa.group.ownerId;qa.tickets.splice(0);
 }`});
 const sample=async(label)=>{
  const data=await evaluate(`(()=>{const rect=n=>{if(!n)return null;const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}},v=${node('sheet-content-viewport')},footer=${node('outing-recipients-continue')},header=${node('group-recipient-sheet')};return{viewport:rect(v),footer:rect(footer),header:rect(header),screen:{width:innerWidth,height:innerHeight},scrolls:[...document.querySelectorAll('*')].filter(n=>n.scrollHeight>n.clientHeight+2&&['auto','scroll'].includes(getComputedStyle(n).overflowY)).map(n=>({id:n.dataset.testid,height:n.clientHeight,content:n.scrollHeight,top:n.scrollTop})),text:document.body.innerText}})()`);
  samples.push({label,...data});await capture('groups-ticket-surface-'+phase+'-'+label);return data;
 };
 for(const count of [1,8]){
  await call('Page.navigate',{url:origin+'/groups/'+id(20)+'/outings/'+id(30)+'?case=conversation&members='+count});await until(node('group-buy'));await click('group-buy');await until(node('outing-recipients-continue'));await delay(1500);
  const first=await sample('members-'+count+'-rest');
  const v=first.viewport;assert.ok(v&&v.height>100);
  // Physical pointer drag of the real library handle, sampled while held.
  const x=195,y=v.y+8;
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await call('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
  for(const dy of [30,90,160]){await call('Input.dispatchMouseEvent',{type:'mouseMoved',x,y:y+dy,button:'left',buttons:1});await delay(70);await sample('members-'+count+'-drag-'+dy)}
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x,y:y+160,button:'left',clickCount:1});await delay(800);await sample('members-'+count+'-release');
 }
 fs.writeFileSync(path.join(artifacts,'groups-ticket-surface-'+phase+'.json'),JSON.stringify({scope:'Actual RN Web routes with synthetic API fixtures; pointer drag, not UIKit touch',samples,errors},null,2));assert.deepEqual(errors.filter(e=>!e.includes('Failed to load resource')),[]);console.log('CAPTURED',phase,samples.length);
}).catch(error=>{fs.writeFileSync(path.join(artifacts,'groups-ticket-surface-'+phase+'-failure.json'),JSON.stringify({error:error.message,samples},null,2));console.error(error);process.exitCode=1});
