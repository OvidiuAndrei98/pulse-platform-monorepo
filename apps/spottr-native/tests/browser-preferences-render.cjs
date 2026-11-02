const assert = require('node:assert/strict');
const path = require('node:path');
const { build } = require('../../../node_modules/.pnpm/node_modules/esbuild');
const { withBrowser } = require('./browser-harness.cjs');

// Use the real provider/hooks and React's context propagation. The fixture only
// replaces account/network/storage effects; it never contacts a real account.
async function bundle() {
  const mocks = {
    './ui/haptics': 'export const haptic=()=>{};',
    '@react-native-async-storage/async-storage': 'export default {getItem:async()=>null,setItem:async()=>{}};',
    '@tanstack/react-query': `import {useSyncExternalStore} from 'react'; export function useQuery(){return useSyncExternalStore(window.fixture.subscribe,()=>window.fixture.query);}`,
    './auth/AuthProvider': `import {useSyncExternalStore} from 'react'; export function useAuth(){return useSyncExternalStore(window.fixture.subscribe,()=>window.fixture.auth);} export const accountApi=async()=>[];`,
    './data/queries': 'export const queryClient={};',
    './ui/ToastProvider': 'const value={show:()=>{},clear:()=>{}};export const useToast=()=>value;',
    './i18n': 'export const translate=(language,key)=>language+":"+key;',
    './copy': 'export const productCopy=(language,key)=>language+":"+key;',
  };
  return (await build({
    stdin: { resolveDir: path.resolve(__dirname, '..'), loader: 'tsx', contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {PreferencesProvider} from './src/PreferencesProvider';
      import {usePreferences} from './src/usePreferences';
      const listeners=new Set<()=>void>();
      const controller={getToken:()=>null};
      const fixture=window.fixture={
        auth:{user:{id:'fixture',preferredLanguage:'en'},controller},
        query:{data:[],isPending:false,isError:false,refetch:()=>{}},
        renders:{copy:0,saved:0},
        subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn)},
        publish:()=>listeners.forEach(fn=>fn()),
      };
      function CopyPage(){const prefs=usePreferences('copy');fixture.renders.copy++;fixture.setLanguage=prefs.setLanguage;return <span id="copy">{prefs.copy('home')}</span>}
      function Favorites(){const prefs=usePreferences();fixture.renders.saved++;fixture.ready=prefs.ready;return <span id="saved">{prefs.saved.length}</span>}
      createRoot(document.body.appendChild(document.createElement('div'))).render(<PreferencesProvider><CopyPage/><Favorites/></PreferencesProvider>);
    ` },
    bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'isolated-preference-effects', setup(b) {
      b.onResolve({ filter: /.*/ }, args => path.basename(args.importer) === 'PreferencesProvider.tsx' && mocks[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], resolveDir: path.resolve(__dirname, '..'), loader: 'js' }));
    } }],
  })).outputFiles[0].text;
}

bundle().then(source => withBrowser(async ({ evaluate, until, errors }) => {
  await evaluate(source);
  await until('window.fixture?.ready');
  const initial = await evaluate('({...fixture.renders})');
  await evaluate(`fixture.query={...fixture.query,data:[{id:'event'}]};fixture.publish();`);
  await until(`document.getElementById('saved').textContent==='1'`);
  assert.equal(await evaluate('fixture.renders.copy'), initial.copy, 'Favorites loading does not rerender copy-only pages');
  assert.ok(await evaluate('fixture.renders.saved') > initial.saved, 'Favorite controls still update');
  await evaluate(`fixture.setLanguage('ro')`);
  await until(`document.getElementById('copy').textContent==='ro:home'`);
  const translated = await evaluate('fixture.renders.copy');
  await evaluate(`fixture.auth={...fixture.auth,user:null};fixture.publish()`);
  await until(`document.getElementById('saved').textContent==='0'`);
  assert.equal(await evaluate('fixture.renders.copy'), translated, 'Logout clears saved data without broadcasting unrelated text changes');
  assert.deepEqual(errors, []);
  console.log('PASS: favorite updates, language changes and logout stay isolated with real React context rendering.');
})).catch(error => { console.error(error); process.exitCode = 1; });
