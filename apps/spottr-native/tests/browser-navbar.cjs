// Compare the native web preview against the actual Next component and compiled
// stylesheet, rather than a second hand-written approximation of its CSS.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { withBrowser } = require('./browser-harness.cjs');
const webApp = path.resolve(__dirname, '../../pulse-app');
const webRequire = createRequire(path.join(webApp, 'package.json'));
const ts = webRequire('typescript');
const React = webRequire('react');
const { renderToStaticMarkup } = webRequire('react-dom/server');
const sharp = createRequire(webRequire.resolve('next/package.json'))('sharp');
const artifacts = path.resolve(__dirname, '../artifacts');

function compileModule(relativePath, resolve = webRequire) {
  const source = fs.readFileSync(path.join(webApp, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(resolve, module, module.exports);
  return module.exports;
}
const tabs = compileModule('src/lib/navigation/tabs.ts');
let pathname = '/';
const { BottomNavGate } = compileModule('src/components/BottomNav.tsx', name => {
  if (name === '@/components/ClientNavigation') return { scrollClientPageToTop() {} };
  if (name === '@/lib/navigation/tabs') return tabs;
  if (name === 'next/navigation') return { usePathname: () => pathname, useRouter: () => ({ prefetch() {} }) };
  if (name === '@/core/DataProviderContext') return { useDataProvider: () => ({ isOrganizer: false }) };
  if (name === 'react-i18next') return { useTranslation: () => ({ t: key => key }) };
  return webRequire(name);
});

async function main() {
  const stylesheet = path.join(webApp, 'src/app/globals.css');
  const { css } = await webRequire('postcss')([webRequire('@tailwindcss/postcss')({ base: webApp })]).process(fs.readFileSync(stylesheet, 'utf8'), { from: stylesheet });
  await withBrowser(async ({ base, call, evaluate, until, delay, click, errors }) => {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `const originalFetch=window.fetch.bind(window);window.fetch=(url,options)=>String(url).includes('/api/v1/')?Promise.resolve(new Response('[]',{headers:{'content-type':'application/json'}})):originalFetch(url,options);` });
    const results = [];
    for (const width of [390, 1024]) for (const pattern of [false, true]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 768 });
      const screenshots = {}, layouts = {};
      for (const variant of ['native', 'next']) {
        if (variant === 'native') {
          await call('Page.navigate', { url: process.env.NAVBAR_PREVIEW_URL || base });
          await until(`document.querySelector('[data-testid="tab-indicator"]')`, process.env.NAVBAR_PREVIEW_URL ? 60000 : 14000);
          if (pattern) await click('tab-Feed');
        } else {
          pathname = pattern ? '/feed' : '/';
          await call('Page.navigate', { url: 'about:blank' });
          const { frameTree } = await call('Page.getFrameTree');
          await call('Page.setDocumentContent', { frameId: frameTree.frame.id, html: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body style="margin:0;background:black">${renderToStaticMarkup(React.createElement(BottomNavGate))}</body></html>` });
        }
        await evaluate(`(() => {
          const bar=document.querySelector('${variant === 'native' ? '[data-testid="tab-bar"]' : '[data-bottom-nav-glass]'}'), container=bar.parentElement;
          container.style.zIndex='9999';
          const background=document.createElement('div');
          Object.assign(background.style,{position:'absolute',width:'100vw',left:'calc(50% - 50vw)',top:'-200px',bottom:'-200px',zIndex:'-1',pointerEvents:'none',background:${JSON.stringify(pattern ? 'repeating-linear-gradient(135deg,#122933 0px,#122933 28px,#76304c 28px,#76304c 56px,#413424 56px,#413424 84px)' : '#000')}});
          container.prepend(background);
        })()`);
        // Metro briefly overlays its refresh badge on the first development
        // page load. Wait for that unrelated debug UI and tab motion to settle.
        await delay(variant === 'native' && process.env.NAVBAR_PREVIEW_URL ? 3000 : 500);
        layouts[variant] = await evaluate(`(() => {
          const bar=document.querySelector('${variant === 'native' ? '[data-testid="tab-bar"]' : '[data-bottom-nav-glass]'}'), indicator=document.querySelector('${variant === 'native' ? '[data-testid="tab-indicator"]' : '[data-nav-indicator]'}');
          const properties=['borderTopColor','borderTopWidth','borderRadius','backgroundColor','backgroundImage','boxShadow','backdropFilter','overflow','isolation','zIndex'];
          const read=el=>({rect:el.getBoundingClientRect().toJSON(),style:Object.fromEntries(properties.map(p=>[p,getComputedStyle(el)[p]]))});
          return {bar:read(bar),indicator:read(indicator)};
        })()`);
        // The original reserves a desktop scrollbar gutter. Align each crop
        // around its own bar so viewport centering does not become a color diff.
        const cropWidth = Math.min(width,390), barRect = layouts[variant].bar.rect;
        const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: barRect.x-(cropWidth-barRect.width)/2, y: 728, width: cropWidth, height: 116, scale: 1 } });
        screenshots[variant] = Buffer.from(data,'base64');
        fs.writeFileSync(path.join(artifacts, `navbar-parity-${width}-${pattern?'pattern':'black'}-${variant}.png`), screenshots[variant]);
      }
      const [actual,expected] = await Promise.all([sharp(screenshots.native).removeAlpha().raw().toBuffer(),sharp(screenshots.next).removeAlpha().raw().toBuffer()]);
      assert.equal(actual.length,expected.length);
      let absoluteError=0, changed=0;
      for(let n=0;n<actual.length;n++){const difference=Math.abs(actual[n]-expected[n]);absoluteError+=difference;if(difference>3)changed++;}
      const meanError=absoluteError/actual.length, changedPercent=100*changed/actual.length;
      results.push({width,pattern,meanError,changedPercent,layouts});
      console.log(JSON.stringify({width,pattern,meanError,changedPercent}));
    }
    fs.writeFileSync(path.join(artifacts,'navbar-parity.json'),JSON.stringify(results,null,2));
    assert.deepEqual(errors,[]);
    if (!process.env.NAVBAR_DIAGNOSE) for(const result of results) {
      assert.equal(result.layouts.native.bar.style.overflow,result.layouts.next.bar.style.overflow,'Indicator glow must not be clipped at the glass border');
      assert.equal(result.layouts.native.bar.rect.width,result.layouts.next.bar.rect.width);
      assert.equal(result.layouts.native.bar.rect.height,result.layouts.next.bar.rect.height);
      assert.ok(result.meanError<0.2,`Navbar differs from actual Next output (${result.width}px, pattern=${result.pattern}): mean RGB error ${result.meanError.toFixed(2)}`);
    }
  });
}
main().catch(error=>{console.error(error);process.exitCode=1;});
