const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {withBrowser}=require('./browser-harness.cjs');
const dictionary={exports:{}};vm.runInNewContext(ts.transpile(fs.readFileSync(path.resolve(__dirname,'../../../packages/app-core/src/i18n/resources.ts'),'utf8'),{module:ts.ModuleKind.CommonJS}),{exports:dictionary.exports,module:dictionary});
const language=process.env.OUTINGS_TEST_LANGUAGE==='ro'?'ro':'en',strings=dictionary.exports.resources[language].translation,t=key=>key.split('.').reduce((v,k)=>v[k],strings);
const web=process.env.OUTINGS_TEST_PLATFORM==='web',override=process.env.NAVIGATION_TEST_URL;
// Web guests currently use the default English locale until account preferences load.
const guestT=key=>key.split('.').reduce((v,k)=>v[k],dictionary.exports.resources[web?'en':language].translation);
if(web&&!override||override&&!['localhost','127.0.0.1'].includes(new URL(override).hostname))throw Error('LOCAL_PREVIEW_REQUIRED');
withBrowser(async({base,call,evaluate,until,click,input,capture,errors,delay})=>{
  const origin=web?override:base,id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`(${function fixture(language){
    const original=fetch.bind(window),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),mode=new URL(location.href).searchParams.get('case')||'new';
    const user={id:id(1),username:'Outing QA',email:'outing@example.invalid',role:'user',hasPassword:true,preferredLanguage:language,createdAt:'2026-01-01T00:00:00Z'};
    localStorage.setItem('i18nextLng',language);
    if(mode==='guest'){localStorage.removeItem('pulse_token');localStorage.removeItem('spottr-native.session.v1');}else{localStorage.setItem('pulse_token','isolated-event-outing');localStorage.setItem('spottr-native.session.v1',JSON.stringify({version:1,token:'isolated-event-outing',user}));}
    const day=new Date(Date.now()+86400000*2).toISOString().slice(0,10),outingDate=new Date(Date.parse(day+'T22:30:00Z')+86400000).toISOString().slice(0,10);
    const event={id:id(4),organizerId:id(3),title:'After dark',description:'A night out',city:'Iasi',locationName:'Rooftop venue',category:'house',vibe:'indoor',status:'published',startTime:day+'T22:30:00Z',endTime:outingDate+'T05:00:00Z',latitude:47.1,longitude:27.5,ticketTypes:[],lineup:[],stats:{goingCount:1,isFavorited:false}};
    const plan={id:id(30),ownerId:id(1),title:'Matching plan',status:'accepted',outingDate,city:'Iasi',expiresAt:'2099-01-01T00:00:00Z',members:[{userId:id(1),username:user.username,status:'accepted'}],options:mode==='duplicate'?[{eventId:event.id,title:event.title,location:event.locationName,startTime:event.startTime,available:true}]:[]};
    const qa=window.__eventStart={writes:[],reads:[],recovered:false,friendsRecovered:false,event,outingDate,plans:[plan,{...plan,id:id(31),title:'Wrong city',city:'Bucuresti'},{...plan,id:id(32),title:'Already decided',chosenEventId:id(6)}]};
    window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);if(!url.pathname.includes('/api/v1/'))return original(input,init);
      const route=url.pathname.split('/api/v1')[1],method=init.method||'GET',body=init.body?JSON.parse(init.body):undefined;
      const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
      if(method==='GET')qa.reads.push(route);else qa.writes.push({route,body});
      if(route==='/auth/login')return reply({token:'isolated-event-outing'});
      if(route==='/users/me')return reply(user);
      if(route==='/events/'+id(4)){if(mode==='error'&&!qa.recovered)return reply({message:'TEMPORARILY_UNAVAILABLE'},503);return reply(mode==='ended'?{...event,endTime:'2020-01-01T00:00:00Z'}:event);}
      if(route==='/event-feed')return reply({items:[{...event,externalTickets:false,priceRon:80,liked:false,likeCount:0}]});
      if(route==='/events')return reply([event]);
      if(route==='/friends'){if(mode==='friends-error'&&!qa.friendsRecovered)return reply({message:'TEMPORARILY_UNAVAILABLE'},503);return reply([{id:id(2),username:'Friend QA',role:'user',relationship:'friends',createdAt:'2026-01-01T00:00:00Z'}]);}
      if(route==='/outings/plans'&&method==='GET')return reply(qa.plans);
      if(route==='/outings/plans'&&method==='POST'){
        const p={...plan,id:id(40),title:body.title,outingDate:body.outingDate,city:body.city,members:[...plan.members,{userId:id(2),username:'Friend QA',status:'pending'}],options:(body.eventIds??[]).map(eventId=>({eventId,title:event.title,location:event.locationName,startTime:event.startTime,available:true}))};qa.plans=[p,...qa.plans];return reply(p,201);
      }
      if(route.startsWith('/outings/plans/')&&method==='GET')return reply(qa.plans.find(p=>route.endsWith(p.id)));
      if(route.endsWith('/proposals')){const p=qa.plans.find(p=>route.includes(p.id));p.options.push({eventId:body.eventId,title:event.title,location:event.locationName,startTime:event.startTime,available:true});return reply({ok:true});}
      if(route==='/notifications')return reply({items:[],unreadCount:0});if(route==='/wardrobe/mine')return reply({deposits:[],staffAccess:false});
      return reply([]);
    };
  }.toString()})(${JSON.stringify(language)});`});
  const open=async(route)=>{await call('Page.navigate',{url:origin+route});await until(`document.querySelector('[data-testid="outings-screen"],[data-testid="event-feed"]')`);};
  const press=async(text)=>{const query=`[...document.querySelectorAll('button,a,[role="button"]')].find(el=>el.textContent.trim()===${JSON.stringify(text)}||el.getAttribute('aria-label')===${JSON.stringify(text)})`;await until(query);await evaluate(`${query}.setAttribute('data-testid','event-outing-press')`);await click('event-outing-press');};
  const mutations=()=>evaluate(`window.__eventStart.writes.filter(w=>w.route.startsWith('/outings/'))`);
  await open('/feed');await press(t('discovery.propose'));await until(`document.querySelector('[data-testid="event-outing-start"]')`);await until(`document.querySelector('[data-testid="outing-title"]').value==='After dark'`);
  assert.equal((await mutations()).length,0,'Opening the source event is GET-only');
  if(web)assert.equal(await evaluate(`document.querySelector('[data-testid="outing-date"]').value`),await evaluate('window.__eventStart.outingDate'),'Romania day, not UTC date');
  await input('outing-title','Our rooftop night');await click('outing-toggle-existing');await until(`document.querySelector('[data-testid="outing-suggest-${id(30)}"]')`);
  assert.equal(await evaluate(`document.body.innerText.includes('Wrong city')||document.body.innerText.includes('Already decided')`),false);
  await click('outing-toggle-existing');assert.equal(await evaluate(`document.querySelector('[data-testid="outing-title"]').value`),'Our rooftop night','Switching modes keeps draft fields');
  for(const width of [320,390,1024]){await call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<700});await delay(150);assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false);await capture(`event-outing-${web?'web':'native'}-${language}-${width}`);}
  const friend=`[...document.querySelectorAll('label,[role="checkbox"]')].find(el=>el.textContent.includes('Friend QA')||el.getAttribute('aria-label')==='Friend QA')`;
  await until(friend);await evaluate(`${friend}.setAttribute('data-testid','event-outing-friend')`);await click('event-outing-friend');await click('outing-create');await until('window.__eventStart.plans[0].id.endsWith("000000000040")');
  const writes=await mutations();assert.equal(writes.length,1);assert.deepEqual(writes[0].body.eventIds,[id(4)]);assert.equal(writes[0].body.city,'Iasi');assert.equal(writes[0].body.outingDate,await evaluate('window.__eventStart.outingDate'));assert.deepEqual(writes[0].body.friendIds,[id(2)]);assert.equal(await evaluate('window.__eventStart.plans[0].chosenEventId'),undefined);
  await open('/outings?event='+id(4));await click('outing-toggle-existing');await click('outing-suggest-'+id(30));await until('window.__eventStart.plans[0].options.length===1');assert.equal((await mutations()).length,1);
  await open('/outings?case=duplicate&event='+id(4));await click('outing-toggle-existing');await click('outing-suggest-'+id(30));await until(`document.body.innerText.includes('Matching plan')`);assert.equal((await mutations()).length,0,'Already added opens the plan without another proposal');
  await open('/outings?case=error&event='+id(4));await until(`document.body.innerText.includes(${JSON.stringify(t('outings.eventStart.loadFailed'))})`);assert.equal(await evaluate(`!!document.querySelector('[data-testid="outing-create"]')`),false);await evaluate('window.__eventStart.recovered=true');await press(t('common.retry'));await until(`document.querySelector('[data-testid="outing-title"]')`);
  await open('/outings?case=friends-error&event='+id(4));await until(`document.body.innerText.includes(${JSON.stringify(t('outings.failed'))})`);await input('outing-title','Keep this draft');await evaluate('window.__eventStart.friendsRecovered=true');await press(t('common.retry'));await until(friend);assert.equal(await evaluate(`document.querySelector('[data-testid="outing-title"]').value`),'Keep this draft');assert.equal((await mutations()).length,0);
  await open('/outings?case=ended&event='+id(4));await until(`document.body.innerText.includes(${JSON.stringify(t('outings.eventStart.unavailable'))})`);assert.equal(await evaluate(`!!document.querySelector('[data-testid="outing-create"]')`),false);
  await open('/outings?case=guest&event='+id(4));await press(guestT('social.signIn'));await until(`location.pathname==='/login'`);
  if(web){assert.equal(await evaluate(`new URLSearchParams(location.search).get('returnTo')`),'/outings?event='+id(4));await press(guestT('auth.continueWithEmail'));await evaluate(`document.querySelector('#email').setAttribute('data-testid','auth-email');document.querySelector('#password').setAttribute('data-testid','auth-password');document.querySelector('button[type="submit"]').setAttribute('data-testid','auth-submit')`);}else{assert.equal(await evaluate(`new URLSearchParams(location.search).get('returnOutingsEvent')`),id(4));await click('auth-email-choice');}
  await input('auth-email','outing@example.invalid');await input('auth-password','fixture-password');await click('auth-submit');await until(`document.querySelector('[data-testid="event-outing-start"]')`);assert.equal(await evaluate(`document.querySelector('[data-testid="outing-title"]').value`),'After dark');assert.equal((await mutations()).length,0,'Login restores event intent without creating a plan');
  assert.deepEqual(errors.filter(e=>!e.includes('Failed to load resource')),[]);console.log(`PASS event-first outing: explicit creation, Romania date, Iasi, preserved draft, existing/duplicate, retries, unavailable, guest login (${web?'Web':'Native-web'}, ${language})`);
}).catch(error=>{console.error(error);process.exitCode=1;});
