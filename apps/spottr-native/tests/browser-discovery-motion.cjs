const assert = require('node:assert/strict');
const { withBrowser } = require('./browser-harness.cjs');

withBrowser(async ({ base, call, evaluate, until, delay, capture, errors }) => {
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.removeItem('spottr-native.session.v1');localStorage.setItem('i18nextLng','en');
    const originalFetch=window.fetch.bind(window);
    window.fetch=async(url,options)=>{
      const parsed=new URL(String(url),location.href);
      if(parsed.pathname.includes('/api/v1/')) {
        const events=[1,2].map(n=>({id:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),organizerId:'00000000-0000-4000-8000-000000000099',title:'Motion event '+n,category:'HOUSE',vibe:'Indoor',city:'Bucuresti',locationName:'QA Club',description:'QA event',latitude:44.4268,longitude:26.1025,startTime:'2030-11-01T20:00:00Z',endTime:'2030-11-02T04:00:00Z',ticketTypes:[],lineup:[]}));
        return new Response(JSON.stringify(parsed.pathname.endsWith('/events')?events:[]),{headers:{'content-type':'application/json'}});
      }
      if(parsed.origin===location.origin||parsed.hostname==='tiles.openfreemap.org')return originalFetch(url,options);
      throw Error('Unexpected fetch');
    };
    window.__toolbarGeometry=()=>{
      const box=id=>document.querySelector('[data-testid="'+id+'"]').getBoundingClientRect();
      const surface=box('events-view-switch'),blob=box('events-view-indicator');
      const active=document.querySelector('[data-testid="events-map-toggle"]').getAttribute('aria-pressed')==='true'?'events-map-toggle':'events-list-toggle';
      const icon=document.querySelector('[data-testid="'+active+'"] svg').getBoundingClientRect();
      return{left:blob.left-surface.left,right:surface.right-blob.right,top:blob.top-surface.top,bottom:surface.bottom-blob.bottom,
        centerX:blob.left+blob.width/2-icon.left-icon.width/2,centerY:blob.top+blob.height/2-icon.top-icon.height/2,
        width:blob.width,color:getComputedStyle(document.querySelector('[data-testid="events-view-indicator"]')).backgroundColor};
    };
  ` });
  await call('Page.navigate', { url: base + '/events' });
  await until(`document.querySelector('[data-testid="events-view-indicator"]')`);
  await delay(300);
  const margins = [];
  for (const mode of ['list', 'map', 'list']) {
    const frames = await evaluate(`(async()=>{
      const samples=[window.__toolbarGeometry().left];
      document.querySelector('[data-testid="events-${mode}-toggle"]').click();
      const start=performance.now();while(performance.now()-start<750){await new Promise(requestAnimationFrame);samples.push(window.__toolbarGeometry().left);}
      return samples;
    })()`);
    const geometry = await evaluate('window.__toolbarGeometry()');
    assert.ok(Math.abs(geometry.centerX) < .5 && Math.abs(geometry.centerY) < .5, 'Capsule centers on the selected icon: ' + JSON.stringify(geometry));
    assert.ok(Math.abs(geometry.top - geometry.bottom) < .2);
    assert.equal(geometry.color, 'rgb(255, 0, 68)', 'Keep the current accent');
    assert.equal(await evaluate(`document.querySelectorAll('[data-testid="events-view-indicator"]').length`), 1);
    margins.push(mode === 'list' ? geometry.left : geometry.right);
    if (mode === 'map') assert.ok(frames.some(left => left > 8 && left < 70), 'Moving capsule has intermediate positions');
  }
  assert.ok(margins.every(margin => Math.abs(margin - 4) < .5), 'Both ends have the same 4px inset: ' + margins);
  await evaluate(`document.querySelector('[data-testid="events-map-toggle"]').click()`);
  await delay(60);
  await evaluate(`document.querySelector('[data-testid="events-list-toggle"]').click()`);
  await delay(750);
  assert.ok(Math.abs((await evaluate('window.__toolbarGeometry()')).left - 4) < .5, 'Interrupted spring settles on the last choice');
  await capture('discovery-switch-centered');
  for (const mode of ['list', 'map']) {
    await evaluate(`document.querySelector('[data-testid="events-${mode}-toggle"]').click()`); await delay(750);
    await evaluate(`window.__originalSearch=document.querySelector('[data-testid="discovery-search"]');window.__morphFrame=()=>{
      const field=document.querySelector('[data-testid="discovery-search-surface"]'),r=field.getBoundingClientRect(),bar=document.querySelector('[data-testid="discovery-toolbar"]').getBoundingClientRect();
      const glyph=field.querySelector('svg').getBoundingClientRect(),input=window.__originalSearch.getBoundingClientRect(),content=document.querySelector('[data-testid="events-list"]');
      const back=document.querySelector('[data-testid="discovery-back-surface"]'),b=back.getBoundingClientRect(),source=document.querySelector('[data-testid="discovery-search-source"]').getBoundingClientRect(),dest=document.querySelector('[data-testid="discovery-search-destination"]').getBoundingClientRect();
      const switchBox=document.querySelector('[data-testid="events-view-switch"]').getBoundingClientRect(),filterBox=document.querySelector('[data-testid="event-filters"]').getBoundingClientRect();
      return {width:r.width,x:r.left-bar.left,radius:parseFloat(getComputedStyle(field).borderRadius),iconX:glyph.left-r.left+glyph.width/2,inputWidth:window.__originalSearch.offsetWidth,height:bar.height,contentTop:content?.getBoundingClientRect().top,
        back:{x:b.x-bar.x,width:b.width,height:b.height,radius:parseFloat(getComputedStyle(back).borderRadius)},source:{x:source.x-bar.x,width:source.width},destination:{x:dest.x-bar.x,width:dest.width},switchWidth:switchBox.width,
        switchCenter:{x:switchBox.x+switchBox.width/2-bar.x,y:switchBox.y+switchBox.height/2-bar.y},filterWidth:filterBox.width,
        filterCenter:{x:filterBox.x+filterBox.width/2-bar.x,y:filterBox.y+filterBox.height/2-bar.y},
        controls:Number(getComputedStyle(document.querySelector('[data-testid="discovery-source-layer"]')).opacity),backOpacity:Number(getComputedStyle(document.querySelector('[data-testid="discovery-back-layer"]')).opacity)};
    }`);
    const frames = await evaluate(`(async()=>{
      const samples=[window.__morphFrame()];document.querySelector('[data-testid="discovery-search-toggle"]').click();
      const start=performance.now();while(performance.now()-start<950){await new Promise(requestAnimationFrame);samples.push(window.__morphFrame());}return samples;
    })()`);
    const first=frames[0],last=frames.at(-1);
    assert.ok(frames.some(f=>f.width>50&&f.width<last.width-4), 'Continuous field geometry');
    assert.ok(frames.some(f=>f.x>55&&f.x<first.x-4), 'Icon and surface travel together');
    assert.ok(Math.abs(last.x-last.destination.x)<.5&&Math.abs(last.width-last.destination.width)<.5);
    assert.ok(Math.abs(first.x-first.source.x)<.5&&Math.abs(first.width-first.source.width)<.5);
    const checkGeometry = samples => { for (const f of samples) {
      assert.ok(Math.abs(f.back.width-f.back.height)<.1, 'Back stays circular during its uniform entrance scale');
      assert.ok(Math.abs(f.back.x+f.back.width/2-22)<.2, 'Back never shifts its center');
      assert.ok(f.back.width>=44*.929&&f.back.width<=44*1.036, 'Restrained Back entrance');
      assert.equal(f.back.radius,22);
      assert.equal(f.radius,22,'Search is fully rounded in every frame');
      for(const name of ['switchCenter','filterCenter']){
        assert.ok(Math.abs(f[name].x-first[name].x)<.15&&Math.abs(f[name].y-first[name].y)<.15, 'Default controls shrink around fixed centers');
      }
      assert.ok(f.switchWidth>=first.switchWidth*.879&&f.switchWidth<=first.switchWidth+.1);
      assert.ok(f.filterWidth>=first.filterWidth*.879&&f.filterWidth<=first.filterWidth+.1);
      if(f.controls>.001)assert.equal(f.backOpacity,0,'Back and the source switch cannot stack');
      const t=(f.width-first.width)/(last.width-first.width),expected=first.x+(last.x-first.x)*t;
      if(f.width>last.width+.1) {
        assert.ok(f.width<=last.width+6.1&&f.width<=last.width*1.016, 'Terminal overshoot is bounded');
        assert.ok(Math.abs(f.x-last.x)<.5, 'Overshoot keeps the Back-side edge anchored');
      } else assert.ok(Math.abs(f.x-expected)<.5,'Opening and closing use the same measured path');
    }};
    checkGeometry(frames);
    assert.ok(Math.abs(first.iconX-22)<.5&&Math.abs(last.iconX-18)<.5, 'The same search glyph moves into the field: '+JSON.stringify({first,last}));
    assert.ok(frames.every(f=>Math.abs(f.height-44)<.5), 'Toolbar height stays constant');
    if(mode==='list') assert.ok(frames.every(f=>Math.abs(f.contentTop-first.contentTop)<.5), 'Event cards stay in place');
    assert.ok(frames.every(f=>Math.abs(f.inputWidth-first.inputWidth)<.5), 'Input does not reflow each frame');
    assert.equal(await evaluate(`window.__originalSearch===document.querySelector('[data-testid="discovery-search"]')`),true);
    assert.equal(await evaluate(`document.activeElement?.getAttribute('data-testid')`),'discovery-search');
    assert.equal(await evaluate(`document.querySelector('[data-testid="event-filters"]').tabIndex`),-1);
    assert.equal(await evaluate(`document.querySelector('[data-testid="events-map-toggle"]').tabIndex`),-1);
    await capture('discovery-liquid-search-'+mode);
    await evaluate(`document.querySelector('[data-testid="discovery-search-back"]').click()`);
    await delay(65);
    const reversal=await evaluate(`(()=>{const before=window.__morphFrame().width;document.querySelector('[data-testid="discovery-search-toggle"]').click();return {before,after:window.__morphFrame().width};})()`);
    assert.ok(Math.abs(reversal.after-reversal.before)<.5, 'Interrupted animation does not restart from an endpoint: '+JSON.stringify(reversal));
    await delay(950);
    assert.ok(Math.abs(await evaluate('window.__morphFrame().width')-last.width)<.5);
    const closing=await evaluate(`(async()=>{const samples=[window.__morphFrame()];document.querySelector('[data-testid="discovery-search-back"]').click();const start=performance.now();while(performance.now()-start<650){await new Promise(requestAnimationFrame);samples.push(window.__morphFrame());}return samples;})()`);
    checkGeometry(closing);
    assert.equal(await evaluate(`document.activeElement?.getAttribute('data-testid')`),'discovery-search-toggle');
    assert.equal(await evaluate(`document.querySelector('[data-testid="discovery-search"]').tabIndex`),-1);
  }
  await evaluate(`document.querySelector('[data-testid="events-list-toggle"]').click()`);await delay(750);
  for (const width of [320, 768, 1152]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 1024 });
    await delay(350);
    const geometry = await evaluate('window.__toolbarGeometry()');
    assert.ok(Math.abs(geometry.left - 4) < .5 && Math.abs(geometry.centerX) < .5, 'Resize preserves the capsule alignment');
  }
  await call('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await call('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true});
  await delay(100);
  await evaluate(`document.querySelector('[data-testid="discovery-search-toggle"]').click()`);await delay(80);
  assert.ok(Math.abs(await evaluate('window.__morphFrame().x')-52)<.5,'Reduced motion opens without travel');
  await evaluate(`document.querySelector('[data-testid="discovery-search-back"]').click()`);await delay(80);
  assert.ok(Math.abs(await evaluate('window.__morphFrame().width')-44)<.5,'Reduced motion closes without travel');
  assert.deepEqual(errors, []);
  console.log('PASS centered switch, shared search geometry, one glyph, fixed input/card layout, rapid reversal, focus and reduced motion in List/Map');
}).catch(error => { console.error(error); process.exitCode = 1; });
