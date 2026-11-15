// Focused real RN Web composer sizing regression with isolated API responses.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {withBrowser}=require('./browser-harness.cjs');
const origin=process.env.GROUPS_NATIVE_URL||'http://localhost:8083';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('LOCAL_PREVIEW_REQUIRED');
const source=fs.readFileSync(path.resolve(__dirname,'../../pulse-app/scripts/groups.browser.cjs'),'utf8'),start=source.indexOf('function(){'),end=source.indexOf('}.toString()})()`',start),fixture=source.slice(start,end+1),photo=path.resolve(__dirname,'../public/party-event.webp'),existed=fs.existsSync(photo);
if(start<0||end<start)throw Error('Shared fixture not found');
if(!existed)fs.copyFileSync(path.resolve(__dirname,'../assets/party-event.webp'),photo);
withBrowser(async({call,evaluate,until,input,delay,capture,errors})=>{
 await call('Page.addScriptToEvaluateOnNewDocument',{source:`{
  const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');localStorage.setItem('spottr-native.session.v1',JSON.stringify({version:1,token:'isolated-permanent-groups',user:{id:id(1),username:'Franco QA',email:'group1@example.invalid',role:'user',hasPassword:true,preferredLanguage:'en',createdAt:'2026-01-01T00:00:00Z',avatarUrl:'/party-event.webp'}}));
 } (${fixture})();`});
 await call('Page.navigate',{url:origin+'/groups/00000000-0000-4000-8000-000000000020?case=conversation'});await until('document.querySelector("[data-testid=group-composer]")',40000);
 const bounds=()=>evaluate(`(()=>{const n=id=>document.querySelector('[data-testid="'+id+'"]'),r=id=>n(id)?.getBoundingClientRect(),field=r('group-composer-surface'),plus=r('group-add'),send=r('group-send');return{height:field.height,bottom:field.bottom,plusBottom:plus.bottom,sendBottom:send?.bottom,sendRight:send?.right,fieldRight:field.right,value:n('group-composer').value,overflow:document.documentElement.scrollWidth>innerWidth+1}})()`);
 await input('group-composer','A short draft');await until('document.querySelector("[data-testid=group-composer-surface]").getBoundingClientRect().height<=48');const initial=await bounds();
 await input('group-composer',Array.from({length:30},(_,i)=>'Long draft line '+(i+1)).join('\n'));await until('document.querySelector("[data-testid=group-composer-surface]").getBoundingClientRect().height>=132');const tall=await bounds();assert.ok(tall.height<=222);await capture('groups-native-composer-capped');
 await input('group-composer','Keep my draft');await delay(150);const shrunk=await bounds();console.log('Composer shrink measurements',JSON.stringify({initial,tall:{...tall,valueLength:tall.value.length,value:undefined},shrunk}));assert.equal(shrunk.value,'Keep my draft');await capture('groups-native-composer-after-short-replacement');await until('document.querySelector("[data-testid=group-composer-surface]").getBoundingClientRect().height<=48');
 await input('group-composer','');await until('!document.querySelector("[data-testid=group-send]")');assert.ok((await bounds()).height<=48);assert.deepEqual(errors,[]);console.log('PASS native-web composer: short→capped long→short→empty, stable bottom controls. No native keyboard claim.');
}).catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{if(!existed&&fs.existsSync(photo))fs.unlinkSync(photo)});
