// Actual RN Web routes with synthetic data. Brightness/text scaling are deliberate
// browser stress conditions, not iOS Dynamic Type or a native Glass simulation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {withBrowser}=require('./browser-harness.cjs');
const origin=process.env.GROUPS_NATIVE_URL||'http://localhost:8083';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),out=path.resolve(__dirname,'../artifacts'),prefix='groups-16nov-photo-reference'+(process.env.GROUPS_QA_ONLY==='history'?'-history':'') ,checks=[],samples=[];
const source=fs.readFileSync(path.resolve(__dirname,'../../pulse-app/scripts/groups.browser.cjs'),'utf8'),a=source.indexOf('function(){'),b=source.indexOf('}.toString()})()`',a),fixture=source.slice(a,b+1).replace(/const actor=(.*?),photo=/,'const actor=1,photo=').replace("photo='/party-event.webp'",'photo='+JSON.stringify(origin+'/party-event.webp'));
const audit=fs.readFileSync(path.join(__dirname,'browser-chat-audit.cjs'),'utf8'),start=audit.indexOf('{source:`')+9,end=audit.indexOf('`});',start),bootstrap=audit.slice(start,end).replace('${fixture}',fixture);
const photo=path.resolve(__dirname,'../public/party-event.webp');if(!fs.existsSync(photo))fs.copyFileSync(path.resolve(__dirname,'../assets/party-event.webp'),photo);
withBrowser(async({call,evaluate,until:poll,capture,delay,errors})=>{
 const node=id=>`document.querySelector('[data-testid="${id}"]')`,until=(expr,ms=60000)=>poll(expr,ms),check=(ok,label)=>{checks.push({passed:!!ok,label});assert.ok(ok,label);console.log('PASS',label)};
 await call('Page.addScriptToEvaluateOnNewDocument',{source:bootstrap+`{
  const qa=window.__permanentGroups,p=qa.group.outings[0],params=new URL(location.href).searchParams,received=params.has('received'),kind=params.get('kind'),uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),e=qa.events[0];
  if(kind==='long')e.title='A long international headliner and a second live set throughout the closing night';
  if(kind==='missing')delete e.bannerUrl;
  p.members.forEach(m=>{m.attendance='unanswered';m.hasTicket=false;m.ticketState='none'});p.confirmedCount=0;p.readyCount=0;p.options[0].title=e.title;p.options[0].imageUrl=e.bannerUrl;
  const row={id:uid(109),requestId:uid(209),seq:1,senderId:uid(received?2:1),username:received?'Ana QA':'Franco QA',avatarUrl:location.origin+'/party-event.webp',kind:'event',eventId:e.id,content:'',createdAt:new Date().toISOString(),event:{id:e.id,title:e.title,city:e.city,location:e.locationName,startTime:e.startTime,endTime:e.endTime,status:e.status,imageUrl:e.bannerUrl},outingId:p.id,referenceMessageId:uid(109)};
  qa.messages.splice(0,qa.messages.length,row);qa.group.lastSeq=1;
  if(params.has('history')){
   row.outingContext={title:p.title,city:p.city,outingDate:p.outingDate,decisionRound:p.decisionRound||1,candidateDates:(p.candidateDates||[]).map(d=>d.date),chosenEventId:p.chosenEventId};
   const changed={...row,id:uid(110),requestId:uid(210),seq:2,kind:'outing',senderId:uid(2),username:'Ana QA',event:undefined,eventId:undefined,outingContext:{...row.outingContext,outingDate:'2026-11-21',decisionRound:(p.decisionRound||1)+1}};
   const unchanged={...changed,id:uid(111),requestId:uid(211),seq:3};
   qa.messages.push(changed,unchanged);qa.group.lastSeq=3;
  }
 }`});
 const read=async label=>{
  const data=await evaluate(`(()=>{const rect=n=>{if(!n)return null;const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}},card=${node('group-shared-preview-'+id(109))},cover=${node('group-shared-preview-'+id(109)+'-cover')},body=${node('group-shared-preview-'+id(109)+'-body')},actions=${node('group-shared-preview-'+id(109)+'-actions')},images=[...card.querySelectorAll('img')];return{width:innerWidth,documentWidth:document.documentElement.scrollWidth,card:rect(card),cover:rect(cover),body:rect(body),actions:rect(actions),bodyText:body.textContent,buttons:[...actions.querySelectorAll('[role="radio"],[role="checkbox"],[role="button"]')].map(n=>({id:n.dataset.testid,...rect(n)})),images:images.map(n=>({loaded:n.complete&&n.naturalWidth>0,src:n.currentSrc})),geometry:window.__chatAudit.geometry()}})()`);samples.push({label,...data});await capture(prefix+'-'+label);return data;
 };
 for(const {label,width=390,received=false,kind='normal',brightness=1,fontScale=1} of [
  {label:'outgoing-photo'}, {label:'incoming-photo',received:true}, {label:'bright-photo',brightness:2.5}, {label:'dark-photo',brightness:.35},
  {label:'narrow-320',width:320}, {label:'long-title-320',width:320,kind:'long'}, {label:'large-text-320',width:320,kind:'long',received:true,fontScale:1.4}, {label:'missing-image-320',width:320,kind:'missing'}
 ].filter(()=>process.env.GROUPS_QA_ONLY!=='history')){
  await call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await call('Page.navigate',{url:origin+'/groups/'+id(20)+'?case=conversation&chatCase=cards&pinned=1&kind='+kind+(received?'&received=1':'')});await until(node('group-chat-response-yes'));await delay(450);
  if(kind!=='missing')await until(`(()=>{const images=[...${node('group-shared-preview-'+id(109))}.querySelectorAll('img')];return images.length>0&&images.every(n=>n.complete&&n.naturalWidth>0)})()`);
  if(brightness!==1)await evaluate(`[...${node('group-shared-preview-'+id(109))}.querySelectorAll('img')].forEach(n=>n.style.filter='brightness(${brightness})')`);
  if(fontScale!==1)await evaluate(`[...${node('group-shared-preview-'+id(109))}.querySelectorAll('[dir="auto"]')].forEach(n=>{const s=getComputedStyle(n);n.style.fontSize=(parseFloat(s.fontSize)*${fontScale})+'px';n.style.lineHeight=(parseFloat(s.lineHeight)*${fontScale})+'px'})`);
  await delay(160);const current=await read(label);check(current.documentWidth<=width+1&&current.card.x>=0&&current.card.right<=width+.5,label+' remains within the viewport');
  check(current.body.y>=current.cover.y-.5&&current.body.bottom<=current.cover.bottom+.5,label+' date/title/place are on the photo');
  check(current.actions.y>=current.cover.bottom-.5&&current.actions.height<=100*fontScale+.5,label+' response footer is bounded and separate');
  check(current.buttons.every(n=>n.height>=43.5),label+' direct controls retain accessible targets');
  if(kind==='normal')check(current.cover.height>=150&&current.cover.height<=160,label+' reserves the requested compact photograph');
  if(kind==='long')check(current.bodyText.includes('throughout the closing night'),label+' retains the complete long title');
  await delay(600);const stable=await evaluate(`${node('group-shared-preview-'+id(109))}.getBoundingClientRect().height`);check(Math.abs(stable-current.card.height)<.5,label+' has no delayed growth');
 }
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await call('Page.navigate',{url:origin+'/groups/'+id(20)+'?case=conversation&chatCase=cards&pinned=1&history=1'});
 await until(node('group-system-update-'+id(110)));await delay(350);
 const history=await evaluate(`(()=>{const updates=[...document.querySelectorAll('[data-testid^="group-system-update-"]')];return{updates:updates.map(n=>n.textContent),genericVisible:!!${node('group-system-update-'+id(111))},oldSheet:!!${node('group-history-sheet')},posters:document.querySelectorAll('[data-testid^="group-shared-preview-"][data-testid$="-cover"]').length,raw:window.__permanentGroups.messages.map(m=>({id:m.id,kind:m.kind,username:m.username,seq:m.seq})),geometry:window.__chatAudit.geometry()}})()`);
 samples.push({label:'compact-history',...history});await capture(prefix+'-compact-history');
 check(history.updates.length===1&&history.updates[0]==='Ana QA changed the outing date.','Only the proven update appears with its original author');
 check(!history.genericVisible&&!history.oldSheet,'Unchanged versions and the old history sheet are absent from chat');
 check(history.posters===1&&history.raw.length===3,'One event poster retains all three raw messages');
 await evaluate(`${node('group-shared-preview-'+id(109)+'-cover')}.click()`);
 await until(node('group-open-history'));await evaluate(`${node('group-open-history')}.click()`);await until(node('group-history-entry-'+id(111)));
 const detail=await evaluate(`(()=>{const n=${node('group-history-entries')};return{entries:n.querySelectorAll('[data-testid^="group-history-entry-"]').length,text:n.textContent}})()`);samples.push({label:'detail-history',...detail});await evaluate(`${node('group-history-entries')}.scrollIntoView({block:'start',behavior:'instant'})`);await delay(200);await capture(prefix+'-detail-history');
 check(detail.entries===2&&detail.text.includes('Ana QA'),'The detail disclosure retains both raw outing versions');
 check(errors.length===0,'No browser runtime errors');fs.writeFileSync(path.join(out,prefix+'-results.json'),JSON.stringify({scope:'Actual RN Web with synthetic local data, real repository photograph and CSS brightness/text stress; not UIKit/Dynamic Type',checks,samples,errors},null,2));console.log('COMPLETE',checks.length);
}).catch(error=>{fs.writeFileSync(path.join(out,prefix+'-failure.json'),JSON.stringify({error:error.message,checks,samples},null,2));console.error(error);process.exitCode=1});
