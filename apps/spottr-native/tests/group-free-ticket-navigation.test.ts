import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {outingCheckoutRecovery} from '@packages/app-core/outings/experience';
const {hooks,modules,find,settle,deferred}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');

function recipients(os:string){
 const h=hooks(),actions:any[]=[],navigated:any[]=[],requests:any[]=[],invalidated:any[]=[],reply=deferred();let closed=0,fail=false,waiting=false,token='isolated-token',failure:unknown=Error('failed'),reviews=0;
 const navigation={navigate:(...args:any[])=>navigated.push(args),dispatch:(action:any)=>actions.push(action)};
 const members=[{userId:'me',username:'Buyer',status:'accepted',hasTicket:false,ticketState:'none'},{userId:'friend',username:'Friend',status:'accepted',hasTicket:false,ticketState:'none'}],plan={id:'outing',chosenEventId:'event',decisionRound:3,members};
 const symbols=(...names:string[])=>Object.fromEntries(names.map(name=>[name,name]));
 const {PlanTicketRecipients}=modules({react:h.react,'react-native':{View:'View',Platform:{OS:os}},'@react-navigation/native':{useNavigation:()=>navigation,CommonActions:{navigate:(name:string,params:any)=>({type:'NAVIGATE',payload:{name,params}})},StackActions:{popTo:(name:string,params:any)=>({type:'POP_TO',payload:{name,params}})}},'@tanstack/react-query':{useQuery:()=>({})},'expo-crypto':{randomUUID:()=> 'isolated-request'},'lucide-react-native':symbols('Check'),'@packages/app-core/outings/experience':{eligiblePlanRecipients:(p:any)=>p.members,recipientHasPendingAccess:()=>false,automaticPlanRecipients:(p:any)=>p.members,outingCheckoutRecovery},'@packages/app-core/social/groups':{groupTicketLabel:(state?:string)=> 'groups.ticket_'+(state??'unknown')},'@packages/app-core/checkout/ticketAvailability':{getTicketAvailability:()=> 'available',getRemainingTicketCapacity:()=>10},'@packages/app-core/checkout/totals':{checkoutTotals:()=>({total:0})},'@packages/app-core/events/serviceFee':{formatRon:()=> '0 lei'},'../data/queries':{useEvent:()=>({data:{id:'event',ticketTypes:[{id:'free',name:'Free',priceRon:0}]}}),queryClient:{invalidateQueries:(value:any)=>invalidated.push(value)}},'../auth/AuthProvider':{useAuth:()=>({user:{id:'me'},controller:{getToken:()=>token}}),accountApi:async(...args:any[])=>{requests.push(args);if(waiting)await reply.promise;if(fail)throw failure;return {orderId:'order'}}},'../groups/GroupActionSheet':symbols('GroupActionSheet'),'../groups/GroupContent':symbols('EventPreview'),'../ui/common':symbols('EventImage'),'@packages/app-core/social/groupPresentation':{groupEventDate:()=> '16 Nov'},'../ui/AppSheet':symbols('AppSheet'),'../ui/AppSheetScrollView':symbols('AppSheetScrollView'),'../ui/Text':symbols('Text'),'../usePreferences':{usePreferences:()=>({copy:(key:string)=>key})},'../dashboard/DashboardDropdown':symbols('DashboardDropdown'),'./OutingPrimitives':symbols('MemberAvatar','OutingPressable','OutingAction'),'./outingsStyles':{o:{}},'../ui/theme':{colors:{},tokens:{radius:{field:12}}}}).load(path.resolve(__dirname,'../src/outings/PlanTicketRecipients.tsx'));
 // The real sheet places its footer outside the scrolling children. Include
 // that separate slot in test traversal without executing a native sheet.
 const draw=()=>{const tree=h.render(()=>PlanTicketRecipients({plan,actor:'me',onClose:()=>closed++,onReviewSelection:()=>reviews++}));return {...tree,props:{...tree.props,children:[tree.props.children,tree.props.footer]}}};draw();
 const dismiss=()=>{const tree=draw(),sheet=find(tree,(n:any)=>n.props?.testID==='group-recipient-sheet');assert.equal(sheet.props.closing,true);assert.equal(closed,0);assert.deepEqual(navigated,[]);assert.deepEqual(actions,[]);sheet.props.onDismiss();sheet.props.onDismiss();};
 return {h,draw,dismiss,actions,navigated,requests,invalidated,members,reply,get closed(){return closed},get reviews(){return reviews},fail:(cause:unknown=Error('failed'))=>{fail=true;failure=cause},delay:()=>{waiting=true},changeAccount:()=>{token='another-owner'}};
}

for(const os of ['web','android','ios'])test('free ticket for the purchaser opens the actual '+os+' account navigation rather than an unavailable local route',async()=>{
 const t=recipients(os),tree=t.draw(),submit=find(tree,(n:any)=>n.props?.testID==='outing-recipients-continue'),row=find(tree,(n:any)=>n.props?.testID==='outing-recipient-me');assert.equal(row.props['aria-checked'],true);assert.equal(row.props['aria-checked'],row.props.accessibilityState.checked,'Web and native checkbox state agree');assert.equal(submit.props.disabled,false);submit.props.onPress();await settle();t.dismiss();assert.equal(t.closed,1);assert.equal(t.requests.length,1);assert.deepEqual(JSON.parse(JSON.stringify(t.requests[0][1].body.outing.recipientIds)),['me']);assert.deepEqual(t.navigated,[]);assert.equal(t.actions.length,1);const destination=t.actions[0].payload;if(os==='ios')assert.equal(destination.name,'Tickets');else{assert.equal(destination.name,'Tabs');assert.equal(destination.params.screen,'Profile');assert.equal(destination.params.params.screen,'Tickets')}t.h.unmount();
});

test('friend-only free registration still opens Ticket transfers and never the purchaser wallet',async()=>{
 const t=recipients('web');let tree=t.draw();find(tree,(n:any)=>n.props?.testID==='outing-recipient-me').props.onPress();tree=t.draw();find(tree,(n:any)=>n.props?.testID==='outing-recipient-friend').props.onPress();tree=t.draw();find(tree,(n:any)=>n.props?.testID==='outing-recipients-continue').props.onPress();await settle();t.dismiss();assert.equal(t.closed,1);assert.deepEqual(t.navigated,[['TicketTransfers']]);assert.deepEqual(t.actions,[]);assert.deepEqual(JSON.parse(JSON.stringify(t.requests[0][1].body.outing.recipientIds)),['friend']);t.h.unmount();
});

test('failed free registration does not navigate or close the selection',async()=>{
 const t=recipients('web');t.fail();const tree=t.draw();find(tree,(n:any)=>n.props?.testID==='outing-recipients-continue').props.onPress();await settle();assert.equal(t.closed,0);assert.deepEqual(t.navigated,[]);assert.deepEqual(t.actions,[]);assert.ok(find(t.draw(),(n:any)=>n.props?.accessibilityRole==='alert'));t.h.unmount();
});

test('unknown ticket ownership is explicit and requires consent instead of becoming no-ticket',async()=>{
 const t=recipients('web');t.members[0]!.ticketState='unknown';let tree=t.draw();
 let submit=find(tree,(n:any)=>n.props?.testID==='outing-recipients-continue');assert.equal(submit.props.disabled,true);submit.props.onPress();await settle();assert.equal(t.requests.length,0);
 find(tree,(n:any)=>n.props?.testID==='outing-extra-confirmation').props.onPress();tree=t.draw();submit=find(tree,(n:any)=>n.props?.testID==='outing-recipients-continue');assert.equal(submit.props.disabled,false);submit.props.onPress();await settle();assert.equal(t.requests[0][1].body.outing.extraConfirmed,true);t.h.unmount();
});

test('existing access permits an intentional extra ticket only after explicit confirmation',async()=>{
 const t=recipients('web');t.members[0]!.ticketState='valid';t.members[0]!.hasTicket=true;let tree=t.draw();
 assert.equal(find(tree,(n:any)=>n.props?.testID==='outing-recipients-continue').props.disabled,true);
 find(tree,(n:any)=>n.props?.testID==='outing-extra-confirmation').props.onPress();tree=t.draw();find(tree,(n:any)=>n.props?.testID==='outing-recipients-continue').props.onPress();await settle();assert.equal(t.requests[0][1].body.outing.extraConfirmed,true);assert.deepEqual(Array.from(t.requests[0][1].body.outing.recipientIds),['me']);t.h.unmount();
});

test('closing during free registration cannot queue wallet navigation after the close request',async()=>{
 const t=recipients('ios');t.delay();find(t.draw(),(n:any)=>n.props?.testID==='outing-recipients-continue').props.onPress();await settle();
 const sheet=find(t.draw(),(n:any)=>n.props?.testID==='group-recipient-sheet');sheet.props.onRequestClose();t.reply.resolve();await settle();
 const closing=find(t.draw(),(n:any)=>n.props?.testID==='group-recipient-sheet');closing.props.onDismiss();assert.equal(t.closed,1);assert.deepEqual(t.actions,[]);assert.deepEqual(t.navigated,[]);t.h.unmount();
});

test('switching accounts before dismissal invalidates queued wallet navigation',async()=>{
 const t=recipients('ios');find(t.draw(),(n:any)=>n.props?.testID==='outing-recipients-continue').props.onPress();await settle();
 const sheet=find(t.draw(),(n:any)=>n.props?.testID==='group-recipient-sheet');assert.equal(sheet.props.closing,true);t.changeAccount();sheet.props.onDismiss();assert.equal(t.closed,1);assert.deepEqual(t.actions,[]);assert.deepEqual(t.navigated,[]);t.h.unmount();
});

test('an acknowledgement after recipient sheet unmount never opens the wallet',async()=>{
 const t=recipients('ios');t.delay();find(t.draw(),(n:any)=>n.props?.testID==='outing-recipients-continue').props.onPress();await settle();t.h.unmount();t.reply.resolve();await settle();assert.equal(t.closed,0);assert.deepEqual(t.actions,[]);assert.deepEqual(t.navigated,[]);
});

test('recipient recovery refreshes canonical outing only after dismissal and never replays registration',async()=>{
 const t=recipients('ios');t.fail({code:'OUTING_RECIPIENTS_CHANGED',data:{error:'OUTING_RECIPIENTS_CHANGED',reason:'outing_changed'}});find(t.draw(),(n:any)=>n.props?.testID==='outing-recipients-continue').props.onPress();await settle();
 let tree=t.draw();assert.equal(find(tree,(n:any)=>n.props?.testID==='outing-recipients-continue'),undefined);find(tree,(n:any)=>n.props?.testID==='outing-recipient-recovery').props.onPress();assert.equal(t.reviews,0);tree=t.draw();find(tree,(n:any)=>n.props?.testID==='group-recipient-sheet').props.onDismiss();assert.equal(t.reviews,1);assert.equal(t.closed,1);assert.equal(t.requests.length,1);assert.ok(t.invalidated.some((entry:any)=>entry.queryKey[0]==='event'));t.h.unmount();
});

test('legacy unverified ownership is labelled unknown even if hasTicket was false',()=>{
 const t=recipients('ios');delete (t.members[0] as any).ticketState;const tree=t.draw();assert.ok(find(tree,(n:any)=>n.type==='Text'&&n.props.children==='groups.ticket_unknown'));t.h.unmount();
});
