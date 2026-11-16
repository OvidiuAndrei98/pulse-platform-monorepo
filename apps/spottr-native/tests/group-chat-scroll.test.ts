import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {groupConversationRows,pinnedOutingPresentation,isCanonicalGroupReference} from '@packages/app-core/social/groupPresentation';
const {find,hooks,modules,deferred,settle}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');

function fixture(platform='ios'){
 const h=hooks(),react={...h.react,memo:(component:unknown)=>component,useLayoutEffect:h.react.useEffect};
 let focused=true;
 const uid='viewer',gid='group',commands:{offset:number;animated:boolean}[]=[],reads:number[]=[];
 const message=(seq:number,senderId='friend')=>({id:'message-'+seq,seq,senderId,username:senderId,kind:'text',content:'Message '+seq,createdAt:'2026-11-15T21:00:00Z'});
 const group={id:gid,name:'Friends',ownerId:uid,status:'accepted',joinedAt:'2026-11-15T20:00:00Z',visibleAfterSeq:0,lastSeq:1,members:[],outings:[]};
 const sent=deferred();
 const model:any={ready:true,loading:false,user:{id:uid},groups:[group],messages:{[gid]:[message(1)]},drafts:{[gid]:'Hello'},revoked:[],more:{},collection:{},historyMore:{},friends:[],
  store:{read:(_id:string,seq:number)=>{reads.push(seq);return Promise.resolve(true)},send:()=>sent.promise}};
 const symbols=(names:string[])=>Object.fromEntries(names.map(name=>[name,name]));
 const mocks:any={
  react,'react-native':{...symbols(['ActivityIndicator','FlatList','Pressable','ScrollView','View']),Platform:{OS:platform},StyleSheet:{create:(styles:unknown)=>styles},useWindowDimensions:()=>({width:390,height:844})},
  '@react-navigation/native':{useNavigation:()=>({navigate(){},canGoBack:()=>true,goBack(){}}),useIsFocused:()=>focused},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:60,bottom:34})},'lucide-react-native':symbols(['ArrowUp','BellOff','CalendarDays','Check','ChevronRight','Images','Plus','UsersRound']),
  '@packages/app-core/social/groups':{groupMembershipCounts:()=>({accepted:2,pending:0}),preferredGroupOuting:()=>undefined},
  '@packages/app-core/outings/model':{planningCityKey:(value:string)=>value,planningToday:()=>''},
  '@packages/app-core/outings/presentation':{outingDate:()=>''}, './GroupContent':{GroupAvatar:'GroupAvatar',EventPreview:'EventPreview',OutingSummary:'OutingSummary',ConversationRow:'ConversationRow',MessageMeta:'MessageMeta'},'./GroupEventReference':{GroupEventReference:'GroupEventReference'},'./groupStyles':{groupStyles:{}},'@packages/app-core/social/groupPresentation':{conversationTitle:(group:any)=>group.name,groupConversationRows,pinnedOutingPresentation,isCanonicalGroupReference},'./useGroups':{useGroups:()=>model},
  '../usePreferences':{usePreferences:()=>({copy:(key:string)=>key,language:'en'})},'../data/events':{formatDate:()=>''},'../ui/theme':{colors:{}},
  '../ui/Text':symbols(['Text']),'../ui/ActionButton':symbols(['ActionButton']),'../ui/GlassPressable':symbols(['GlassPressable']),
  '../ui/FormInput':symbols(['FormInput']),'../ui/AppSheet':symbols(['AppSheet']),'../ui/AppSheetScrollView':symbols(['AppSheetScrollView']),
  '../ui/common':symbols(['EventImage','Feedback','Loading']),'../ui/KeyboardForms':symbols(['FormScrollView']),
  '../outings/OutingPrimitives':symbols(['MemberAvatar','OutingPressable']),'../ui/ActionIcon':symbols(['ActionIcon']),
  './GroupNightForm':symbols(['GroupNightForm']),'./GroupMenu':symbols(['GroupMenu']),'./GroupEventChooser':symbols(['EventChooser']),
  './GroupOutingCard':symbols(['GroupOutingCard']),'./GroupHistoryUpdates':symbols(['GroupHistoryUpdates']),'../ui/GlassInputSurface':symbols(['GlassInputSurface']),
  './GroupChatKeyboard':symbols(['GroupChatKeyboardProvider','GroupChatScrollView','GroupComposerDock']),
  '../ui/AccentPressable':symbols(['AccentPressable']),
  '../outings/PlanTicketRecipients':symbols(['PlanTicketRecipients']),
  '../checkout/useCheckoutReservation':{useCheckoutReservation:()=>({busy:false,error:null,open(){},resume(){},cancel(){}})},
 };
 const {FriendGroupScreen}=modules(mocks).load(path.resolve(__dirname,'../src/groups/GroupsScreen.tsx'));
 const render=()=>h.render(()=>FriendGroupScreen({id:gid}));
 const byID=(root:any,id:string)=>find(root,(node:any)=>node.props?.testID===id);
 let root=render();
 const list=()=>byID(root,'group-messages');
 list().props.ref.current={scrollToOffset:(command:any)=>commands.push({...command})};
 const inset=(top:number)=>list().props.renderScrollComponent({}).props.onViewportInset(top);
 const scroll=(offset:number)=>list().props.onScroll({nativeEvent:{contentOffset:{y:offset}}});
 const layout=()=>list().props.onContentSizeChange(390,1400);
 inset(platform==='web'?0:360);layout();commands.length=0;reads.length=0;
 return {model,group,message,commands,reads,sent,list,inset,scroll,layout,byID,
  setFocused(value:boolean){focused=value},
  render(){root=render();return root},get root(){return root},
  drag(offset:number){list().props.onScrollBeginDrag();scroll(offset)},
 };
}

test('native inserts follow the real negative latest offset and never install the raw-zero MVCP autoscroll',()=>{
 for(const os of ['ios','android']){
  const f=fixture(os);
  assert.equal(f.list().props.inverted,true);
  assert.equal(f.list().props.maintainVisibleContentPosition.minIndexForVisible,0);
  assert.equal(f.list().props.maintainVisibleContentPosition.autoscrollToTopThreshold,undefined,
   'RN auto-scrolls to raw zero, which discards the native composer/keyboard inset');
  f.scroll(-360);
  f.model.messages.group=[f.message(2),...f.model.messages.group];f.group.lastSeq=2;f.render();
  assert.equal(f.commands.at(-1)?.offset,-360);
  f.layout();assert.equal(f.commands.at(-1)?.offset,-360,'The command must be corrected after the inserted cell has its native layout');
  f.scroll(-360);assert.ok(f.reads.includes(2),'The newest message can be read after arriving at the visible latest position');
 }
});

test('incoming messages and older pagination preserve a history reader and do not mark hidden new messages read',()=>{
 const f=fixture();f.drag(-160); // 200pt from latest with 360pt of native inset.
 f.model.messages.group=[f.message(2),...f.model.messages.group];f.group.lastSeq=2;f.render();let root=f.render();f.layout();
 assert.equal(f.commands.length,0);
 assert.equal(f.reads.includes(2),false,'A negative raw offset alone must not mark history readers at the latest message');
 assert.ok(f.byID(root,'group-new-messages'));
 f.model.messages.group=[...f.model.messages.group,f.message(0)];f.render();f.layout();
 assert.equal(f.commands.length,0,'Loading older history must keep MVCP anchoring without latest commands');
 root=f.render();f.byID(root,'group-new-messages').props.onPress();
 assert.equal(f.commands.at(-1)?.offset,-360);
 assert.equal(f.commands.at(-1)?.animated,true);
 assert.equal(f.reads.includes(2),false,'Pressing the button is not proof that the latest message has become visible');
 f.scroll(-360);assert.ok(f.reads.includes(2));
});

test('own sends reach the latest message through single-line/multiline shrink with the keyboard open or closed',async()=>{
 for(const inset of [88,122,360,424]){
  const f=fixture();f.inset(inset);f.drag(200);f.commands.length=0;
  f.byID(f.root,'group-send').props.onPress();
  assert.equal(f.commands.length,0,'Do not move history before the send has succeeded');
  f.model.messages.group=[f.message(2,'viewer'),...f.model.messages.group];f.group.lastSeq=2;f.render();f.layout();
  f.sent.resolve({id:'message-2'});await settle();f.render();
  assert.equal(f.commands.at(-1)?.offset,-inset);
  const reduced=Math.max(88,inset-34);f.inset(reduced);f.layout();
  assert.equal(f.commands.at(-1)?.offset,-reduced,'Composer shrink must use its current measured inset, not a stale pre-send height');
 }
});

test('failed sends, membership changes and user drags cancel deferred latest corrections',async()=>{
 const failed=fixture();failed.drag(200);failed.byID(failed.root,'group-send').props.onPress();failed.sent.resolve(undefined);await settle();failed.layout();
 assert.equal(failed.commands.length,0,'A failed send must leave the draft and history position in place');
 const left=fixture();left.drag(200);left.byID(left.root,'group-send').props.onPress();
 left.group.joinedAt='2026-11-15T22:00:00Z';left.group.visibleAfterSeq=1;left.model.messages.group=[];left.render();left.commands.length=0;
 left.sent.resolve({id:'message-2'});await settle();left.layout();
 assert.equal(left.commands.length,0,'A response from the previous membership must not move the new private conversation epoch');
 const drag=fixture();drag.model.messages.group=[drag.message(2),...drag.model.messages.group];drag.render();drag.commands.length=0;
 drag.drag(200);drag.inset(400);drag.layout();
 assert.equal(drag.commands.length,0,'Taking control of history cancels pending insertion/layout corrections');
});

test('browser latest commands retain zero while native inset handling stays in the native adapter',()=>{
 const f=fixture('web');f.drag(200);f.model.messages.group=[f.message(2),...f.model.messages.group];f.group.lastSeq=2;f.render();const root=f.render();
 f.byID(root,'group-new-messages').props.onPress();assert.equal(f.commands.at(-1)?.offset,0);
});

test('sharing from the picker defers latest positioning until the covered conversation is visible again',()=>{
 const f=fixture();f.scroll(-360);f.setFocused(false);f.render();f.commands.length=0;
 f.model.messages.group=[f.message(2,'viewer'),...f.model.messages.group];f.group.lastSeq=2;f.render();f.layout();
 assert.equal(f.commands.length,0,'A zero-sized covered route must not consume the own-share position correction');
 f.setFocused(true);f.render();assert.equal(f.commands.at(-1)?.offset,-360,'Return applies the pending latest correction to the visible list');
 f.layout();assert.equal(f.commands.at(-1)?.offset,-360);
});

test('returning from the picker without a new message leaves a history reader at the same anchor',()=>{
 const f=fixture();f.drag(320);f.commands.length=0;f.setFocused(false);f.render();
 f.list().props.onScroll({nativeEvent:{contentOffset:{y:0}}});f.layout();f.setFocused(true);f.render();f.layout();
 assert.equal(f.commands.length,0,'A hidden native layout/scroll event is not user intent to return to latest');
 f.model.messages.group=[f.message(2),...f.model.messages.group];f.group.lastSeq=2;f.render();f.layout();assert.equal(f.commands.length,0);
});

test('return viewport layout cannot consume the correction before the shared event cell is measured',()=>{
 const f=fixture();f.setFocused(false);f.render();
 f.model.messages.group=[f.message(2,'viewer'),...f.model.messages.group];f.group.lastSeq=2;f.render();
 f.setFocused(true);f.render();
 f.list().props.onLayout({nativeEvent:{layout:{width:390,height:652}}});
 const beforeContent=f.commands.length;f.layout();
 assert.equal(f.commands.length,beforeContent+1,'The returned viewport is not proof that the new shared card has its final native layout');
 assert.equal(f.commands.at(-1)?.offset,-360);
});

test('own reference audit updates and cached source refreshes do not pull a history reader to latest',()=>{
 const f=fixture();f.drag(320);f.commands.length=0;
 const source={...f.message(0,'friend'),kind:'event',outingId:'outing',referenceMessageId:'message-0'};
 f.model.messages.group=[f.message(1),source];f.render();f.layout();
 assert.equal(f.commands.length,0,'Hydrating an older canonical source keeps the visible history anchor');
 const update={...f.message(2,'viewer'),kind:'outing',outingId:'outing',referenceMessageId:source.id};
 f.model.messages.group=[update,...f.model.messages.group];f.group.lastSeq=2;f.render();f.layout();
 assert.equal(f.commands.length,0,'A decision audit is not a newly sent message requiring latest focus');
 f.model.messages.group=f.model.messages.group.map((message:any)=>message.id===source.id?{...message,outingContext:{decisionRound:2}}:message);
 f.render();f.layout();assert.equal(f.commands.length,0,'Refreshing the original message in place cannot change its list anchor');
});
