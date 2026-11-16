// Actual RN Web navigation, isolated synthetic data. Browser viewport resizing
// simulates available space, NOT the iOS keyboard driver or physical gestures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {withBrowser}=require('./browser-harness.cjs');
const origin=process.env.GROUPS_NATIVE_URL||'http://localhost:8083';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('LOCAL_PREVIEW_REQUIRED');
const source=fs.readFileSync(path.resolve(__dirname,'../../pulse-app/scripts/groups.browser.cjs'),'utf8');
const start=source.indexOf('function(){'),end=source.indexOf('}.toString()})()`',start);
if(start<0||end<start)throw Error('Shared fixture not found');
const fixture=source.slice(start,end+1).replace(/const actor=(.*?),photo=/,"const actor=1,photo=");
const phase=process.env.CHAT_AUDIT_PHASE||'after',historyOnly=process.env.CHAT_AUDIT_ONLY==='history',artifacts=path.resolve(__dirname,'../artifacts');
const prefix='chat-audit-'+phase,id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),group=id(20);
fs.mkdirSync(artifacts,{recursive:true});
const photo=path.resolve(__dirname,'../public/party-event.webp'),existed=fs.existsSync(photo);
if(!existed)fs.copyFileSync(path.resolve(__dirname,'../assets/party-event.webp'),photo);
const samples=[],checks=[];

withBrowser(async({call,evaluate,until:poll,click,input,delay,capture,errors,onCDPEvent})=>{
 const until=(expr,timeout=60000)=>poll(expr,timeout),node=key=>`document.querySelector('[data-testid="${key}"]')`;
 await call('Page.addScriptToEvaluateOnNewDocument',{source:`{
  const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  localStorage.setItem('spottr-native.session.v1',JSON.stringify({version:1,token:'isolated-chat-audit',user:{id:id(1),username:'Franco QA',email:'chat1@example.invalid',role:'user',hasPassword:true,preferredLanguage:'en',createdAt:'2026-01-01T00:00:00Z',avatarUrl:'/party-event.webp'}}));
 }(${fixture})();{
  const qa=window.__permanentGroups,params=new URL(location.href).searchParams,variant=params.get('chatCase')||'cards',id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  const make=(index,text)=>({id:id(5000+index),requestId:id(6000+index),seq:index+1,senderId:id(index%2?1:2),username:index%2?'Franco QA':'Ana QA',avatarUrl:'/party-event.webp',kind:'text',content:text,createdAt:new Date(Date.now()-(101-index)*60000).toISOString()});
  if(variant!=='cards'){
   const count=({empty:0,one:1,three:3,long:1,hundred:100})[variant]??0;
   const rows=Array.from({length:count},(_,i)=>make(i,variant==='long'?('A longer message that must scroll because of its measured height, rather than the number of messages. ').repeat(22):variant==='hundred'?'Message '+(i+1)+' for the isolated scroll history test.':'Hhh'));
   qa.messages.splice(0,qa.messages.length,...rows.reverse());qa.group.lastSeq=count;
   if(params.get('pinned')!=='1')qa.group.outings.splice(0);
  }
  window.__chatAudit={variant,receivedSeq:qa.group.lastSeq};
  window.__chatAudit.insertIncoming=()=>{const row=make(++window.__chatAudit.receivedSeq,'A new incoming QA message');row.senderId=id(2);qa.messages.unshift(row);qa.group.lastSeq=row.seq;qa.group.revision++};
  window.__chatAudit.geometry=()=>{
   const rect=n=>{if(!n)return null;const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,bottom:r.bottom,right:r.right}},list=document.querySelector('[data-testid="group-messages"]'),composer=document.querySelector('[data-testid="group-composer-row"]'),root=document.querySelector('[data-testid="friend-group"]'),input=document.querySelector('[data-testid="group-composer"]'),pinned=document.querySelector('[data-testid="group-summary"]');
   if(!list||!composer||!root)return null;
   const scroller=getComputedStyle(list).overflowY==='auto'||getComputedStyle(list).overflowY==='scroll'?list:[...list.querySelectorAll('*')].find(n=>['auto','scroll'].includes(getComputedStyle(n).overflowY))||list;
   const messages=[...list.querySelectorAll('[data-testid^="group-message-"]')].map(n=>({id:n.dataset.testid,...rect(n)})),view=rect(scroller),comp=rect(composer),content=scroller.firstElementChild;
   return{variant,pinned:!!pinned,viewportHeight:scroller.clientHeight,contentHeight:scroller.scrollHeight,naturalContentHeight:content?.getBoundingClientRect().height,scrollRange:Math.max(0,scroller.scrollHeight-scroller.clientHeight),offset:scroller.scrollTop,insets:{top:0,bottom:0,source:'browser layout; UIKit insets not available'},safeArea:{top:0,bottom:0,source:'browser emulation'},keyboard:{simulatedViewportReduction:844-innerHeight,nativeProgress:null},composerHeight:comp.height,pinnedSummaryHeight:pinned?rect(pinned).height:0,list:view,composer:comp,input:rect(input),root:rect(root),content:rect(content),inverted:getComputedStyle(scroller).transform,renderedMessages:messages.length,messages,latest:messages.find(n=>n.id==='group-message-'+qa.messages[0]?.id),emptyButton:[...list.querySelectorAll('[role="button"]')].map(n=>({text:n.textContent,...rect(n)})),atLatest:Math.abs(scroller.scrollTop)<70,documentWidth:document.documentElement.scrollWidth};
  };
 }`});
 const open=async(variant,pinned=false)=>{await call('Page.navigate',{url:origin+'/groups/'+group+'?case=conversation&chatCase='+variant+(pinned?'&pinned=1':'')});await until('window.__chatAudit?.geometry()');await delay(250)};
 const measure=async label=>{const value=await evaluate('window.__chatAudit.geometry()');samples.push({label,...value});console.log('GEOMETRY',label,JSON.stringify({viewport:value.viewportHeight,content:value.contentHeight,range:value.scrollRange,offset:value.offset,composer:value.composerHeight,summary:value.pinnedSummaryHeight,mounted:value.renderedMessages,latestBottom:value.latest?.bottom,composerTop:value.composer.top}));return value};
 const shot=async label=>capture(prefix+'-'+label);
 const check=(ok,label)=>{checks.push({ok:!!ok,label});if(phase!=='before')assert.ok(ok,label)};
 if(!historyOnly){
 for(const variant of ['empty','one','three','long','hundred']){
  await open(variant);const cold=await measure(variant+'-cold');await shot(variant+'-cold');
  check(cold.documentWidth<=391,variant+' fits width');
  if(['empty','one','three'].includes(variant))check(cold.scrollRange<=2,variant+' has no artificial scroll range');
  if(cold.latest)check(cold.latest.bottom<=cold.composer.top+.5,variant+' latest metadata above composer');
  if(variant==='empty')check(cold.emptyButton.length===0,'Empty conversation has no redundant action under composer');
  if(variant==='hundred')check(cold.renderedMessages<50,'Long conversation virtualizes the first page');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:520,deviceScaleFactor:1,mobile:true});await delay(220);const keyboard=await measure(variant+'-reduced-viewport');await shot(variant+'-reduced-viewport');
  if(['empty','one','three'].includes(variant))check(keyboard.scrollRange<=2,variant+' short content fits reduced viewport');
  if(keyboard.latest&&variant!=='long')check(keyboard.latest.bottom<=keyboard.composer.top+.5,variant+' keyboard-resized latest metadata visible');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(180);
 }
 for(const variant of ['empty','one','three']){await open(variant,true);const value=await measure(variant+'-pinned');await shot(variant+'-pinned');check(value.scrollRange<=2,variant+' fits with pinned summary');if(value.latest)check(value.latest.bottom<=value.composer.top+.5,variant+' pinned latest visible')}
 await open('one');await input('group-composer',Array.from({length:9},(_,i)=>'Composer line '+(i+1)).join('\n'));await delay(250);let multiline=await measure('multiline');await shot('multiline');check(multiline.latest.bottom<=multiline.composer.top+.5,'Multiline composer never covers latest message');check(multiline.input.height>44&&multiline.input.height<=220.5,'Multiline composer grows with bounded intrinsic height');
 await input('group-composer','Hhh');await delay(150);const shrink=await measure('composer-shrink');check(shrink.composerHeight<multiline.composerHeight,'Deleting multiline content shrinks composer');
 await evaluate('window.__permanentGroups.holdNextSend=true');await click('group-send');await until('typeof window.__permanentGroups.releaseSend==="function"');await shot('send-pending');await evaluate('window.__permanentGroups.releaseSend()');await until('window.__permanentGroups.messages.length===2');await until('!'+node('group-send'));await delay(180);const sent=await measure('send-settled');check(sent.latest.bottom<=sent.composer.top+.5,'Sent message and metadata visible');check(await evaluate('new Set(window.__permanentGroups.messages.map(m=>m.requestId)).size===window.__permanentGroups.messages.length'),'Sending creates one stable request/message');await shot('send-settled');
 }

 // Native inversion is mirrored by RN Web; positive scroll offsets read history.
 await open('hundred');await evaluate(`{const n=${node('group-messages')};n.scrollTop=500;n.dispatchEvent(new Event('scroll'));}`);await delay(250);const history=await measure('history-anchor');await shot('history-anchor');
 const anchor=history.messages.find(m=>m.top>=history.list.top&&m.bottom<=history.list.bottom);
 if(anchor){await call('Emulation.setDeviceMetricsOverride',{width:390,height:700,deviceScaleFactor:1,mobile:true});await delay(220);const after=await measure('history-resized'),retained=after.messages.find(m=>m.id===anchor.id);check(!!retained,'History retains the visible message when viewport changes');await shot('history-resized')}
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await delay(250);const beforeIncoming=await measure('history-before-incoming'),incomingAnchor=beforeIncoming.messages.find(m=>m.top>=beforeIncoming.list.top&&m.bottom<=beforeIncoming.list.bottom);
 await evaluate(`window.__chatAudit.scrollEvents=[];${node('group-messages')}.addEventListener('scroll',e=>window.__chatAudit.scrollEvents.push({offset:e.target.scrollTop,ms:performance.now()}));window.__chatAudit.insertIncoming()`);await delay(5500);const incoming=await measure('history-after-incoming');await shot('history-incoming');samples.push({label:'incoming-scroll-events',value:await evaluate('({events:window.__chatAudit.scrollEvents,reads:window.__permanentGroups.writes.filter(w=>w.route.endsWith("/read")),latest:window.__permanentGroups.messages[0],newButton:!!document.querySelector("[data-testid=group-new-messages]")})')});await until(node('group-new-messages'),1500);
 check(incoming.offset>70,'Incoming message does not jump a history reader to latest');
 if(incomingAnchor){const retained=incoming.messages.find(m=>m.id===incomingAnchor.id);samples.push({label:'history-incoming-anchor',id:incomingAnchor.id,beforeTop:incomingAnchor.top,afterTop:retained?.top,delta:retained?retained.top-incomingAnchor.top:null});check(!!retained&&Math.abs(retained.top-incomingAnchor.top)<2,'Incoming message preserves the visible history anchor without moving the composer')}
 await click('group-new-messages');await delay(400);const atLatest=await measure('new-message-button');check(atLatest.offset<2&&atLatest.latest.bottom<=atLatest.composer.top+.5,'New messages button reaches the visible latest message');
 await open('hundred');await evaluate(`{const list=${node('group-messages')},older=[...list.querySelectorAll('[role="button"]')].find(n=>n.textContent.includes('Earlier messages'));older.dataset.testid='group-older-qa';older.scrollIntoView({block:'end'});list.dispatchEvent(new Event('scroll'))}`);await delay(350);
 const beforeOlder=await measure('history-before-pagination'),olderAnchor=beforeOlder.messages.find(m=>m.top>=beforeOlder.list.top&&m.bottom<=beforeOlder.list.bottom);
 await evaluate(`${node('group-older-qa')}.click()`);await until('window.__permanentGroups.reads.some(r=>r.includes("before=51"))');await delay(350);const older=await measure('history-after-pagination');await shot('history-older');
 check(older.renderedMessages<75,'Loading second history page remains virtualized');
 if(olderAnchor){const retained=older.messages.find(m=>m.id===olderAnchor.id);samples.push({label:'history-pagination-anchor',id:olderAnchor.id,beforeTop:olderAnchor.top,afterTop:retained?.top,delta:retained?retained.top-olderAnchor.top:null});check(!!retained&&Math.abs(retained.top-olderAnchor.top)<12,'Pagination preserves the visible history anchor')}
 if(historyOnly){fs.writeFileSync(path.join(artifacts,prefix+'-history.json'),JSON.stringify({samples,checks,errors},null,2));console.log('History checks passed');return}
 await open('cards',true);await until(node('group-chat-response'));const cards=await measure('cards');await shot('cards');
 const invitation=await evaluate(`{const n=${node('group-chat-response')};const c=n.closest('[data-testid^="group-message-"]');({height:c.getBoundingClientRect().height,radios:n.querySelectorAll('[role=radio]').length,selected:n.querySelectorAll('[aria-checked=true]').length})}`);samples.push({label:'invitation',...invitation});check(invitation.radios===2,'Invitation retains two direct attendance choices');

 // Continuous browser navigation recording. It is not an iPhone video and the
 // JPEG timestamps remain alongside frames, so no synthetic 60fps claim is made.
 const framesDir=path.join(artifacts,prefix+'-recording');fs.mkdirSync(framesDir,{recursive:true});const frames=[];let recording=false;
 const unsubscribe=onCDPEvent(message=>{if(message.method!=='Page.screencastFrame')return;const p=message.params;call('Page.screencastFrameAck',{sessionId:p.sessionId}).catch(()=>{});if(!recording)return;const name='frame-'+String(frames.length).padStart(5,'0')+'.jpg';fs.writeFileSync(path.join(framesDir,name),Buffer.from(p.data,'base64'));frames.push({file:name,timestamp:p.metadata.timestamp})});
 recording=true;await call('Page.startScreencast',{format:'jpeg',quality:75,maxWidth:390,maxHeight:844,everyNthFrame:1});
 await delay(450);await click('group-summary');await until(node('group-outing'));await delay(700);await click('group-outing-back');await until(node('group-composer'));await input('group-composer','See you there');await delay(450);await click('group-send');await until('window.__permanentGroups.messages.some(m=>m.content==="See you there")');await delay(900);
 await call('Page.stopScreencast');recording=false;unsubscribe();fs.writeFileSync(path.join(framesDir,'frames.json'),JSON.stringify({kind:'Chrome CDP screencast; synthetic local data',frames},null,2));
 fs.writeFileSync(path.join(artifacts,prefix+'-measurements.json'),JSON.stringify({phase,fixture:'synthetic local API; actual RN Web navigation',keyboard:'Chrome viewport resize, not native keyboard',samples,checks,recording:{directory:framesDir,frameCount:frames.length},errors},null,2));
 assert.deepEqual(errors.filter(e=>!e.includes('Failed to load resource')),[]);console.log('COMPLETE',prefix,'checks',checks.length,'failed',checks.filter(c=>!c.ok).length,'recordingFrames',frames.length);
}).catch(error=>{fs.writeFileSync(path.join(artifacts,prefix+'-failure.json'),JSON.stringify({message:error.message,samples,checks},null,2));console.error(error);process.exitCode=1}).finally(()=>{if(!existed&&fs.existsSync(photo))fs.unlinkSync(photo)});
