// Real browser, temporary profile and simulated API. No live writes.
const assert=require('node:assert/strict');
const {withBrowser}=require('./browser-harness.cjs');
withBrowser(async({call,evaluate,until,capture,errors,delay,click})=>{
 const origin=process.env.INTERFACE_TEST_URL||'http://127.0.0.1:49188';
 await call('Page.addScriptToEvaluateOnNewDocument',{source:'('+function(){
  const original=window.fetch.bind(window),user={id:'22222222-2222-4222-8222-222222222222',username:'Admin QA',email:'admin@example.invalid',role:'admin',preferredLanguage:'en',hasPassword:true};
  localStorage.setItem('pulse_token','interface-test-only');localStorage.setItem('i18nextLng','en');
  window.fetch=async(input,options={})=>{const url=new URL(String(input),location.origin),route=url.pathname.split('/api/v1')[1];if(!route){if(url.origin===location.origin)return original(input,options);throw Error('Unexpected external request');}const reply=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});if(route==='/users/me'||route==='/auth/me')return reply(user);if(route==='/users/me/notifications')return reply({items:[],unreadCount:0});if(route==='/diagnostics/errors')return new Response(null,{status:204});return reply([]);};
 }.toString()+')();'});
 await call('Page.navigate',{url:origin+'/admin/style-guide'});await until("document.querySelector('#reference-name')");
 const name=await evaluate("(()=>{const input=document.querySelector('#reference-name'),label=document.querySelector('label[for=\"reference-name\"]');return {id:input.id,label:label?.textContent,invalid:input.getAttribute('aria-invalid'),error:document.getElementById(input.getAttribute('aria-describedby'))?.textContent};})()");
 assert.ok(name.label);assert.equal(name.invalid,'true');assert.ok(name.error);
 assert.equal(await evaluate("getComputedStyle(document.querySelector('#reference-name')).paddingLeft"),'14px');
 await evaluate("document.querySelector('label[for=\"reference-name\"]').click()");assert.equal(await evaluate('document.activeElement.id'),'reference-name');
 const skin=await evaluate("(()=>{const s=getComputedStyle(document.querySelector('.ui-button[data-variant=primary]'));return {bg:s.backgroundColor,color:s.color,radius:s.borderRadius,min:s.minHeight};})()");
 assert.equal(skin.bg,'rgb(217, 0, 58)');assert.equal(skin.color,'rgb(255, 255, 255)');assert.equal(skin.radius,'999px');assert.equal(skin.min,'44px');
 await evaluate("document.querySelector('[data-testid=\"interface-form\"] button[type=submit]').click()");assert.equal(await evaluate("document.querySelector('[data-testid=\"interface-form\"] button[type=submit]').disabled"),true);
 const key=async(key,code=key)=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:key==='Tab'?9:key==='Escape'?27:key==='Enter'?13:undefined,text:key==='Enter'?'\r':undefined,unmodifiedText:key==='Enter'?'\r':undefined});await call('Input.dispatchKeyEvent',{type:'keyUp',key,code});};
 await evaluate("document.querySelector('#reference-name').focus()");await key('Enter');assert.equal(await evaluate("document.querySelector('[data-testid=\"interface-submitted\"]').textContent"),'1');
 await delay(1250);
 await click("interface-open-modal");await until("document.querySelector('[data-testid=\"interface-modal\"]')?.open");
 assert.equal(await evaluate('document.activeElement.textContent'),'Cancel');for(let i=0;i<10;i++)await key('Tab');assert.equal(await evaluate("document.querySelector('[data-testid=\"interface-modal\"]').contains(document.activeElement)"),true);
 await key('Escape');await until("!document.querySelector('[data-testid=\"interface-modal\"]')");assert.equal(await evaluate('document.activeElement.dataset.testid'),'interface-open-modal');
 await evaluate("document.querySelector('button[aria-haspopup=dialog]').click()");await until("document.querySelector('dialog[open] [data-day]')");
 await evaluate("document.querySelector('dialog[open] svg.lucide-chevron-right').closest('button').click()");assert.equal(await evaluate("document.querySelectorAll('dialog[open] [data-day][tabindex=\"0\"]').length"),1);
 await evaluate("document.querySelector('dialog[open] [data-day][tabindex=\"0\"]').focus()");await key('ArrowRight');assert.equal(await evaluate('document.activeElement.dataset.day'),'2026-11-02');await key('Enter');await until("document.activeElement.getAttribute('aria-pressed')==='true'");await key('Escape');
 // The dropdown keeps a single themed keyboard perimeter; active rows use their
 // border instead of the old white outline. Focus on filled actions needs a halo.
 await evaluate("document.querySelector('[role=combobox]').focus()");await key('ArrowDown');
 await until("document.querySelector('[role=listbox] [data-active=true]')");
 const selectSkin=await evaluate("(()=>{const trigger=document.querySelector('[role=combobox]'),active=document.querySelector('[role=listbox] [data-active=true]'),a=getComputedStyle(trigger),b=getComputedStyle(active);return {outline:a.outlineColor,width:a.outlineWidth,radius:a.borderRadius,activeBorder:b.borderTopColor,activeOutline:b.outlineStyle};})()");
 assert.equal(selectSkin.outline,'rgb(255, 0, 68)');assert.equal(selectSkin.width,'2px');assert.equal(selectSkin.radius,'12px');assert.equal(selectSkin.activeBorder,'rgb(255, 0, 68)');assert.equal(selectSkin.activeOutline,'none');
 const ratios=[];
 for(let selected=0;selected<2;selected++){
  const pixels=await evaluate("(()=>{const node=document.querySelector('[role=listbox] [data-active=true]'),canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d'),ancestors=[];for(let p=node;p;p=p.parentElement)ancestors.unshift(p);ctx.fillStyle='black';ctx.fillRect(0,0,1,1);for(const p of ancestors){ctx.fillStyle=getComputedStyle(p).backgroundColor;ctx.fillRect(0,0,1,1);}const background=[...ctx.getImageData(0,0,1,1).data].slice(0,3);ctx.clearRect(0,0,1,1);ctx.fillStyle=getComputedStyle(node).borderTopColor;ctx.fillRect(0,0,1,1);return {background,focus:[...ctx.getImageData(0,0,1,1).data].slice(0,3)};})()");
  const luminance=rgb=>rgb.map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0),values=[luminance(pixels.background),luminance(pixels.focus)].sort((a,b)=>b-a),ratio=(values[0]+.05)/(values[1]+.05);
  assert.ok(ratio>=3,'Active row contrast '+ratio);ratios.push(Number(ratio.toFixed(2)));
  if(!selected){await key('Enter');await key('ArrowDown');await until("document.querySelector('[role=listbox] [data-active=true][aria-selected=true]')");}
 }
 console.log('Dropdown active border contrast, normal/selected:',ratios.join('/'));
 await evaluate("document.querySelector('[role=combobox]').scrollIntoView({block:'center'})");await delay(80);await capture('interface-web-dropdown-focus');
 const ax=await call('Accessibility.getFullAXTree');assert.ok(ax.nodes.some(node=>node.role?.value==='combobox'&&node.name?.value==='Ticket type'));
 await call('Emulation.setEmulatedMedia',{features:[{name:'forced-colors',value:'active'}]});await delay(200);
 const forcedSelect=await evaluate("(()=>{const p=document.createElement('span');p.style.outline='2px solid Highlight';document.body.append(p);const expected=getComputedStyle(p).outlineColor;p.remove();return {expected,trigger:getComputedStyle(document.querySelector('[role=combobox]')).outlineColor,option:getComputedStyle(document.querySelector('[role=listbox] [data-active=true]')).borderTopColor};})()");
 assert.equal(forcedSelect.trigger,forcedSelect.expected);assert.equal(forcedSelect.option,forcedSelect.expected);
 await call('Emulation.setEmulatedMedia',{features:[]});await key('Escape');
 await evaluate("document.querySelector('.ui-button[data-variant=primary]').focus()");
 const primaryFocus=await evaluate("(()=>{const s=getComputedStyle(document.activeElement);return {color:s.outlineColor,offset:s.outlineOffset,halo:s.boxShadow};})()");
 assert.equal(primaryFocus.color,'rgb(255, 0, 68)');assert.equal(primaryFocus.offset,'3px');assert.ok(primaryFocus.halo.includes('rgb(0, 0, 0)')&&primaryFocus.halo.includes('6px'));
 for(const width of [1440,320]){await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===320});await delay(120);await evaluate('scrollTo(0,0)');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);await capture('interface-web-'+width);}
 await evaluate("document.documentElement.style.setProperty('--native-safe-top','40px');document.documentElement.style.setProperty('--native-safe-bottom','32px');document.documentElement.style.setProperty('--native-safe-left','24px');document.documentElement.style.setProperty('--native-safe-right','24px');document.querySelector('[data-testid=\"interface-open-modal\"]').click()");await until("document.querySelector('dialog[open]')");
 assert.equal(await evaluate("(()=>{const r=document.querySelector('dialog[open]').getBoundingClientRect();return r.left>=24&&r.right<=innerWidth-24&&r.top>=40&&r.bottom<=innerHeight-32;})()"),true);await capture('interface-web-safe-area');await key('Escape');
 await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert.equal(await evaluate("parseFloat(getComputedStyle(document.querySelector('.ui-spinner')??document.querySelector('.ui-button')).animationDuration)<0.001"),true);
 assert.deepEqual(errors,[]);console.log('PASS shared fields/contrast/busy submit/calendar keyboard/modal focus+restore/320/desktop/safe-area/reduced-motion');
}).catch(error=>{console.error(error);process.exitCode=1;});
