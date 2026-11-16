// Layout QA through actual RN Web routes. All API data is synthetic and local;
// this checks fallback surfaces, not UIKit/Liquid Glass or physical keyboard.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {withBrowser}=require('./browser-harness.cjs');
const origin=process.env.GROUPS_NATIVE_URL||'http://localhost:8083';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('LOCAL_PREVIEW_REQUIRED');
const source=fs.readFileSync(path.resolve(__dirname,'../../pulse-app/scripts/groups.browser.cjs'),'utf8');
const start=source.indexOf('function(){'),end=source.indexOf('}.toString()})()`',start);
const fixture=source.slice(start,end+1).replace(/const actor=(.*?),photo=/,'const actor=1,photo=');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),group=id(20),plan=id(30);
const artifacts=path.resolve(__dirname,'../artifacts'),photo=path.resolve(__dirname,'../public/party-event.webp'),existed=fs.existsSync(photo);
if(!existed)fs.copyFileSync(path.resolve(__dirname,'../assets/party-event.webp'),photo);
const measures=[];
withBrowser(async({call,evaluate,until:poll,input,delay,capture,errors})=>{
 const until=(expr,ms=60000)=>poll(expr,ms),node=key=>`document.querySelector('[data-testid="${key}"]')`;
 await call('Page.addScriptToEvaluateOnNewDocument',{source:`{
  const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  localStorage.setItem('spottr-native.session.v1',JSON.stringify({version:1,token:'isolated-sheet-audit',user:{id:id(1),username:'Franco QA',email:'group1@example.invalid',role:'user',hasPassword:true,preferredLanguage:'en',createdAt:'2026-01-01T00:00:00Z',avatarUrl:'/party-event.webp'}}));
 }(${fixture})();{
  const qa=window.__permanentGroups,params=new URL(location.href).searchParams,count=Number(params.get('members'))||3,p=qa.group.outings[0],base=qa.group.members[0];
  qa.group.name=count===8?'':'Noi QA';p.ownerId=qa.group.ownerId;
  qa.group.members=Array.from({length:count},(_,i)=>({...base,userId:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),username:count===8?'Alexandru-Mihai Popescu Ionescu '+(i+1):i?'Ana QA':'Franco QA',status:'accepted'}));
  p.members=qa.group.members.map(m=>({...m,attendance:'unanswered',hasTicket:false,ticketState:'none'}));p.confirmedCount=0;p.readyCount=0;p.allConfirmedReady=false;qa.tickets.splice(0);
  if(params.get('case')==='proposals-owner')p.options=qa.events.slice(0,2).map(e=>({...p.options[0],eventId:e.id,title:e.title,startTime:e.startTime,imageUrl:e.bannerUrl,location:e.locationName,available:true}));
 }`});
 const press=async key=>{await until(node(key));await evaluate(`${node(key)}.scrollIntoView({block:'nearest'})`);let previous='';for(let i=0;i<24;i++){const raw=await evaluate(`(()=>{const outer=${node(key)},n=outer.querySelector('[role=button]')||outer,r=n.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2,hit:n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})})()`),p=JSON.parse(raw);if(previous===raw&&p.hit){await call('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});return}previous=raw;await delay(70)}throw Error('Target covered '+key)};
 const open=async(route,count=3,mode='conversation')=>{await call('Page.navigate',{url:origin+route+'?'+new URLSearchParams({case:mode,members:count})});await until('window.__permanentGroups');await until(node(route.endsWith('/info')?'group-info':'group-outing'))};
 const shot=async(name,sheetId)=>{await delay(1550);await capture('chat-audit-final-'+name);const value=await evaluate(`(()=>{const rect=n=>{if(!n)return null;const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}},sheet=${sheetId?node(sheetId):'null'},viewport=document.querySelector('[data-testid="sheet-content-viewport"]'),foot=document.querySelector('[data-testid="outing-recipients-continue"],[data-testid="group-save-context"],[data-testid="group-confirm-choice"]');return{width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,sheet:rect(sheet),contentViewport:rect(viewport),ancestors:viewport?Array.from((function*(n){for(let i=0;n&&i<6;i++,n=n.parentElement)yield n})(viewport)).map(n=>({rect:rect(n),style:n.getAttribute('style')})):[],footer:rect(foot),dialogs:document.querySelectorAll('[role="dialog"]').length,scrolls:sheet?[...sheet.querySelectorAll('*')].filter(n=>getComputedStyle(n).overflowY==='auto'||getComputedStyle(n).overflowY==='scroll').map(n=>({client:n.clientHeight,scroll:n.scrollHeight,rect:rect(n)})):[],text:(sheet||document.body).innerText}})()`);measures.push({name,...value});assert.ok(value.documentWidth<=value.width+1,name+' has no horizontal overflow');if(value.footer){assert.ok(value.footer.x>=0&&value.footer.right<=value.width+1,name+' footer fits width');assert.ok(value.footer.bottom<=value.height+1&&value.footer.y>=0,name+' footer remains visible')}console.log('LAYOUT',name,JSON.stringify({width:value.width,footer:value.footer,viewport:value.contentViewport,scrolls:value.scrolls.map(s=>({client:s.client,scroll:s.scroll}))}));return value};
 for(const width of [320,390]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
  for(const count of [1,8]){
   await open('/groups/'+group+'/outings/'+plan,count);await until(node('group-buy'));await press('group-buy');await until(node('group-recipient-sheet'));
   await until(node('outing-recipient-'+id(1)));await shot('recipients-'+count+'-'+width,'group-recipient-sheet');
   assert.equal(await evaluate('document.querySelectorAll("[data-testid^=outing-recipient-]").length'),count);
   if(count===8){
    for(let attempt=0;attempt<5;attempt++){
     const position=await evaluate(`(()=>{const row=${node('outing-recipient-'+id(8))},r=row.getBoundingClientRect(),footer=${node('outing-recipients-continue')}.closest('[style*="padding-bottom"]')?.getBoundingClientRect();return{top:r.top,bottom:r.bottom,limit:footer?.top||700}})()`);
     if(position.top>=200&&position.bottom<position.limit)break;
     await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:width/2,y:480,deltaY:400,deltaX:0});await delay(260);
    }
    await press('outing-recipient-'+id(8));await until(`${node('outing-recipient-'+id(8))}.getAttribute('aria-checked')==='true'`);
    const last=await evaluate(`(()=>{const r=${node('outing-recipient-'+id(8))}.getBoundingClientRect();return{top:r.top,bottom:r.bottom,hit:${node('outing-recipient-'+id(8))}.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})()`);measures.push({name:'eighth-recipient-reachable-'+width,...last});assert.ok(last.hit,'Eighth recipient is visibly reachable above the fixed footer');await shot('recipients-8-last-'+width,'group-recipient-sheet');
   }
  }
  await open('/groups/'+group+'/outings/'+plan,3);await press('group-edit-context');await until(node('group-night-editor'));const editor=await shot('night-editor-'+width,'group-night-editor');
  if(editor.contentViewport){assert.ok(editor.contentViewport.height<650,'Editor is a short action sheet, not a full page');assert.ok(Math.abs(editor.contentViewport.bottom-editor.height)<2,'Editor content reaches the sheet bottom without an empty overdrag gap')}
  await open('/groups/'+group+'/outings/'+plan,3,'proposals-owner');await until(node('group-choose-destination'));await press('group-choose-destination');await until(node('group-destination-sheet'));await press('group-choose-'+id(10));const destination=await shot('destination-'+width,'group-destination-sheet');
  assert.ok(destination.contentViewport&&Math.abs(destination.contentViewport.bottom-destination.height)<2,'Destination sheet reaches the bottom without an empty overdrag gap');
  await open('/groups/'+group+'/info',8);await until(node('group-info-name'));await shot('info-eight-'+width);assert.ok(await evaluate(`${node('group-info-name')}.getBoundingClientRect().height<=102`),'Auto group title is bounded while full member names remain below');
  await press('group-info-rename');await until(node('group-rename-input'));await shot('rename-'+width,'group-info-action');
 }
 await call('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:true});await open('/groups/'+group+'/outings/'+plan,8);
 await evaluate(`{const style=document.createElement('style');style.textContent='[dir="auto"]{font-size:calc(1em * 1.3)!important;line-height:1.4!important}';document.head.append(style)}`);await press('group-buy');await until(node('group-recipient-sheet'));await shot('recipients-eight-320-enlarged','group-recipient-sheet');
 fs.writeFileSync(path.join(artifacts,'chat-audit-final-sheets.json'),JSON.stringify({scope:'Actual RN Web routes, isolated synthetic API data; CSS enlarged text, no native Dynamic Type claim',measures,errors},null,2));assert.deepEqual(errors.filter(e=>!e.includes('Failed to load resource')),[]);console.log('COMPLETE sheets',measures.length);
}).catch(error=>{fs.writeFileSync(path.join(artifacts,'chat-audit-final-sheets-failure.json'),JSON.stringify({error:error.message,measures},null,2));console.error(error);process.exitCode=1}).finally(()=>{if(!existed&&fs.existsSync(photo))fs.unlinkSync(photo)});
