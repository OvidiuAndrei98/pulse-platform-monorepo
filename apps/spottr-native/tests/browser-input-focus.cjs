// Compound-field regression, isolated browser profile and simulated API; no live writes.
const assert = require('node:assert/strict');
const {withBrowser} = require('./browser-harness.cjs');
withBrowser(async ({call,evaluate,until,click,capture,errors,delay}) => {
 const origin=process.env.INTERFACE_TEST_URL||'http://127.0.0.1:49188';
 assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname),'Use an isolated local preview');
 await call('Page.addScriptToEvaluateOnNewDocument',{source:'('+function(){
  localStorage.removeItem('pulse_token');localStorage.setItem('i18nextLng','en');
  const original=window.fetch.bind(window);
  window.fetch=async(input,options={})=>{
   const url=new URL(String(input),location.origin),route=url.pathname.split('/api/v1')[1];
   if(!route){if(url.origin===location.origin)return original(input,options);throw Error('Unexpected external request');}
   if(options.method&&!['GET','HEAD'].includes(options.method.toUpperCase())&&route!=='/diagnostics/errors')throw Error('Unexpected API write '+route);
   return new Response(route==='/diagnostics/errors'?null:JSON.stringify([]),{status:route==='/diagnostics/errors'?204:200,headers:{'Content-Type':'application/json'}});
  };
 }.toString()+')();'});
 const tab=async()=>{
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 };
 for(const route of ['/register','/login','/forgot-password']){
  await call('Page.navigate',{url:origin+route});await until("document.querySelector('input[type=email]')?.closest('.ui-input-shell')");
  if(route==='/login'){
   await delay(200);await evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Continue with email').dataset.testid='email-mode'");
   await click('email-mode');await until("document.querySelector('input[type=email]').getBoundingClientRect().height>0");
  }
  await delay(200);await evaluate("document.querySelector('input[type=email]').dataset.testid='focus-email'");
  await click('focus-email');await delay(180);
  const check=async()=>await evaluate(`(()=>{
   const input=document.querySelector('input[type=email]'),shell=input.closest('.ui-input-shell'),a=getComputedStyle(input),b=getComputedStyle(shell);
   return {active:document.activeElement===input,visible:input.matches(':focus-visible'),inner:a.outlineStyle,outer:b.outlineStyle,width:b.outlineWidth,color:b.outlineColor,radius:b.borderRadius,label:input.labels?.[0]?.textContent.trim()};
  })()`);
  let state=await check();assert.equal(state.active,true,route+' '+JSON.stringify(state)+' active='+await evaluate('document.activeElement.outerHTML'));assert.equal(state.visible,true);assert.equal(state.inner,'none');assert.equal(state.outer,'solid');assert.equal(state.width,'2px');assert.equal(state.color,'rgb(255, 0, 68)');assert.notEqual(state.radius,'0px');assert.ok(state.label);
  // Move away, then reach the email again using only Tab (a real keyboard path).
  await tab();for(let count=0;count<30&&!(await check()).active;count++)await tab();
  state=await check();assert.equal(state.active,true);assert.equal(state.inner,'none');assert.equal(state.outer,'solid');
  // Forced colors must replace the brand indicator with the system Highlight.
  await call('Emulation.setEmulatedMedia',{features:[{name:'forced-colors',value:'active'}]});
  await delay(200);
  const highContrast=await evaluate("(()=>{const p=document.createElement('div');p.style.outline='2px solid Highlight';document.body.append(p);const expected=getComputedStyle(p).outlineColor;p.remove();return {expected,actual:getComputedStyle(document.querySelector('input[type=email]').closest('.ui-input-shell')).outlineColor};})()");
  assert.equal(highContrast.actual,highContrast.expected);assert.equal((await check()).outer,'solid');assert.equal((await check()).inner,'none');
  await call('Emulation.setEmulatedMedia',{features:[]});
  if(route==='/register'){
   for(const width of [390,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});await evaluate("document.querySelector('input[type=email]').scrollIntoView({block:'center'})");await delay(180);await capture('input-focus-register-'+width);}
  }
 }
 // A bare control outside a shell, normal input and textarea retain their own ring.
 await evaluate("(()=>{const p=document.createElement('div');p.innerHTML='<label>Standalone<input class=\"ui-input-bare\"></label><label>Standard<input class=\"ui-input\"></label><label>Notes<textarea class=\"ui-input ui-textarea\"></textarea></label><label class=\"ui-input-shell\">Search<input class=\"ui-input-bare\"></label><button class=\"ui-button\">Next</button>';document.body.append(p);p.dataset.testid='focus-probes';})()");
 for(const selector of ['.ui-input-bare','input.ui-input','textarea.ui-input']){
  await evaluate(`document.querySelector('[data-testid=focus-probes] ${selector}').focus()`);
  assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle'),'solid');
  assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineWidth'),'2px');
 }
 await evaluate("document.querySelector('[data-testid=focus-probes] .ui-input-shell input').focus()");
 assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle'),'none');
 assert.equal(await evaluate('getComputedStyle(document.activeElement.parentElement).outlineColor'),'rgb(255, 0, 68)');
 assert.deepEqual(errors,[]);console.log('PASS auth compound focus: pointer/Tab, rounded perimeter, no internal outline, accessible labels, forced colors, standalone/input/textarea fallback');
}).catch(error=>{console.error(error);process.exitCode=1;});
