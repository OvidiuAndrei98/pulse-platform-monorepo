const assert=require('node:assert/strict');
const {withBrowser}=require('./browser-harness.cjs');
const web=process.env.TICKET_TEST_PLATFORM==='web',override=process.env.NAVIGATION_TEST_URL;
if(web&&!override||override&&!['localhost','127.0.0.1'].includes(new URL(override).hostname))throw Error('LOCAL_PREVIEW_REQUIRED');
withBrowser(async({base,call,evaluate,until,click,capture,errors,delay})=>{
 const origin=web?override:base,id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 await call('Page.addScriptToEvaluateOnNewDocument',{source:`(${function fixture(){
  const original=fetch.bind(window),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  const user={id:id(9),username:'Buyer QA',email:'buyer@example.invalid',role:'user',hasPassword:true,preferredLanguage:'en',createdAt:'2026-01-01T00:00:00Z'};
  localStorage.setItem('pulse_token','isolated-basket');localStorage.setItem('spottr-native.session.v1',JSON.stringify({version:1,token:'isolated-basket',user}));
  const qa=window.__basket={requests:[],sold:false,freePaid:false};
  const tier=(n,name,priceRon)=>({id:id(n),name,priceRon,capacity:100,ticketsSold:0,startSales:'2020-01-01T00:00:00Z',endSales:'2099-01-02T00:00:00Z'});
  const event=()=>({id:id(1),organizerId:id(8),title:'Multiple tickets',description:'Pick different ticket types.',category:'house',vibe:'indoor',city:'Bucuresti',locationName:'Venue',startTime:'2099-01-01T12:00:00Z',endTime:'2099-01-02T00:00:00Z',commissionRateBps:500,commissionPerTicketBani:150,latitude:44,longitude:26,lineup:[],stats:{goingCount:1,isFavorited:false},ticketTypes:[{...tier(2,'General',qa.freePaid?0:50),ticketsSold:qa.sold?100:0},tier(3,'VIP',100),{...tier(4,'Sold out',30),ticketsSold:100},{...tier(5,'Coming soon',40),startSales:'2098-01-01T00:00:00Z'},{...tier(6,'Sales ended',40),endSales:'2020-02-01T00:00:00Z'},tier(7,'Free access',0)]});
  window.open=()=>({closed:false,close(){this.closed=true;},focus(){},location:{replace(){}},document:{title:'',body:{style:{}}}});
  window.fetch=async(input,init={})=>{
   const url=new URL(typeof input==='string'?input:input.url,location.href);if(!url.pathname.includes('/api/v1/'))return original(input,init);
   const path=url.pathname.split('/api/v1')[1],method=init.method||'GET';
   const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
   if(method!=='GET')qa.requests.push({path,body:init.body?JSON.parse(init.body):null});
   if(path==='/users/me')return reply(user);
   if(path==='/users/me/billing-details')return reply({details:{type:'individual',name:'Buyer QA',taxId:'',registrationNumber:'',address:'Test street 1',city:'Bucuresti',county:'Bucuresti',sector:'Sector 3',country:'Romania'}});
   if(path==='/event-feed')return reply({items:[{...event(),externalTickets:false,liked:false,likeCount:0}]});
   if(path==='/events')return reply([event()]);
   if(path.endsWith('/tickets/purchase'))return reply({message:'TEMPORARILY_UNAVAILABLE'},503);
   if(path.startsWith('/events/')&&path.endsWith(id(1)))return reply(event());
   if(path.endsWith('/social'))return reply({goingCount:1,interestedCount:0,currentUserStatus:null});
   if(path==='/notifications')return reply({items:[],unreadCount:0});
   if(path==='/wardrobe/mine')return reply({deposits:[],staffAccess:false});
   if(path.startsWith('/profiles/'))return reply({id:id(8),username:'Organizer'});
   return reply([]);
  };
 }.toString()})();`});
 const open=async()=>{await call('Page.navigate',{url:web?origin+'/feed?eventId='+id(1):origin+'/events/'+id(1)});await until(`document.querySelector('[data-testid="event-ticket-${id(2)}-plus"]')`);await delay(550);};
 const quantity=n=>evaluate(`document.querySelector('[data-testid="event-ticket-${id(n)}-quantity"]').textContent`);
 const select=async(n,value)=>{for(let attempts=0;attempts<20&&Number(await quantity(n))!==value;attempts++)await click('event-ticket-'+id(n)+(Number(await quantity(n))<value?'-plus':'-minus'));assert.equal(Number(await quantity(n)),value);};
 const proceed=async()=>{if(!web)return click('event-continue');await evaluate(`{const el=[...document.querySelectorAll('[data-vaul-drawer] button')].find(el=>/^Continue/.test(el.textContent.trim()));if(!el)throw Error('Missing event Continue');el.click();}`);};
 await open();assert.equal(await evaluate(`document.body.innerText.includes('Plan with friends')`),false);
 for(const n of [4,5,6]){assert.equal(await evaluate(`{const el=document.querySelector('[data-testid="event-ticket-${id(n)}-plus"]');el.disabled||el.getAttribute('aria-disabled')==='true'}`),true);}
 await select(2,2);await select(3,1);assert.equal(Number(await quantity(7)),0);

 await proceed();await until(web?`document.querySelector('aside[role="dialog"]')`:`document.querySelector('[data-testid="checkout-screen"]')`);
 assert.equal(await evaluate(`document.body.innerText.includes('VIP')&&document.body.innerText.includes('General')`),true);
 const first=web?'checkout-ticket-'+id(2):'checkout',second='checkout-ticket-'+id(3);
 await until(`document.querySelector('[data-testid="${first}-quantity"]')`);assert.equal(await evaluate(`document.querySelector('[data-testid="${first}-quantity"]').textContent`),'2');assert.equal(await evaluate(`document.querySelector('[data-testid="${second}-quantity"]').textContent`),'1');
 assert.equal(await evaluate('window.__basket.requests.filter(r=>r.path.endsWith("/tickets/purchase")).length'),0);
 const next=async()=>{if(!web)return click('checkout-next');await until(`document.querySelector('aside[role="dialog"] footer button:not(:disabled)')`);await evaluate(`document.querySelector('aside[role="dialog"] footer button:not(:disabled)').click()`);};
 await next();await next();await next();await until(`window.__basket.requests.some(r=>r.path.endsWith('/tickets/purchase'))`);
 const order=await evaluate(`window.__basket.requests.find(r=>r.path.endsWith('/tickets/purchase')).body`);assert.deepEqual(order.items,[{ticketTypeId:id(2),quantity:2},{ticketTypeId:id(3),quantity:1}]);assert.equal(order.expectedTotalBani,21450);
 await open();await select(2,2);await select(3,1);await evaluate('window.__basket.sold=true');await proceed();await until(`document.body.innerText.includes('no longer available')||document.body.innerText.includes('no longer available'.toUpperCase())||document.querySelector('[data-testid="event-ticket-${id(2)}-quantity"]').textContent==='0'`);
 assert.equal(await evaluate(`!!document.querySelector('[data-testid="checkout-screen"],aside[role="dialog"]')`),false,'A stale basket never opens checkout');assert.equal(Number(await quantity(3)),1,'Unrelated valid tier is retained');assert.equal(await evaluate('window.__basket.requests.length'),0);
 await open();await select(2,2);await select(3,1);await evaluate('window.__basket.freePaid=true');await proceed();await delay(200);assert.equal(await evaluate(`!!document.querySelector('[data-testid="checkout-screen"],aside[role="dialog"]')`),false,'Repricing into mixed/free cannot open paid checkout');assert.equal(await evaluate('window.__basket.requests.length'),0);
 await open();await select(2,2);await select(3,1);await select(7,1);assert.equal(Number(await quantity(2)),0);assert.equal(Number(await quantity(3)),0);assert.equal(await evaluate(`document.querySelector('[data-testid="event-ticket-${id(7)}-plus"]').disabled||document.querySelector('[data-testid="event-ticket-${id(7)}-plus"]').getAttribute('aria-disabled')==='true'`),true);
 for(const width of [320,390,1024]){await call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<768});await open();await select(2,2);await select(3,1);await until(`document.querySelector('[data-testid="event-ticket-${id(3)}"]')`);await delay(250);assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false);await evaluate(`document.querySelector('[data-testid="event-ticket-${id(3)}"]').scrollIntoView({block:'center'})`);await capture(`ticket-quantities-${web?'web':'native'}-${width}`);}
 assert.deepEqual(errors.filter(e=>!e.includes('Failed to load resource')),[]);console.log('PASS multiple tiers, zero removal, disabled sale states, basket handoff, complete payment quote, stale availability and individual free booking: '+(web?'Web':'Native-web'));
}).catch(error=>{console.error(error);process.exitCode=1;});
