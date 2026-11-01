const assert = require('node:assert/strict');
const {withBrowser} = require('./browser-harness.cjs');

withBrowser(async ({base,call,evaluate,until,click,input,delay,errors}) => {
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`(${function(){
    const original=fetch.bind(window);
    localStorage.removeItem('spottr-native.session.v1');
    window.__loginQA={requests:[]};
    window.fetch=async(url,opts={})=>{
      const value=String(url);if(!value.includes('/api/v1/')){if(new URL(value,location.href).origin===location.origin)return original(url,opts);throw Error('External request blocked');}
      const path=new URL(value,location.href).pathname.split('/api/v1')[1];
      const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
      if(path==='/auth/login'){window.__loginQA.requests.push(JSON.parse(opts.body));await new Promise(resolve=>setTimeout(resolve,500));return reply({error:'invalid_credentials'},401);}
      if(path==='/notifications')return reply({items:[],unreadCount:0});
      return reply([]);
    };
  }.toString()})();`});
  const count=()=>evaluate('window.__loginQA.requests.length');
  const enter=async()=>{ await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13}); };
  const open=async()=>{await call('Page.navigate',{url:base+'/login?activation=success'});await until(`document.querySelector('[data-testid="auth-password"]')`);};
  await open();
  await input('auth-email','person@example.test'); await enter();
  assert.equal(await evaluate('document.activeElement.dataset.testid'),'auth-password','Email Return focuses password when incomplete');
  for(const char of 'fixture-password') await call('Input.insertText',{text:char});
  await delay(400); assert.equal(await count(),0,'Typing must not auto-submit');
  await enter(); await enter();
  await until('window.__loginQA.requests.length===1'); await delay(650);
  assert.equal(await count(),1,'Repeated Enter sends a single in-flight request');
  await click('auth-email'); await enter(); await until('window.__loginQA.requests.length===2'); await delay(650);
  assert.equal(await count(),2,'Enter also submits from the complete email field');

  await open();
  await input('auth-password','fixture-password'); await delay(300); assert.equal(await count(),0);
  await input('auth-email','person@example.test'); await until('window.__loginQA.requests.length===1'); await delay(800);
  assert.equal(await count(),1,'Password-first fill submits once and never loops after rejection');

  await open(); await input('auth-email','person@example.test'); await input('auth-password','fixture-password'); await enter();
  await until('window.__loginQA.requests.length===1'); await delay(800); assert.equal(await count(),1,'Enter plus queued autofill is deduplicated');
  assert.ok(!errors.some(message=>!message.includes('401')),errors.join('\n'));
  console.log('PASS login: keyboard Enter from both fields, incomplete form focus, manual typing, password-first autofill, duplicate submit and failed-login retry');
}).catch(error=>{console.error(error);process.exitCode=1;});
