const assert = require('node:assert/strict');
const {withBrowser} = require('./browser-harness.cjs');
const web = process.env.FEED_TEST_PLATFORM === 'web', override = process.env.NAVIGATION_TEST_URL;
if (web && !override || override && !['localhost','127.0.0.1'].includes(new URL(override).hostname)) throw Error('LOCAL_PREVIEW_REQUIRED');
withBrowser(async ({base,call,evaluate,until,click,capture,errors,delay}) => {
  const origin = web ? override : base;
  await call('Page.addScriptToEvaluateOnNewDocument', {source: `(${function fixture() {
    const original = fetch.bind(window), id = n => '00000000-0000-4000-8000-' + String(n).padStart(12,'0'), guest = new URL(location.href).searchParams.has('guest');
    const user = {id:id(1), username:'Feed QA', email:'feed@example.invalid', role:'user',hasPassword:true,preferredLanguage:'en',createdAt:'2026-01-01T00:00:00Z'};
    localStorage.setItem('i18nextLng','en');
    if (!guest) {localStorage.setItem('pulse_token','isolated-feed-qa'); localStorage.setItem('spottr-native.session.v1',JSON.stringify({version:1,token:'isolated-feed-qa',user}));}
    else {localStorage.removeItem('pulse_token');localStorage.removeItem('spottr-native.session.v1');}
    const events = [4,5,6].map(n => ({id:id(n),organizerId:id(3),title:n===4?'Rooftop after dark':n===5?'Into the weekend':'Sunday sessions',category:'HOUSE',description:'A night above the city.',city:'Bucuresti',locationName:'Rooftop venue',startTime:'2099-07-03T19:00:00Z',endTime:'2099-07-04T03:00:00Z',externalTickets:false,priceRon:80,liked:false,likeCount:8,bannerUrl:location.origin+(location.port==='49188'?'/party-event.webp':'/assets/assets/party-event.9ff7ef76614a79d5a475f57bf9f48fdb.webp')}));
    const day = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const plan = {id:id(30),ownerId:id(1),title:'Friday with friends',status:'accepted',outingDate:day,city:'Bucuresti',expiresAt:'2099-01-01T00:00:00Z',members:[{userId:id(1),username:user.username,status:'accepted'}],options:[]};
    window.__feedQA={writes:[],reads:[],events,fail:false,plan};
    window.fetch = async (input, init={}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (!url.pathname.includes('/api/v1/')) return original(input,init);
      const path = url.pathname.split('/api/v1')[1], method = init.method ?? 'GET', qa = window.__feedQA;
      const reply = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
      if (method === 'GET') qa.reads.push(path + url.search); else qa.writes.push({path,method});
      if (path === '/users/me') return reply(user);
      if (path === '/event-feed') return reply(url.searchParams.get('page') === '2' ? {items:events.slice(2)} : {items:events.slice(0,2),nextPage:2});
      if (path.endsWith('/likes')) {const event=events.find(e=>path.includes(e.id));if(qa.fail){qa.fail=false;return reply({message:'TEMPORARILY_UNAVAILABLE'},503);}event.liked=method==='PUT';event.likeCount=event.liked?9:8;return reply({liked:event.liked,likeCount:event.likeCount});}
      if (path === '/events') return reply(events.map(e=>({...e,vibe:'indoor',status:'published',latitude:44.4,longitude:26.1,ticketTypes:[],lineup:[],stats:{goingCount:1,isFavorited:false}})));
      if (path.startsWith('/events/')) {const event=events.find(e=>path==='/events/'+e.id);return reply(event?{...event,vibe:'indoor',status:'published',latitude:44.4,longitude:26.1,ticketTypes:[],lineup:[],stats:{goingCount:1,isFavorited:false}}:[]);}
      if (path === '/outings/plans') return reply([plan]);
      if (path.startsWith('/outings/plans/')) return reply(plan);
      if (path === '/notifications') return reply({items:[],unreadCount:0});
      if (path === '/wardrobe/mine') return reply({deposits:[],staffAccess:false});
      if (path === '/feed') return reply([{activityType:'organizer_event',actorId:id(3),actorUsername:'Organizer-only content',eventId:id(4),eventTitle:events[0].title,eventStartTime:events[0].startTime,occurredAt:'2026-01-01T00:00:00Z'}]);
      return reply([]);
    };
  }.toString()})();`});
  const open = async path => {await call('Page.navigate',{url:origin+path}); await until(`document.querySelector('[data-testid="${path.startsWith('/friends')?'friends-hub':'event-feed'}"]')`);};
  await open('/feed'); await until(`document.querySelector('[data-testid="feed-like-00000000-0000-4000-8000-000000000004"]')`);
  const like='feed-like-00000000-0000-4000-8000-000000000004';
  const settled=async()=>{await until(`document.querySelector('[data-testid="${like}"]').getAttribute('aria-disabled')!=='true'&&!document.querySelector('[data-testid="${like}"]').disabled`);await delay(100);};
  await capture('feed-before-like-'+(web?'web':'native'));
  await click(like); await until(`window.__feedQA.events[0].liked`); await settled(); assert.equal(await evaluate('window.__feedQA.writes.filter(w=>w.method==="PUT").length'),1);
  await click(like); await until(`!window.__feedQA.events[0].liked`); await settled(); assert.equal(await evaluate('window.__feedQA.writes.filter(w=>w.method==="DELETE").length'),1);
  await evaluate('window.__feedQA.fail=true'); await click(like); await until(`document.body.innerText.includes('Your like could not be updated')`); await settled(); await click(like); await until(`window.__feedQA.events[0].liked`);
  for(const width of [320,390,1024]) {await call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<768});await delay(200);assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false);await capture(`event-feed-${web?'web':'native'}-${width}`);}
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  if (web) {await evaluate(`document.querySelector('[data-nav-scroll^="event-feed:"]').scrollTo({top:844})`);} else {await evaluate(`{const root=document.querySelector('[data-testid="event-feed-list"]');const el=[root,...root.querySelectorAll('*')].find(e=>e.scrollHeight>e.clientHeight+200&&getComputedStyle(e).overflowY==='auto');if(!el)throw Error('No feed scroll region');el.scrollTop=844;el.dispatchEvent(new Event('scroll'));}`);}
  await until(`window.__feedQA.reads.includes('/event-feed?page=2')`); await delay(250);
  assert.equal(await evaluate('scrollY'),0,'Feed scroll stays in its own viewport');
  if (web) await evaluate(`document.querySelector('button[aria-label="Friends"]').click()`); else await click('tab-Friends');
  await until(`location.pathname==='/friends'`);await until(`document.body.innerText.includes('Friday with friends')`);
  if (web) await evaluate(`document.querySelector('button[aria-label="Feed"]').click()`); else await click('tab-Feed');
  await until(`location.pathname==='/feed'`);await until(`document.querySelector('[data-testid="${like}"]')`);
  assert.equal(await evaluate(`window.__feedQA.writes.some(w=>w.path.includes('favorite'))`),false,'Likes never mutate saved events');
  await open('/friends'); await until(`document.body.innerText.includes('Friday with friends')`); assert.equal(await evaluate(`document.body.innerText.includes('Organizer-only content')`),false,'Friends shows friend participation only');
  await capture('friends-hub-'+(web?'web':'native'));
  if (web) {assert.equal(await evaluate(`['Home','Map','Friends','Feed','Profile'].filter(name=>document.querySelector('button[aria-label="'+name+'"]')).length`),5);} else {for(const tab of ['Home','Explore','Friends','Feed','Profile'])await until(`document.querySelector('[data-testid="tab-${tab}"]')`);}
  await evaluate(`{const el=[...document.querySelectorAll('button,a,[role="button"]')].find(el=>el.textContent.trim()==='Make a plan');if(!el)throw Error('Missing plan action');el.click();}`);
  await until(`document.body.innerText.includes('New plan')`);
  assert.ok(await evaluate(`location.pathname==='/outings'`),'Friends can open the existing plan builder directly');
  // Guest discovery stays public; a like requires signing in.
  await open('/feed?guest=1'); await until(`document.querySelector('[data-testid="${like}"]')`);await click(like);await until(`location.pathname.includes('login')||document.body.innerText.includes('Welcome back')`);assert.equal(await evaluate('window.__feedQA.writes.filter(w=>w.path.endsWith("/likes")).length'),0);
  assert.deepEqual(errors.filter(e=>!e.includes('Failed to load resource')),[]);console.log('Photo feed, independent likes, failure/retry, paging, Friends privacy and guest auth passed: '+(web?'Web':'Native-web'));
}).catch(error=>{console.error(error);process.exitCode=1;});
