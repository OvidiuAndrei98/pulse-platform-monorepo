import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {groupUpdateSummary} from '../../../packages/app-core/src/social/groupPresentation';
import {translate} from '../../../packages/app-core/src/i18n/translate';
import type {GroupMessage} from '../../../packages/app-core/src/social/groups';
const {hooks,modules,find}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');

const context={decisionRound:1,title:'Friday friends',city:'București',outingDate:'2026-11-20',candidateDates:[] as string[]};
const message=(seq:number,changes:Partial<typeof context>={},extra:Partial<GroupMessage>={}):GroupMessage=>({
 id:'version-'+seq,requestId:'operation-'+seq,seq,senderId:'member-'+seq,username:seq===1?'Ana':'Radu',
 kind:'outing',content:'',outingId:'outing',createdAt:'2026-11-16T12:00:00Z',outingContext:{...context,...changes},...extra,
});
function fixture(language:'en'|'ro'='en'){
 const h=hooks(),copy=(key:string,values?:Record<string,string|number>)=>translate(language,key,values);
 const {GroupHistoryUpdates}=modules({react:h.react,'react-native':{View:'View'},
  '@packages/app-core/social/groupPresentation':{groupUpdateSummary},'../ui/Text':{Text:'Text'},
  '../usePreferences':{usePreferences:()=>({language,copy})},'./groupStyles':{groupStyles:{caption:{fontSize:12,lineHeight:18}}},
 }).load(path.resolve(__dirname,'../src/groups/GroupHistoryUpdates.tsx'));
 const render=(messages:GroupMessage[],allMessages=messages)=>h.render(()=>GroupHistoryUpdates({messages,allMessages}));
 const texts=(tree:any)=>Array.from(tree?.props.children??[],(node:any)=>node.props.children);
 return{h,render,texts};
}

test('chat uses the original author and proven change, without a history button or secondary sheet',()=>{
 const f=fixture(),previous=message(1),changed=message(2,{outingDate:'2026-11-21',decisionRound:2});
 const tree=f.render([changed],[changed,previous]);
 assert.deepEqual(f.texts(tree),['Radu changed the outing date.']);
 assert.equal(find(tree,(node:any)=>node.type==='GroupActionSheet'||typeof node.props?.onPress==='function'),undefined);
 assert.equal(find(tree,(node:any)=>node.props?.testID==='group-system-update-version-2')?.type,'Text');
 f.h.unmount();
});

test('missing history, unknown sequence gaps and a different outing cannot invent a visible update',()=>{
 const f=fixture(),changed=message(5,{city:'Cluj-Napoca'});
 for(const history of [[],[message(3)],[message(4,{}, {outingId:'another-outing'})],[message(4,{}, {kind:'text'})]]){
  assert.equal(f.render([changed],[changed,...history]),null);
 }
 f.h.unmount();
});

test('unchanged snapshots, normalized city spellings and anonymous authors do not clutter chat',()=>{
 const f=fixture('ro'),previous=message(1),unchanged=message(2),normalized=message(2,{city:'Bucuresti'});
 assert.equal(f.render([unchanged],[unchanged,previous]),null);
 assert.equal(f.render([normalized],[normalized,previous]),null);
 assert.equal(f.render([message(2,{city:'Cluj-Napoca'},{username:''})],[message(2,{city:'Cluj-Napoca'},{username:''}),previous]),null);
 f.h.unmount();
});

test('several stored changes keep each original actor and do not mutate the raw audit trail',()=>{
 const f=fixture('ro'),previous=message(1),date=message(2,{outingDate:'2026-11-21',decisionRound:2}),
  city=message(3,{outingDate:'2026-11-21',city:'Cluj-Napoca',decisionRound:2},{username:'Ioana'}),
  raw=[city,date,previous],saved=JSON.stringify(raw);
 const tree=f.render([city,date],raw),texts=f.texts(tree);
 assert.deepEqual(texts,['Radu a modificat data ieșirii.','Ioana a modificat orașul ieșirii.'],'The cluster is chronological despite the inverted parent list');
 assert.equal(JSON.stringify(raw),saved,'Rendering leaves the backend snapshots and provenance untouched');
 assert.equal(texts.some((text:string)=>/version|versiun|istoric/i.test(text)),false);
 f.h.unmount();
});

test('empty update clusters render nothing',()=>{const f=fixture();assert.equal(f.render([]),null);f.h.unmount()});
