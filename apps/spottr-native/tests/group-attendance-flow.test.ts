import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
const {hooks,modules,find,deferred,settle}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');
const symbols=(...names:string[])=>Object.fromEntries(names.map(name=>[name,name]));
type Answer='yes'|'no'|'unanswered';

function fixture(answer:Answer='yes'){
 const h=hooks(),requests:{value:Answer;reply:ReturnType<typeof deferred>}[]=[],opened:string[]=[],state:{current:Answer;canVote:boolean}={current:answer,canVote:true};
 const plan={id:'outing',decisionRound:4,chosenEventId:'event',members:[{userId:'me',attendance:answer,ticketState:'none'}]};
 class GroupActionError extends Error{key:string;constructor(key:string){super(key);this.key=key}}
 const {AttendanceResponse}=modules({react:h.react,'react-native':{...symbols('View','ActivityIndicator'),StyleSheet:{create:(value:any)=>value}},'lucide-react-native':symbols('Check','ChevronRight','Plus','RotateCcw'),'@packages/app-core/social/groupPresentation':{decisionState:()=>state},'@packages/app-core/social/groups':{GroupActionError},'@packages/app-core/events/serviceFee':{formatRon:()=>''},'../ui/Text':symbols('Text'),'../ui/ActionButton':symbols('ActionButton'),'../ui/theme':{colors:{}},'../outings/OutingPrimitives':symbols('OutingPressable','MemberAvatar'),'../usePreferences':{usePreferences:()=>({copy:(key:string)=>key})},'./GroupContent':symbols('EventPreview'),'./groupStyles':{groupStyles:{}}}).load(path.resolve(__dirname,'../src/groups/GroupOutingCard.tsx'));
 const render=()=>h.render(()=>AttendanceResponse({plan,actor:'me',compact:true,testID:'answer',onOpen:()=>opened.push('tickets'),onRespond:async(value:Answer)=>{const reply=deferred();requests.push({value,reply});const result=await reply.promise;if(result){state.current=value;plan.members[0]!.attendance=value}return result}}));
 const byID=(tree:any,id:string)=>find(tree,(node:any)=>node.props?.testID===id);
 const press=(value:'yes'|'no')=>byID(render(),'answer-'+value).props.onPress();
 return {h,requests,opened,state,plan,render,byID,press};
}

test('answered invitations keep both direct choices and tickets separate without a response sheet',()=>{
 for(const answer of ['yes','no','unanswered'] as const){
  const f=fixture(answer),tree=f.render();
  assert.ok(f.byID(tree,'answer-yes'));assert.ok(f.byID(tree,'answer-no'));
  assert.equal(f.byID(tree,'answer-change'),undefined);assert.equal(f.byID(tree,'answer-sheet'),undefined);
  for(const value of ['yes','no'] as const){const button=f.byID(tree,'answer-'+value);assert.equal(button.props['aria-checked'],answer===value);assert.equal(button.props.accessibilityRole,'checkbox');if(answer===value)assert.match(button.props.accessibilityLabel,/withdrawResponse/)}
  f.byID(tree,'answer-tickets').props.onPress();assert.deepEqual(f.opened,['tickets']);assert.deepEqual(f.requests,[],'Ticket access never changes attendance, including a negative answer');f.h.unmount();
 }
});

test('yes to no to unanswered is direct and waits for real server acknowledgement',async()=>{
 const f=fixture('yes');f.press('no');let tree=f.render();
 assert.deepEqual(f.requests.map(row=>row.value),['no']);assert.equal(f.state.current,'yes','Pending feedback does not mutate the confirmed plan');
 assert.equal(f.byID(tree,'answer-no').props.accessibilityState.busy,true);assert.equal(f.byID(tree,'answer-sheet'),undefined);
 f.requests[0]!.reply.resolve({id:'outing'});await settle();tree=f.render();assert.equal(f.byID(tree,'answer-no').props['aria-checked'],true);
 f.press('no');assert.deepEqual(f.requests.map(row=>row.value),['no','unanswered']);f.requests[1]!.reply.resolve({id:'outing'});await settle();tree=f.render();
 assert.equal(f.state.current,'unanswered');assert.equal(f.byID(tree,'answer-yes').props['aria-checked'],false);assert.equal(f.byID(tree,'answer-no').props['aria-checked'],false);assert.deepEqual(f.opened,[]);f.h.unmount();
});

test('failed direct response preserves confirmed answer, shows one retry, and never navigates',async()=>{
 const f=fixture('yes');f.press('no');f.requests[0]!.reply.reject(Error('offline'));await settle();let tree=f.render();
 assert.equal(f.state.current,'yes');assert.equal(f.byID(tree,'answer-yes').props['aria-checked'],true);
 const failure=find(tree,(node:any)=>node.type?.name==='ResponseFailure');assert.equal(failure.props.message,'groups.responseSaveError');assert.equal(f.byID(tree,'answer-sheet'),undefined);assert.deepEqual(f.opened,[]);
 failure.props.retry();assert.deepEqual(f.requests.map(row=>row.value),['no','no']);f.requests[1]!.reply.resolve({id:'outing'});await settle();tree=f.render();assert.equal(f.state.current,'no');assert.equal(find(tree,(node:any)=>node.type?.name==='ResponseFailure').props.message,undefined);f.h.unmount();
});

test('rapid taps queue only the latest intent while keeping one response request in flight',async()=>{
 const f=fixture('unanswered');f.press('yes');f.press('no');f.press('no');
 assert.deepEqual(f.requests.map(row=>row.value),['yes'],'Rapid taps do not race server updates');
 f.requests[0]!.reply.resolve({id:'outing'});await settle();assert.deepEqual(f.requests.map(row=>row.value),['yes','unanswered']);
 f.requests[1]!.reply.resolve({id:'outing'});await settle();assert.equal(f.state.current,'unanswered');assert.equal(f.byID(f.render(),'answer-sheet'),undefined);f.h.unmount();
});

test('closed decisions keep both answers read-only while ticket navigation remains available',()=>{
 const f=fixture('no');f.state.canVote=false;const tree=f.render();
 assert.equal(f.byID(tree,'answer-yes').props.disabled,true);assert.equal(f.byID(tree,'answer-no').props.disabled,true);f.press('yes');assert.deepEqual(f.requests,[]);
 f.byID(tree,'answer-tickets').props.onPress();assert.deepEqual(f.opened,['tickets']);f.h.unmount();
});
