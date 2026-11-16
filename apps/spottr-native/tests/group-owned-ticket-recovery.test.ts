import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
const {hooks,modules,find}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');
const symbols=(...names:string[])=>Object.fromEntries(names.map(name=>[name,name]));

test('an unfinished extra checkout cannot hide or change a valid entrance ticket',()=>{
 const h=hooks(),plan={id:'outing',ownerId:'me',status:'accepted',title:'Our night',outingDate:'2099-11-20',city:'Bucuresti',chosenEventId:'event',decisionRound:1,lifecycle:'confirmed',myCheckoutReservation:{orderId:'reservation'},members:[{userId:'me',username:'Buyer',status:'accepted',attendance:'yes',ticketState:'valid',hasTicket:true}],options:[{eventId:'event',title:'After Dark',available:true,ticketAvailability:'available'}]},ticket={id:'owned-ticket',eventId:'event',isValidated:false};
 const group={id:'group',status:'accepted',outings:[plan]},model={user:{id:'me'},groups:[group],messages:{},store:{getSnapshot:()=>({})},busy:false};
 const {GroupOutingScreen}=modules({react:h.react,'react-native':{...symbols('View','ScrollView'),Platform:{OS:'ios'}},'lucide-react-native':symbols('Check','Plus','RotateCcw','Trash2'),'@react-navigation/native':{useNavigation:()=>({canGoBack:()=>true,goBack(){},navigate(){}}),useIsFocused:()=>true},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:60,bottom:34})},
 './useGroups':{useGroups:()=>model},'./GroupsScreen':{GroupBack:'Back',groupStyles:{}},'../usePreferences':{usePreferences:()=>({copy:(key:string)=>key,language:'en'})},'../outings/OutingPrimitives':symbols('MemberAvatar','OutingPressable'),'../ui/ActionButton':symbols('ActionButton'),'./GroupMenu':symbols('GroupMenu'),'./GroupOutingCard':symbols('AttendanceResponse','EventPreference','ProposalPreview'),'./GroupContent':symbols('EventPreview'),'./GroupNightSheet':symbols('GroupNightSheet'),'./GroupActionSheet':symbols('GroupActionSheet'),'../ui/Text':symbols('Text'),'../ui/common':symbols('Feedback','Loading'),'../ui/theme':{colors:{}},'../data/useTickets':{useTickets:()=>({data:[ticket]})},'../profile/TicketSheet':symbols('TicketSheet'),'../outings/PlanTicketRecipients':symbols('PlanTicketRecipients'),'../outings/useOutings':{useOutings:()=>({transfers:[],store:{}})},'../checkout/useCheckoutReservation':{useCheckoutReservation:()=>({busy:false,error:null,canCancel:false,resume:async()=>{}})},'../checkout/CheckoutReservationActions':symbols('CheckoutReservationActions'),
 './GroupOutingHistory':symbols('GroupOutingHistory'),
 }).load(path.resolve(__dirname,'../src/groups/GroupOutingScreen.tsx'));
 const draw=()=>h.render(()=>GroupOutingScreen({groupId:'group',planId:'outing'})),by=(tree:any,id:string)=>find(tree,(node:any)=>node.props?.testID===id);
 let tree=draw();assert.ok(by(tree,'group-resume-checkout'));assert.ok(by(tree,'group-my-ticket'));assert.equal(by(tree,'group-buy'),undefined,'The reserved order must not start a duplicate purchase');
 by(tree,'group-my-ticket').props.onPress();tree=draw();const viewer=find(tree,(node:any)=>node.type==='TicketSheet');assert.equal(viewer.props.initialId,ticket.id);assert.equal(viewer.props.tickets[0],ticket);h.unmount();
});
