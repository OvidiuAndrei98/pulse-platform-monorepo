import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as geometry from '@packages/app-core/maps/geometry';

// Run the actual component's effects and native callbacks. The bridge can throw
// before it returns a promise, just like MapLibre's findNodeHandle(ref).
function mount(project: (coordinate: number[]) => Promise<number[]>) {
  const slots: any[] = [], effects: (() => void)[] = [], points: any[] = [];
  let cursor = 0, tree: any;
  const native = { project }, camera = { easeTo() {}, flyTo() {} };
  const props: any = { events: [{id:'a',latitude:44,longitude:26}, {id:'b',latitude:45,longitude:27}],
    center:{latitude:44,longitude:26}, zoom:18, location:null, selected:'a',
    onSelect() {}, onViewport() {}, onSelectedPoint:(point: any)=>points.push(point) };
  function hookMemo(factory:()=>unknown, deps: unknown[]) {
    const i=cursor++, old=slots[i];
    if(!old||deps.some((value,n)=>!Object.is(value,old.deps[n]))) slots[i]={value:factory(),deps};
    return slots[i].value;
  }
  const deps: Record<string, any> = {
    react:{...React,
      useRef:(value:unknown)=>slots[cursor++]??={current:value},
      useMemo:hookMemo,
      useState:(value:any)=>{const i=cursor++;slots[i]??={value};return[slots[i].value,(next:any)=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;}];},
      useEffect:(effect:()=>unknown, deps:unknown[])=>{
        const i=cursor++, old=slots[i];
        if(!old||deps.some((value,n)=>!Object.is(value,old.deps[n]))) effects.push(()=>{
          old?.cleanup?.();slots[i]={deps,cleanup:effect()};
        });
      },
    },
    'react-native':{AccessibilityInfo:{isReduceMotionEnabled:async()=>false,addEventListener:()=>({remove(){}})},StyleSheet:{absoluteFill:{},create:(v:any)=>v},View:'View'},
    '@maplibre/maplibre-react-native':{Map:'Map',Camera:'Camera',Marker:'Marker'},
    'lucide-react-native':{MapPin:'MapPin'},
    '@packages/app-core/events/map/openFreeMapDark.json':{},
    '@packages/app-core/maps/geometry':geometry,
    '../usePreferences':{usePreferences:()=>({copy:(key:string)=>key})},
    '../ui/Text':{Text:'Text'},'../ui/common':{Feedback:'Feedback'},'../ui/theme':{colors:{}},
    '../data/events':{isLive:()=>false},
  };
  const module={exports:{} as any};
  const code=transformSync(readFileSync(new URL('../src/map/EventMapNative.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'transform'}).code;
  runInNewContext(code,{module,exports:module.exports,require:(id:string)=>{assert.ok(id in deps,id);return deps[id];}});
  function elements(node:any):any[]{return Array.isArray(node)?node.flatMap(elements):React.isValidElement(node)?[node,...elements((node.props as any).children)]:[];}
  const render=(patch={})=>{
    Object.assign(props,patch);cursor=0;tree=module.exports.EventMapNative(props);
    for(const element of elements(tree))if(element.type==='Map'||element.type==='Camera')element.props.ref.current=element.type==='Map'?native:camera;
    while(effects.length)effects.shift()!();
  };
  const map=()=>elements(tree).find(el=>el.type==='Map').props;
  const load=()=>{map().onDidFinishLoadingMap();render();};
  const retry=()=>{elements(tree).find(el=>el.type==='Feedback').props.retry();render();};
  const unmount=()=>{for(const slot of slots)if(typeof slot?.cleanup==='function')slot.cleanup();};
  render();
  return{render,map,load,retry,unmount,points};
}
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
const latest=(points:any[])=>JSON.parse(JSON.stringify(points.at(-1)));

test('native map waits for load and catches a synchronous missing-handle exception', async()=>{
  let calls=0, unavailable=true;
  const ui=mount(()=>{calls++;if(unavailable)throw Error('NativeComponent ref is null, wait for the map being initialized');return Promise.resolve([10,20]);});
  assert.equal(calls,0,'Mount and selection do not project before the native map is ready');
  ui.map().onRegionIsChanging();await flush();assert.equal(calls,0);
  assert.doesNotThrow(ui.load);await flush();assert.ok(calls>0);assert.equal(latest(ui.points),null);
  unavailable=false;ui.map().onRegionIsChanging();await flush();
  assert.deepEqual(latest(ui.points),{x:10,y:20},'Projection recovers when the native handle becomes available');
  ui.unmount();
});

test('native map handles rejected projection and non-finite pixel coordinates', async()=>{
  let result=0;
  const ui=mount(()=>result===0?Promise.reject(Error('bridge unavailable')):Promise.resolve(result===1?[NaN,Infinity]:[7,9]));
  ui.load();await flush();assert.equal(latest(ui.points),null);
  result=1;ui.map().onRegionIsChanging();await flush();assert.equal(latest(ui.points),null);
  result=2;ui.map().onRegionIsChanging();await flush();assert.deepEqual(latest(ui.points),{x:7,y:9});
  ui.unmount();
});

test('a newer selection, deselection and unmount invalidate pending native projections', async()=>{
  const pending:((point:number[])=>void)[]=[];
  const ui=mount(()=>new Promise(resolve=>pending.push(resolve)));
  ui.load();const old=pending.splice(0);
  ui.render({selected:'b'});pending.pop()!([30,40]);await flush();
  for(const resolve of old)resolve([1,2]);await flush();
  assert.deepEqual(latest(ui.points),{x:30,y:40},'A stale selection cannot move the current card');
  ui.map().onRegionIsChanging();const beforeClear=pending.pop()!;
  ui.render({selected:null});beforeClear([3,4]);await flush();assert.equal(latest(ui.points),null);
  ui.render({selected:'a'});const afterUnmount=pending.pop()!;
  ui.unmount();const count=ui.points.length;afterUnmount([5,6]);await flush();assert.equal(ui.points.length,count);
});

test('map failure and retry ignore callbacks and results from the replaced native map', async()=>{
  const pending:((point:number[])=>void)[]=[];
  const ui=mount(()=>new Promise(resolve=>pending.push(resolve)));
  ui.load();const old=ui.map(),oldResults=pending.splice(0);
  old.onDidFailLoadingMap();ui.render();ui.retry();
  old.onDidFinishLoadingMap();old.onRegionIsChanging();
  assert.equal(pending.length,0,'A retired load event cannot mark the new map ready');
  for(const resolve of oldResults)resolve([1,2]);await flush();assert.equal(latest(ui.points),null);
  ui.load();pending.at(-1)!([50,60]);await flush();assert.deepEqual(latest(ui.points),{x:50,y:60});
  ui.unmount();
});
