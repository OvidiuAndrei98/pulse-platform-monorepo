import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
const {hooks,modules,find,settle}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');

function recipients(os:string){
 const h=hooks(),actions:any[]=[],navigated:any[]=[],requests:any[]=[],invalidated:any[]=[];let closed=0,fail=false;
 const navigation={navigate:(...args:any[])=>navigated.push(args),dispatch:(action:any)=>actions.push(action)};
 const members=[{userId:'me',username:'Buyer',status:'accepted',hasTicket:false,ticketState:'none'},{userId:'friend',username:'Friend',status:'accepted',hasTicket:false,ticketState:'none'}],plan={id:'outing',chosenEventId:'event',decisionRound:3,members};
 const symbols=(...names:string[])=>Object.fromEntries(names.map(name=>[name,name]));
 const {PlanTicketRecipients}=modules({react:h.react,'react-native':{View:'View',Platform:{OS:os}},'@react-navigation/native':{useNavigation:()=>navigation,CommonActions:{navigate:(name:string,params:any)=>({type:'NAVIGATE',payload:{name,params}})},StackActions:{popTo:(name:string,params:any)=>({type:'POP_TO',payload:{name,params}})}},'@tanstack/react-query':{useQuery:()=>({})},'expo-crypto':{randomUUID:()=> 'isolated-request'},'lucide-react-native':symbols('Check'),'@packages/app-core/outings/experience':{eligiblePlanRecipients:(p:any)=>p.members,recipientHasPendingAccess:()=>false,automaticPlanRecipients:(p:any)=>p.members},'@packages/app-core/social/groups':{groupTicketLabel:()=> 'groups.ticket_none'},'@packages/app-core/checkout/ticketAvailability':{getTicketAvailability:()=> 'available',getRemainingTicketCapacity:()=>10},'@packages/app-core/checkout/totals':{checkoutTotals:()=>({total:0})},'@packages/app-core/events/serviceFee':{formatRon:()=> '0 lei'},'../data/queries':{useEvent:()=>({data:{id:'event',ticketTypes:[{id:'free',name:'Free',priceRon:0}]}}),queryClient:{invalidateQueries:(value:any)=>invalidated.push(value)}},'../auth/AuthProvider':{useAuth:()=>({user:{id:'me'},controller:{getToken:()=> 'isolated-token'}}),accountApi:async(...args:any[])=>{requests.push(args);if(fail)throw Error('failed');return {orderId:'order'}}},'../ui/AppSheet':symbols('AppSheet'),'../ui/AppSheetScrollView':symbols('AppSheetScrollView'),'../ui/Text':symbols('Text'),'../usePreferences':{usePreferences:()=>({copy:(key:string)=>key})},'../dashboard/DashboardDropdown':symbols('DashboardDropdown'),'./OutingPrimitives':symbols('MemberAvatar','OutingPressable','OutingAction'),'./outingsStyles':{o:{}},'../ui/theme':{colors:{}}}).load(path.resolve(__dirname,'../src/outings/PlanTicketRecipients.tsx'));
 const draw=()=>h.render(()=>PlanTicketRecipients({plan,actor:'me',onClose:()=>closed++}));draw();
 return {h,draw,actions,navigated,requests,invalidated,members,get closed(){return closed},fail:()=>{fail=true}};
}

for(const os of ['web','android','ios'])test('free ticket for the purchaser opens the actual '+os+' account navigation rather than an unavailable local route',async()=>{
 const t=recipients(os),tree=t.draw(),submit=find(tree,(n:any)=>n.props?.testID==='outing-recipients-continue'),row=find(tree,(n:any)=>n.props?.testID==='outing-recipient-me');assert.equal(row.props['aria-checked'],true);assert.equal(row.props['aria-checked'],row.props.accessibilityState.checked,'Web and native checkbox state agree');assert.equal(submit.props.disabled,false);submit.props.onPress();await settle();assert.equal(t.closed,1);assert.equal(t.requests.length,1);assert.deepEqual(JSON.parse(JSON.stringify(t.requests[0][1].body.outing.recipientIds)),['me']);assert.deepEqual(t.navigated,[]);assert.equal(t.actions.length,1);const destination=t.actions[0].payload;if(os==='ios')assert.equal(destination.name,'Tickets');else{assert.equal(destination.name,'Tabs');assert.equal(destination.params.screen,'Profile');assert.equal(destination.params.params.screen,'Tickets')}t.h.unmount();
});

test('friend-only free registration still opens Ticket transfers and never the purchaser wallet',async()=>{
 const t=recipients('web');let tree=t.draw();find(tree,(n:any)=>n.props?.testID==='outing-recipient-me').props.onPress();tree=t.draw();find(tree,(n:any)=>n.props?.testID==='outing-recipient-friend').props.onPress();tree=t.draw();find(tree,(n:any)=>n.props?.testID==='outing-recipients-continue').props.onPress();await settle();assert.equal(t.closed,1);assert.deepEqual(t.navigated,[['TicketTransfers']]);assert.deepEqual(t.actions,[]);assert.deepEqual(JSON.parse(JSON.stringify(t.requests[0][1].body.outing.recipientIds)),['friend']);t.h.unmount();
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
