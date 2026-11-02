// Both exported Native-web and Next use the same isolated fixture contract.
// No real account, email, payment or production API is used by this suite.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {withBrowser}=require('./browser-harness.cjs');
const dictionary={exports:{}};vm.runInNewContext(ts.transpile(fs.readFileSync(path.resolve(__dirname,'../../../packages/app-core/src/i18n/resources.ts'),'utf8'),{module:ts.ModuleKind.CommonJS}),{exports:dictionary.exports,module:dictionary});
const language=process.env.OUTINGS_TEST_LANGUAGE==='ro'?'ro':'en',en=dictionary.exports.resources[language].translation,t=key=>key.split('.').reduce((v,k)=>v[k],en);
const web=process.env.OUTINGS_TEST_PLATFORM==='web',override=process.env.NAVIGATION_TEST_URL;
if(web&&!override)throw Error('LOCAL_WEB_PREVIEW_REQUIRED');
if(override&&!['localhost','127.0.0.1'].includes(new URL(override).hostname))throw Error('LOCAL_TEST_SERVER_REQUIRED');
withBrowser(async({base,call,evaluate,until,click,input,capture,errors,delay})=>{
  const origin=web?override:base;
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`(${function mock(language='en'){
    const original=window.fetch.bind(window),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),mode=new URL(location.href).searchParams.get('case')||'plan';
    const user={id:id(1),username:'Outing QA',email:'outing@example.test',role:'user',hasPassword:true,preferredLanguage:language,createdAt:'2026-01-01T00:00:00Z'};
    localStorage.setItem('pulse_token','isolated-outing-test');localStorage.setItem('i18nextLng',language);
    localStorage.setItem('spottr-native.session.v1',JSON.stringify({version:1,token:'isolated-outing-test',user}));
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const end=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
    const events=[4,5].map(n=>({id:id(n),organizerId:id(3),title:'Outing Event '+n,description:'Test event',locationName:'QA Venue',city:'Bucuresti',category:'house',vibe:'indoor',status:'published',startTime:day+'T20:00:00Z',endTime:end+'T04:00:00Z',latitude:44.4,longitude:26.1,ticketTypes:[],lineup:[{id:id(20),name:'QA Artist',stage:'Main stage',performanceTime:'22:00',isHeadliner:true,source:'MANUAL'}],stats:{goingCount:1,isFavorited:false}}));
    const friend={id:id(2),username:'Friend QA',role:'user',relationship:'friends',showAttendancePublicly:false,createdAt:'2026-01-01T00:00:00Z'};
    const ticket={id:id(90),orderId:id(80),eventId:id(4),validationHash:'a'.repeat(64),isValidated:mode==='night',ticketTypeName:'General',eventTitle:events[0].title,locationName:'QA Venue',startTime:'2099-01-01T20:00:00Z',endTime:'2099-01-02T04:00:00Z'};
    const qa=window.__outings={writes:[],plans:[],transfers:[],ticket,help:false,meeting:'Main entrance',approved:false};
    if(mode==='invited')qa.plans=[{id:id(30),ownerId:id(2),title:'Invited plan',status:'pending',expiresAt:'2099-01-01T00:00:00Z',members:[{userId:id(2),username:friend.username,status:'accepted'},{userId:id(1),username:user.username,status:'pending'}],options:events.map(e=>({eventId:e.id,title:e.title,location:e.locationName,startTime:e.startTime,available:true}))}];
    if(mode==='list')qa.plans=[
      {id:id(31),ownerId:id(2),title:'Friday with friends',outingDate:day,city:'Bucuresti',status:'pending',expiresAt:'2099-01-01T00:00:00Z',members:[],options:[]},
      ...[30,32].map(n=>({id:id(n),ownerId:id(1),title:n===30?'Our next night out':'Saturday in the city',outingDate:day,city:'Bucuresti',status:'accepted',expiresAt:'2099-01-01T00:00:00Z',members:[{userId:id(1),username:user.username,status:'accepted'},{userId:id(2),username:friend.username,status:'accepted'}],options:n===30?[]:[{eventId:id(4),title:events[0].title,location:events[0].locationName,startTime:events[0].startTime,available:true}] }))
    ];
    if(mode==='suggest')qa.plans=[{id:id(30),ownerId:id(1),title:'Suggest plan',outingDate:day,city:'Bucuresti',status:'accepted',expiresAt:'2099-01-01T00:00:00Z',members:[{userId:id(1),username:user.username,status:'accepted'}],options:[]}];
    if(mode==='incoming')qa.transfers=[{id:id(40),ticketId:id(91),eventId:id(4),eventTitle:events[0].title,senderId:id(2),senderName:friend.username,recipientId:'',recipientName:'',status:'pending',expiresAt:'2099-01-01T00:00:00Z'}];
    const group=()=>({canCreate:true,ticketValidated:true,eligibleFriends:[],group:{id:id(50),eventId:id(4),ownerId:id(1),eventTitle:events[0].title,eventLocation:'QA Venue',startTime:events[0].startTime,endTime:events[0].endTime,expiresAt:'2099-01-03T04:00:00Z',currentMemberStatus:'accepted',canSendHelp:true,currentUserNeedsHelp:qa.help,meetingPoint:qa.meeting,members:[{userId:id(1),username:user.username,status:'accepted'}],messages:[]}});
    const deposit=()=>({id:id(60),eventId:id(4),eventTitle:events[0].title,userId:id(1),customerName:user.username,zoneId:id(61),zoneName:'A',number:'A001',status:'stored',items:{coat:1,bag:0,backpack:0},remaining:{coat:1,bag:0,backpack:0},revision:1,reservedUntil:'2099-01-01T00:00:00Z',createdAt:'2026-01-01T00:00:00Z',storedAt:'2026-01-01T00:00:00Z',returnedAt:null,pickupId:id(62),pickupItems:{coat:1,bag:0,backpack:0},pickupExpiresAt:'2099-01-03T00:00:00Z',pickupApproved:qa.approved});
    window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);if(!url.pathname.includes('/api/v1/'))return original(input,init);
      const route=url.pathname.split('/api/v1')[1],method=init.method||'GET',body=init.body?JSON.parse(init.body):undefined;
      const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
      if(method!=='GET')qa.writes.push({route,body});
      if(route==='/users/me')return reply(user);
      if(route==='/notifications')return reply({items:[],unreadCount:0});
      if(route==='/friends')return reply([friend]);
      if(route==='/events')return reply(url.searchParams.get('page')>1?[]:events);
      if(route==='/events/'+id(4))return reply(events[0]);
      if(route==='/users/me/tickets')return reply([ticket]);
      if(route==='/outings/plans'&&method==='GET'&&mode==='error'&&!qa.recovered)return reply({message:'TEMPORARILY_UNAVAILABLE'},503);
      if(route==='/outings/plans'&&method==='GET')return reply(qa.plans.map(p=>p.status==='pending'?{...p,members:[],options:[]}:p));
      if(route.startsWith('/outings/plans/')&&method==='GET'){const p=qa.plans.find(p=>route.endsWith('/'+p.id));return reply(p?.status==='pending'?{...p,members:[],options:[]}:p);}
      if(route==='/outings/plans'&&method==='POST'){
        const plan={id:id(30),ownerId:id(1),title:body.title,outingDate:body.outingDate,city:body.city,status:'accepted',expiresAt:'2099-01-01T00:00:00Z',members:[{userId:id(1),username:user.username,status:'accepted'},...body.friendIds.map(userId=>({userId,username:friend.username,status:'pending'}))],options:events.filter(e=>(body.eventIds??[]).includes(e.id)).map(e=>({eventId:e.id,title:e.title,location:e.locationName,startTime:e.startTime,available:true}))};qa.plans=[plan];return reply(plan,201);
      }
      if(route.startsWith('/outings/plans/')&&method==='POST'){
        const p=qa.plans[0];if(route.endsWith('/respond')){p.status=body.status;p.members.find(m=>m.userId===user.id).status=body.status;}
        if(route.endsWith('/vote'))p.members.find(m=>m.userId===user.id).voteEventId=body.eventId;
        if(route.endsWith('/proposals')){const e=events.find(e=>e.id===body.eventId);p.options.push({eventId:e.id,title:e.title,location:e.locationName,startTime:e.startTime,available:true,priceRon:50,ticketAvailability:'on_sale'});}
        if(route.endsWith('/choose')){p.chosenEventId=body.eventId;p.members.forEach(m=>{if(m.status==='accepted')m.hasTicket=m.userId===user.id;});}return reply({ok:true});
      }
      if(route==='/outings/transfers'&&method==='GET')return reply(qa.transfers);
      if(route==='/outings/transfers'&&method==='POST'){const x={id:id(40),ticketId:body.ticketId,eventId:id(4),eventTitle:events[0].title,senderId:id(1),senderName:user.username,recipientId:'',recipientName:'',status:'pending',expiresAt:'2099-01-01T00:00:00Z'};qa.transfers=[x];return reply(x,201);}
      if(route.endsWith('/respond')&&route.startsWith('/outings/transfers/')){qa.transfers[0].status=body.status;if(body.status==='accepted'){qa.transfers[0].recipientId=user.id;qa.transfers[0].recipientName=user.username;}return reply({ok:true});}
      if(route.endsWith('/safety-group'))return reply(group());
      if(route.endsWith('/safety-group/help')){qa.help=true;return reply({ok:true});}
      if(route.endsWith('/safety-group/help-resolved')){qa.help=false;return reply({ok:true});}
      if(route.startsWith('/outings/meeting-point/')){qa.meeting=body.content;return reply({ok:true});}
      if(route==='/wardrobe/mine')return reply({deposits:mode==='night'?[deposit()]:[],staffAccess:false});
      if(route.startsWith('/wardrobe/')&&method==='POST'){qa.approved=body.approve;return reply({ok:true});}
      if(route.endsWith('/updates'))return reply([]);
      if(method==='GET')return reply([]);
      throw Error('Unexpected outing mutation: '+route);
    };
  }.toString()})(${JSON.stringify(language)});`});
  const open=async route=>{await call('Page.navigate',{url:origin+route});await until('window.__outings && document.readyState==="complete"',60000);};
  const press=async text=>{const q=`[...document.querySelectorAll('button,[role="button"]')].find(n=>n.textContent.trim()===${JSON.stringify(text)}||n.getAttribute('aria-label')===${JSON.stringify(text)})`;await until(q);await evaluate(`${q}.setAttribute('data-testid','outing-qa-press')`);await click('outing-qa-press');await evaluate(`document.querySelector('[data-testid="outing-qa-press"]')?.removeAttribute('data-testid')`);};
  const choose=async title=>{const q=`[...document.querySelectorAll('label,[role="checkbox"]')].find(n=>n.textContent.trim().startsWith(${JSON.stringify(title)})||n.getAttribute('aria-label')===${JSON.stringify(title)}||n.querySelector('input')?.getAttribute('aria-label')===${JSON.stringify(title)})`;await until(q);await evaluate(`${q}.setAttribute('data-testid','outing-qa-choice')`);await click('outing-qa-choice');await evaluate(`document.querySelector('[data-testid="outing-qa-choice"]')?.removeAttribute('data-testid')`);};
  const responsive=async name=>{for(const width of [320,390,1024]){await call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<700});await until('document.documentElement.scrollWidth<=innerWidth+1');await capture('outings-'+(web?'web':'native-web')+'-'+name+'-'+width);}};
  const luminance=color=>{const values=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return values[0]*.2126+values[1]*.7152+values[2]*.0722;};
  const contrast=async text=>{const pair=await evaluate(`(()=>{const el=[...document.querySelector('[data-testid="outings-screen"]').querySelectorAll('*')].find(el=>el.textContent.trim()===${JSON.stringify(text)});if(!el)throw Error('Missing contrast sample');let node=el,bg='rgb(0, 0, 0)';while(node){const value=getComputedStyle(node).backgroundColor;if(value!=='transparent'&&value!=='rgba(0, 0, 0, 0)'){bg=value;break;}node=node.parentElement;}return {fg:getComputedStyle(el).color,bg};})()`);const a=luminance(pair.fg),b=luminance(pair.bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert.ok(ratio>=4.5,'Rendered text contrast '+ratio);console.log('Contrast '+(web?'Web':'Native-web')+' '+ratio.toFixed(2)+':1');};
  const namedControls=async()=>{const tree=await call('Accessibility.getFullAXTree');const empty=tree.nodes.filter(n=>!n.ignored&&['button','link','checkbox','textbox','combobox'].includes(n.role?.value)&&!n.name?.value?.trim());assert.deepEqual(empty.map(n=>n.role.value),[],'Every interactive control has an accessible name');};
  await open('/outings?case=error');await until(`document.body.innerText.includes(${JSON.stringify(t('outings.failed'))})`);assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(t('outings.ui.emptyTitle'))})`),false,'A failed load is not an empty outing list');await responsive('error');await evaluate('window.__outings.recovered=true');await press(t('common.retry'));await until(`document.body.innerText.includes(${JSON.stringify(t('outings.ui.emptyTitle'))})`);
  await open('/outings?case=list');await until(`document.querySelector('[data-testid="outing-card-00000000-0000-4000-8000-000000000030"]')`);await responsive('list');await namedControls();await contrast(t('outings.hint'));
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  await evaluate(`document.querySelector('[data-testid="outing-card-00000000-0000-4000-8000-000000000030"]').focus()`);await until(`parseFloat(getComputedStyle(document.activeElement).outlineWidth)>0`);
  await call('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:true});assert.ok(await evaluate(`document.querySelector('[data-testid="outing-new"]').getBoundingClientRect().height<=64`),'Header action label stays compact on narrow screens');
  await click('outing-card-00000000-0000-4000-8000-000000000031');await until(`document.body.innerText.includes(${JSON.stringify(t('outings.ui.invitationTitle'))})`);assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(t('outings.ui.participants'))})`),false,'Pending invitation never renders participant status');
  await open('/outings');await press(t('outings.newPlan'));await responsive('create');await namedControls();await until(`document.body.innerText.includes('Friend QA')`);await press(t('outings.create'));await until(`document.body.innerText.includes(${JSON.stringify(t('outings.ui.invalidFriends'))})`);assert.equal(await evaluate(`window.__outings.writes.filter(w=>w.route==='/outings/plans').length`),0);await choose('Friend QA');await press(t('outings.create'));
  await until(`window.__outings.plans.length===1 && [...document.querySelectorAll('button,[role="button"]')].some(n=>n.getAttribute('aria-label')===${JSON.stringify(t('outings.share'))})`);
  assert.equal(await evaluate(`window.__outings.writes.filter(w=>w.route==='/outings/plans').length`),1);
  assert.equal(await evaluate('window.__outings.plans[0].options.length'),0,'Creation does not require event choices');
  await click('outing-propose-00000000-0000-4000-8000-000000000004');await until('window.__outings.plans[0].options.length===1');
  await click('outing-vote-00000000-0000-4000-8000-000000000004');await until(`window.__outings.plans[0].members[0].voteEventId`);await press(t('outings.choose'));assert.equal(await evaluate('window.__outings.plans[0].chosenEventId'),undefined,'Choosing opens confirmation before changing the plan');await press(t('common.cancel'));assert.equal(await evaluate('window.__outings.plans[0].chosenEventId'),undefined);await press(t('outings.choose'));await click('outing-confirm-choice');await until(`document.body.innerText.includes(${JSON.stringify(t('outings.chosenHint'))})`);
  await until(`!document.querySelector('[role="dialog"],dialog[open]')`);await delay(250);await responsive('chosen');await namedControls();
  assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(t('outings.transfers'))})`),false,'Ticket transfers are separate from outing plans');
  console.log('PASS '+(web?'Web':'Native-web')+' private plan creation, selection, vote and owner decision');
  await open('/outings?case=invited&plan=00000000-0000-4000-8000-000000000030');await press(t('outings.accept'));await until(`window.__outings.plans[0].status==='accepted'`);
  await open('/ticket-transfers?case=incoming');await until(`document.querySelector('[data-testid="transfer-accept-00000000-0000-4000-8000-000000000040"]')`);await click('transfer-accept-00000000-0000-4000-8000-000000000040');await until(`window.__outings.transfers[0].status==='accepted'`);
  await open('/outings?case=suggest&event=00000000-0000-4000-8000-000000000004');await click('outing-toggle-existing');await click('outing-suggest-00000000-0000-4000-8000-000000000030');await until('window.__outings.plans[0].options.length===1');
  await open('/outings?ticket=00000000-0000-4000-8000-000000000090');await until(`document.querySelector('[data-testid="transfer-email"]')`);assert.equal(await evaluate('location.pathname'),'/ticket-transfers','Legacy transfer link redirects to the separate screen');await input('transfer-email','recipient@example.test');await choose(t('outings.confirmTransfer'));await click('transfer-send');await until(`window.__outings.transfers.length===1`);
  assert.equal(await evaluate(`window.__outings.writes.filter(w=>w.route==='/outings/transfers').length`),1);
  console.log('PASS private invitation acceptance, incoming transfer and confirmed outgoing transfer');
  await open('/events/00000000-0000-4000-8000-000000000004/night?case=night');await until(`document.querySelector('[data-testid="night-ticket"]')`);
  await input('night-meeting','Next to the main entrance');await press(t('common.save'));await until(`window.__outings.meeting==='Next to the main entrance'`);
  await press(t('safetyGroup.holdForHelp'));assert.equal(await evaluate('window.__outings.help'),false,'A quick tap cannot send a help alert');
  await evaluate(`[...document.querySelectorAll('button,[role="button"]')].find(n=>n.getAttribute('aria-label')===${JSON.stringify(t('safetyGroup.holdForHelp'))}).focus()`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await delay(1600);await call('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
  await until('window.__outings.help');await press(t('safetyGroup.iAmSafe'));await until('!window.__outings.help');
  await press(t('wardrobe.approve'));await until('window.__outings.approved');
  assert.equal(await evaluate(`document.body.innerText.includes('QA Artist')`),true);
  for(const width of [320,390,1024]){await call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<700});await until('document.documentElement.scrollWidth<=innerWidth+1');await capture('outings-'+(web?'web':'native-web')+'-night-'+width);}
  console.log('PASS event night group help/resolve, customer pickup approval, program and responsive width');
  assert.deepEqual(errors,[],'No browser exceptions');
}).catch(error=>{console.error(error);process.exitCode=1;});
