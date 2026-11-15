// Local Next navigation, synthetic API fixtures. No production requests or payments.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {withBrowser}=require('../../spottr-native/tests/browser-harness.cjs');
const origin=process.env.GROUPS_NEXT_URL||'http://localhost:8084';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('LOCAL_PREVIEW_REQUIRED');
const shared=fs.readFileSync(path.join(__dirname,'groups.browser.cjs'),'utf8'),start=shared.indexOf('function(){'),end=shared.indexOf('}.toString()})()`',start),fixture=shared.slice(start,end+1).replace('snapshot=plan=>({revision:','snapshot=plan=>({title:plan.title,revision:');
withBrowser(async({call,evaluate,until,click,input,delay,capture,errors})=>{
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),root='/groups/'+id(20),outing=root+'/outings/'+id(30),phase=process.env.GROUPS_COHERENCE_BEFORE?'before':'after';
 await call('Page.addScriptToEvaluateOnNewDocument',{source:'('+fixture+')();('+function(){
  const original=fetch.bind(window),qa=window.__permanentGroups;
  const activity=(event,person,kind)=>({activityType:kind,occurredAt:new Date().toISOString(),actorId:person.userId,actorUsername:person.username,actorAvatarUrl:person.avatarUrl,eventId:event.id,eventTitle:event.title,eventBannerUrl:event.bannerUrl,eventStartTime:event.startTime,eventEndTime:event.endTime,eventLocation:event.locationName,eventCity:event.city});
  window.fetch=async(input,init={})=>{const u=new URL(typeof input==='string'?input:input.url,location.href);
   if(/\/api\/v1\/events\/[^/]+\/social$/.test(u.pathname))return new Response(JSON.stringify({friends:[],goingCount:0,manualGoingCount:0,ticketsSoldCount:0,interestedCount:0}),{headers:{'content-type':'application/json'}});
   if(u.pathname.endsWith('/api/v1/feed'))return new Response(JSON.stringify([activity(qa.events[0],qa.group.members[1],'friend_ticket'),activity(qa.events[0],qa.group.members[1],'friend_going'),activity(qa.events[0],qa.group.members[2],'friend_going'),activity({...qa.events[1],endTime:'2020-01-01T00:00:00Z'},qa.group.members[1],'friend_ticket')]),{headers:{'content-type':'application/json'}});
   if(qa.holdNextAnswer&&u.pathname.endsWith('/vote')&&init.method==='POST'){qa.holdNextAnswer=false;await new Promise(resolve=>qa.releaseAnswer=resolve)}
   return original(input,init);
  };
 }.toString()+')()'});
 const open=async(route,mode='conversation')=>{await call('Page.navigate',{url:origin+route+(route.includes('?')?'&':'?')+'case='+mode});await until('window.__permanentGroups',40000)};
 const shot=async(name)=>{await delay(400);await capture('groups-coherence-next-'+phase+'-'+name)};
 await open('/friends');await until('document.querySelector("[data-testid=friends-hub]")',40000);await until('document.querySelector("[data-testid=group-row-'+id(20)+']")');await shot('friends');
 await click('group-row-'+id(20));await until('document.querySelector("[data-testid=group-composer]")');await shot('chat');await evaluate('{const v=document.querySelector("[data-testid=group-messages]");v.scrollTop=0;v.dispatchEvent(new Event("scroll"))}');await shot('event');
 if(phase==='after'){await input('group-composer','Navigation draft QA');await click('group-summary');await until('document.querySelector("[data-testid=group-outing]")');await click('group-outing-back');await until('document.querySelector("[data-testid=group-composer]")?.value==="Navigation draft QA"');}
 await open(outing,'availability');await until('document.querySelector("[data-testid=group-outing]")');await shot('outing');
 await open(root+'/info','settings-owner');await until('document.querySelector("[data-testid=group-info]")');await shot('info');
 await open(root+'/events/select?planId='+id(30)+'&from=outing','picker-boundary');await until('document.querySelector("[data-testid=group-propose-event-'+id(10)+']")');await shot('picker');
 if(phase==='before'){console.log('PASS before screenshots: Friends, chat, event, outing, info, selector');return;}
 await open(outing,'proposals');await until('document.querySelector("[data-testid=group-preference-'+id(10)+'-toggle]")');
 await evaluate('window.__permanentGroups.failNextAnswer=true');await click('group-preference-'+id(10)+'-toggle');await until('document.querySelector("[data-testid=group-preference-'+id(10)+'] [role=alert]")');assert.equal(await evaluate('document.querySelector("[data-testid=group-preference-'+id(10)+']").dataset.value'),'');assert.equal(await evaluate('document.querySelectorAll("[role=alert]").length'),1,'One scoped response error');await shot('current-vote-failed');
 await click('group-preference-'+id(10)+'-toggle');await until('document.querySelector("[data-testid=group-preference-'+id(10)+'-toggle]")?.getAttribute("aria-pressed")==="true"');await until('!document.querySelector("[data-testid=group-preference-'+id(11)+'-toggle]").disabled');
 await evaluate('window.__permanentGroups.holdNextAnswer=true');await click('group-preference-'+id(11)+'-toggle');await until('window.__permanentGroups.releaseAnswer');assert.equal(await evaluate('document.querySelector("[data-testid=group-preference-'+id(11)+']").dataset.value'),'');await evaluate('document.querySelector("[data-testid=group-preference-'+id(11)+'-toggle]").click();window.__permanentGroups.releaseAnswer()');await until('document.querySelector("[data-testid=group-preference-'+id(11)+'-toggle]")?.getAttribute("aria-pressed")==="true"');assert.equal(await evaluate('window.__permanentGroups.writes.filter(w=>w.route.endsWith("/vote")&&w.body.eventId==="'+id(11)+'").length'),1);assert.equal(await evaluate('document.querySelector("[data-testid=group-preference-'+id(10)+']").dataset.value'),'yes');await shot('current-multiple-preferences');
 await open('/friends');await until('document.querySelector("[data-testid=friends-event-'+id(10)+']")');assert.equal(await evaluate('document.querySelectorAll("[data-testid^=friends-event-]").length'),1,'Ended events filtered and actors deduplicated');await shot('friends-populated');
 await call('Emulation.setDeviceMetricsOverride',{width:320,height:780,deviceScaleFactor:1,mobile:true});await shot('friends-narrow');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 await open(outing,'dates');await until('document.querySelector("[data-testid=group-outing]")');assert.equal(await evaluate('!!document.querySelector("[data-testid^=group-availability-]")'),false);await shot('current-legacy-context-narrow');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await open('/');await until('document.body.innerText.toUpperCase().includes("ROOF TOP QA")',40000);await shot('reference-home');await open('/events?view=list');await until('document.body.innerText.toUpperCase().includes("ROOF TOP QA")',40000);await shot('reference-discover');
 const unexpected=errors.filter(e=>!e.includes('Failed to load resource')&&!e.includes('fonts.googleapis'));assert.deepEqual(unexpected,[]);
 console.log('PASS coherent local Next screens');
}).catch(error=>{console.error(error);process.exitCode=1});
