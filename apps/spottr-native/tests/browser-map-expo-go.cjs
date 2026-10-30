const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { withBrowser } = require('./browser-harness.cjs');
const documentPath = path.resolve(__dirname, '../dist/__qa-map-expo-go.html');
fs.mkdirSync(path.dirname(documentPath), { recursive: true });
fs.copyFileSync(path.resolve(__dirname, '../src/map/webview/event-map.html'), documentPath);

withBrowser(async ({ base, call, evaluate, until, capture, delay, errors }) => {
  await call('Network.enable'); await call('Log.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__qa = { messages: [], state: null };
    window.ReactNativeWebView = { postMessage(raw) {
      const message = JSON.parse(raw); window.__qa.messages.push(message);
      if (message.type === 'viewport' && window.__qa.state) {
        Object.assign(window.__qa.state, {center:message.center,zoom:message.zoom});
        window.postMessage(JSON.stringify(window.__qa.state), '*');
      }
    }};
  ` });
  await call('Page.navigate', { url: base + '/__qa-map-expo-go.html' });
  await until(`window.__qa.messages.some(message => message.type === 'ready')`);
  const maliciousTitle = '</script><img src=x onerror="window.__injected=true">';
  const state = { events: [
    { id: 'one', title: 'Map event one', latitude: 44.4323, longitude: 26.1063, live: true },
    { id: 'two', title: maliciousTitle, latitude: 44.4323, longitude: 26.1063, live: false },
    { id: 'three', title: 'Map event three', latitude: 44.4723, longitude: 26.1663, live: false },
  ], center: { latitude: 44.4323, longitude: 26.1063 }, zoom: 13,
    selected: null, location: null, focus: null, attributionBottom: 240, reducedMotion: false,
    label: 'Events map', clusterLabel: '{count} events' };
  await evaluate(`window.__qa.state=${JSON.stringify(state)};window.postMessage(JSON.stringify(window.__qa.state),'*')`);
  await until(`document.querySelector('.spottr-map-cluster')?.textContent==='2'`);
  await until(`document.querySelector('.maplibregl-ctrl-attrib')?.textContent.includes('OpenFreeMap')`, 30000);
  await until(`window.__qa.messages.some(message=>message.type==='error'&&message.failed===false)`, 45000);
  assert.equal(await evaluate(`document.querySelector('.maplibregl-ctrl-bottom-right').style.bottom`), '240px');
  await evaluate(`document.querySelector('.spottr-map-cluster').click()`);
  await until(`document.querySelectorAll('.spottr-map-pin').length===3&&Number(document.getElementById('map').dataset.zoom)>=18`);
  assert.equal(await evaluate(`document.querySelector('[data-testid="map-pin-two"]').title`), maliciousTitle);
  assert.equal(await evaluate(`!!window.__injected`), false);
  await evaluate(`window.__qa.messages=[];document.querySelector('[data-testid="map-pin-two"]').click()`);
  assert.deepEqual(await evaluate(`window.__qa.messages.filter(message=>message.type==='select')`), [{ type: 'select', id: 'two' }]);
  await evaluate(`window.__qa.state.selected='two';window.postMessage(JSON.stringify(window.__qa.state),'*')`);
  await until(`document.querySelector('[data-testid="map-pin-two"]').dataset.selected==='true'`);
  assert.equal(await evaluate(`window.__qa.messages.some(message=>message.type==='point'&&message.point&&Number.isFinite(message.point.x)&&Number.isFinite(message.point.y))`), true);
  await evaluate(`window.__qa.state.focus={id:'three',revision:1};window.__qa.state.selected='three';window.postMessage(JSON.stringify(window.__qa.state),'*')`);
  await until(`Math.abs(Number(document.getElementById('map').dataset.latitude)-44.4723)<.001&&Number(document.getElementById('map').dataset.pitch)>=49`);
  await delay(2000);
  await capture('map-expo-go-focus');
  await evaluate(`Object.assign(window.__qa.state,{center:{latitude:44.4323,longitude:26.1063},zoom:14,location:{latitude:44.4323,longitude:26.1063}});window.postMessage(JSON.stringify(window.__qa.state),'*')`);
  await until(`document.querySelector('.spottr-map-location')&&Math.abs(Number(document.getElementById('map').dataset.zoom)-14)<.01`);
  await evaluate(`window.__qa.state.events=window.__qa.state.events.filter(event=>event.id!=='two');window.__qa.state.location=null;window.__qa.state.reducedMotion=true;window.__qa.state.focus={id:'one',revision:2};window.postMessage(JSON.stringify(window.__qa.state),'*')`);
  await until(`document.querySelector('[data-testid="map-pin-one"]')&&!document.querySelector('[data-testid="map-pin-two"]')&&!document.querySelector('.spottr-map-location')&&Number(document.getElementById('map').dataset.zoom)>=18`);
  assert.equal(await evaluate(`document.querySelectorAll('.maplibregl-canvas').length`), 1);
  assert.deepEqual(errors, []);
  console.log('PASS Expo Go document: local worker, WebGL, clusters, safe labels, selection bridge, focus, zoom/location, attribution and reduced motion');
}).catch(error => { console.error(error); process.exitCode = 1; });
