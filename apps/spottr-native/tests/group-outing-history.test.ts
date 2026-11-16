import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
const {hooks,modules,find,deferred,settle}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');

function fixture(count=25){
 const h=hooks(),reply=deferred();let loads=0;
 const messages=Array.from({length:count},(_,index)=>({id:'version-'+index,seq:index+1,kind:'outing',outingId:'outing',username:'Author '+index,createdAt:'2026-11-15T21:00:00Z',outingContext:{title:'Our night',outingDate:'2026-11-20',city:index%2?'Cluj-Napoca':'Bucuresti',decisionRound:1,candidateDates:[]}})).reverse();
 const props={planId:'outing',messages,more:false,onMore:()=>{loads++;return reply.promise}};
 const {GroupOutingHistory}=modules({react:h.react,'react-native':{View:'View'},'../outings/OutingPrimitives':{OutingPressable:'OutingPressable'},'../ui/ActionButton':{ActionButton:'ActionButton'},'../ui/Text':{Text:'Text'},'../usePreferences':{usePreferences:()=>({language:'en',copy:(key:string,values?:unknown)=>key+JSON.stringify(values??{})})},'./groupStyles':{groupStyles:{}}}).load(path.resolve(__dirname,'../src/groups/GroupOutingHistory.tsx'));
 const draw=()=>h.render(()=>GroupOutingHistory(props)),by=(tree:any,id:string)=>find(tree,(node:any)=>node.props?.testID===id);
 const rows=(tree:any):any[]=>{const found:any[]=[];const visit=(node:any)=>{if(!node||typeof node!=='object')return;if(node.props?.testID?.startsWith('group-history-entry-'))found.push(node);[node.props?.children].flat(Infinity).forEach(visit)};visit(tree);return found};
 const open=()=>{by(draw(),'group-open-history').props.onPress();return draw()};
 return{h,props,messages,reply,draw,by,rows,open,loads:()=>loads};
}

test('raw history stays in outing detail, collapsed initially and bounded to twenty versions',()=>{
 const f=fixture();assert.equal(f.by(f.draw(),'group-history-entries'),undefined);
 let tree=f.open();assert.equal(f.rows(tree).length,20);assert.equal(f.rows(tree)[0].props.testID,'group-history-entry-version-24');
 assert.equal(f.loads(),0);f.by(tree,'group-history-more').props.onPress();tree=f.draw();assert.equal(f.rows(tree).length,25);assert.equal(f.loads(),0);assert.equal(f.by(tree,'group-history-more'),undefined);
 assert.equal(f.messages.length,25);assert.equal(f.messages[0]!.id,'version-24');f.h.unmount();
});

test('full versions retain original authors and are never combined with another outing',()=>{
 const f=fixture(3);f.props.messages.unshift({...f.messages[0]!,id:'other-outing',outingId:'other'});
 const tree=f.open(),rows=f.rows(tree);assert.equal(rows.length,3);assert.equal(f.by(tree,'group-history-entry-other-outing'),undefined);
 const text=JSON.stringify(rows);assert.match(text,/Author 2/);assert.match(text,/Author 1/);assert.match(text,/updateGeneric/,'A version without a preceding snapshot is still accessible in detail');f.h.unmount();
});

test('loading older group pages is explicit, coalesced, and not invoked by opening history',async()=>{
 const f=fixture(1);f.props.more=true;let tree=f.open();assert.equal(f.loads(),0);
 f.by(tree,'group-history-more').props.onPress();f.by(tree,'group-history-more').props.onPress();assert.equal(f.loads(),1);tree=f.draw();assert.equal(f.by(tree,'group-history-more').props.busy,true);
 f.reply.resolve();await settle();assert.equal(f.by(f.draw(),'group-history-more').props.busy,false);f.h.unmount();
});

test('older-page completion after leaving the detail cannot reopen its history',async()=>{
 const f=fixture(1);f.props.more=true;f.by(f.open(),'group-history-more').props.onPress();f.h.unmount();f.reply.resolve();await settle();assert.equal(f.loads(),1);assert.equal(f.messages.length,1);
});
