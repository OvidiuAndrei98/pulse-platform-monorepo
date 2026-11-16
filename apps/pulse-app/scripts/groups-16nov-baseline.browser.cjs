// Before-state screenshots; synthetic UI data, not evidence of API integration.
const fs=require('node:fs'),path=require('node:path');
const {withBrowser}=require('../../spottr-native/tests/browser-harness.cjs');
const source=fs.readFileSync(path.join(__dirname,'groups.browser.cjs'),'utf8');
const fixture=source.slice(source.indexOf('function(){'),source.indexOf('}.toString()})()`')+1);
const previous=fs.readFileSync(path.join(__dirname,'groups-single-flow.browser.cjs'),'utf8');
const refs=previous.slice(previous.indexOf('function references(){'),previous.indexOf('\nwithBrowser('));
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
withBrowser(async({call,until,click,capture,delay})=>{
 await call('Page.addScriptToEvaluateOnNewDocument',{source:'('+fixture+')();'+refs+';references();'});
 await call('Page.navigate',{url:'http://localhost:8084/groups/'+id(20)+'?case=conversation'});
 await until('document.querySelector("[data-testid=group-message-response-yes]")',45000);
 if(!fs.existsSync(path.join(__dirname,'../../spottr-native/artifacts/groups-16nov-next-before-chat.png')))await capture('groups-16nov-next-before-chat');
 await call('Page.navigate',{url:'http://localhost:8084/groups/'+id(20)+'/outings/'+id(30)+'?case=proposals-owner'});
 await until('document.querySelector("[data-testid=group-buy]")',45000);
 await click('group-buy');await until('document.querySelector("[data-testid=outing-recipients-continue]")');await delay(150);
 await capture('groups-16nov-next-before-tickets');console.log('Captured synthetic before states.');
}).catch(error=>{console.error(error);process.exitCode=1});
