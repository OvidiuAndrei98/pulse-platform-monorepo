// Real RN Web routes with synthetic, local fixtures. This deliberately does not
// claim physical UIKit keyboard, Liquid Glass, swipe-back or Dynamic Type QA.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');
const origin = process.env.GROUPS_NATIVE_URL || 'http://localhost:8083';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('LOCAL_PREVIEW_REQUIRED');
const phase = process.env.CARD_AUDIT_PHASE || 'after', only = process.env.CARD_AUDIT_ONLY;
const cardKinds = process.env.CARD_AUDIT_KINDS?.split(',') || ['shared-own', 'shared-received', 'invitation-own', 'invitation-received', 'comparison'];
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const group = id(20), artifacts = path.resolve(__dirname, '../artifacts'), prefix = 'chat-card-date-' + phase;
const source = fs.readFileSync(path.resolve(__dirname, '../../pulse-app/scripts/groups.browser.cjs'), 'utf8');
const a = source.indexOf('function(){'), b = source.indexOf('}.toString()})()`', a);
if (a < 0 || b < a) throw Error('Local fixture bootstrap unavailable');
const fixture = source.slice(a, b + 1).replace(/const actor=(.*?),photo=/, 'const actor=1,photo=');
const chat = fs.readFileSync(path.join(__dirname, 'browser-chat-audit.cjs'), 'utf8');
const start = chat.indexOf('{source:`') + 9, end = chat.indexOf('`});', start);
const bootstrap = chat.slice(start, end).replace('${fixture}', fixture);
const photo = path.resolve(__dirname, '../public/party-event.webp'), existed = fs.existsSync(photo);
if (!existed) fs.copyFileSync(path.resolve(__dirname, '../assets/party-event.webp'), photo);
const samples = [], checks = [], writes = [];

withBrowser(async ({ call, evaluate, until: poll, click, delay, capture, errors, onCDPEvent }) => {
  const until = (condition, timeout = 60000) => poll(condition, timeout);
  const node = key => `document.querySelector('[data-testid="${key}"]')`;
  const check = (passed, label) => { checks.push({ passed: !!passed, label }); assert.ok(passed, label); };
  await call('Page.addScriptToEvaluateOnNewDocument', { source: bootstrap + `{
    const qa=window.__permanentGroups,params=new URL(location.href).searchParams,kind=params.get('cardKind'),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
    const snapshot=p=>({title:p.title,revision:p.revision,decisionRound:p.decisionRound,chosenEventId:p.chosenEventId,outingDate:p.outingDate,city:p.city,candidateDates:p.candidateDates.map(x=>x.date)});
    if(kind){
      const plan=qa.group.outings[0],mine=kind.endsWith('own'),shared=kind.startsWith('shared');
      if(kind==='comparison'){
        delete plan.chosenEventId;plan.lifecycle='choosing_event';
        plan.options=qa.events.slice(0,2).map(e=>({eventId:e.id,title:e.title,location:e.locationName,imageUrl:e.bannerUrl,startTime:e.startTime,available:true,proposedBy:id(2),reactions:[],priceRon:50,totalPriceRon:54,ticketAvailability:'on_sale'}));
      }
      plan.members.forEach(m=>m.attendance='unanswered');plan.confirmedCount=0;
      const original=qa.messages.find(m=>m.kind===(shared?'event':'outing'));
      const row={...original,id:id(109),requestId:id(209),seq:1,senderId:id(mine?1:2),username:mine?'Franco QA':'Ana QA',content:'',...(!shared?{outingContext:snapshot(plan)}:{})};
      if(kind.includes('associated')){
        delete plan.chosenEventId;plan.lifecycle='choosing_event';
        plan.options=[{...plan.options[0],eventId:row.event.id,title:row.event.title,startTime:row.event.startTime,imageUrl:row.event.imageUrl,location:row.event.location}];
      }
      qa.messages.splice(0,qa.messages.length,row);qa.group.lastSeq=1;
      if(params.has('long')){
        const title='A longer event title with an international headliner and a second set across the whole night';
        qa.events.forEach(e=>e.title=title);plan.options.forEach(e=>e.title=title);if(row.event)row.event.title=title;
      }
      if(params.has('missing')){qa.events.forEach(e=>delete e.bannerUrl);plan.options.forEach(e=>delete e.imageUrl);if(row.event)delete row.event.imageUrl;}
    }
    window.__cardAudit={kind};
  }` });
  const open = async (route, extras = '') => {
    await call('Page.navigate', { url: origin + route + '?case=conversation&chatCase=cards&pinned=1' + extras });
    await until(node(route.includes('/outings/') ? 'group-outing' : 'group-messages'));
    await delay(250);
  };
  const shot = label => capture(prefix + '-' + label);
  const measure = async label => {
    const result = await evaluate(`(()=>{
      const rect=n=>{if(!n)return null;const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,bottom:r.bottom,right:r.right}},row=${node('group-message-' + id(109))};
      const covers=[...document.querySelectorAll('[data-testid$="-cover"], [data-testid="event-cover"]')].filter(n=>row?.contains(n));
      const buttons=row?[...row.querySelectorAll('[role="button"],[role="radio"],[role="checkbox"]')].map(n=>({id:n.dataset.testid,label:n.getAttribute('aria-label')||n.textContent,...rect(n)})):[];
      const meta=${node('group-received-time-' + id(109))};
      return{kind:window.__cardAudit.kind,route:location.pathname,viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,row:rect(row),covers:covers.map(rect),artwork:[...row?.querySelectorAll('[data-testid="event-artwork"]')||[]].map(rect),buttons,meta:rect(meta),geometry:window.__chatAudit.geometry()};
    })()`);
    samples.push({ label, ...result });
    console.log('CARD', label, JSON.stringify({ row: result.row, covers: result.covers, latest: result.geometry?.latest?.bottom, composer: result.geometry?.composer.top }));
    return result;
  };
  if (only !== 'date') {
    for (const width of [390, 320]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
      for (const kind of cardKinds) {
        await open('/groups/' + group, '&cardKind=' + kind); await until(node('group-message-' + id(109)));
        const m = await measure(width + '-' + kind); await shot(width + '-' + kind);
        check(m.documentWidth <= width + 1 && m.row.x >= 0 && m.row.right <= width + .5, kind + ' fits ' + width);
        check(m.geometry.latest.bottom <= m.geometry.composer.top + .5, kind + ' latest metadata stays above composer at ' + width);
        check(m.covers.length === (kind === 'comparison' ? 2 : 1), kind + ' renders its expected photo surfaces');
        for (const cover of m.covers) check(cover.width / cover.height >= 2.34 && cover.width / cover.height <= 2.51, kind + ' uses a wide cover ratio at ' + width);
        if (kind.startsWith('shared')) check(m.buttons.filter(b => b.id === 'group-create-outing').every(b => b.height >= 44), kind + ' direct action retains a 44px target');
        if(kind.includes('associated')){
          check(await evaluate(`${node('group-create-outing')}?.textContent==='Open outing'`),'The associated shared event derives its Open outing action');
          await delay(1500);const settled=await measure(width+'-'+kind+'-settled');
          check(Math.abs(settled.row.height-m.row.height)<.5,'Associated shared card has no post-layout growth');
          await click('group-create-outing');await until(node('group-outing'));
          const actionWrites=await evaluate('window.__permanentGroups.writes.filter(w=>/\\/(outings|attendance|vote|proposals)$/.test(w.route))');
          writes.push({label:width+'-'+kind+'-open-outing',actionWrites});
          check(actionWrites.length===0,'Open outing never creates an outing or response');
          await click('group-outing-back');await until(node('group-messages'));
          const returned=await measure(width+'-'+kind+'-returned');
          check(Math.abs(returned.row.height-m.row.height)<.5,'Associated shared card retains its height after returning');
        }
        if (kind.startsWith('invitation')) {
          const responses = m.buttons.filter(b => b.id === 'group-chat-response-yes' || b.id === 'group-chat-response-no');
          check(responses.length === 2 && responses.every(b => b.height >= 44), kind + ' has two accessible direct responses');
          const route = await evaluate('location.pathname');
          await click('group-chat-response-yes'); await until('window.__permanentGroups.writes.some(w=>w.route.endsWith("/attendance"))');
          check(await evaluate('location.pathname') === route, 'Response does not trigger card navigation');
          check(await evaluate('window.__permanentGroups.group.outings[0].members.find(m=>m.userId==="' + id(1) + '").attendance') === 'yes', 'Response reaches the local API fixture');
          await evaluate('window.__permanentGroups.failNextAnswer=true'); await click('group-chat-response-no');
          await until(`${node('group-chat-response-no')}?.textContent.includes('Try again')`); await shot(width + '-' + kind + '-failed');
          const failure = await measure(width + '-' + kind + '-failed');
          check(Math.abs(failure.row.height - m.row.height) < 1, 'Request error does not resize the invitation');
          check(await evaluate(`${node('group-chat-response-yes')}?.getAttribute('aria-checked')==='true'`), 'Failed answer keeps the confirmed attendance selected');
          await click('group-chat-response-no'); await until('window.__permanentGroups.group.outings[0].members.find(m=>m.userId==="' + id(1) + '").attendance==="no"');
          check(await evaluate('location.pathname') === route, 'Retry stays inside the conversation');
        }
        const expected = await evaluate(kind.startsWith('shared') ? '"/events/"+window.__permanentGroups.messages[0].eventId' : '"/groups/'+group+'/outings/"+window.__permanentGroups.group.outings[0].id');
        const coverID = await evaluate(`document.querySelector('[data-testid="group-message-${id(109)}"] [data-testid$="-cover"]')?.dataset.testid`);
        await click(coverID); await until('(location.pathname==='+JSON.stringify(expected)+'||location.pathname.startsWith('+JSON.stringify(expected+'/')+'))');
        const destination = await evaluate('location.pathname'); samples.push({ label: width + '-' + kind + '-navigation', expected, destination });
        check(destination === expected || destination.startsWith(expected + '/'), kind + ' photograph opens the correct detail route');
      }
    }
    await open('/groups/' + group, '&cardKind=invitation-received&long=1');
    await evaluate(`(()=>{const text=[];for(const n of document.querySelectorAll('div,span'))if([...n.childNodes].some(t=>t.nodeType===Node.TEXT_NODE&&t.textContent.trim())){const s=getComputedStyle(n);text.push([n,parseFloat(s.fontSize),parseFloat(s.lineHeight)])}for(const[n,f,l]of text){n.style.fontSize=f*1.35+'px';if(Number.isFinite(l))n.style.lineHeight=l*1.35+'px'}})()`);
    await delay(200); const enlarged = await measure('320-long-enlarged'); await shot('320-long-enlarged');
    check(enlarged.documentWidth <= 321, 'Long title and CSS-enlarged text do not overflow width');
    check(enlarged.buttons.filter(b => b.id?.startsWith('group-chat-response-')).every(b => b.x >= 0 && b.right <= 320 && b.height >= 44), 'Enlarged responses retain their complete targets');
    await open('/groups/' + group, '&cardKind=shared-received&missing=1'); await delay(350); await measure('320-neutral-image-fallback'); await shot('320-neutral-image-fallback');
    check(await evaluate('!document.querySelector("[data-testid=group-shared-preview-' + id(109) + '-cover] img")'), 'Missing photograph uses a neutral surface instead of an invented image');
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  if (only !== 'cards') {
    const framesDir = path.join(artifacts, prefix + '-recording'); fs.mkdirSync(framesDir, { recursive: true }); const frames = [];
    const unsubscribe = onCDPEvent(message => {
      if (message.method !== 'Page.screencastFrame') return;
      const p = message.params; call('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
      const file = 'frame-' + String(frames.length).padStart(5, '0') + '.jpg';
      fs.writeFileSync(path.join(framesDir, file), Buffer.from(p.data, 'base64')); frames.push({ file, timestamp: p.metadata.timestamp });
    });
    await open('/groups/' + group); await click('group-add'); await click('group-open-night'); await until(node('group-night-form'));
    await call('Page.startScreencast', { format: 'jpeg', quality: 75, maxWidth: 390, maxHeight: 844, everyNthFrame: 1 });
    const today = await evaluate('new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Bucharest",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())');
    const target = new Date(Date.parse(today + 'T12:00:00Z') + 2 * 86400000).toISOString().slice(0, 10);
    await click('ribbon-day-' + target); await shot('working-date-tap');
    const selected = await evaluate('document.querySelector("[data-testid^=ribbon-day-][aria-pressed=true]")?.dataset.testid');
    check(selected === 'ribbon-day-' + target, 'Tap sets the highlighted working date');
    await click('group-night-pick-event'); await until(node('group-event-picker-context'));
    let requests = await evaluate('window.__permanentGroups.reads.filter(r=>r.startsWith("/events?")&&r.includes("nightDate="))'); writes.push({ label: 'date-tap', requests });
    check(new URL('http://fixture' + requests.at(-1)).searchParams.get('nightDate') === target, 'Selector request uses the tapped day');
    await shot('working-date-selector'); await click('group-event-picker-page-back'); await until(node('group-night-form'));
    // An actual wheel event followed immediately by the navigation action tests
    // deterministic completion of the browser scroll, without waiting a timer.
    const point = await evaluate(`(()=>{const r=${node('discovery-date-track')}.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 44 * 38, deltaY: 0 });
    await delay(35); const visual = await evaluate('document.querySelector("[data-testid^=ribbon-day-][aria-pressed=true]")?.dataset.testid?.slice(11)');
    await click('group-night-pick-event'); await until(node('group-event-picker-context'));
    requests = await evaluate('window.__permanentGroups.reads.filter(r=>r.startsWith("/events?")&&r.includes("nightDate="))'); writes.push({ label: 'date-fast-wheel', selectedBeforeClick: visual, requests });
    check(new URL('http://fixture' + requests.at(-1)).searchParams.get('nightDate') === visual, 'Immediate selector navigation completes the current visual day');
    await shot('working-date-fast-selector');
    await call('Page.stopScreencast'); unsubscribe();
    fs.writeFileSync(path.join(framesDir, 'frames.json'), JSON.stringify({ kind: 'Continuous Chrome CDP capture, synthetic data; pointer/wheel, not native wheel', frames }, null, 2));
  }
  check(errors.length === 0, 'No runtime errors during card/date QA');
  fs.writeFileSync(path.join(artifacts, prefix + '-results.json'), JSON.stringify({ scope: 'RN Web actual navigation with isolated fixture API; CSS enlarged text, no physical UIKit claims', samples, checks, writes, errors }, null, 2));
  console.log('COMPLETE cards/date', checks.length, 'checks');
}).catch(error => {
  fs.writeFileSync(path.join(artifacts, prefix + '-failure.json'), JSON.stringify({ error: error.message, samples, checks, writes }, null, 2));
  console.error(error); process.exitCode = 1;
}).finally(() => { if (!existed && fs.existsSync(photo)) fs.unlinkSync(photo); });
