// Local Next regression and visual audit. Fixtures are synthetic and isolated.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {withBrowser}=require('../../spottr-native/tests/browser-harness.cjs');
const origin=process.env.GROUPS_NEXT_URL||'http://localhost:8084',before=process.env.GROUPS_2208_BASELINE==='1';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('LOCAL_ONLY');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),root='/groups/'+id(20);
const source=fs.readFileSync(path.join(__dirname,'groups.browser.cjs'),'utf8'),start=source.indexOf('function(){'),end=source.indexOf('}.toString()})()`',start),fixture=source.slice(start,end+1);
withBrowser(async({call,evaluate,until,click,delay,capture,errors})=>{
 await call('Page.addScriptToEvaluateOnNewDocument',{source:'('+fixture+')()'});
 const results=[],prefix='groups-2208-'+(before?'before':'after');
 const open=async(route=root,mode='conversation')=>{await call('Page.navigate',{url:origin+route+'?case='+mode});await until('document.querySelector("[data-testid=group-composer]")||document.querySelector("[data-testid=group-outing]")',40000);await delay(250)};
 const geometry=()=>evaluate(`(()=>{const v=document.querySelector('[data-testid=group-messages]'),r=v.getBoundingClientRect(),rows=[...v.querySelectorAll('[data-message-id]')],visible=rows.filter(e=>e.getBoundingClientRect().bottom>r.top&&e.getBoundingClientRect().top<r.bottom);return{viewport:v.clientHeight,content:v.scrollHeight,offset:v.scrollTop,visible:visible.map(e=>e.dataset.messageId),first:visible[0]?.dataset.messageId,firstOffset:visible[0]?.getBoundingClientRect().top-r.top,mounted:rows.length}})()`);
 const selector=async()=>{await click('group-add');await click('group-open-events');await until('document.querySelector("[data-testid=group-event-picker]")');};
 await open();await capture(prefix+'-chat');
 results.push({cards:await evaluate(`(()=>{const c=document.querySelector('[data-testid=group-outing-message]'),p=c.querySelector('img')?.parentElement;return{height:c.getBoundingClientRect().height,photo:p&&{width:p.getBoundingClientRect().width,height:p.getBoundingClientRect().height},redundant:!!c.querySelector('[data-testid=group-message-open-outing]')}})()`)});
 for(const mode of ['conversation','many-messages']){
  await open(root,mode);
  for(const position of ['bottom','middle']){
   if(position==='middle')await evaluate(`{const v=document.querySelector('[data-testid=group-messages]');v.dispatchEvent(new Event('wheel',{bubbles:true}));v.scrollTop=Math.max(0,(v.scrollHeight-v.clientHeight)*.45);v.dispatchEvent(new Event('scroll'));}`);
   await delay(150);const initial=await geometry();
   for(let n=0;n<5;n++){await selector();await click('group-page-back');await until('document.querySelector("[data-testid=group-composer]")');await delay(150);const returned=await geometry();results.push({mode,position,n,initial,returned});if(!before){assert.ok(returned.visible.length,'Messages remain visible after picker return');assert.equal(returned.first,initial.first,'Same visible message after return');assert.ok(Math.abs(returned.firstOffset-initial.firstOffset)<12,'Visible anchor is stable');}}
   await capture(prefix+'-return-'+mode+'-'+position);
  }
 }
 // A normal scroll and immediate selector entry before the old 160ms debounce.
 await open();await click('group-add');await click('group-propose-night');await until('document.querySelector("[data-testid=discovery-date-scroll]")');await delay(200);
 const result=await evaluate(`(()=>{const v=document.querySelector('[data-testid=discovery-date-scroll]');v.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));v.style.scrollSnapType='none';v.style.scrollBehavior='auto';v.scrollLeft=440;v.dispatchEvent(new Event('scroll',{bubbles:true}));return new Promise(resolve=>setTimeout(()=>{const centered=document.querySelector('[data-centered=true]')?.dataset.testid;document.querySelector('[data-testid=group-night-choose-event]').click();resolve({centered,offset:v.scrollLeft})},60))})()`);
 await until('document.querySelector("[data-testid=group-event-search]")');await delay(300);
 const requested=await evaluate('window.__permanentGroups.reads.filter(r=>r.includes("/events")).slice(-4)');results.push({dateCentered:result,requests:requested});await capture(prefix+'-fast-date-picker');
 if(!before){const expected=result?.centered?.replace('ribbon-day-','');assert.ok(requested.some(r=>r.includes('nightDate='+expected)),'Picker uses the visible selected night immediately');}
 if(!before){
  await click('group-page-back');await until('document.querySelector("[data-testid=group-night-editor]")');
  const year=await evaluate('new Date().getUTCFullYear()');
  for(const selected of [year+'-12-31',(year+1)+'-01-01']){
   await until('document.querySelector("[data-testid=ribbon-day-'+selected+']")');await evaluate('document.querySelector("[data-testid=ribbon-day-'+selected+']").click();document.querySelector("[data-testid=group-night-choose-event]").click()');await until('document.querySelector("[data-testid=group-event-search]")');await delay(120);
   assert.ok(await evaluate('window.__permanentGroups.reads.some(r=>r.includes("nightDate='+selected+'"))'),'Tap at calendar boundary remains the committed picker context');await click('group-page-back');await until('document.querySelector("[data-testid=group-night-editor]")');assert.equal(await evaluate('document.querySelector("[data-centered=true]").dataset.testid'),'ribbon-day-'+selected);
  }
 }
 await open(root+'/outings/'+id(30),'proposals-owner');await capture(prefix+'-comparison');await click('group-proposal-menu-'+id(10));await until('document.querySelector("[role=menu]")');results.push({menu:await evaluate(`(()=>{const m=document.querySelector('[role=menu]').getBoundingClientRect();return{width:m.width,height:m.height}})()`)});await capture(prefix+'-menu');
 fs.mkdirSync(path.join(__dirname,'../.tmp'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../.tmp/'+prefix+'.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results.filter(r=>!('n'in r)||r.n===4),null,2));console.log('PASS '+(before?'baseline observations':'Next 22:08 local regression'));
 assert.deepEqual(errors.filter(e=>!e.includes('Failed to load resource')&&!e.includes('fonts.googleapis')),[]);
}).catch(error=>{console.error(error);process.exitCode=1});
