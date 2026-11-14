const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSync } = require('esbuild');
const { withBrowser } = require('./browser-harness.cjs');

// Exercise the real scene owner with React's reconciler and RN Web FlatList.
// The map probe counts the native map/location initialization that a remount
// would repeat; platform-specific native projection is tested separately.
const app = path.resolve(__dirname, '..'), dist = path.join(app, 'dist');
fs.mkdirSync(dist, { recursive: true });
buildSync({ absWorkingDir: app, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic',
  alias: { 'react-native': 'react-native-web' }, define: { 'process.env.NODE_ENV': '"production"' },
  outfile: path.join(dist, 'qa-discovery-lifecycle.js'),
  stdin: { resolveDir: app, loader: 'tsx', contents: `
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FlatList, Platform, View } from 'react-native';
import { DiscoveryScenes } from './src/screens/DiscoveryScenes';
const qa = window.__lifecycle = { listMounts:0, listUnmounts:0, mapMounts:0, mapUnmounts:0, locationReads:0 };
const rows=Array.from({length:80},(_,id)=>({id:String(id)}));
function ListProbe({revision}) {
  const [saved,setSaved]=useState(false);
  useEffect(()=>{qa.listMounts++;return()=>{qa.listUnmounts++;};},[]);
  return <FlatList testID="probe-list" style={{flex:1}} data={rows} keyExtractor={row=>row.id}
    ListHeaderComponent={<button data-testid="list-state" onClick={()=>setSaved(v=>!v)}>{String(saved)} / {revision}</button>}
    renderItem={({item})=><View style={{height:60}}><button>{item.id}</button></View>}/>;
}
function MapProbe({revision}) {
  window.__mapRenders=(window.__mapRenders||0)+1;
  const [zoom,setZoom]=useState(12),[selected,setSelected]=useState('a'),[collapsed,setCollapsed]=useState(false);
  useEffect(()=>{qa.mapMounts++;qa.locationReads++;return()=>{qa.mapUnmounts++;};},[]);
  return <View testID="probe-map" style={{flex:1}}><canvas data-testid="probe-map-canvas"/>
    <button data-testid="zoom" onClick={()=>setZoom(v=>v+1)}>{zoom}</button>
    <button data-testid="select" onClick={()=>setSelected('b')}>{selected}</button>
    <button data-testid="collapse" onClick={()=>setCollapsed(v=>!v)}>{String(collapsed)}</button>
    <span data-testid="map-revision">{revision}</span>
  </View>;
}
function App() {
  const [view,setView]=useState('list'),[revision,setRevision]=useState(0);
  window.__setPlatform=value=>Object.defineProperty(Platform,'OS',{value,configurable:true});
  return <><nav><button data-testid="list" onClick={()=>setView('list')}>List</button><button data-testid="map" onClick={()=>setView('map')}>Map</button><button data-testid="update" onClick={()=>setRevision(v=>v+1)}>New filter data</button></nav>
    <View style={{height:600,width:360}}><DiscoveryScenes view={view} list={<ListProbe revision={revision}/>} map={<MapProbe revision={revision}/>}/></View></>;
}
createRoot(document.getElementById('root')).render(<App/>);
` } });
fs.writeFileSync(path.join(dist, 'qa-discovery-lifecycle.html'), '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/qa-discovery-lifecycle.js"></script>');

withBrowser(async ({ base, call, evaluate, until, click, errors }) => {
  await call('Page.navigate', { url: base + '/qa-discovery-lifecycle.html' });
  await until('window.__lifecycle?.listMounts===1');
  assert.equal(await evaluate('window.__lifecycle.mapMounts'), 0, 'The native map is lazy until first requested');
  await click('list-state');
  await evaluate(`window.__listNode=document.querySelector('[data-testid="probe-list"]');window.__listNode.scrollTop=530;`);
  await until('window.__listNode.scrollTop>300');
  const offset = await evaluate('window.__listNode.scrollTop');
  await click('map'); await until('window.__lifecycle.mapMounts===1');
  await click('zoom'); await click('select'); await click('collapse');
  await evaluate(`window.__mapNode=document.querySelector('[data-testid="probe-map"]');window.__canvasNode=document.querySelector('[data-testid="probe-map-canvas"]');true;`);
  const mapSize = await evaluate(`(()=>{const r=window.__mapNode.getBoundingClientRect();return {width:r.width,height:r.height};})()`);
  assert.equal(await evaluate(`document.querySelector('[data-testid="discovery-list-scene"]').inert`), true, 'Hidden web rows cannot receive keyboard focus');
  await click('list');
  assert.equal(await evaluate(`document.querySelector('[data-testid="probe-list"]')===window.__listNode`), true);
  assert.equal(await evaluate('window.__listNode.scrollTop'), offset, 'FlatList scroll offset survives returning from map');
  assert.match(await evaluate(`document.querySelector('[data-testid="list-state"]').textContent`), /^true/);
  assert.deepEqual(await evaluate(`(()=>{const r=window.__mapNode.getBoundingClientRect();return {width:r.width,height:r.height};})()`), mapSize, 'The parked native surface retains nonzero geometry');
  assert.equal(await evaluate(`document.querySelector('[data-testid="discovery-map-scene"]').inert`), true);
  const hiddenRenders=await evaluate('window.__mapRenders');
  await click('update');
  assert.equal(await evaluate('window.__mapRenders'),hiddenRenders,'Filter edits do not rebuild the hidden native marker tree');
  for (const os of ['web','ios','android']) {
    await evaluate(`window.__setPlatform(${JSON.stringify(os)})`);
    for (let n=0;n<8;n++) { await click('map'); await click('list'); }
  }
  await click('map');
  assert.equal(await evaluate(`document.querySelector('[data-testid="probe-map"]')===window.__mapNode&&document.querySelector('[data-testid="probe-map-canvas"]')===window.__canvasNode`), true);
  assert.equal(await evaluate(`document.querySelector('[data-testid="zoom"]').textContent`), '13');
  assert.equal(await evaluate(`document.querySelector('[data-testid="select"]').textContent`), 'b');
  assert.equal(await evaluate(`document.querySelector('[data-testid="collapse"]').textContent`), 'true');
  assert.equal(await evaluate(`document.querySelector('[data-testid="map-revision"]').textContent`), '1', 'A retained map still receives updated filter data');
  assert.deepEqual(await evaluate('window.__lifecycle'), {listMounts:1,listUnmounts:0,mapMounts:1,mapUnmounts:0,locationReads:1});
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-testid="discovery-list-scene"]')).opacity`), '1', 'Parking never tears down native glass with an alpha change');
  assert.deepEqual(errors, []);
  console.log('PASS retained Discovery scenes: lazy map, 25+ switches, FlatList offset, camera/selection/tray, filter updates and one location initialization');
}).catch(error => { console.error(error); process.exitCode=1; });
