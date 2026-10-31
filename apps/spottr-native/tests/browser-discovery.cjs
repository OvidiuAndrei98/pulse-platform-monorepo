const assert=require('node:assert/strict');
const {withBrowser}=require('./browser-harness.cjs');

withBrowser(async({base,call,evaluate,until,click,input,delay,capture,errors})=>{
  const next=!!process.env.MAP_TEST_URL,origin=process.env.MAP_TEST_URL||base;
  assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
  await call('Emulation.setDeviceMetricsOverride',{width:1152,height:900,deviceScaleFactor:1,mobile:false});
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`(${function mock(){
    localStorage.removeItem('spottr-native.session.v1');localStorage.removeItem('pulse_token');localStorage.setItem('i18nextLng','en');
    const original=fetch.bind(window);window.__discovery={requests:[]};
    const event=n=>({id:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),organizerId:'00000000-0000-4000-8000-000000000099',title:(n%2?'House':'Rock')+' event '+n,category:'HOUSE',vibe:'Indoor',city:'Bucuresti',locationName:'QA Club',description:'QA event',latitude:44.4268,longitude:26.1025,startTime:'2030-11-01T20:00:00Z',endTime:'2030-11-02T04:00:00Z',ticketTypes:[],lineup:[]});
    window.fetch=async(url,options)=>{const parsed=new URL(String(url),location.origin);if(!parsed.pathname.includes('/api/v1/')){if(parsed.origin===location.origin||parsed.hostname==='tiles.openfreemap.org')return original(url,options);throw Error('Unexpected external request');}
      const route=parsed.pathname.split('/api/v1')[1],reply=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
      if(route==='/events'){window.__discovery.requests.push(Object.fromEntries(parsed.searchParams));const q=(parsed.searchParams.get('q')||'').toLowerCase();return reply([1,2,3,4,5].map(event).filter(row=>row.title.toLowerCase().includes(q)));}
      if(route.endsWith('/social'))return reply({friends:[],goingCount:0,interestedCount:0,manualGoingCount:0,ticketsSoldCount:0});
      if(route==='/promotions/active')return reply([]);return reply([]);
    };
  }.toString()})();`});
  await call('Page.navigate',{url:origin+'/events'});await delay(650);await until(`document.querySelector('[data-testid="discovery-search"]')`);
  const centeredFilter=await evaluate(`(()=>{const button=document.querySelector('[data-testid="event-filters"]'),icon=button.querySelector('svg'),r=button.getBoundingClientRect(),s=icon.getBoundingClientRect();return Math.abs(r.x+r.width/2-s.x-s.width/2)<1&&Math.abs(r.y+r.height/2-s.y-s.height/2)<1;})()`);
  assert.equal(centeredFilter,true,'Filter icon stays centered in the Glass fallback');
  await input('discovery-search','House');
  await until(`window.__discovery.requests.some(q=>q.q==='House')`);
  await until(`document.body.innerText.includes('House event 1')&&!document.body.innerText.includes('Rock event 2')`);
  // Desktop Escape clears and keeps focus on the visible input.
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await evaluate(`document.activeElement?.getAttribute('data-testid')`),'discovery-search');
  await until(`document.querySelector('[data-testid="discovery-search"]').value===''&&document.body.innerText.includes('Rock event 2')`);
  const pressText=async(text)=>{await evaluate(`(()=>{const root=document.querySelector('dialog[open]')||[...document.querySelectorAll('[aria-modal="true"]')].at(-1)||document;const el=[...root.querySelectorAll('button,[role="button"],[role="radio"]')].find(el=>el.textContent.trim()===${JSON.stringify(text)});if(!el)throw Error('Missing button '+${JSON.stringify(text)}+' in '+root.innerText);el.click();})()`);};
  const clearSearch=async()=>{await evaluate(`document.querySelector('[data-testid="discovery-toolbar"] [aria-label="Clear search"]').click()`);await delay(250);};
  await input('discovery-search','Rock');await clearSearch();
  assert.equal(await evaluate(`document.activeElement?.getAttribute('data-testid')`),'discovery-search','Desktop X returns focus to the visible input');
  await input('discovery-search','House');
  await call('Emulation.setDeviceMetricsOverride',{width:320,height:700,deviceScaleFactor:1,mobile:true});await delay(300);
  assert.equal(await evaluate(`(()=>{const el=document.querySelector('[data-testid="discovery-search"]');return el?.value==='House'&&el.getBoundingClientRect().width>60;})()`),true,'Desktop-to-mobile keeps an active query visible');
  await clearSearch();
  if(!next){assert.equal(await evaluate(`document.activeElement?.getAttribute('data-testid')`),'discovery-search','Clear keeps the field focused');await click('discovery-search-back');await delay(150);}
  assert.equal(await evaluate(`document.activeElement?.getAttribute('data-testid')`),'discovery-search-toggle','Dismissal restores the round trigger');
  await call('Emulation.setDeviceMetricsOverride',{width:1152,height:900,deviceScaleFactor:1,mobile:false});await delay(300);
  await click('discovery-city');
  if(!next)await click('discovery-city-field');
  await until(next?`document.querySelector('[data-testid="discovery-city-options"]')`:`document.querySelector('[data-testid="discovery-city-field-options"]')`);
  if(next)await evaluate(`(()=>{const option=[...document.querySelectorAll('[role="option"]')].find(el=>el.textContent.trim()==='Bucuresti');option.click();})()`);
  else await pressText('Bucuresti');
  if(!next)await pressText('Apply filters');
  await delay(350);
  await until(`window.__discovery.requests.some(q=>q.city==='Bucuresti')`);
  const key=async(key,code=key,number=key.length===1?key.toUpperCase().charCodeAt(0):({Enter:13,ArrowDown:40,ArrowUp:38,Home:36,End:35,Escape:27,Tab:9}[key]||0))=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:number,...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});await call('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:number});};
  if(!next)await click('discovery-city');
  const focusId=next?'discovery-city':'discovery-city-field';
  await key('Tab');await evaluate(`document.querySelector('[data-testid="${focusId}"]').focus()`);await delay(50);
  const focusSkin=await evaluate(`(()=>{const node=document.querySelector('[data-testid="${focusId}"]'),s=getComputedStyle(node);return {color:s.outlineColor,width:s.outlineWidth,radius:s.borderRadius};})()`);
  assert.equal(focusSkin.color,'rgb(255, 0, 68)');assert.equal(focusSkin.width,'2px');assert.notEqual(focusSkin.radius,'0px');
  if(!next){
    await click('discovery-city-field');await until(`document.querySelector('[data-testid="discovery-city-field-options"]')`);
    assert.equal(await evaluate(`!![...document.querySelectorAll('[data-testid="discovery-city-field-options"] [role=button]')].find(node=>getComputedStyle(node).borderTopColor==='rgb(255, 0, 68)')`),true);
    await capture('native-dropdown-focus');await key('Escape');await until(`!document.querySelector('[data-testid="discovery-city-field-options"]')`);
    await pressText('Apply filters');
  }
  if(next){
    await evaluate(`document.querySelector('[data-testid="discovery-city"]').focus()`);await key('ArrowDown');
    await until(`document.querySelector('[role="listbox"]')`);await key('End');
    assert.equal(await evaluate(`(()=>{const e=document.querySelector('[data-testid="discovery-city"]');return document.getElementById(e.getAttribute('aria-activedescendant')).textContent.trim();})()`),'Sibiu');
    await key('Home');await key('ArrowDown');await key('Enter');
    assert.equal(await evaluate(`document.activeElement?.getAttribute('data-testid')`),'discovery-city');
    await key('Enter');for(const character of 'Cluj')await key(character);await key('Enter');
    await until(`document.querySelector('[data-testid="discovery-city"]').textContent.includes('Cluj-Napoca')`);
    await key('Enter');await key('Home');await key('ArrowDown');await key('Enter');
    await key('Enter');await key('Escape');assert.equal(await evaluate(`document.querySelector('[data-testid="discovery-city"]').getAttribute('aria-expanded')`),'false');
    await key('Enter');await key('Tab');assert.equal(await evaluate(`!!document.querySelector('[role="listbox"]')`),false,'Tab dismisses the custom menu');
    await click('discovery-city');await click('discovery-search');assert.equal(await evaluate(`!!document.querySelector('[role="listbox"]')`),false,'Outside pointer dismisses the custom menu');
  }
  await click('discovery-calendar-toggle');await until(`document.querySelector('[data-testid="discovery-calendar"]')`);
  const days=await evaluate(`[...document.querySelectorAll('[data-testid^="discovery-day-"]')].filter(el=>el.getAttribute('aria-disabled')!=='true'&&!el.disabled).map(el=>el.dataset.testid.slice(14)).slice(-5)`);
  const day=days[0];assert.match(day,/^\d{4}-\d{2}-\d{2}$/);
  await click('discovery-day-'+day);
  assert.equal(await evaluate(`document.querySelector('[data-testid="discovery-calendar"]')?.querySelectorAll('[role="radio"],input[type="radio"]').length`),0,'Calendar has no single/range mode selector');
  await click('discovery-day-'+day);
  if(next){const selected=await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('[data-testid="discovery-day-${day}"]'));return{size:parseFloat(s.fontSize),weight:Number(s.fontWeight),color:s.color,background:s.backgroundColor};})()`);assert.ok(selected.size>=18.67&&selected.weight>=700);assert.equal(selected.color,'rgb(255, 255, 255)');}
  await pressText('Apply filters');await until(`window.__discovery.requests.some(q=>q.startsBefore&&q.startsAfter)`);
  await delay(350);
  await click('event-filters');await delay(350);
  assert.equal(await evaluate(`!!(document.querySelector('dialog[open]')||document.querySelector('[aria-modal="true"]'))?.querySelector('[data-testid="discovery-calendar"]')`),false,'Desktop filters exclude city/calendar');
  await pressText('Reset');await pressText('Apply filters');
  assert.ok(await evaluate(`window.__discovery.requests.at(-1).startsBefore`),'Desktop filter reset keeps selected dates');
  assert.equal(await evaluate(`window.__discovery.requests.at(-1).city`),'Bucuresti','Desktop filter reset keeps the separate city');
  await capture((next?'next-':'')+'discovery-desktop-toolbar');
  await call('Emulation.setDeviceMetricsOverride',{width:320,height:700,deviceScaleFactor:1,mobile:true});await delay(350);
  await click('discovery-search-toggle');await input('discovery-search','Rock');
  await until(`window.__discovery.requests.some(q=>q.q==='Rock')`);
  const bounds=await evaluate(`(()=>{const bar=document.querySelector('[data-testid="discovery-toolbar"]'),field=document.querySelector('[data-testid="discovery-search"]'),r=bar.getBoundingClientRect(),f=field.getBoundingClientRect();return{left:r.left,right:r.right,field:f.width,screen:innerWidth};})()`);
  assert.ok(bounds.left>=0&&bounds.right<=bounds.screen+.5&&bounds.field>=60,'Expanded search fits 320px');
  await capture((next?'next-':'')+'discovery-mobile-search');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(250);
  assert.equal(await evaluate(`document.activeElement?.getAttribute('data-testid')`),'discovery-search-toggle');
  if(next){for(let i=0;i<4;i++){await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert.equal(await evaluate(`!!document.activeElement?.closest('[inert]')`),false);}}
  await click('event-filters');await until(`document.querySelector('[data-testid="filters-calendar-toggle"]')`);
  const calendarToggle=`document.querySelector('[data-testid="filters-calendar-toggle"]')`;
  assert.equal(await evaluate(`${calendarToggle}.getAttribute('aria-expanded')`),'false','Mobile calendar starts collapsed, even with a selected date');
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="discovery-calendar"]')`),false);
  assert.ok(await evaluate(`!!document.getElementById(${calendarToggle}.getAttribute('aria-controls'))`),'Disclosure controls an existing container');
  await delay(650);
  await capture((next?'next-':'')+'discovery-mobile-calendar-collapsed');
  await evaluate(`${calendarToggle}.focus()`);
  assert.equal(await evaluate(`document.activeElement?.getAttribute('data-testid')`),'filters-calendar-toggle','Calendar disclosure is keyboard focusable');
  await key('Enter');await until(`document.querySelector('[data-testid="discovery-calendar"]')`);
  assert.ok(await evaluate(`(()=>{const s=getComputedStyle(${calendarToggle});return s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0;})()`),'Calendar disclosure has a visible keyboard focus indicator');
  assert.equal(await evaluate(`document.querySelector('[data-testid="discovery-day-${day}"]').getAttribute('aria-pressed')`),'true','Opening the calendar preserves the selected single day');
  await key(' ','Space',32);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="discovery-calendar"]')`),false,'Closing removes calendar controls from the focus order');
  await click('filters-calendar-toggle');await until(`document.querySelector('[data-testid="discovery-calendar"]')`);
  assert.equal(await evaluate(`document.querySelector('[data-testid="discovery-day-${day}"]').getAttribute('aria-pressed')`),'true','Closing and reopening keeps the date');
  await pressText('Clear dates');
  if(next){
    const field=`document.querySelector('dialog[open] [role="combobox"][aria-label="City"]')`;
    await evaluate(`${field}.focus()`);await key('Enter');await until(`document.querySelector('[role="listbox"]')`);
    assert.equal(await evaluate(`(()=>{const r=document.querySelector('[role="listbox"]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()`),true,'Themed menu escapes dialog clipping and fits 320px');
    await capture('next-discovery-mobile-dropdown');await key('Escape');
    assert.equal(await evaluate(`!!document.querySelector('dialog[open]')`),true,'Escape closes only the nested select');
  }
  await click('discovery-day-'+day);
  await click('filters-calendar-toggle');
  await pressText('Apply filters');await until(`document.querySelector('[role="alert"]')?.textContent.includes('last day')`);
  assert.equal(await evaluate(`${calendarToggle}.getAttribute('aria-expanded')`),'true','Validation reopens an incomplete range');
  await delay(350);
  assert.ok(await evaluate(`(()=>{const alert=document.querySelector('[role="alert"]'),a=alert.getBoundingClientRect(),dialog=alert.closest('dialog,[aria-modal="true"]')?.getBoundingClientRect();return a.top>=0&&a.bottom<=innerHeight&&a.width>0&&(!dialog||(a.top>=dialog.top&&a.bottom<=dialog.bottom));})()`),'Incomplete range error is visible inside the dialog');
  await capture((next?'next-':'')+'discovery-mobile-calendar');
  await click('discovery-day-'+days[3]);await pressText('Apply filters');
  await until(`!(document.querySelector('dialog[open]')||document.querySelector('[aria-modal="true"]'))`);
  await click('event-filters');await until(`${calendarToggle}`);
  assert.equal(await evaluate(`${calendarToggle}.getAttribute('aria-expanded')`),'false','Reopening filters starts compact');
  await pressText('Reset');await click('filters-calendar-toggle');
  assert.equal(await evaluate(`document.querySelector('[data-testid="discovery-calendar"]').querySelectorAll('[aria-pressed="true"],[aria-selected="true"]').length`),0,'Reset clears custom dates');
  await pressText('Tonight');
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="discovery-calendar"]')`),false,'A quick period collapses the calendar');
  await pressText('Apply filters');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log((next?'Next':'Native web')+' discovery search, calendar, preserved desktop filters, mobile expansion and range validation: PASS');
}).catch(error=>{console.error(error);process.exitCode=1;});
