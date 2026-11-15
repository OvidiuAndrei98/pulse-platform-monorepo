// Real React Native Web routes with the shared isolated API fixture.
// This checks wiring and web geometry, not UIKit sheets, keyboards or Liquid Glass.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {withBrowser}=require('./browser-harness.cjs');
const origin=process.env.GROUPS_NATIVE_URL||'http://localhost:8083';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('LOCAL_PREVIEW_REQUIRED');
const source=fs.readFileSync(path.resolve(__dirname,'../../pulse-app/scripts/groups.browser.cjs'),'utf8'),start=source.indexOf('function(){'),end=source.indexOf('}.toString()})()`',start);
if(start<0||end<start)throw Error('Shared browser fixture not found');
const fixture=source.slice(start,end+1),photo=path.resolve(__dirname,'../public/party-event.webp'),existed=fs.existsSync(photo);
if(!existed)fs.copyFileSync(path.resolve(__dirname,'../assets/party-event.webp'),photo);
withBrowser(async({call,evaluate,until,click,input,delay,capture,errors})=>{
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),group=id(20),plan=id(30);
 await call('Page.addScriptToEvaluateOnNewDocument',{source:`{
  const mode=new URL(location.href).searchParams.get('case'),actor=['settings-member','availability','picker-empty','picker-error','edit'].includes(mode)?2:1,id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  localStorage.setItem('spottr-native.session.v1',JSON.stringify({version:1,token:'isolated-permanent-groups',user:{id:id(actor),username:actor===1?'Franco QA':'Ana QA',email:'group'+actor+'@example.invalid',role:'user',hasPassword:true,preferredLanguage:'en',createdAt:'2026-01-01T00:00:00Z',avatarUrl:'/party-event.webp'}}));
 } (${fixture})();
 if(new URL(location.href).searchParams.get('case')==='settings-history-error')window.__permanentGroups.failHistory=true;
 if(new URL(location.href).searchParams.get('case')==='settings-collection-error')window.__permanentGroups.failCollection=true;
 if(new URL(location.href).searchParams.get('case')==='settings-collection-forbidden')window.__permanentGroups.forbiddenCollection=true;`});
 const open=async(route,mode='settings-owner')=>{await call('Page.navigate',{url:origin+route+'?case='+mode});await until('window.__permanentGroups',40000)};
 const exists=key=>`document.querySelector('[data-testid="${key}"]')`;
 const shown=key=>`(()=>{const n=${exists(key)};return n&&n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0})()`;
 const disabled=key=>`(()=>{const n=${exists(key)};return n&&(n.disabled||n.getAttribute('aria-disabled')==='true')})()`;
 const actionCount=()=>evaluate('window.__permanentGroups.writes.filter(w=>w.route.endsWith("/actions")).length');
 const press=async(key)=>{await until(shown(key));await evaluate(`${exists(key)}.scrollIntoView({block:'center'})`);let last='';for(let i=0;i<15;i++){const value=await evaluate(`(()=>{const n=${exists(key)},r=n.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),hit:n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})})()`),r=JSON.parse(value);if(value===last&&r.hit){const point={x:r.x+r.w/2,y:r.y+r.h/2,button:'left',clickCount:1};await call('Input.dispatchMouseEvent',{type:'mousePressed',...point});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point});return}last=value;await delay(75)}await capture('groups-native-settings-blocked-'+key);console.error('Blocked control',key,last,await evaluate(`(()=>{const a=[];for(let n=${exists(key)};n;n=n.parentElement){const r=n.getBoundingClientRect();a.push({test:n.dataset?.testid,y:r.y,bottom:r.bottom,h:r.height,scroll:n.scrollTop,sh:n.scrollHeight,ch:n.clientHeight,overflow:getComputedStyle(n).overflow})}return a})()`));throw Error('Covered/moving control '+key)};
 const sheetClosed=()=>until(`!${exists('group-info-action')}`);
 const openInfoFromChat=async()=>{await open('/groups/'+group);await until(shown('friend-group'),40000);await press('group-menu');await press('group-menu-members');await until(shown('group-info-rename'))};
 const shot=async name=>{await delay(150);await capture('groups-native-settings-'+name)};
 const chooseDate=async day=>{await delay(350);await click('ribbon-day-'+day);await until(`${exists('ribbon-day-'+day)}?.getAttribute('aria-pressed')==='true'`)};
 const geometry=async key=>evaluate(`(()=>{const n=${exists(key)},r=n.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height,viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1}})()`);
 const scrollToFooter=async key=>{for(let i=0;i<30;i++){const visible=await evaluate(`(()=>{const n=${exists(key)};if(!n)return false;const r=n.getBoundingClientRect();return r.top>=68&&r.bottom<=innerHeight&&n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()`);if(visible)return;await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:160,y:650,deltaX:0,deltaY:650});await delay(90)}throw Error('Cannot reach collection footer '+key)};
 await call('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:true});
 if(!process.env.GROUPS_SETTINGS_PAGINATION_ONLY){

 // Info shows identity and real navigation; editing is a single short sheet.
 await openInfoFromChat();
 assert.equal(await evaluate(`${exists('group-info-name')}.innerText`),'Noi QA');
 assert.equal(await evaluate('!!document.querySelector("input[data-testid=group-rename-input]")'),false);
 assert.equal(await evaluate('document.body.innerText.includes("Delete group")'),false);
 for(const key of ['group-info-outings','group-info-shared','group-info-notifications','group-info-invite']){const r=await geometry(key);assert.ok(r.x>=0&&r.right<=320&&r.h>=44,'Bounded Info control '+key)}
 assert.ok(await evaluate('document.body.innerText.includes("2 members")&&document.body.innerText.includes("1 invited")'),'Accepted and pending membership counts remain distinct');
 await shot('info-owner-320');
 await press('group-info-rename');await until(shown('group-rename-input'));
 assert.equal(await evaluate(disabled('group-rename-save')),true);const before=await actionCount();
 await evaluate(`${exists('group-rename-save')}.click()`);assert.equal(await actionCount(),before,'No-op Save sends nothing');
 await input('group-rename-input','After Hours QA');await evaluate('window.__permanentGroups.failNextRename=true');await press('group-rename-save');
 await until(`document.querySelector('[data-testid="group-info-action"] [role="alert"]')`);
 assert.equal(await evaluate(`${exists('group-rename-input')}.value`),'After Hours QA');assert.equal(await evaluate('window.__permanentGroups.group.name'),'Noi QA','A failed Save cannot fake success');await shot('rename-failed-draft');
 await press('group-rename-cancel');await sheetClosed();await press('group-info-rename');await until(shown('group-rename-input'));
 assert.equal(await evaluate(`${exists('group-rename-input')}.value`),'Noi QA','Cancel discards local rename draft');
 await input('group-rename-input','After Hours QA');await press('group-rename-save');await sheetClosed();await until(`${exists('group-info-name')}?.innerText==='After Hours QA'`);
 await press('group-info-back');await until(shown('friend-group'));assert.ok(await evaluate('document.body.innerText.includes("After Hours QA")'),'The same chat header receives the canonical rename');
 assert.equal(await evaluate('window.__permanentGroups.groups.length'),1);
 console.log('PASS native Info owner, narrow geometry, no-op/error/cancel/rename reconciliation');

 // Accepted member receives no owner actions; pending access exposes no settings.
 await open('/groups/'+group+'/info','settings-member');await until(shown('group-info-member-'+id(2)));
 for(const key of ['group-info-rename','group-info-invite','group-remove-'+id(3),'group-transfer-'+id(1)])assert.equal(await evaluate('!!'+exists(key)),false,'Member lacks owner control '+key);
 await press('group-info-leave');await until(shown('group-info-confirm'));await press('group-info-cancel');await sheetClosed();assert.equal(await actionCount(),0);
 await open('/groups/'+group+'/info','invited');await until('document.body.innerText.includes("Group invitation")');assert.equal(await evaluate('!!'+exists('group-info-rename')),false);assert.equal(await evaluate('!!'+exists('group-info-outings')),false);
 console.log('PASS native accepted-member/pending privacy and cancelled leave');

 // Inviting and cancelling invitations use specific identities and one selector.
 await openInfoFromChat();await until(shown('group-info-invite'));await press('group-info-invite');await until(shown('group-invite-friend-'+id(4)));
 assert.equal(await evaluate(disabled('group-invite-save')),true);
 for(const person of [1,2,3])assert.equal(await evaluate('!!'+exists('group-invite-friend-'+id(person))),false,'Existing or pending members are absent from invite choices');
 await press('group-invite-friend-'+id(4));await press('group-invite-save');await sheetClosed();await until(shown('group-info-member-'+id(4)));
 assert.equal(await evaluate(`window.__permanentGroups.group.members.find(m=>m.userId==='${id(4)}').status`),'pending');
 assert.ok((await evaluate(`${exists('group-remove-'+id(3))}.innerText`)).includes('Cancel invitation'));
 await press('group-remove-'+id(3));await until(shown('group-info-confirm'));assert.ok(await evaluate(`${exists('group-info-action')}.innerText.includes('Mihai QA')`),'Destructive confirmation names the pending invitee');await press('group-info-confirm');await sheetClosed();await until(`!${exists('group-info-member-'+id(3))}`);
 const removal=await evaluate('window.__permanentGroups.writes.filter(w=>w.body?.action==="remove").at(-1).body');assert.equal(removal.userId,id(3));
 await evaluate(`document.querySelector('[data-testid="group-info-notifications"] [role="switch"]').click()`);await until('window.__permanentGroups.group.muted===true');
 await press('group-info-back');await until(shown('friend-group'));await press('group-menu');await until('document.querySelector("[role=menu]")');assert.ok(await evaluate('document.querySelector("[role=menu]").innerText.includes("Unmute")'));
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until('!document.querySelector("[role=menu]")');
 console.log('PASS native invite selector, named pending cancellation and mute across Info/chat');

 // Canonical collection pages distinguish data, empty state, failures and forbidden.
 await open('/groups/'+group+'/outings');await until(shown('group-outing-row-'+plan));assert.equal(await evaluate('!!'+exists('group-outings-empty')),false);await shot('outings-page');
 await press('group-outing-row-'+plan);await until(shown('group-outing'));await press('group-outing-back');await until(shown('group-outings-list'));
 await open('/groups/'+group+'/outings','settings-empty');await until(shown('group-outings-empty'));assert.equal(await evaluate('!!'+exists('group-outings-error')),false);
 await open('/groups/'+group+'/outings','settings-history-error');await until(shown('group-outings-error'));assert.equal(await evaluate('!!'+exists('group-outings-empty')),false);
 await open('/groups/'+group+'/events','settings-empty');await until(shown('group-shared-empty'));assert.equal(await evaluate('!!'+exists('group-shared-error')),false);
 await open('/groups/'+group+'/events','settings-collection-error');await until(shown('group-shared-error'));assert.equal(await evaluate('!!'+exists('group-shared-empty')),false);
 await open('/groups/'+group+'/events','settings-collection-forbidden');await until(shown('group-shared-error'));assert.equal(await evaluate('!!'+exists('group-shared-empty')),false);
 console.log('PASS native outings/shared real rows, correct empty/error/forbidden separation');

 // A shared collection opens the canonical selector, sends once, returns to its source.
 await open('/groups/'+group+'/events');await until(shown('group-shared-find'));await press('group-shared-find');await until(shown('group-event-picker-page'));await until(shown('group-send-event-'+id(12)));
 assert.equal(await evaluate('window.__permanentGroups.writes.filter(w=>w.route.endsWith("/outings")).length'),0);
 await press('group-send-event-'+id(12));await until(shown('group-shared-page'));await until(`document.querySelector('[data-testid^="group-shared-event-"]')?.innerText.includes('SECOND NIGHT QA')`);
 assert.equal(await evaluate('window.__permanentGroups.groups.length'),1);assert.equal(await evaluate('window.__permanentGroups.group.outings.length'),1);
 assert.equal(await evaluate('window.__permanentGroups.writes.filter(w=>w.route.endsWith("/messages")&&w.body?.eventId).length'),1);
 console.log('PASS native canonical event picker source return, refreshed collection and no extra outing/chat');

 // Ownership transfer updates the exact group; an acknowledged member leave
 // still exits even though private revocation removes the action component.
 await open('/groups/'+group+'/info');await until(shown('group-transfer-'+id(2)));await press('group-transfer-'+id(2));await until(shown('group-info-confirm'));await press('group-info-confirm');await sheetClosed();await until(`window.__permanentGroups.group.ownerId==='${id(2)}'`);assert.equal(await evaluate('!!'+exists('group-info-rename')),false);assert.equal(await evaluate('!!'+exists('group-info-invite')),false);
 await open('/groups/'+group+'/info','settings-member');await until(shown('group-info-leave'));await press('group-info-leave');await until(shown('group-info-confirm'));await press('group-info-confirm');await until('location.pathname==="/groups"');assert.equal(await evaluate('window.__permanentGroups.groups.length'),0);assert.equal(await evaluate('!!'+exists('group-info-action')),false);
 console.log('PASS native authority transfer and acknowledged leave after private revocation');

 // One editor is used by detail and picker. Local drafts and failed requests
 // never mutate canonical context; explicit impact consent preserves tickets.
 const detail='/groups/'+group+'/outings/'+plan;
 await open(detail,'edit');await until(shown('group-edit-context'));assert.equal(await evaluate('!!'+exists('group-menu-edit-night')+'||!!'+exists('group-menu-edit-city')),false);const ticketsBefore=await evaluate('JSON.stringify(window.__permanentGroups.tickets)'),oldDay=await evaluate('window.__permanentGroups.group.outings[0].outingDate'),nextDay=await evaluate('window.__permanentGroups.events[2].startTime.slice(0,10)');
 await press('group-edit-context');await until(shown('group-save-context'));assert.equal(await evaluate(disabled('group-save-context')),true);await chooseDate(nextDay);await evaluate('window.__permanentGroups.failNextContext={status:503,code:"TEMPORARY_FAILURE"}');await press('group-save-context');await until(`document.querySelector('[data-testid="group-night-editor"] [role="alert"]')`);assert.equal(await evaluate('window.__permanentGroups.group.outings[0].outingDate'),oldDay);assert.equal(await evaluate(`${exists('ribbon-day-'+nextDay)}?.getAttribute('aria-pressed')`),'true');await shot('context-failed-draft');await press('group-edit-night-cancel');await until(`!${exists('group-night-editor')}`);
 await press('group-edit-context');await until(shown('group-save-context'));assert.equal(await evaluate(`${exists('ribbon-day-'+oldDay)}?.getAttribute('aria-pressed')`),'true');assert.equal(await evaluate(disabled('group-save-context')),true);await chooseDate(nextDay);await press('group-save-context');await until(shown('group-context-confirm'));assert.equal(await evaluate('window.__permanentGroups.group.outings[0].outingDate'),oldDay);await shot('context-impact');await press('group-context-confirm');await until(`!${exists('group-night-editor')}`);assert.equal(await evaluate('window.__permanentGroups.group.outings[0].id'),plan);assert.equal(await evaluate('window.__permanentGroups.group.outings[0].outingDate'),nextDay);assert.equal(await evaluate('JSON.stringify(window.__permanentGroups.tickets)'),ticketsBefore);
 console.log('PASS native single context editor, no-op, failed draft, cancel, impact and unchanged wallet');

 await open(detail,'availability');await until(shown('group-empty-propose'));await press('group-empty-propose');await until(shown('group-event-picker-page'));await until(shown('group-send-event-'+id(10)));await press('group-picker-edit-context');await until(shown('group-save-context'));await chooseDate(nextDay);await press('group-save-context');await until(`!${exists('group-night-editor')}`);await until(shown('group-send-event-'+id(12)));assert.equal(await evaluate('!!'+exists('group-send-event-'+id(10))),false);assert.equal(await evaluate('location.pathname'),'/groups/'+group+'/events/select');await press('group-event-picker-page-back');await until(shown('group-outing'));assert.equal(await evaluate('window.__permanentGroups.group.outings[0].outingDate'),nextDay);
 console.log('PASS native picker Change persists one context before catalog filtering and returns to source');

 // Closing an in-flight editor invalidates old error feedback, without
 // suppressing the genuine server acknowledgement or revocation semantics.
 await open(detail,'availability');await until(shown('group-edit-context'));await press('group-edit-context');await until(shown('group-save-context'));await chooseDate(nextDay);await evaluate('window.__permanentGroups.holdNextContext=true;window.__permanentGroups.failNextContext={status:503,code:"TEMPORARY_FAILURE"}');await press('group-save-context');await until('typeof window.__permanentGroups.releaseContext==="function"');await press('group-edit-night-cancel');await until(`!${exists('group-night-editor')}`);await press('group-edit-context');await until(shown('group-save-context'));await evaluate('window.__permanentGroups.releaseContext()');await until('window.__permanentGroups.failNextContext===null');await delay(100);assert.equal(await evaluate('!!document.querySelector("[data-testid=group-night-editor] [role=alert]")'),false);assert.equal(await evaluate('!!'+exists('group-context-impact')),false);await press('group-edit-night-cancel');await until(`!${exists('group-night-editor')}`);
 console.log('PASS native close/reopen while context request is pending discards stale editor feedback');

 // Selecting an optional event uses a page and returns into the existing
 // creation draft. There are no provisional writes before final submission.
 await open('/groups/'+group+'/outings');await until(shown('group-outings-new'));await press('group-outings-new');await until(shown('group-night-pick-event'));await chooseDate(nextDay);await press('group-night-pick-event');await until(shown('group-event-picker-page'));await until(shown('group-send-event-'+id(12)));assert.equal(await evaluate('window.__permanentGroups.writes.filter(w=>w.route.endsWith("/outings")).length'),0);await press('group-send-event-'+id(12));await until(shown('group-new-outing'));await until(shown('group-night-selected-event'));assert.equal(await evaluate(`${exists('ribbon-day-'+nextDay)}?.getAttribute('aria-pressed')`),'true');assert.equal(await evaluate('window.__permanentGroups.writes.filter(w=>w.route.endsWith("/outings")).length'),0);await press('group-create-outing');await until(shown('group-outing'));assert.equal(await evaluate('window.__permanentGroups.group.outings.length'),2);assert.equal(await evaluate('window.__permanentGroups.groups.length'),1);const created=await evaluate('window.__permanentGroups.writes.find(w=>w.route.endsWith("/outings")).body');assert.equal(created.eventId,id(12));assert.match(created.requestId,/^[a-f0-9-]{36}$/);assert.deepEqual(Object.keys(created).sort(),['eventId','requestId']);await press('group-outing-back');await until(shown('group-outings-page'));assert.equal(await evaluate('!!'+exists('group-new-outing')),false,'Successful creation replaces its submitted draft route');
 console.log('PASS native optional event selection preserves draft, atomic create and Back history');
 }

 await open('/groups/'+group+'/outings','settings-many');await until(shown('group-outings-more'));await scrollToFooter('group-outings-more');await press('group-outings-more');await until('window.__permanentGroups.reads.some(r=>r.includes("/outings?before="))');await until(`!${exists('group-outings-more')}`);assert.equal(await evaluate('!!'+exists('group-outings-empty')),false);
 await open('/groups/'+group+'/events','settings-many');await until(shown('group-shared-more'));await scrollToFooter('group-shared-more');await press('group-shared-more');await until('window.__permanentGroups.reads.some(r=>r.includes("collection=events")&&r.includes("before="))');await until(`!${exists('group-shared-more')}`);assert.equal(await evaluate('document.querySelectorAll("[data-testid^=group-shared-event-]").length<65'),true,'Shared events remain windowed instead of rendering the entire collection');await shot('shared-paginated');
 console.log('PASS native outing/shared cursor pagination and virtualized shared-event rows');
 // Focus refresh after opening an event must keep authorized older pages and
 // the source anchor, rather than replacing 65 loaded rows with the first 50.
 const olderEvent=id(10064),olderRow='group-shared-event-'+id(20064);
 await evaluate(`{const qa=window.__permanentGroups;qa.events.push({...qa.events[0],id:'${olderEvent}',title:'Shared event QA 64',ticketTypes:qa.events[0].ticketTypes.map(t=>({...t,eventId:'${olderEvent}'}))})}`);
 await scrollToFooter(olderRow);const sourcePosition=await evaluate(`(()=>{const list=${exists('group-shared-list')},r=${exists(olderRow)}.getBoundingClientRect();return{url:location.pathname+location.search,offset:list.scrollTop,anchor:r.top,headRequests:window.__permanentGroups.reads.filter(r=>r.includes('collection=events')&&!r.includes('before=')).length}})()`);
 await press(olderRow);await until(`location.pathname.includes('/events/${olderEvent}')`);await until(shown('event-outing'));
 if(process.env.GROUPS_SETTINGS_HISTORY_DIAGNOSTIC){
  const before=await evaluate(`(()=>{const node=${exists('event-outing')},key=Object.keys(node).find(k=>k.startsWith('__reactFiber$')),refs=[];for(let f=node[key];f;f=f.return){const ref=f.ref?.current;if(ref&&typeof ref.getRootState==='function')refs.push(ref)}window.__qaNav=refs.at(-1);window.__qaActions=[];const clean=state=>({index:state?.index,names:state?.routes?.map(r=>r.name)});if(window.__qaNav)window.__qaNav.addListener('__unsafe_action__',event=>{const a=event.data?.action;window.__qaActions.push({type:a?.type,target:a?.target,payload:clean(a?.payload),state:clean(window.__qaNav.getRootState())})});return{url:location.pathname+location.search,history:history.length,root:clean(window.__qaNav?.getRootState())}})()`);
  await evaluate('history.back()');await delay(350);const after=await evaluate(`(()=>{const clean=state=>({index:state?.index,names:state?.routes?.map(r=>r.name)}),shape=state=>state?.routes?.map(r=>({name:r.name,path:r.path,paramKeys:Object.keys(r.params??{}),children:shape(r.state)}));return{url:location.pathname+location.search,history:history.length,root:clean(window.__qaNav?.getRootState()),shape:shape(window.__qaNav?.getRootState()),actions:window.__qaActions}})()`);console.log('Isolated browser history diagnostic',JSON.stringify({sourceURL:sourcePosition.url,before,after,warnings:errors.filter(e=>e.includes('RESET'))}));await shot('browser-history-diagnostic');return;
 }
 await press('sheet-handle');await until(shown('group-shared-page'));await until(`window.__permanentGroups.reads.filter(r=>r.includes('collection=events')&&!r.includes('before=')).length>${sourcePosition.headRequests}`);await until(`!${exists('group-shared-loading')}`);await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 await until(`(()=>{const row=${exists(olderRow)},list=${exists('group-shared-list')};if(!row||!list)return false;return Math.abs(list.scrollTop-${sourcePosition.offset})<=16&&Math.abs(row.getBoundingClientRect().top-${sourcePosition.anchor})<=16})()`);
 assert.equal(await evaluate('!!'+exists('group-shared-more')),false,'Exhausted older pagination remains exhausted after head refresh');assert.equal(await evaluate('!!'+exists('group-shared-empty')),false);await shot('shared-older-anchor-after-back');
 console.log('PASS native 65-row collection→older event→Back preserves loaded older rows, pagination and source anchor through focus refresh');
 assert.deepEqual(errors,[]);console.log('Native groups settings browser: PASS');
}).catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{if(!existed&&fs.existsSync(photo))fs.unlinkSync(photo)});
