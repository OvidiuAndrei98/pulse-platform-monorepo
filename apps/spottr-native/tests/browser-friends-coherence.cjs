// Actual RN Web screens and navigation against explicitly synthetic, isolated API
// fixtures. This does not establish native iPhone/Android or live API behaviour.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {withBrowser} = require('./browser-harness.cjs');
const origin = process.env.GROUPS_NATIVE_URL || 'http://localhost:8083';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('LOCAL_PREVIEW_REQUIRED');
const source = fs.readFileSync(path.resolve(__dirname, '../../pulse-app/scripts/groups.browser.cjs'), 'utf8');
const start = source.indexOf('function(){'), end = source.indexOf('}.toString()})()`', start);
if (start < 0 || end < start) throw Error('Shared isolated browser fixture not found');
const fixture = source.slice(start, end + 1)
  .replace(/const actor=(.*?),photo=/, "const actor=Number(new URL(location.href).searchParams.get('actor'))||($1),photo=")
  // Complete the creation-time snapshot for the current validated API schema.
  .replace('snapshot=plan=>({revision:', 'snapshot=plan=>({title:plan.title,revision:');
const photo = path.resolve(__dirname, '../public/party-event.webp'), existed = fs.existsSync(photo);
if (!existed) fs.copyFileSync(path.resolve(__dirname, '../assets/party-event.webp'), photo);
const phase = process.env.FRIENDS_COHERENCE_PHASE || 'after';

withBrowser(async ({call, evaluate, until: poll, click, input, delay, capture, errors}) => {
  const until=(expression,timeout=60000)=>poll(expression,timeout);
  const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
  const group = id(20), plan = id(30);
  await call('Page.addScriptToEvaluateOnNewDocument', {source: `{
    const mode = new URL(location.href).searchParams.get('case');
    const actor = Number(new URL(location.href).searchParams.get('actor')) || (['availability','proposals-owner','incoming','settings-member','picker-empty','picker-error'].includes(mode) ? 2 : 1);
    const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
    localStorage.setItem('spottr-native.session.v1', JSON.stringify({version:1,token:'isolated-permanent-groups',user:{id:id(actor),username:actor===1?'Franco QA':'Ana QA',email:'group'+actor+'@example.invalid',role:'user',hasPassword:true,preferredLanguage:'en',createdAt:'2026-01-01T00:00:00Z',avatarUrl:'/party-event.webp'}}));
  } (${fixture})();
  {
    const qa = window.__permanentGroups, original = fetch.bind(window);
    const clone=value=>JSON.parse(JSON.stringify(value)), params=new URL(location.href).searchParams;
    const initial=qa.group.outings[0],context=p=>({title:p.title,city:p.city,outingDate:p.outingDate,candidateDates:p.candidateDates.map(d=>d.date),chosenEventId:p.chosenEventId,decisionRound:p.decisionRound||1});
    // Initial fixture messages represent the context at their creation. Never
    // recompute these snapshots when a later context or destination changes.
    qa.messages.filter(m=>m.kind==='outing').forEach(m=>{const p=qa.group.outings.find(p=>p.id===m.outingId);if(p&&!m.outingContext)m.outingContext=clone(context(p))});
    qa.saveSnapshot=()=>localStorage.setItem('qa-friends-coherence-state',JSON.stringify({group:qa.group,messages:qa.messages,events:qa.events,tickets:qa.tickets,transfers:qa.transfers,writes:qa.writes}));
    if(params.get('persist')==='1'){
      const raw=localStorage.getItem('qa-friends-coherence-state');
      if(raw){const saved=JSON.parse(raw);Object.assign(initial,saved.group.outings.find(p=>p.id===initial.id));Object.assign(qa.group,saved.group);qa.group.outings=qa.group.outings.map(p=>p.id===initial.id?initial:p);qa.messages.splice(0,qa.messages.length,...saved.messages);qa.events.splice(0,qa.events.length,...saved.events);qa.tickets.splice(0,qa.tickets.length,...saved.tickets);qa.transfers.splice(0,qa.transfers.length,...saved.transfers);qa.writes.splice(0,qa.writes.length,...saved.writes)}
    }
    if(params.get('variant')==='pending'){
      qa.group.members[2].status='pending';initial.members=initial.members.filter(m=>m.userId!==qa.group.members[2].userId);initial.confirmedCount=initial.members.filter(m=>m.attendance==='yes').length;
    }
    if(params.get('variant')==='long-text'){
      qa.group.name='The nights we choose together — very long group name for readability QA';
      qa.group.members[1].username='Alexandru-Mihai Popescu Ionescu QA';initial.members[1].username=qa.group.members[1].username;
      const title='AFTER DARK — A very long event title with special guests, extended club sessions and late night music QA';
      qa.events[0].title=title;initial.options[0].title=title;qa.messages.filter(m=>m.event?.id===qa.events[0].id).forEach(m=>m.event.title=title);
      qa.messages.find(m=>m.kind==='text').content='A longer incoming message to check how wrapping, avatars and the outside timestamp behave when text is enlarged and the available width is narrow.';
    }
    if(params.get('variant')==='missing-image'){
      qa.events.forEach(e=>e.bannerUrl='/missing-fixture-image.webp');initial?.options.forEach(e=>e.imageUrl='/missing-fixture-image.webp');qa.messages.forEach(m=>{if(m.event)m.event.imageUrl='/missing-fixture-image.webp'});
    }
    if(params.get('variant')==='many-proposals'){
      const base=clone(initial.options[0]);
      initial.options=Array.from({length:8},(_,i)=>({...clone(base),eventId:'00000000-0000-4000-8000-'+String(40+i).padStart(12,'0'),title:'Proposal '+(i+1)+' QA'}));
    }
    if(params.get('variant')==='eight-members'){
      qa.group.name='';qa.group.members=Array.from({length:8},(_,i)=>({...clone(qa.group.members[i%3]),userId:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),username:'Alexandru-Mihai Popescu Ionescu '+(i+1),status:'accepted'}));
      initial.members=qa.group.members.map(m=>({...m,attendance:'unanswered',hasTicket:false,ticketState:'none'}));
    }
    if(params.get('variant')==='unanswered'){
      initial.members.forEach(m=>m.attendance='unanswered');initial.confirmedCount=0;initial.readyCount=0;initial.allConfirmedReady=false;
    }
    if(params.get('variant')?.startsWith('free')){
      qa.events.forEach(e=>e.ticketTypes.forEach(t=>t.priceRon=0));initial.options.forEach(o=>{o.priceRon=0;o.totalPriceRon=0});
      if(params.get('variant')!=='free-extra'){initial.members.forEach(m=>{m.hasTicket=false;m.ticketState='none';m.attendance='unanswered'});initial.confirmedCount=0;initial.readyCount=0;initial.allConfirmedReady=false;qa.tickets.splice(0)}
      if(params.get('variant')==='free-unknown'){delete initial.members[0].hasTicket;initial.members[0].ticketState='unknown'}
    }
    const makeFeed = (e, actorId, activityType) => ({activityType,actorId,actorUsername:actorId.endsWith('2')?'Ana QA':'Mihai QA',actorAvatarUrl:'/party-event.webp',eventId:e.id,eventTitle:e.title,eventBannerUrl:e.bannerUrl,eventStartTime:e.startTime,eventEndTime:e.endTime,eventLocation:e.locationName,locationName:e.locationName,occurredAt:new Date().toISOString()});
    const feed = [makeFeed(qa.events[0],qa.group.members[1].userId,'friend_ticket'),makeFeed(qa.events[0],qa.group.members[2].userId,'friend_going'),makeFeed(qa.events[1],qa.group.members[1].userId,'friend_ticket')];
    window.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname.endsWith('/api/v1/feed')) return new Response(JSON.stringify(feed), {headers:{'content-type':'application/json'}});
      if(init.method==='POST'&&/\\/(availability|attendance|vote)$/.test(url.pathname)&&qa.holdNextAnswer){qa.holdNextAnswer=false;await new Promise(resolve=>qa.releaseAnswer=resolve)}
      const response=await original(input, init);
      // Simulate an existing older outing outside the initial group page. The
      // canonical fixture still owns it, so create returns it idempotently.
      if(params.get('variant')==='older-outing'&&(!init.method||init.method==='GET')&&(url.pathname.endsWith('/outings/groups')||url.pathname.endsWith('/outings/groups/'+qa.group.id))){
        const hide=g=>({...g,outings:g.outings.filter(p=>p.id!==initial.id),outingsHasMore:true});
        return new Response(JSON.stringify(url.pathname.endsWith('/outings/groups')?[hide(qa.group)]:hide(qa.group)),{headers:{'content-type':'application/json'}});
      }
      if(init.method==='POST')qa.saveSnapshot();
      return response;
    };
  }`});
  const node = key => `document.querySelector('[data-testid="${key}"]')`;
  const visible = key => `(()=>{const n=${node(key)};return n&&n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0})()`;
  const open = async (route, mode = 'conversation', extra = {}) => {
    await call('Page.navigate', {url: origin + route + (route.includes('?') ? '&' : '?') + new URLSearchParams({case:mode,...extra})});
    await until('window.__permanentGroups', 60000);
  };
  const shot = async name => {await delay(400); await capture(`friends-coherence-${phase}-${name}`);};
  const disabled=key=>`(()=>{const n=${node(key)};return n&&(n.disabled||n.getAttribute('aria-disabled')==='true')})()`;
  const selected=key=>`${node(key)}?.getAttribute('aria-checked')==='true'`;
  const press=async(key)=>{await until(visible(key));await evaluate(`${node(key)}.scrollIntoView({block:'center'})`);let last='';for(let i=0;i<18;i++){const value=await evaluate(`(()=>{const n=${node(key)},r=n.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),hit:n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})})()`),r=JSON.parse(value);if(value===last&&r.hit){const point={x:r.x+r.w/2,y:r.y+r.h/2,button:'left',clickCount:1};await call('Input.dispatchMouseEvent',{type:'mousePressed',...point});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point});return}last=value;await delay(75)}await shot('covered-'+key);throw Error('Covered or moving control '+key)};
  const scrollMessage = async id => {
    await until(node('group-message-' + id));
    await evaluate(`${node('group-message-' + id)}.scrollIntoView({block:'center'})`);
    await delay(160);
  };
  if(process.env.FRIENDS_COHERENCE_EXTRA_ONLY){
    await call('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:true});
    await open('/friends','conversation',{variant:'eight-members'});await until(node('group-row-'+group));
    const row=await evaluate(`(()=>{const n=${node('group-row-'+group)},r=n.getBoundingClientRect();return{x:r.x,right:r.right,text:n.innerText}})()`);
    assert.ok(row.x>=0&&row.right<=320.5);assert.ok(row.text.includes('Alexandru-Mihai'));
    await shot('eight-members-320-friends');await press('group-row-'+group);await until(node('group-chat-response'));
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await shot('eight-members-320-chat');
    await open('/groups/'+group+'/info','conversation',{variant:'eight-members'});await until(node('group-info-name'));
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await shot('eight-members-320-info');
    assert.ok(await evaluate(`${node('group-info-name')}.getBoundingClientRect().height<=102`),'Automatic group title stays within three lines; complete identities remain in member list');
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await open('/groups/'+group,'conversation',{actor:1,variant:'older-outing'});await until(node('group-event-action-'+id(11)));
    await press('group-event-action-'+id(11));await until(node('group-attendance'));
    assert.equal(await evaluate('location.pathname'),'/groups/'+group+'/outings/'+plan);
    assert.equal(await evaluate('window.__permanentGroups.group.outings.length'),1);
    assert.equal(await evaluate('window.__permanentGroups.group.outings[0].chosenEventId'),id(10));
    assert.equal(await evaluate('window.__permanentGroups.group.outings[0].options.some(o=>o.eventId==="'+id(11)+'")'),true);
    assert.equal(await evaluate('window.__permanentGroups.writes.filter(w=>w.route.endsWith("/proposals")).length'),1);
    await shot('older-outing-alternative');
    assert.deepEqual(errors.filter(e=>!e.includes('Failed to load resource')),[]);
    console.log('PASS native eight long member names, bounded automatic title and older-outing alternative reuse');return;
  }

  await open('/friends');
  await until(visible('friends-hub'), 60000);
  await until(node('group-row-' + group));
  await until('document.body.innerText.includes("ROOF TOP QA")');
  await shot('friends');
  await click('group-row-' + group);
  await until(visible('friend-group'));
  await until(node('group-message-' + id(103)));
  await shot('chat-poll');
  await scrollMessage(id(102));
  await shot('chat-event');
  await scrollMessage(id(100));
  await shot('chat-incoming-outgoing');
  await click('group-summary');
  await until(visible('group-outing'));
  await shot('outing-confirmed');
  await open('/groups/' + group + '/outings/' + plan, 'availability');
  await until(visible('group-outing'));
  await shot('outing-undecided');
  await click('group-empty-propose');
  await until(node('group-send-event-' + id(10)));
  await shot('selector');
  await open('/groups/' + group + '/info', 'settings-owner');
  await until(node('group-info-name'));
  await shot('info');
  await open('/groups', 'conversation');
  await until(node('group-row-' + group));
  await shot('groups');
  if(phase!=='before'&&!process.env.FRIENDS_COHERENCE_CAPTURES_ONLY){
    const chat='/groups/'+group,detail=chat+'/outings/'+plan;
    const state=expression=>'window.__permanentGroups.group.outings[0].'+expression;
    const paymentWrites=()=>evaluate('window.__permanentGroups.writes.filter(w=>/tickets\\/(book|purchase)|payment|checkout/i.test(w.route))');

    // Known event: two direct answers; no availability gate, maybe or join-plan.
    await open(chat,'conversation',{actor:1,variant:'unanswered'});await until(node('group-chat-response-yes'));
    assert.equal(await evaluate(`${node('group-chat-response')}.querySelectorAll('[role=radio]').length`),2);
    assert.equal(await evaluate('!!'+node('group-chat-response-maybe')),false);
    assert.equal(await evaluate(`${node('group-chat-response')}.querySelectorAll('[aria-checked=true]').length`),0);
    await evaluate('window.__permanentGroups.holdNextAnswer=true');await press('group-chat-response-yes');
    await until('typeof window.__permanentGroups.releaseAnswer==="function"');
    assert.equal(await evaluate(disabled('group-chat-response-no')),true);
    assert.equal(await evaluate(selected('group-chat-response-yes')),false);
    await evaluate(`${node('group-chat-response-no')}.click()`);await shot('current-attendance-pending');
    await evaluate('window.__permanentGroups.releaseAnswer()');await until(selected('group-chat-response-yes'));
    assert.equal(await evaluate('window.__permanentGroups.writes.filter(w=>w.route.endsWith("/attendance")).length'),1);
    await evaluate('window.__permanentGroups.failNextAnswer=true');await press('group-chat-response-no');await until(node('group-chat-response-error'));
    assert.equal(await evaluate(selected('group-chat-response-yes')),true);
    assert.equal(await evaluate(`(()=>{const text=${node('group-chat-response-error')}.innerText.trim();return [...document.querySelectorAll('[role=alert]')].filter(n=>n.getBoundingClientRect().height>0&&n.innerText.trim()===text).length})()`),1);
    await shot('current-attendance-error');await press('group-chat-response-retry');await until(selected('group-chat-response-no'));
    await press('group-chat-view-outing');await until(selected('group-attendance-no'));
    assert.equal(await evaluate('!!'+node('group-availability')),false);
    await press('group-attendance-yes');await until(selected('group-attendance-yes'));await press('group-outing-back');await until(selected('group-chat-response-yes'));
    assert.equal((await paymentWrites()).length,0);await shot('current-invitation');
    await evaluate('window.__permanentGroups.saveSnapshot()');await open(chat,'conversation',{actor:2,persist:1});await until(node('group-chat-response-no'));
    assert.equal(await evaluate(`${node('group-chat-response')}.querySelectorAll('[aria-checked=true]').length`),0);
    await press('group-chat-response-no');await until(selected('group-chat-response-no'));
    await evaluate('window.__permanentGroups.saveSnapshot()');await open(detail,'conversation',{actor:1,persist:1});await until(selected('group-attendance-yes'));
    assert.equal(await evaluate(state('members.find(m=>m.userId==="'+id(2)+'").attendance')),'no');
    assert.equal(await evaluate('window.__permanentGroups.group.members.find(m=>m.userId==="'+id(2)+'").status'),'accepted','Declining outing never leaves group');
    assert.equal((await paymentWrites()).length,0);await shot('current-creator-member');
    console.log('PASS current direct yes/no attendance, pending guard, one error/retry and two-actor chat/detail reconciliation');

    // Before choice, one toggle per event supports multiple independent picks.
    await open(detail,'proposals',{actor:1});await until(node('group-preference-'+id(10)));
    assert.equal(await evaluate('!!'+node('group-availability')),false);
    const first='group-preference-'+id(10),second='group-preference-'+id(11);
    const order=await evaluate('[...document.querySelectorAll("[data-testid^=group-proposal-]")].map(n=>n.dataset.testid)');
    await press(first);await until(state('options[0].reactions.some(r=>r.userId==="'+id(1)+'"&&r.answer==="yes")'));
    await press(second);await until(state('options[1].reactions.some(r=>r.userId==="'+id(1)+'"&&r.answer==="yes")'));
    await press(first);await until('!'+state('options[0].reactions.some(r=>r.userId==="'+id(1)+'"&&r.answer==="yes")'));
    assert.equal(await evaluate(state('options[1].reactions.some(r=>r.userId==="'+id(1)+'"&&r.answer==="yes")')),true);
    assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-testid^=group-proposal-]")].map(n=>n.dataset.testid)'),order);
    assert.equal(await evaluate(state('chosenEventId')),undefined);assert.equal(await evaluate('!!'+node('group-choose-'+id(10))),false);
    await shot('current-event-comparison');await evaluate('window.__permanentGroups.saveSnapshot()');
    await open(detail,'proposals',{actor:2,persist:1});await until(node('group-choose-'+id(11)));await press('group-choose-'+id(11));await until(node('group-confirm-choice'));
    assert.equal(await evaluate(state('chosenEventId')),undefined);await press('group-confirm-choice');await until(node('group-attendance-yes'));
    assert.equal(await evaluate(state('chosenEventId')),id(11));assert.equal(await evaluate(state('members.every(m=>m.attendance==="unanswered")')),true);
    assert.equal((await paymentWrites()).length,0);await shot('current-event-chosen');
    console.log('PASS current multiple event supports, deselection, stable order and explicit creator choice without automatic attendance');

    await open(detail,'availability',{actor:2});await until(node('group-empty-propose'));
    assert.equal(await evaluate('document.querySelectorAll("[role=radio],[role=combobox]").length'),0,'An undecided outing no longer inserts an availability response step');
    await shot('current-undecided');
    await open(detail,'proposals',{actor:2,variant:'many-proposals'});await until(node('group-more-proposals'));
    assert.equal(await evaluate('document.querySelectorAll(\'[data-testid^="group-proposal-"]\').length'),3);await shot('current-many-proposals');
    await press('group-more-proposals');assert.equal(await evaluate('document.querySelectorAll(\'[data-testid^="group-proposal-"]\').length'),8);
    assert.equal(await evaluate('window.__permanentGroups.writes.length'),0);

    // A changed context resets affected answers; old messages remain historical.
    await open(detail,'edit',{actor:2});await until(node('group-edit-context'));
    const ticketsBefore=await evaluate('JSON.stringify(window.__permanentGroups.tickets)'),nextDay=await evaluate('window.__permanentGroups.events[2].startTime.slice(0,10)');
    await press('group-edit-context');await until(node('group-save-context'));await delay(350);await click('ribbon-day-'+nextDay);
    await until(`${node('ribbon-day-'+nextDay)}?.getAttribute('aria-pressed')==='true'`);await press('group-save-context');await until(node('group-context-confirm'));await press('group-context-confirm');
    await until('!'+node('group-night-editor'));assert.equal(await evaluate(state('outingDate')),nextDay);
    assert.equal(await evaluate(state('members.every(m=>m.attendance==="unanswered")')),true);assert.equal(await evaluate('JSON.stringify(window.__permanentGroups.tickets)'),ticketsBefore);
    await evaluate('window.__permanentGroups.saveSnapshot()');await open(chat,'edit',{actor:1,persist:1});await until(node('group-message-'+id(103)));
    assert.equal(await evaluate(`${node('group-message-'+id(103))}.querySelectorAll('[role=radio]').length`),0);await shot('current-old-context');

    // Existing free-registration checkout is exercised for self/friends; no
    // external Stripe charge. Canonical fixture records the actual request.
    const purchase=async(variant,recipients)=>{
      await open(detail,variant==='free-extra'?'has-owned':'conversation',{actor:1,variant});await until(node('group-buy'));await press('group-buy');await until(node('outing-recipient-'+id(1)));
      for(const n of [1,2,3]){const key='outing-recipient-'+id(n),want=recipients.includes(n),checked=await evaluate(`${node(key)}?.getAttribute('aria-checked')==='true'`);if(checked!==want)await press(key)}
      if(variant==='free-extra'){
        await until(node('outing-extra-confirmation'));assert.equal(await evaluate(disabled('outing-recipients-continue')),true);
        assert.equal((await paymentWrites()).length,0);await shot('current-extra-ticket-confirm');await press('outing-extra-confirmation');
      }
      await until('!'+disabled('outing-recipients-continue'));await press('outing-recipients-continue');
      await until('window.__permanentGroups.writes.some(w=>w.route.endsWith("/tickets/book"))');
      await until('!'+node('outing-recipients-continue'));
      const body=await evaluate('window.__permanentGroups.writes.find(w=>w.route.endsWith("/tickets/book")).body');
      assert.deepEqual(body.outing.recipientIds,recipients.map(id));assert.equal(body.items[0].quantity,recipients.length);
      assert.equal(body.outing.extraConfirmed,variant==='free-extra'?true:undefined);
      assert.equal(await evaluate(state('members.find(m=>m.userId==="'+id(1)+'").attendance')),variant==='free-extra'?'yes':'unanswered');
      if(recipients.every(n=>n!==1)){assert.equal(await evaluate('window.__permanentGroups.tickets.filter(t=>t.assignedRecipientId==="'+id(1)+'").length'),0);assert.equal(await evaluate('!!'+node('ticket-preview')),false)}
      await shot('current-book-'+variant+'-'+recipients.join('-'));
    };
    await purchase('free-none',[1]);await purchase('free-none',[2]);await purchase('free-none',[1,2,3]);await purchase('free-extra',[1]);
    await open(detail,'conversation',{actor:1,variant:'free-unknown'});await until(node('group-buy'));await press('group-buy');await until(node('outing-recipient-'+id(1)));
    assert.equal(await evaluate(`${node('outing-recipient-'+id(1))}.getAttribute('aria-checked')==='true'`),false,'Unknown ticket status is not automatically selected as needing a ticket');
    console.log('PASS current self/friend-only/multiple free registration and deliberate additional-ticket confirmation; ownership/attendance remain separate');

    for(const mode of ['picker-empty','picker-error']){await open(detail,mode,{actor:2});await until(node('group-empty-propose'));await press('group-empty-propose');await until(node(mode==='picker-empty'?'group-picker-empty':'group-picker-error'));await shot('current-'+mode);if(mode==='picker-error'){await evaluate('window.__permanentGroups.failCatalog=false');await press('group-picker-retry');await until(node('group-send-event-'+id(10)));await until(node('group-send-event-'+id(11)))}}
    await open(chat,'invited',{actor:2});await until(node('group-accept'));assert.equal(await evaluate('!!'+node('group-messages')),false);await shot('current-invited');
    await open(detail,'history');await until(node('group-attendance-yes'));for(const a of ['yes','no'])assert.equal(await evaluate(disabled('group-attendance-'+a)),true);assert.equal(await evaluate('!!'+node('group-buy')),false);

    await call('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:true});
    await open(chat,'conversation',{variant:'long-text'});await until(node('group-chat-response'));
    await evaluate(`(()=>{const list=[];for(const n of document.querySelectorAll('div,span'))if([...n.childNodes].some(t=>t.nodeType===Node.TEXT_NODE&&t.textContent.trim())){const s=getComputedStyle(n);list.push([n,parseFloat(s.fontSize),parseFloat(s.lineHeight)])}for(const[n,f,l]of list){n.style.fontSize=f*1.35+'px';if(Number.isFinite(l))n.style.lineHeight=l*1.35+'px'}})()`);await shot('current-long-text-320');
    for(const a of ['yes','no']){const r=await evaluate(`(()=>{const r=${node('group-chat-response-'+a)}.getBoundingClientRect();return{x:r.x,right:r.right,h:r.height}})()`);assert.ok(r.x>=0&&r.right<=320.5&&r.h>=44)}
    await scrollMessage(id(100));await shot('current-incoming-meta-320');const meta=await evaluate(`(()=>{const b=${node('group-bubble-'+id(100))},m=${node('group-received-time-'+id(100))};return{outside:!b.contains(m),bottom:b.getBoundingClientRect().bottom,top:m.getBoundingClientRect().top}})()`);assert.ok(meta.outside&&meta.top>=meta.bottom-1);
    await open(chat,'conversation',{variant:'missing-image'});await until(node('group-message-'+id(101)));await scrollMessage(id(101));await shot('current-missing-image');
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await open('/');await until('document.body.innerText.toUpperCase().includes("ROOF TOP QA")');await shot('reference-home');await open('/events');await until('document.body.innerText.toUpperCase().includes("ROOF TOP QA")');await shot('reference-discover');
    console.log('PASS current context revision, invitations, closed state, empty/network retry, narrow/enlarged fallback and same-data reference captures');
  }

  assert.deepEqual(errors.filter(e => !e.includes('Failed to load resource')), []);
  console.log(`PASS ${phase} actual RN Web route captures: Friends, group incoming/outgoing, event, poll, outing, info and selector. Synthetic local API fixtures only.`);
}).catch(error => {console.error(error);process.exitCode = 1;}).finally(() => {
  if (!existed && fs.existsSync(photo)) fs.unlinkSync(photo);
});
