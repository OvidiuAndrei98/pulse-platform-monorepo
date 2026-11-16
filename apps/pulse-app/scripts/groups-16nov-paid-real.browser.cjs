// Real local purchase handler, deliberately no Stripe provider. This validates
// the checkout payload and safe retry path, not a successful card payment.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {withBrowser}=require('../../spottr-native/tests/browser-harness.cjs');
const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../api/.tmp/friends-browser-fixture.json'),'utf8'));
if(!fixture.testOnly||new URL(fixture.baseUrl).hostname!=='127.0.0.1')throw Error('LOCAL_ONLY');
const source=fs.readFileSync(path.join(__dirname,'groups-real-api.browser.cjs'),'utf8');
const bootstrap=new Function(source.slice(source.indexOf('function bootstrap('),source.indexOf('async function visit('))+';return bootstrap')();
const evidence={checks:[],requests:[]},result=path.join(__dirname,'../.tmp/groups-16nov-paid-real.json');
async function api(route,body){const r=await fetch(fixture.baseUrl+'/api/v1'+route,{method:body?'POST':'GET',headers:{authorization:'Bearer '+fixture.actors[0].token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json()}}
(async()=>{
 const group=await api('/outings/groups',{name:'Next paid preparation QA '+Date.now(),friendIds:[fixture.actors[1].id],requestId:crypto.randomUUID()});assert.equal(group.status,201);
 const eventId=fixture.eventIds[0],plan=await api('/outings/groups/'+group.data.id+'/outings',{eventId,requestId:crypto.randomUUID()});assert.equal(plan.status,201);
 const ticketCount=(await api('/users/me/tickets')).data.filter(t=>t.eventId===eventId).length;
 await withBrowser(async({call,evaluate,until,click,delay,capture,errors})=>{
  await call('Page.addScriptToEvaluateOnNewDocument',{source:'('+bootstrap.toString()+')('+JSON.stringify(fixture)+',0);'+`(()=>{const original=fetch;window.fetch=async(input,init={})=>{if(String(typeof input==='string'?input:input.url).includes('/tickets/purchase'))window.__purchaseBody=JSON.parse(init.body);return original(input,init)}})()`});
  await call('Page.navigate',{url:'http://localhost:8084/groups/'+group.data.id+'/outings/'+plan.data.id});await click(ticketCount?'group-buy-more':'group-buy');
  if(ticketCount){await click('outing-recipient-'+fixture.actors[0].id);await click('outing-extra-confirmation');}
  await until('document.querySelector("[data-testid=outing-recipients-continue]")&&!document.querySelector("[data-testid=outing-recipients-continue]").disabled');await click('outing-recipients-continue');await click('checkout-next');await until('document.querySelector("input[id$=billing-address]")');
  const set=async(suffix,value)=>{await evaluate('(()=>{const n=document.querySelector('+JSON.stringify('input[id$="'+suffix+'"]')+');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(n,'+JSON.stringify(value)+');n.dispatchEvent(new Event("input",{bubbles:true}))})()');await delay(30)};
  await set('billing-name','Next QA Buyer');await set('billing-address','Strada Test 12');await set('billing-city','Cluj-Napoca');await set('billing-county','Cluj');await set('billing-country','Romania');await set('-email','next-paid@example.test');await click('checkout-next');await until('document.querySelector("[data-testid=checkout-next]")?.innerText.includes("Pay")');await capture('groups-16nov-next-paid-summary');
  await click('checkout-next');await until('window.__groupsRealQA.requests.some(r=>r.route.endsWith("/tickets/purchase"))',30000);await until('!document.querySelector("[data-testid=checkout-next]").disabled');await delay(100);
  const request=(await evaluate('window.__groupsRealQA.requests')).find(r=>r.route.endsWith('/tickets/purchase'));assert.equal(request.status,503);
  const body=await evaluate('window.__purchaseBody');assert.deepEqual(body.outing.recipientIds,[fixture.actors[0].id]);assert.equal(body.outing.planId,plan.data.id);assert.equal(body.outing.decisionRound,plan.data.decisionRound);assert.equal(body.items.length,1);assert.equal(body.items[0].quantity,1);
  assert.equal((await api('/users/me/tickets')).data.filter(t=>t.eventId===eventId).length,ticketCount);await capture('groups-16nov-next-paid-unavailable');evidence.requests=await evaluate('window.__groupsRealQA.requests');evidence.payload={items:body.items,outing:body.outing};evidence.checks=['Real UI builds paid checkout from the selected event, ticket type and own recipient, requiring explicit extra-ticket confirmation for the seeded ticket.','Actual local POST /tickets/purchase receives the same plan ID, decision round, type and quantity.','Provider deliberately unavailable: API returns 503, UI releases busy state and issues no new ticket; no live card payment was attempted.'];evidence.errors=errors.filter(e=>!e.includes('Failed to load resource')&&!e.includes('fonts.googleapis'));assert.deepEqual(evidence.errors,[]);
 });evidence.success=true;fs.writeFileSync(result,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence.checks,null,2));
})().catch(error=>{evidence.error=String(error.stack??error);fs.writeFileSync(result,JSON.stringify(evidence,null,2));console.error(error);process.exitCode=1});
