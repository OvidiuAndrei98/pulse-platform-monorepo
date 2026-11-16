import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {colors,tokens} from '../src/ui/theme';
const {find,hooks,modules,deferred,settle}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');
const id=(value:number)=>'00000000-0000-4000-8000-'+String(value).padStart(12,'0');

// Exercise the real reference component and shared association rules. The
// child poll/material renderers are stubs; this is not a UIKit visual test.
function fixture(){
 const h=hooks(),event={id:id(10),title:'Reference night',city:'București',location:'Venue',startTime:'2099-11-20T20:00:00Z',endTime:'2099-11-21T04:00:00Z',status:'published',imageUrl:'https://example.invalid/poster.webp'};
 const actor=id(2),plan:any={id:id(30),groupId:id(20),title:'Our night',ownerId:id(1),city:event.city,outingDate:'2099-11-20',candidateDates:[],lifecycle:'choosing_event',expiresAt:'2099-11-22T20:00:00Z',decisionRound:1,revision:1,members:[{userId:id(1),status:'accepted',attendance:'unanswered'},{userId:actor,status:'accepted',attendance:'unanswered'}],options:[{eventId:event.id,title:event.title,startTime:event.startTime,endTime:event.endTime,city:event.city,imageUrl:event.imageUrl,location:event.location,available:true,reactions:[]}]};
 const group:any={id:id(20),ownerId:id(1),status:'accepted',members:plan.members,outings:[plan]};
 const message:any={id:id(109),seq:1,senderId:id(1),username:'Original author',kind:'event',createdAt:'2026-11-15T21:00:00Z',content:'',event};
 const writes:any[]=[],loads:any[]=[],navigation:any[]=[];
 let createResult:any=plan;
 const store:any={createOuting:async(...args:any[])=>{writes.push(['create',...args]);return createResult},planAction:async(...args:any[])=>{writes.push(['action',...args]);return plan},loadPlan:async(...args:any[])=>{loads.push(args);return null},getSnapshot:()=>({error:null})};
 const mocks={react:h.react,'react-native':{View:'View',Platform:{OS:'web'},StyleSheet:{create:(value:any)=>value}},'lucide-react-native':{ChevronRight:'ChevronRight'},'../usePreferences':{usePreferences:()=>({copy:(key:string)=>key})},'../ui/Text':{Text:'Text'},'../ui/theme':{colors,tokens},'../outings/OutingPrimitives':{OutingPressable:'OutingPressable'},'./GroupContent':{EventPreview:'EventPreview'},'./GroupOutingCard':{AttendanceResponse:'AttendanceResponse',EventPreference:'EventPreference'}};
 const component=modules(mocks).load(path.resolve(__dirname,'../src/groups/GroupEventReference.tsx')).GroupEventReference;
 let props:any={message,group,actor,busy:false,store,onEvent:(value:string)=>navigation.push(['event',value]),onOuting:(value:string)=>navigation.push(['outing',value])};
 const render=(changes:any={})=>{props={...props,...changes};return h.render(()=>component(props))};
 const bind=(changes:any={})=>{Object.assign(message,{outingId:plan.id,referenceMessageId:message.id},changes)};
 return {h,event,actor,plan,group,message,writes,loads,navigation,store,render,bind,setCreateResult:(value:any)=>{createResult=value}};
}

test('a raw share stays independent even if another outing already contains the same event',async()=>{
 const f=fixture(),tree=f.render(),preview=find(tree,(n:any)=>n.type==='EventPreview');
 assert.equal(tree.props.dataSet.referenceState,'shared');assert.equal(preview.props.variant,'media');
 assert.ok(find(tree,(n:any)=>n.props?.testID==='group-create-outing'));
 assert.equal(f.writes.length,0);assert.equal(f.loads.length,0);
 preview.props.onPress();assert.deepEqual(f.navigation,[['event',f.event.id]]);
});

test('proposing passes the source message and performs no automatic navigation or attendance',async()=>{
 const f=fixture(),pending=deferred();f.setCreateResult(pending.promise);
 const action=find(f.render(),(n:any)=>n.props?.testID==='group-create-outing');
 action.props.onPress();action.props.onPress();
 assert.equal(f.writes.length,1,'Rapid repeated taps do not create duplicate attempts');
 assert.equal(f.writes[0][2].eventId,f.event.id);assert.equal(f.writes[0][2].sourceMessageId,f.message.id);
 assert.equal(f.navigation.length,0);
 pending.resolve(f.plan);await settle();
 assert.equal(f.writes.length,1);assert.equal(f.navigation.length,0);
 assert.equal(f.plan.members.every((member:any)=>member.attendance==='unanswered'),true);
});

test('source binding selects exactly the stated outing when the same event occurs in multiple outings',async()=>{
 const f=fixture(),other={...f.plan,id:id(31),decisionRound:7,chosenEventId:f.event.id,lifecycle:'chosen'};
 f.group.outings=[f.plan,other];f.bind({outingId:other.id});
 const tree=f.render(),response=find(tree,(n:any)=>n.type==='AttendanceResponse');
 assert.ok(response);assert.equal(response.props.plan.id,other.id);assert.equal(response.props.plan.decisionRound,7);
 assert.equal(tree.props.dataSet.referenceState,'chosen');
 find(tree,(n:any)=>n.type==='EventPreview').props.onPress();assert.deepEqual(f.navigation,[['outing',other.id]]);
 await response.props.onRespond('yes');
 assert.equal(f.writes[0][2],other.id);assert.equal(f.writes[0][4].decisionRound,7);
 assert.equal(f.writes[0][4].answer,'yes');
});

test('canonical reference changes in place from comparison to attendance without modifying its source metadata',async()=>{
 const f=fixture();f.bind();
 const original={id:f.message.id,senderId:f.message.senderId,createdAt:f.message.createdAt};
 let tree=f.render(),preference=find(tree,(n:any)=>n.type==='EventPreference');
 assert.ok(preference);assert.equal(tree.props.dataSet.referenceState,'comparing');
 await preference.props.onToggle(true);
 assert.equal(f.writes[0][3],'vote');assert.equal(f.writes[0][4].eventId,f.event.id);
 f.plan.chosenEventId=f.event.id;f.plan.lifecycle='chosen';f.plan.decisionRound=2;
 tree=f.render();assert.ok(find(tree,(n:any)=>n.type==='AttendanceResponse'));assert.equal(find(tree,(n:any)=>n.type==='EventPreference'),undefined);
 assert.deepEqual({id:f.message.id,senderId:f.message.senderId,createdAt:f.message.createdAt},original);
 assert.equal(tree.props.testID,'group-event-reference-'+original.id);
 assert.equal(f.writes.length,1,'Rendering the new decision must not synthesize attendance');
});

test('noncanonical updates, invalid destinations and closed outings never show a full interactive reference',()=>{
 for(const variant of ['update','unavailable','cancelled','completed','alternative']){
  const f=fixture();f.bind();
  if(variant==='update')f.message.referenceMessageId=id(108);
  if(variant==='unavailable')f.plan.options[0].available=false;
  if(['cancelled','completed'].includes(variant))f.plan.lifecycle=variant;
  if(variant==='alternative')f.plan.chosenEventId=id(11);
  const tree=f.render();assert.equal(find(tree,(n:any)=>n.type==='EventPreview').props.variant,'message',variant);
  assert.equal(find(tree,(n:any)=>['AttendanceResponse','EventPreference'].includes(n.type)),undefined,variant);
  assert.equal(f.writes.length,0);
 }
});

test('an older explicit reference hydrates its own missing outing instead of borrowing another matching event',()=>{
 const f=fixture();f.bind({outingId:id(77)});
 const tree=f.render();
 assert.equal(tree.props.dataSet.referenceState,'loading');assert.deepEqual(f.loads,[[f.group.id,id(77)]]);
 assert.equal(find(tree,(n:any)=>['AttendanceResponse','EventPreference'].includes(n.type)),undefined);
 find(tree,(n:any)=>n.type==='EventPreview').props.onPress();assert.deepEqual(f.navigation,[['outing',id(77)]]);
 assert.equal(f.writes.length,0);
});

test('adding a missing alternative to a reused outing retains the same explicit source ID',async()=>{
 const f=fixture();f.setCreateResult({...f.plan,options:[]});
 find(f.render(),(n:any)=>n.props?.testID==='group-create-outing').props.onPress();await settle();
 assert.equal(f.writes.length,2);assert.equal(f.writes[1][3],'proposals');
 assert.equal(f.writes[1][4].sourceMessageId,f.message.id);assert.equal(f.writes[1][4].revision,f.plan.revision);
 assert.equal(f.navigation.length,0);
});
