import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../../pulse-app/public/offline-scanner-sw.js',import.meta.url),'utf8');
test('offline preparation and worker agree on the cache version',()=>{
  const name=/const CACHE_NAME = "([^"]+)"/.exec(source)![1];
  const page=fs.readFileSync(new URL('../../pulse-app/src/app/dashboard/ticket-validation/page.tsx',import.meta.url),'utf8');
  assert.ok(page.includes('caches.open("'+name+'")'),'Preparation must await writes to the cache the active worker actually reads');
});
function worker(failRead:boolean,failWrite:boolean){
  const listeners=new Map<string,(event:any)=>void>();let network=0;
  vm.runInNewContext(source,{URL,Response,fetch:async()=>{network++;return new Response('/* decoder */',{status:200});},caches:{match:async()=>{if(failRead)throw Error('storage unavailable');return undefined;},open:async()=>({put:async()=>{if(failWrite)throw Error('quota exceeded');}})},self:{location:{origin:'https://app.example.invalid'},addEventListener:(key:string,listener:any)=>listeners.set(key,listener)}});
  return {listeners,network:()=>network};
}
for(const [read,write] of [[false,true],[true,false],[true,true],[false,false]])test(`offline cache is optional when read=${read}, write=${write}`,async()=>{
  const state=worker(read!,write!);let response:Promise<Response>|undefined;
  state.listeners.get('fetch')!({request:new Request('https://app.example.invalid/_next/static/decoder.js'),respondWith:(value:Promise<Response>)=>{response=value;}});
  assert.ok(response);const result=await response;assert.equal(result.status,200);assert.equal(await result.text(),'/* decoder */');assert.equal(state.network(),1);
});
test('service worker never intercepts API, external, unrelated or mutation requests',()=>{
  const state=worker(false,false);let intercepted=0;
  for(const [url,method]of [['https://app.example.invalid/api/v1/wardrobe/events','GET'],['https://api.example.invalid/_next/x.js','GET'],['https://app.example.invalid/users/me','GET'],['https://app.example.invalid/_next/x.js','POST']])state.listeners.get('fetch')!({request:new Request(url!,{method}),respondWith:()=>intercepted++});
  assert.equal(intercepted,0);assert.equal(state.network(),0);
});
