import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {loadYoga} from 'yoga-layout/load';
import {colors,tokens,screenPadding} from '../src/ui/theme';
const {find,hooks,modules}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');
const flatten=(value:any):any=>Array.isArray(value)?Object.assign({},...value.filter(Boolean).map(flatten)):value??{};
const symbols=(...names:string[])=>Object.fromEntries(names.map(name=>[name,name]));
const id=(value:number)=>'00000000-0000-4000-8000-'+String(value).padStart(12,'0');

// Exercise the actual list -> Message -> EventPreview composition and the
// real explicitly bound reference. UIKit rendering is NOT simulated by Yoga.
function fixture({received=false,associated=true,image=true,width=390,longTitle=false}={}){
 const h=hooks();let currentHooks=h;
 const react={...Object.fromEntries(Object.keys(h.react).map(key=>[key,(...args:any[])=>currentHooks.react[key](...args)])),memo:(component:unknown)=>component,useLayoutEffect:(...args:any[])=>currentHooks.react.useEffect(...args)};
 const render=(instance:any,fn:()=>any)=>{currentHooks=instance;return instance.render(fn)};
 const event={id:id(10),title:longTitle?'An international headliner with a second live set and an extended closing night':'AFTER DARK',city:'București',location:'Piața Unirii',startTime:'2099-11-20T20:00:00Z',endTime:'2099-11-21T04:00:00Z',status:'published',...(image?{imageUrl:'https://example.invalid/poster.webp'}:{})};
 const plan={id:id(30),groupId:id(20),title:'Our night',ownerId:id(1),status:'accepted',city:event.city,outingDate:'2099-11-20',candidateDates:[],lifecycle:'choosing_event',expiresAt:'2099-11-22T20:00:00Z',decisionRound:1,revision:1,members:[],options:[{eventId:event.id,title:event.title,startTime:event.startTime,imageUrl:event.imageUrl,location:event.location,available:true,reactions:[]}]};
 const group={id:id(20),name:'Friends',ownerId:id(1),status:'accepted',joinedAt:'2026-11-15T20:00:00Z',visibleAfterSeq:0,lastSeq:1,members:[{userId:id(1),username:'Franco',status:'accepted'},{userId:id(2),username:'Ana',status:'accepted'}],outings:associated?[plan]:[]};
 const message={id:id(109),seq:1,senderId:id(received?2:1),username:received?'Ana':'Franco',kind:'event',content:'',createdAt:'2026-11-15T21:00:00Z',event,...(associated?{outingId:plan.id,referenceMessageId:id(109)}:{})};
 const navigation:any[]=[],writes:any[]=[];
 const model:any={ready:true,user:{id:id(1)},groups:[group],messages:{[group.id]:[message]},drafts:{},revoked:[],more:{},collection:{},historyMore:{},friends:[],store:{read:()=>Promise.resolve(true),getSnapshot:()=>({error:null}),loadPlan:async()=>null,createOuting:async(...args:any[])=>{writes.push(args);return plan},planAction:async(...args:any[])=>{writes.push(args);return plan}}};
 const copy=(key:string)=>({'groups.viewOuting':'Open outing','groups.proposeOuting':'Propose outing','outings.v2.proposeShort':'Propose','groups.destinationPending':'Choosing the destination'}[key]??key);
 const mocks:any={react,'react-native':{...symbols('View','FlatList','ScrollView','Pressable','ActivityIndicator'),Platform:{OS:'ios'},StyleSheet:{create:(v:any)=>v,flatten,absoluteFill:{position:'absolute',top:0,right:0,bottom:0,left:0}},useWindowDimensions:()=>({width,height:844})},
  '@react-navigation/native':{useNavigation:()=>({navigate:(...args:any[])=>navigation.push(args),canGoBack:()=>true,goBack(){}}),useIsFocused:()=>true},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:60,bottom:34})},
  'lucide-react-native':symbols('ArrowUp','BellOff','CalendarDays','Check','Images','Plus','UsersRound','ChevronRight'),'expo-linear-gradient':symbols('LinearGradient'),
  './useGroups':{useGroups:()=>model},'../usePreferences':{usePreferences:()=>({copy,language:'en'})},'../auth/AuthProvider':{useAuth:()=>({user:model.user})},'../ui/theme':{colors,tokens,screenPadding},
  '../ui/Text':symbols('Text'),'../ui/ActionButton':symbols('ActionButton'),'../ui/FormInput':symbols('FormInput'),'./GroupComposerInput':symbols('GroupComposerInput'),'../ui/common':symbols('EventImage','Feedback','Loading'),'../ui/KeyboardForms':symbols('FormScrollView'),
  '../outings/OutingPrimitives':symbols('OutingPressable','MemberAvatar'),'./GroupMenu':symbols('GroupMenu'),'./GroupBack':symbols('GroupBack'),'./GroupOutingCard':symbols('GroupOutingCard','EventPreference','AttendanceResponse'),'./GroupHistoryUpdates':symbols('GroupHistoryUpdates'),'../ui/GlassInputSurface':symbols('GlassInputSurface'),
  './GroupChatKeyboard':symbols('GroupChatKeyboardProvider','GroupChatScrollView','GroupComposerDock'),'../ui/AccentPressable':symbols('AccentPressable'),
  '../outings/PlanTicketRecipients':symbols('PlanTicketRecipients'),'../checkout/useCheckoutReservation':{useCheckoutReservation:()=>({busy:false,error:null,open(){},resume(){},cancel(){}})}};
 const loader=modules(mocks),screen=loader.load(path.resolve(__dirname,'../src/groups/GroupsScreen.tsx'));
 const root=render(h,()=>screen.FriendGroupScreen({id:group.id})),list=find(root,(n:any)=>n.props?.testID==='group-messages');
 const component=list.props.renderItem({item:list.props.data[0]});
 const messageCell=render(hooks(),()=>component.type(component.props));
 const reference=find(messageCell,(n:any)=>n.type?.name==='GroupEventReference');assert.ok(reference,'The real message uses the reference renderer');
 const renderedReference=render(hooks(),()=>reference.type(reference.props));
 const replace=(node:any):any=>node===reference?renderedReference:!node||typeof node!=='object'?node:{...node,props:{...node.props,children:Array.isArray(node.props?.children)?node.props.children.map(replace):replace(node.props?.children)}};
 const cell=replace(messageCell);
 const preview=find(cell,(n:any)=>n.props?.testID==='group-shared-preview-'+message.id);
 const action=find(preview,(n:any)=>n.props?.testID==='group-create-outing');
 return {cell,preview,action,message,event,group,plan,navigation,writes,list};
}

test('an explicitly associated shared event opens only its bound outing and retains one canonical preview',async()=>{
 for(const received of [false,true]){
  const f=fixture({received});
  assert.equal(f.list.props.inverted,true);
  assert.equal(f.action,undefined,'A bound reference cannot propose another outing');
  assert.equal(find(f.cell,(n:any)=>n.type==='EventPreference').props.plan.id,f.plan.id);
  f.preview.props.onPress();
  assert.equal(f.navigation.length,1);assert.equal(f.navigation[0][0],'GroupOuting');assert.equal(f.navigation[0][1].planId,f.plan.id);
  assert.equal(f.writes.length,0,'Opening the reference must not silently create or change an outing');
  assert.equal(find(f.cell,(n:any)=>n.type==='ActionButton'),undefined,'The reference does not wrap its action in an unconstrained native glass button');
 }
});

test('unassociated shared events retain explicit Propose without creating an outing just by rendering',async()=>{
 const f=fixture({associated:false});assert.equal(f.action.type,'OutingPressable');assert.equal(find(f.action,(n:any)=>n.type==='Text').props.children,'Propose outing');assert.equal(f.writes.length,0);
 await f.action.props.onPress();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.writes.length,1);assert.equal(f.writes[0][0],f.group.id);assert.equal(f.writes[0][1].eventId,f.event.id);assert.equal(f.writes[0][1].sourceMessageId,f.message.id);
 assert.equal(f.navigation.length,0,'Proposing evolves the original card without forcing a route change');
 f.preview.props.onPress();assert.equal(f.navigation[0][0],'Event');assert.equal(f.navigation[0][1].id,f.event.id);
});

test('the complete associated shared-event cell stays content-sized across hidden and restored native viewports',async()=>{
 const y=await loadYoga();
 for(const width of [320,390,430])for(const received of [false,true])for(const image of [false,true])for(const longTitle of [false,true])for(const fontScale of [1,1.5]){
  const f=fixture({width,received,image,longTitle}),nodes=new Map<string,any>(),texts:any[]=[];
  function build(element:any):any[]{
   if(!element||typeof element!=='object')return[];
   if(typeof element.type==='function')return build(element.type(element.props));
   if(element.type==null||typeof element.type==='symbol')return[element.props?.children].flat(Infinity).flatMap(build);
   const props=element.props??{},style=flatten(props.style),node=y.Node.create();
   if(props.testID)nodes.set(props.testID,node);
   for(const [key,method]of [['width','setWidth'],['height','setHeight'],['minWidth','setMinWidth'],['minHeight','setMinHeight'],['maxWidth','setMaxWidth'],['maxHeight','setMaxHeight']]as const)if(style[key]!==undefined)node[method](style[key]);
   node.setFlexDirection(style.flexDirection==='row'?y.FLEX_DIRECTION_ROW:y.FLEX_DIRECTION_COLUMN);
   if(style.flex!==undefined){node.setFlexGrow(style.flex);node.setFlexBasis(0)}
   if(style.flexGrow!==undefined)node.setFlexGrow(style.flexGrow);if(style.flexShrink!==undefined)node.setFlexShrink(style.flexShrink);
   if(style.aspectRatio!==undefined)node.setAspectRatio(style.aspectRatio);
   const align=(value:string)=>({center:y.ALIGN_CENTER,stretch:y.ALIGN_STRETCH,'flex-start':y.ALIGN_FLEX_START,'flex-end':y.ALIGN_FLEX_END}[value]??y.ALIGN_AUTO);
   if(style.alignItems)node.setAlignItems(align(style.alignItems));if(style.alignSelf)node.setAlignSelf(align(style.alignSelf));
   if(style.justifyContent==='center')node.setJustifyContent(y.JUSTIFY_CENTER);if(style.justifyContent==='flex-end')node.setJustifyContent(y.JUSTIFY_FLEX_END);
   if(style.gap!==undefined)node.setGap(y.GUTTER_ALL,style.gap);
   for(const [key,edge]of [['padding',y.EDGE_ALL],['paddingHorizontal',y.EDGE_HORIZONTAL],['paddingVertical',y.EDGE_VERTICAL],['paddingTop',y.EDGE_TOP],['paddingBottom',y.EDGE_BOTTOM],['paddingLeft',y.EDGE_LEFT],['paddingRight',y.EDGE_RIGHT]]as const)if(style[key]!==undefined)node.setPadding(edge,style[key]);
   for(const [key,edge]of [['marginHorizontal',y.EDGE_HORIZONTAL],['marginTop',y.EDGE_TOP],['marginBottom',y.EDGE_BOTTOM]]as const)if(style[key]!==undefined)node.setMargin(edge,style[key]);
   if(style.position==='absolute'){node.setPositionType(y.POSITION_TYPE_ABSOLUTE);for(const [key,edge]of [['top',y.EDGE_TOP],['bottom',y.EDGE_BOTTOM],['left',y.EDGE_LEFT],['right',y.EDGE_RIGHT]]as const)if(style[key]!==undefined)node.setPosition(edge,style[key])}
   if(element.type==='Text'){
    const label=String(props.children??''),line=(style.lineHeight??20)*fontScale,font=(style.fontSize??14)*fontScale;
    node.setMeasureFunc((available:number)=>{const natural=label.length*font*.53,lines=available>0?Math.max(1,Math.ceil(natural/available)):1;return{width:Math.min(natural,available>0?available:natural),height:Math.min(props.numberOfLines??Infinity,lines)*line}});texts.push(node);
   }else if(element.type==='EventImage'){node.setMeasureFunc(()=>({width:3000,height:12000}))}
   else if(element.type==='MemberAvatar'){node.setWidth(props.size);node.setHeight(props.size)}
   else if(element.type==='EventPreference'){node.setHeight(48)}
   else for(const child of[props.children].flat(Infinity))for(const next of build(child))node.insertChild(next,node.getChildCount());
   return[node];
  }
  const viewport=y.Node.create();viewport.setWidth(width);
  // Inverted transforms do not change Yoga dimensions. A scroll content host
  // has an unbounded content height even while its viewport is finite/hidden.
  const content=y.Node.create();content.setPositionType(y.POSITION_TYPE_ABSOLUTE);content.setPosition(y.EDGE_TOP,0);content.setPosition(y.EDGE_LEFT,0);content.setPosition(y.EDGE_RIGHT,0);content.setPadding(y.EDGE_TOP,8);content.setPadding(y.EDGE_BOTTOM,12);
  viewport.insertChild(content,0);const cell=build(f.cell)[0];content.insertChild(cell,0);
  let expected:number|undefined;
  for(const height of[652,0,652,328,652,0,652]){
   viewport.setHeight(height);texts.forEach(n=>n.markDirty());viewport.calculateLayout(undefined,undefined,y.DIRECTION_LTR);
   const measured=cell.getComputedHeight(),cover=nodes.get('group-shared-preview-'+f.message.id+'-cover');
   assert.ok(measured>200&&measured<650,JSON.stringify({width,received,image,height,measured,longTitle,fontScale}));
   if(expected!==undefined)assert.equal(measured,expected,'Covering/restoring the viewport cannot grow the shared cell');expected=measured;
   assert.ok(cover.getComputedHeight()>=150&&cover.getComputedHeight()<500,'Cover reserves a compact baseline and expands only for its real text');if(!longTitle&&fontScale===1)assert.ok(cover.getComputedHeight()<=160,'Ordinary text keeps the requested 150?160 point photo');
   assert.equal(nodes.get('group-create-outing'),undefined,'There is no second proposal button inside the canonical reference');
  }
  viewport.freeRecursive();
 }
});
