import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
const {hooks,modules,find,deferred,settle}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');

test('event sharing acknowledgement returns only while its picker remains focused and mounted',async()=>{
 for(const lifecycle of ['active','blurred','unmounted']){
  const h=hooks(),reply=deferred(),writes:any[]=[],navigated:any[]=[];let focused=true;
  const model={groups:[{id:'group',status:'accepted',outings:[]}],events:[{id:'event'}],store:{send:(...args:any[])=>{writes.push(args);return reply.promise},getSnapshot:()=>({error:null})}},symbols=(...names:string[])=>Object.fromEntries(names.map(name=>[name,name]));
  const {GroupEventPickerScreen}=modules({react:h.react,'react-native':symbols('View'),'@react-navigation/native':{CommonActions:{},useIsFocused:()=>focused,useNavigation:()=>({canGoBack:()=>true,goBack:()=>navigated.push('back'),navigate:(...args:any[])=>navigated.push(args)})},'./GroupPage':{...symbols('GroupAccess','GroupPage'),g:{}},'./GroupEventChooser':symbols('EventChooser'),'./GroupNightSheet':symbols('GroupNightSheet'),'./GroupNightForm':symbols('GroupNightForm'),'./useGroups':{useGroups:()=>model},'../usePreferences':{usePreferences:()=>({copy:(key:string)=>key})},'../ui/ActionButton':symbols('ActionButton'),'../ui/common':symbols('Feedback','Loading'),'../ui/KeyboardForms':symbols('FormScrollView'),'../ui/Text':symbols('Text')}).load(path.resolve(__dirname,'../src/groups/GroupEventPickerScreen.tsx'));
  const draw=()=>h.render(()=>GroupEventPickerScreen({groupId:'group'}));const tree=draw();find(tree,(n:any)=>n.type==='EventChooser').props.onSelect('event');assert.equal(writes.length,1);assert.deepEqual(navigated,[]);if(lifecycle==='unmounted')h.unmount();else if(lifecycle==='blurred'){focused=false;draw()}reply.resolve(true);await settle();assert.deepEqual(navigated,lifecycle==='active'?['back']:[]);h.unmount();
 }
});
