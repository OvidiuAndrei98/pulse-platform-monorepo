// One persistent reference through the actual RN Web navigation and production
// Go handlers on an isolated PostgreSQL fixture. Authentication and one explicit
// network failure are synthetic; no Stripe, production or UIKit claims.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {withBrowser} = require('./browser-harness.cjs');
const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../api/.tmp/friends-browser-fixture.json'), 'utf8'));
const origin = process.env.GROUPS_NATIVE_URL || 'http://localhost:8083';
for (const url of [origin, fixture.baseUrl]) if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw Error('LOCAL_ONLY');
assert.equal(fixture.testOnly, true);
const prefix = process.env.GROUPS_QA_PREFIX || 'groups-reference-real-api', artifacts = path.resolve(__dirname, '../artifacts');
const checks = [], samples = [], requests = [];
const api = async (actor, route, method = 'GET', body) => {
  const response = await fetch(fixture.baseUrl + '/api/v1' + route, {method, headers: {authorization: 'Bearer ' + fixture.actors[actor].token, 'content-type': 'application/json'}, ...(body ? {body: JSON.stringify(body)} : {})});
  const data = await response.json();
  requests.push({scope: 'harness', actor, method, route, status: response.status});
  assert.ok(response.ok, method + ' ' + route + ' returned ' + response.status + ' ' + JSON.stringify(data));
  return data;
};
const initial = fs.readFileSync(path.join(__dirname, 'browser-friends-coherence-api.cjs'), 'utf8');
const begin = initial.indexOf('{source:`') + 9, end = initial.indexOf('`});', begin);
if (begin < 9 || end < begin) throw Error('Fixture bootstrap unavailable');
const bootstrap = initial.slice(begin, end).replaceAll('\\\\', '\\').replace('${JSON.stringify(fixture)}', JSON.stringify(fixture));
new (require('node:vm').Script)(bootstrap);

withBrowser(async ({call, evaluate, until: poll, capture, delay, errors}) => {
  const until = async (expression, timeout = 60000) => {try {return await poll(expression, timeout);} catch(error) {await capture(prefix+'-timeout');fs.writeFileSync(path.join(artifacts,prefix+'-timeout.json'),JSON.stringify({error:error.message,requests:await evaluate('window.__realGroups?.requests'),route:await evaluate('location.pathname'),errors},null,2));throw error;}};
  const node = id => `document.querySelector('[data-testid="${id}"]')`;
  const checked = id => `${node(id)}?.getAttribute('aria-checked')==='true'`;
  // Sheet controls are clicked only once their animated presentation is stable
  // and the physical point really targets that control, not its backdrop.
  const click=async(id)=>{
    await until(node(id));await evaluate(`${node(id)}.scrollIntoView({block:'center'})`);let previous='',stable=0;
    for(let i=0;i<24;i++){
      const current=await evaluate(`(()=>{const root=${node(id)},n=root.matches('[role=button],[role=radio],[role=checkbox],button')?root:root.querySelector('[role=button],[role=radio],[role=checkbox],button')||root,r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return JSON.stringify({x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),hit:!!hit&&n.contains(hit)})})()`),point=JSON.parse(current);
      stable=current===previous&&point.hit?stable+1:0;
      if(stable>=2){const coords={x:point.x+point.w/2,y:point.y+point.h/2,button:'left',clickCount:1};await call('Input.dispatchMouseEvent',{type:'mousePressed',...coords});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...coords});return;}
      previous=current;await delay(80);
    }
    await capture(prefix+'-covered-'+id);throw Error('Control did not become stable and hittable: '+id);
  };
  const check = (passed, label) => { checks.push({passed: !!passed, label}); assert.ok(passed, label); console.log('PASS', label); };
  await call('Page.addScriptToEvaluateOnNewDocument', {source: bootstrap + `{
    const original=window.fetch.bind(window);
    window.__referenceQa={failAttendanceOnce:false,requestQueries:[],sourceWrites:[]};
    window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      if((init.method||'GET')==='POST'&&(/\\/outings$/.test(url.pathname)||/\\/proposals$/.test(url.pathname)))window.__referenceQa.sourceWrites.push({path:url.pathname,body:JSON.parse(init.body||'{}')});
      if(url.pathname.includes('/outings/groups/')&&url.pathname.endsWith('/messages'))window.__referenceQa.requestQueries.push(url.pathname+url.search);
      if(window.__referenceQa.failAttendanceOnce&&url.pathname.endsWith('/attendance')&&(init.method||'GET')==='POST'){
        window.__referenceQa.failAttendanceOnce=false;
        window.__realGroups.requests.push({route:url.pathname.split('/api/v1')[1],method:'POST',status:503,injected:true});
        return new Response(JSON.stringify({error:'QA_NETWORK_UNAVAILABLE'}),{status:503,headers:{'content-type':'application/json'}});
      }
      return original(input,init);
    };
  }`});
  const group = await api(0, '/outings/groups', 'POST', {requestId: crypto.randomUUID(), name: 'Reference QA ' + Date.now(), friendIds: [fixture.actors[1].id]});
  await api(1, '/outings/groups/' + group.id + '/actions', 'POST', {action: 'accept'});
  const groupRoute = '/groups/' + group.id;
  const messages = actor => api(actor, groupRoute.replace('/groups/', '/outings/groups/') + '/messages');
  const open = async (actor, route = groupRoute) => {
    if (await evaluate('!!window.__realGroups')) requests.push(...await evaluate('window.__realGroups.requests'));
    await call('Page.navigate', {url: origin + route + '?qaActor=' + actor});
    await until(node(route.includes('/outings/') ? 'group-outing' : 'group-add'));
  };
  const shot = async label => { await delay(200); await capture(prefix + '-' + label); };
  let source, planId;
  const checkReference = async label => {
    const canonical = await messages(0), reference = canonical.items.find(message => message.id === source.id);
    check(!!reference && reference.senderId === source.senderId && reference.createdAt === source.createdAt, label + ': original message and author preserved');
    check(reference.outingId === planId && reference.referenceMessageId === reference.id, label + ': reference has the explicit outing binding');
    await until(node('group-message-' + source.id));
    const geometry = await evaluate(`(()=>{
      const r=n=>{if(!n)return null;const q=n.getBoundingClientRect();return{x:q.x,y:q.y,width:q.width,height:q.height,right:q.right,bottom:q.bottom}};
      const list=${node('group-messages')},ref=${node('group-message-' + source.id)};
      const covers=[...list.querySelectorAll('[data-testid$="-cover"]')];
      return{width:innerWidth,documentWidth:document.documentElement.scrollWidth,reference:r(ref),covers:covers.map(n=>({id:n.dataset.testid,...r(n)})),offset:list.scrollTop,content:list.scrollHeight,viewport:list.clientHeight,route:location.pathname};
    })()`);
    samples.push({label, ...geometry});
    check(geometry.covers.length === 1, label + ': one principal photograph in the conversation');
    check(geometry.reference.height > 150 && geometry.reference.height < 500 && geometry.documentWidth <= geometry.width + 1, label + ': reference remains bounded without horizontal overflow');
    await shot(label);
    return reference;
  };

  await open(0);
  await click('group-add'); await click('group-open-events');
  await until(node('group-send-event-' + fixture.eventIds[0])); await click('group-send-event-' + fixture.eventIds[0]);
  await until(node('group-create-outing'));
  source = (await messages(0)).items.find(message => message.kind === 'event' && message.eventId === fixture.eventIds[0]);
  check(!!source, 'Actual event share stores a message before proposing');
  check((await api(0, '/outings/groups/' + group.id)).outings.length === 0, 'Sharing alone creates no outing');
  await shot('shared-unbound');

  // A different group member proposes the original author's shared event.
  await open(1); await click('group-create-outing');
  await until(`location.pathname.includes('/outings/')||!!${node('group-chat-response-yes')}`);
  const created = await api(1, '/outings/groups/' + group.id);
  check(created.outings.length === 1, 'Explicit proposal creates one outing');
  planId = created.outings[0].id;
  check(await evaluate('location.pathname')===groupRoute,'Proposing the known event stays in the same conversation');
  check(await evaluate(`window.__referenceQa.sourceWrites.some(write=>write.body.sourceMessageId==='${source.id}')`),'The actual proposal request carries the original sourceMessageId');
  requests.push(...await evaluate('window.__referenceQa.sourceWrites'));
  check(created.outings[0].members.filter(member => member.status === 'accepted').every(member => member.attendance === 'unanswered'), 'Proposing does not manufacture attendance');
  await open(1); await checkReference('proposed-by-member');

  await until(node('group-chat-response-yes')); await click('group-chat-response-yes'); await until(checked('group-chat-response-yes'));
  await until(`${node('group-chat-response-yes')}?.getAttribute('aria-busy')!=='true'`);
  let plan = await api(1, '/outings/plans/' + planId);
  check(plan.members.find(member => member.userId === fixture.actors[1].id).attendance === 'yes', 'Member answer is saved by the real API');
  check(plan.members.find(member => member.userId === fixture.actors[0].id).attendance === 'unanswered', 'Member answer does not change original author attendance');
  await checkReference('member-coming');

  // Fail one request at the client boundary, then retry against the real API.
  await evaluate('window.__referenceQa.failAttendanceOnce=true'); await click('group-chat-response-no');
  await until(node('group-chat-response-error'));
  check(await evaluate(checked('group-chat-response-yes')), 'Network failure retains the confirmed answer');
  check(await evaluate('!'+node('group-chat-response-sheet')),'Changing a response never opens a response sheet');
  plan = await api(1, '/outings/plans/' + planId);
  check(plan.members.find(member => member.userId === fixture.actors[1].id).attendance === 'yes', 'Injected network failure made no server change');
  await checkReference('failed-answer');
  await click('group-chat-response-retry'); await until('!'+node('group-chat-response-error'));
  await until(checked('group-chat-response-no'));
  await until(`${node('group-chat-response-no')}?.getAttribute('aria-busy')!=='true'`);
  plan = await api(1, '/outings/plans/' + planId);
  check(plan.members.find(member => member.userId === fixture.actors[1].id).attendance === 'no', 'Retry saves the explicit negative answer');
  await checkReference('retried-answer');

  // Tapping the selected response explicitly withdraws that answer.
  await click('group-chat-response-no');
  await until(node('group-chat-response-yes'));
  await until(`!(${checked('group-chat-response-no')})&&!(${checked('group-chat-response-yes')})`);
  await until(`${node('group-chat-response-no')}?.getAttribute('aria-busy')!=='true'&&${node('group-chat-response-yes')}?.getAttribute('aria-busy')!=='true'`);
  plan = await api(1, '/outings/plans/' + planId);
  check(plan.members.find(member => member.userId === fixture.actors[1].id).attendance === 'unanswered', 'Explicit withdrawal returns to unanswered');
  await checkReference('withdrawn');

  await open(0); await checkReference('creator-refresh');
  for (let i = 0; i < 3; i++) {
    await click('group-add'); await click('group-open-events'); await until(node('group-event-picker-page'));
    await click('group-event-picker-page-back'); await until(node('group-messages'));
    const m = await checkReference('picker-return-' + i);
    check(m.id === source.id, 'Picker return preserves the canonical message ID');
  }

  const detail='/groups/'+group.id+'/outings/'+planId;
  const referenceNode=messageId=>node('group-event-reference-'+messageId);
  const referenceState=messageId=>`${referenceNode(messageId)}?.dataset.referenceState`;
  const liveReferences=async()=>{
    const data=await messages(1);return [...data.items,...(data.references??[])];
  };
  // The second event is deliberately shared into the same group and night.
  await open(1);await click('group-add');await click('group-open-events');
  await click('group-send-event-'+fixture.eventIds[1]);await until(node('group-create-outing'));
  const alternative=(await messages(1)).items.find(message=>message.kind==='event'&&message.eventId===fixture.eventIds[1]);
  await click('group-create-outing');await until(`${referenceState(alternative.id)}==='alternative'`);
  let freshGroup=await api(1,'/outings/groups/'+group.id);
  check(freshGroup.outings.length===1&&freshGroup.outings[0].options.length===2,'Second event explicitly joins the same outing without silently changing its destination');
  check((await liveReferences()).find(message=>message.id===alternative.id).outingId===planId,'Alternative binds its own source message to the exact existing outing');
  await shot('alternative-compact');

  const chooseInUI=async(eventId)=>{
    await open(1,detail);await click('group-outing-menu');await click('group-menu-reopen');
    await until(node('group-preference-'+eventId));
    await click('group-preference-'+eventId);await until(checked('group-preference-'+eventId));
    const comparing=await api(1,'/outings/plans/'+planId);
    check(!comparing.chosenEventId&&comparing.members.filter(member=>member.status==='accepted').every(member=>member.attendance==='unanswered'),'Event preference does not choose the destination or manufacture attendance');
    await click('group-preference-'+eventId);await until('!('+checked('group-preference-'+eventId)+')');
    await click('group-choose-destination');await until(node('group-destination-sheet'));
    await click('group-choose-'+eventId);await click('group-confirm-choice');await until('!'+node('group-destination-sheet'));
    await until(node('group-attendance-yes'));
  };
  await chooseInUI(fixture.eventIds[1]);
  plan=await api(1,'/outings/plans/'+planId);
  check(plan.chosenEventId===fixture.eventIds[1]&&plan.members.filter(member=>member.status==='accepted').every(member=>member.attendance==='unanswered'),'Creator choice changes destination while leaving every personal RSVP unanswered');
  await open(1);await until(`${referenceState(source.id)}==='alternative'&&${referenceState(alternative.id)}==='chosen'`);
  let refs=await liveReferences();
  check(refs.find(message=>message.id===source.id).referenceMessageId===source.id&&refs.find(message=>message.id===alternative.id).referenceMessageId===alternative.id,'Choosing another event keeps both original source references instead of generating replacement posters');
  check(await evaluate(`document.querySelectorAll('[data-testid="group-messages"] [data-testid$="-cover"]').length===1`),'Only the chosen event remains a full photograph after destination change');
  await shot('chosen-alternative');
  await chooseInUI(fixture.eventIds[0]);
  await open(1);await until(`${referenceState(source.id)}==='chosen'&&${referenceState(alternative.id)}==='alternative'`);
  await checkReference('reselected-original');

  // Setup for same-event/two-outing isolation uses an explicit context command,
  // including its impact acknowledgement; no bypass of coordinator permissions.
  plan=await api(1,'/outings/plans/'+planId);
  const nextNight=new Date(Date.parse(plan.outingDate+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  await api(1,'/outings/plans/'+planId+'/context','POST',{date:nextNight,city:plan.city,confirmImpact:true,revision:plan.revision});
  await open(1);await until(`${referenceState(source.id)}==='unavailable'`);
  check(!await evaluate(`${referenceNode(source.id)}.querySelector('[role=checkbox],[role=radio]')`),'Changed context removes voting from the incompatible reference rather than faking eligibility');
  await shot('context-invalid-reference');
  await click('group-add');await click('group-open-events');await click('group-send-event-'+fixture.eventIds[0]);await until(node('group-create-outing'));
  const secondSource=(await messages(1)).items.find(message=>message.kind==='event'&&message.eventId===fixture.eventIds[0]&&message.id!==source.id);
  await click('group-create-outing');await until(`${referenceState(secondSource.id)}==='chosen'`);
  freshGroup=await api(1,'/outings/groups/'+group.id);
  const secondPlan=freshGroup.outings.find(candidate=>candidate.id!==planId);
  check(freshGroup.outings.length===2&&secondPlan.chosenEventId===fixture.eventIds[0],'Same event can belong to a second outing after explicitly moving the first night');
  refs=await liveReferences();
  check(refs.find(message=>message.id===source.id).outingId===planId&&refs.find(message=>message.id===secondSource.id).outingId===secondPlan.id,'Two outings for the same event keep separate source identities and permissions');
  check(await evaluate(`${referenceState(source.id)}==='unavailable'&&${referenceState(secondSource.id)}==='chosen'`),'Old and current references display their own outing state without event-wide association');
  await shot('same-event-two-outings');

  // The paged endpoint must refresh references older than the latest50 without
  // pretending those noncontiguous rows are the complete message history.
  await open(1,'/groups/'+group.id+'/outings/'+secondPlan.id);
  for(let i=0;i<55;i++)await api(0,'/outings/groups/'+group.id+'/messages','POST',{content:'Synthetic history message '+String(i+1).padStart(2,'0'),requestId:crypto.randomUUID()});
  const page=await api(1,'/outings/groups/'+group.id+'/messages?references='+source.id+','+secondSource.id);
  check(page.items.length===50&&page.hasMore===true,'Real history pagination still returns50 rows with hasMore');
  check(page.references.some(message=>message.id===source.id&&message.outingId===planId)&&page.references.some(message=>message.id===secondSource.id&&message.outingId===secondPlan.id),'Targeted refresh retrieves both canonical references beyond the latest50 messages');
  await open(1);
  await until(`window.__referenceQa.requestQueries.some(route=>route.includes('references='))`);
  // Use physical up-scroll. DOM scrollIntoView follows layout coordinates and
  // moves the wrong way under the inverted list's transform.
  let older;
  for(let attempt=0;attempt<45;attempt++){
    older=await evaluate(`(()=>{const n=[...document.querySelectorAll('[role=button],button')].find(button=>button.textContent.trim()==='Earlier messages');if(!n)return null;const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{x:r.x,y:r.y,width:r.width,height:r.height,hittable:!!hit&&n.contains(hit)}})()`);
    if(older?.hittable&&older.y>=124&&older.y+older.height<=780)break;
    await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:200,y:400,deltaX:0,deltaY:-600});await delay(150);
  }
  check(older?.hittable&&older.y>=124&&older.y+older.height<=780,'Actual up-scroll reaches the explicit history control');
  const historyPoint={x:older.x+older.width/2,y:older.y+older.height/2,button:'left',clickCount:1};
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...historyPoint});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...historyPoint});
  await until(`window.__referenceQa.requestQueries.some(route=>new URL(route,location.origin).searchParams.has('before'))`);
  await until(referenceNode(secondSource.id));
  await until(`![...document.querySelectorAll('[role=button],button')].some(button=>button.textContent.trim()==='Earlier messages')`);
  check(true,'Exhausting the historical page removes the Earlier messages action even with targeted references');
  for(let attempt=0;attempt<15;attempt++){
    const rect=await evaluate(`(()=>{const r=${referenceNode(secondSource.id)}.getBoundingClientRect();return{y:r.y,height:r.height}})()`);
    if(rect.y>=130&&rect.y+rect.height<=780)break;
    await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:200,y:400,deltaX:0,deltaY:rect.y<130?-120:120});await delay(120);
  }
  check(await evaluate(`window.__referenceQa.requestQueries.some(route=>new URL(route,location.origin).searchParams.has('before'))`),'Explicit history action requests the missing real page instead of claiming references are complete history');
  check(await evaluate(`${referenceState(secondSource.id)}==='chosen'`),'Native web hydrates the current old reference from real API metadata');
  check(await evaluate(`document.querySelectorAll('[data-testid="group-message-${secondSource.id}"]').length===1`),'Pagination refresh does not duplicate the source cell');
  await shot('reference-beyond-latest-50');
  requests.push(...await evaluate('window.__realGroups.requests'));
  check(!requests.some(request => /tickets\/(purchase|book)/.test(request.route)), 'Share, proposal, response and withdrawal do not trigger ticketing');
  check(errors.length === 0, 'No browser runtime errors');
  fs.writeFileSync(path.join(artifacts, prefix + '-results.json'), JSON.stringify({scope: 'Actual RN Web routes and local Go/PostgreSQL; synthetic authentication,55 history messages, explicit context setup and one injected503; no UIKit, Stripe or production verification',groupId: group.id, planId, secondPlanId:secondPlan.id,sourceMessageId: source.id,secondSourceMessageId:secondSource.id, checks, samples, requests, errors}, null, 2));
  console.log('COMPLETE', checks.length);
}).catch(error => {
  fs.writeFileSync(path.join(artifacts, prefix + '-failure.json'), JSON.stringify({error: error.message, checks, samples, requests}, null, 2));
  console.error(error); process.exitCode = 1;
});
