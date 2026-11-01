// Real-browser CSS regression, isolated document; no API or account required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {withBrowser} = require('../../spottr-native/tests/browser-harness.cjs');
const read = file => fs.readFileSync(path.resolve(__dirname, '../src', file), 'utf8');
const css = read('styles/design-tokens.css') + read('styles/interface.css') + read('features/events/form/themedSelect.module.css');

withBrowser(async ({call,evaluate,capture,errors}) => {
  await call('Page.navigate', {url:'about:blank'});
  await evaluate(`document.head.innerHTML = '<style>' + ${JSON.stringify(css)} + '</style>'`);
  await evaluate(`document.body.innerHTML = ${JSON.stringify(`
    <style>
      body { margin:24px; background:#000; color:white; font:14px sans-serif; }
      label { display:block; margin-bottom:20px; }
      .ui-input-shell { display:flex; align-items:center; padding:12px; border:1px solid #75757f; border-radius:16px; }
      .ui-input-bare { border:0; outline:none; }
      @layer utilities { .legacy-ring:focus { box-shadow:0 0 0 2px #f006; } .legacy-shell { box-shadow:0 0 0 1px #ffffff33; } }
    </style>
    <label>Account email<input id="email" class="ui-input legacy-ring" type="email"></label>
    <label>API token<input id="token" class="ui-input" type="password"></label>
    <label>Notes<textarea id="notes" class="ui-input ui-textarea"></textarea></label>
    <label>Invalid field<input id="invalid" class="ui-input" aria-invalid="true"></label>
    <label class="ui-input-shell legacy-shell">Search <input id="search" class="ui-input-bare"></label>
    <label>Standalone<input id="bare" class="ui-input-bare"></label>
    <button id="select" class="trigger" aria-expanded="true">Select provider</button>
  `)}`);
  const inspect = id => evaluate(`(()=>{
    const input=document.getElementById(${JSON.stringify(id)}),owner=input.closest('.ui-input-shell')||input;
    const s=getComputedStyle(owner),r=owner.getBoundingClientRect();
    return {width:r.width,height:r.height,outline:s.outlineStyle,size:s.outlineWidth,offset:s.outlineOffset,color:s.outlineColor,shadow:s.boxShadow,inner:getComputedStyle(input).outlineStyle};
  })()`);
  for (const width of [390,1280]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false});
    for (const id of ['email','token','notes','invalid','search','bare','select']) {
      await evaluate('document.activeElement.blur()');
      const before=await inspect(id);
      await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
      await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
      await evaluate(`document.getElementById(${JSON.stringify(id)}).focus()`);
      const focused=await inspect(id);
      assert.equal(focused.outline,'solid',id);
      assert.equal(focused.size,'2px',id);
      assert.equal(focused.offset,'-2px',id+' must overlap the border instead of adding an external line');
      assert.equal(focused.shadow,'none',id+' must not keep a legacy ring');
      assert.equal(focused.width,before.width,id+' width must not shift');
      assert.equal(focused.height,before.height,id+' height must not shift');
      if(id==='search')assert.equal(focused.inner,'none');
      assert.equal(focused.color,id==='invalid'?'rgb(255, 140, 153)':'rgb(255, 0, 68)');
      await call('Emulation.setEmulatedMedia',{features:[{name:'forced-colors',value:'active'}]});
      const highlight=await evaluate(`(()=>{const el=document.createElement('i');el.style.outlineColor='Highlight';document.body.append(el);const color=getComputedStyle(el).outlineColor;el.remove();return color;})()`);
      assert.equal((await inspect(id)).color,highlight,id+' forced colors');
      await call('Emulation.setEmulatedMedia',{features:[]});
    }
    await evaluate('document.getElementById("email").focus()');
    await capture('input-single-perimeter-'+width);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS single input perimeter: email, password, textarea, invalid, compound, bare, dropdown; no layout shift; desktop/mobile and forced colors');
}).catch(error=>{console.error(error);process.exitCode=1;});
