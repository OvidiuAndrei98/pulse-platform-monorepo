const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {withBrowser}=require('../../spottr-native/tests/browser-harness.cjs');
const source=fs.readFileSync(path.join(__dirname,'groups.browser.cjs'),'utf8'),fixture=source.slice(source.indexOf('function(){'),source.indexOf('}.toString()})()`')+1);
withBrowser(async({call,evaluate,until,delay,capture})=>{
 await call('Page.addScriptToEvaluateOnNewDocument',{source:'('+fixture+')()'});
 const values=[];
 for(const [width,height,mobile]of [[1280,800,false],[390,844,true],[320,568,true]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await call('Page.navigate',{url:'http://localhost:8084/groups/00000000-0000-4000-8000-000000000020?case=many-messages'});await until('document.querySelector("[data-testid=group-composer]")',40000);await delay(250);
  const read=()=>evaluate('(()=>{const c=document.querySelector("[data-group-conversation]"),m=document.querySelector("[data-testid=group-messages]"),f=document.querySelector("[data-testid=group-composer]"),r=c.getBoundingClientRect(),fr=f.getBoundingClientRect();return{innerHeight,visualHeight:visualViewport.height,docHeight:document.documentElement.scrollHeight,bodyHeight:document.body.scrollHeight,scrollY,chat:{top:r.top,bottom:r.bottom,height:r.height},composerBottom:fr.bottom,messages:{height:m.clientHeight,scrollHeight:m.scrollHeight,scrollTop:m.scrollTop},bodyPadding:getComputedStyle(document.body).padding,ancestors:[...function*(n){while(n){yield n;n=n.parentElement}}(c)].map(n=>({tag:n.tagName,class:n.className,height:n.clientHeight,scroll:n.scrollHeight,overflow:getComputedStyle(n).overflow,padding:getComputedStyle(n).padding}))}})()');
  const before=await read();await evaluate('scrollTo(0,500)');await delay(150);const after=await read();await capture('groups-16nov-next-chat-viewport-'+width);
  assert.equal(after.scrollY,0);assert.ok(before.docHeight<=height+1);assert.ok(before.composerBottom<=height+1);assert.ok(before.messages.scrollHeight>before.messages.height);
  assert.equal(await evaluate('getComputedStyle(document.documentElement).overflow'),'hidden');
  let keyboard;
  if(mobile){await evaluate('(()=>{document.querySelector("[data-testid=group-composer]").focus({preventScroll:true});Object.defineProperty(visualViewport,"height",{configurable:true,value:innerHeight-280});Object.defineProperty(visualViewport,"offsetTop",{configurable:true,value:20});visualViewport.dispatchEvent(new Event("resize"))})()');await delay(150);keyboard=await read();assert.ok(keyboard.composerBottom<=height-280+20);assert.equal(keyboard.chat.top,20);assert.equal(keyboard.scrollY,0);await capture('groups-16nov-next-chat-keyboard-'+width);await evaluate('delete visualViewport.height;delete visualViewport.offsetTop;document.activeElement.blur();visualViewport.dispatchEvent(new Event("resize"))');await delay(150)}
  // Client navigation must release this route's lock, including nested dialogs.
  await evaluate('document.querySelector("[data-group-conversation] header a").click()');await until('location.pathname==="/friends"&&!document.querySelector("[data-group-conversation]")');await delay(100);const released=await evaluate('({root:document.documentElement.style.overflow,body:document.body.style.overflow})');assert.equal(released.root,'');assert.equal(released.body,'');values.push({width,height,mobile,before,after,keyboard,released});
 }
 fs.writeFileSync(path.join(__dirname,'../.tmp/groups-chat-viewport.json'),JSON.stringify(values,null,2));console.log(JSON.stringify(values,null,2));
 console.log('PASS route-scoped document lock, message scroll, simulated visual viewport keyboard and release on Friends. Physical Safari keyboard not exercised.');
}).catch(error=>{console.error(error);process.exitCode=1});
