// Native-product browser QA: actual navigation, synthetic local messages only.
// Browser viewport changes and browser Back are not UIKit keyboard/swipe tests.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {withBrowser}=require('./browser-harness.cjs');
const origin=process.env.GROUPS_NATIVE_URL||'http://localhost:8083',phase=process.env.CHAT_RETURN_PHASE||'after';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('LOCAL_PREVIEW_REQUIRED');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),group=id(20),prefix='chat-return-'+phase;
const artifacts=path.resolve(__dirname,'../artifacts'),samples=[],checks=[],events=[];
const shared=fs.readFileSync(path.resolve(__dirname,'../../pulse-app/scripts/groups.browser.cjs'),'utf8');
const a=shared.indexOf('function(){'),b=shared.indexOf('}.toString()})()`',a);
const fixture=shared.slice(a,b+1).replace(/const actor=(.*?),photo=/,'const actor=1,photo=');
// Reuse the established isolated bootstrap and geometry instrumentation.
const chat=fs.readFileSync(path.join(__dirname,'browser-chat-audit.cjs'),'utf8'),begin=chat.indexOf('{source:`')+9,end=chat.indexOf('`});',begin);
if(a<0||b<a||begin<9||end<begin)throw Error('QA bootstrap not found');
const bootstrap=chat.slice(begin,end).replace('${fixture}',fixture);
const photo=path.resolve(__dirname,'../public/party-event.webp'),existed=fs.existsSync(photo);
if(!existed)fs.copyFileSync(path.resolve(__dirname,'../assets/party-event.webp'),photo);
const asset=fs.readFileSync(path.resolve(__dirname,'../assets/party-event.webp'));
const imageServer=http.createServer((req,res)=>{res.setHeader('access-control-allow-origin','*');if(req.url.startsWith('/missing')){res.writeHead(404);res.end();return}if(req.url.startsWith('/poster')){res.setHeader('content-type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="white"/><text x="20" y="65" font-size="42" fill="black">QA FULL POSTER TOP</text><text x="20" y="460" font-size="42" fill="black">EVENT TITLE</text><text x="20" y="860" font-size="36" fill="black">QA POSTER BOTTOM</text></svg>');return}const send=()=>{res.setHeader('content-type','image/webp');res.end(asset)};req.url.startsWith('/delayed')?setTimeout(send,2200):send()});
(async()=>{
 await new Promise(resolve=>imageServer.listen(0,'127.0.0.1',resolve));const imageBase='http://127.0.0.1:'+imageServer.address().port;
 await withBrowser(async({call,evaluate,until:poll,click,delay,capture,errors,onCDPEvent})=>{
  const until=(expression,timeout=60000)=>poll(expression,timeout),node=key=>`document.querySelector('[data-testid="${key}"]')`;
  await call('Page.addScriptToEvaluateOnNewDocument',{source:bootstrap+`{
   const q=window.__permanentGroups,params=new URL(location.href).searchParams,img=params.get('imageMode');
   if(params.get('chatCase')==='five'){q.messages.splice(0,q.messages.length,...Array.from({length:5},(_,i)=>({id:'00000000-0000-4000-8000-'+String(5500+i).padStart(12,'0'),requestId:'00000000-0000-4000-8000-'+String(6500+i).padStart(12,'0'),seq:5-i,senderId:q.group.members[i%2].userId,username:'Fixture user',kind:'text',content:'Short message '+(5-i),createdAt:new Date().toISOString()})));q.group.lastSeq=5}
   if(img){const url='${imageBase}/'+img+'?v='+Date.now();q.events.forEach(e=>e.bannerUrl=url);q.messages.forEach(m=>{if(m.event)m.event.imageUrl=url});q.group.outings.forEach(p=>p.options.forEach(e=>e.imageUrl=url))}
   window.__returnAudit={trace:[],listNode:null,mounts:0,unmounts:0};
   const record=kind=>{const q=window.__returnAudit,list=document.querySelector('[data-testid="group-messages"]');q.trace.push({kind,ms:performance.now(),route:location.pathname,focused:document.activeElement?.getAttribute('data-testid')||null,mounted:!!list,offset:list?.scrollTop,viewport:list?.clientHeight,content:list?.scrollHeight,rows:list?[...list.querySelectorAll('[data-testid^="group-message-"]')].map(n=>({id:n.dataset.testid,height:n.getBoundingClientRect().height})):[]})};
   const observed=new WeakSet(),resize=new ResizeObserver(()=>record('resize'));
   const observeGeometry=()=>{for(const n of document.querySelectorAll('[data-testid="group-messages"], [data-testid^="group-message-"], [data-testid$="-cover"], [data-testid="group-composer-row"]'))if(!observed.has(n)){observed.add(n);resize.observe(n)}};
   for(const type of ['focusin','focusout'])document.addEventListener(type,()=>record(type));
   const originalPush=history.pushState,originalReplace=history.replaceState;history.pushState=function(...args){originalPush.apply(this,args);record('push')};history.replaceState=function(...args){originalReplace.apply(this,args);record('replace')};addEventListener('popstate',()=>record('pop'));
   new MutationObserver(()=>{const q=window.__returnAudit,n=document.querySelector('[data-testid="group-messages"]');if(n!==q.listNode){if(q.listNode)q.unmounts++;if(n){q.mounts++;n.addEventListener('scroll',()=>record('scroll'))}q.listNode=n;record('list-identity')}observeGeometry()}).observe(document,{subtree:true,childList:true});
  }`});
  const measure=async(label)=>{const g=await evaluate('window.__chatAudit.geometry()');const meta=await evaluate(`(()=>{const q=window.__returnAudit;return{route:location.pathname,focused:document.activeElement?.getAttribute('data-testid')||null,documentFocus:document.hasFocus(),mounts:q.mounts,unmounts:q.unmounts,listVisibility:q.listNode?getComputedStyle(q.listNode).visibility:null,listDisplay:q.listNode?getComputedStyle(q.listNode).display:null}})()`);const item={label,...g,...meta};samples.push(item);console.log('RETURN',label,JSON.stringify({route:meta.route,viewport:g?.viewportHeight,offset:g?.offset,range:g?.scrollRange,mounted:g?.renderedMessages,visible:g?.messages?.filter(m=>m.bottom>g.list.top&&m.top<g.list.bottom).length,latest:g?.latest?.bottom,composer:g?.composer?.top,mounts:meta.mounts}));return item};
  const check=(ok,label)=>{checks.push({ok:!!ok,label});if(phase!=='before')assert.ok(ok,label)};
  const open=async(variant,extra='')=>{await call('Page.navigate',{url:origin+'/groups/'+group+'?case=conversation&chatCase='+variant+'&pinned=1'+extra});await until('window.__chatAudit?.geometry()');await delay(250)};
  const pick=async()=>{await click('group-add');await until(node('group-open-events'));await click('group-open-events');await until(node('group-event-picker-page'));await until(node('group-send-event-'+id(10)));await measure('picker-blurred-chat')};
  const back=async(method='button')=>{method==='history'?await evaluate('history.back()'):await click('group-event-picker-page-back');await until(`location.pathname==='/groups/${group}'`);await until(node('group-messages'));await delay(320)};
  const visible=m=>m.messages?.filter(x=>x.bottom>m.list.top&&x.top<m.list.bottom)||[];
  const framesDir=path.join(artifacts,prefix+'-recording');fs.mkdirSync(framesDir,{recursive:true});const frames=[];
  const unsubscribe=onCDPEvent(message=>{if(message.method!=='Page.screencastFrame')return;const p=message.params;call('Page.screencastFrameAck',{sessionId:p.sessionId}).catch(()=>{});const file='frame-'+String(frames.length).padStart(5,'0')+'.jpg';fs.writeFileSync(path.join(framesDir,file),Buffer.from(p.data,'base64'));frames.push({file,timestamp:p.metadata.timestamp})});
  await open('cards');await capture(prefix+'-cards-before');const original=await measure('cards-cold');
  await call('Page.startScreencast',{format:'jpeg',quality:75,maxWidth:390,maxHeight:844,everyNthFrame:1});
  for(let i=0;i<5;i++){await pick();await back(i%2?'history':'button');const after=await measure('cards-return-'+i);check(visible(after).length>0,'Repeated selector return '+i+' has real visible messages');check(Math.abs(after.offset-original.offset)<2,'Repeated selector return '+i+' preserves latest offset')}
  await pick();const count=await evaluate('window.__permanentGroups.messages.length');await click('group-send-event-'+id(10));await until(`location.pathname==='/groups/${group}'`);await until('window.__permanentGroups.messages.length==='+String(count+1));await delay(450);const sent=await measure('cards-shared-event');await capture(prefix+'-cards-shared-event');check(visible(sent).length>0,'Sharing returns to visible conversation');check(!!sent.latest&&sent.latest.bottom<=sent.composer.top+1&&sent.latest.bottom>sent.list.top,'Shared event latest row and timestamp are above composer');check(await evaluate('window.__permanentGroups.writes.filter(w=>w.route.endsWith("/messages")&&w.body.eventId).length===1'),'Share issues exactly one request/message');
  await delay(1800);const settledShare=await measure('cards-shared-event-settled');check(Math.abs(settledShare.latest.height-sent.latest.height)<1,'Shared card does not keep growing after its first layout');check(Math.abs(settledShare.contentHeight-sent.contentHeight)<1,'Sharing does not produce an increasing scroll-content feedback loop');
  await call('Page.stopScreencast');unsubscribe();fs.writeFileSync(path.join(framesDir,'frames.json'),JSON.stringify({kind:'Chrome CDP; synthetic data; Back button and browser Back, not native swipe',frames},null,2));events.push(...await evaluate('window.__returnAudit.trace'));
  for(const viewport of [844,520]){
   await call('Emulation.setDeviceMetricsOverride',{width:390,height:viewport,deviceScaleFactor:1,mobile:true});await open('hundred');
   await evaluate(`{const n=${node('group-messages')};n.scrollTop=500;n.dispatchEvent(new Event('scroll'))}`);await delay(250);const before=await measure('history-'+viewport+'-before'),anchor=before.messages.find(m=>m.top>=before.list.top&&m.bottom<=before.list.bottom);
   await pick();await back();const restored=await measure('history-'+viewport+'-back'),retained=anchor&&restored.messages.find(m=>m.id===anchor.id);check(visible(restored).length>0,'History return '+viewport+' has real visible messages');check(!!retained&&Math.abs(retained.top-anchor.top)<2,'History anchor survives selector Back at '+viewport);await capture(prefix+'-history-'+viewport+'-back');
   await pick();await click('group-send-event-'+id(11));await until(`location.pathname==='/groups/${group}'`);await delay(450);const share=await measure('history-'+viewport+'-share');check(visible(share).length>0,'History share '+viewport+' returns to real visible content');await capture(prefix+'-history-'+viewport+'-share');events.push(...await evaluate('window.__returnAudit.trace'));
  }
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  for(const variant of ['empty','one','five']){await open(variant);await pick();await back();const m=await measure(variant+'-back');check(m.scrollRange<=2,variant+' return has no artificial scroll range');if(variant!=='empty')check(visible(m).length>0,variant+' return has visible message')}
  for(const mode of ['delayed','missing','poster']){await open('cards','&imageMode='+mode);const early=await measure('image-'+mode+'-early');await capture(prefix+'-image-'+mode+'-early');await delay(2700);const loaded=await measure('image-'+mode+'-settled');await capture(prefix+'-image-'+mode+'-settled');check(Math.abs(loaded.contentHeight-early.contentHeight)<2,'Image '+mode+' preserves reserved content geometry');check(Math.abs(loaded.offset-early.offset)<2,'Image '+mode+' does not shift list offset');events.push(...await evaluate('window.__returnAudit.trace'))}
  check(errors.length===0,'No browser runtime errors during selector return and image resizing');
  fs.writeFileSync(path.join(artifacts,prefix+'-results.json'),JSON.stringify({phase,scope:'Actual RN Web navigation; synthetic local fixtures. Reduced browser viewport is not a native keyboard. Browser Back is not iOS interactive swipe.',samples,checks,trace:events,recording:{frames:frames.length,directory:framesDir},errors},null,2));console.log('COMPLETE',checks.length,'failed',checks.filter(c=>!c.ok).length,'errors',errors.length);
 });
})().catch(error=>{fs.writeFileSync(path.join(artifacts,prefix+'-failure.json'),JSON.stringify({error:error.message,samples,checks,trace:events},null,2));console.error(error);process.exitCode=1}).finally(()=>{imageServer.close();if(!existed&&fs.existsSync(photo))fs.unlinkSync(photo)});
