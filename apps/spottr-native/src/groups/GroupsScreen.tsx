import React,{memo,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,FlatList,Platform,Pressable,ScrollView,View,useWindowDimensions,type FlatListInstance,type ScrollViewProps} from 'react-native';
import {useNavigation,useIsFocused} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ArrowUp,BellOff,CalendarDays,Check,Images,Plus,UsersRound} from 'lucide-react-native';
import {GROUP_MEMBER_LIMIT,findMatchingFriendGroup,groupMembershipCounts,type FriendGroup,type GroupMessage,type GroupsStore} from '@packages/app-core/social/groups';
import {useGroups} from './useGroups';
import {Text} from '../ui/Text';
import {ActionButton} from '../ui/ActionButton';
import {FormInput} from '../ui/FormInput';
import {GroupComposerInput} from './GroupComposerInput';
import {Feedback,Loading} from '../ui/common';
import {FormScrollView} from '../ui/KeyboardForms';
import {MemberAvatar,OutingPressable} from '../outings/OutingPrimitives';
import {usePreferences} from '../usePreferences';
import {colors} from '../ui/theme';
import {GroupMenu} from './GroupMenu';
import {GroupBack} from './GroupBack';
export {GroupBack} from './GroupBack';
import {GroupEventReference} from './GroupEventReference';
import {ConversationRow,GroupAvatar,OutingSummary,MessageMeta} from './GroupContent';
import {conversationTitle,isCanonicalGroupReference,groupConversationRows,pinnedOutingPresentation} from '@packages/app-core/social/groupPresentation';
import {GroupHistoryUpdates} from './GroupHistoryUpdates';
import {groupStyles as s} from './groupStyles';
export {groupStyles} from './groupStyles';
import {GlassInputSurface} from '../ui/GlassInputSurface';
import {GroupChatKeyboardProvider,GroupChatScrollView,GroupComposerDock} from './GroupChatKeyboard';
import {AccentPressable} from '../ui/AccentPressable';
import {distanceFromLatest} from './groupChatGeometry';
import type {OutingPlan} from '@packages/app-core/outings/model';
import {PlanTicketRecipients,type RecipientTaskDraft} from '../outings/PlanTicketRecipients';
import {useCheckoutReservation} from '../checkout/useCheckoutReservation';

export const GroupRow=ConversationRow;
export function GroupsScreen({eventId,newGroup=false}:{eventId?:string;newGroup?:boolean}){
 const model=useGroups(),{copy}=usePreferences(),safe=useSafeAreaInsets(),navigation=useNavigation<any>();
 const [creating,setCreating]=useState(newGroup),[name,setName]=useState(''),[ids,setIds]=useState<string[]>([]),[sent,setSent]=useState(false);
 useEffect(()=>{if(creating)void model.store.loadFriends()},[creating,model.store]);
 const existing=findMatchingFriendGroup(model.groups,model.user?.id,ids);
 const open=(id:string)=>navigation.navigate('FriendGroup',{id});
 const send=async(id:string)=>{if(eventId){if(await model.store.send(id,eventId))setSent(true)}else open(id)};
 const title=eventId?'groups.sendTo':'groups.title';
 return <View testID="groups-screen" style={[s.root,{paddingTop:safe.top}]}>
  <View style={s.header}><GroupBack onPress={()=>creating?setCreating(false):navigation.canGoBack()?navigation.goBack():navigation.navigate('Tabs',{screen:'Friends'})}/><Text accessibilityRole="header" style={[s.title,{flex:1}]}>{copy(creating?'groups.create':title)}</Text>{!creating&&model.user&&<ActionButton accessibilityLabel={copy('groups.create')} testID="groups-new" icon={<Plus size={20}/>} style={{width:44,paddingHorizontal:0}} tone="secondary" onPress={()=>setCreating(true)}/>}</View>
  <FormScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.page,{paddingBottom:safe.bottom+32}]}>
   {!model.ready||model.loading&&model.user?<Loading/>:!model.user?<><Text style={s.muted}>{copy('groups.sessionEnded')}</Text><ActionButton title={copy('social.signIn')} onPress={()=>navigation.navigate('Auth',{returnTab:'Friends'})}/></>:creating?<>
    <FormInput testID="group-name" accessibilityLabel={copy('groups.name')} placeholder={copy('groups.groupNameOptional')} value={name} onChangeText={setName} maxLength={80}/><Text style={s.heading}>{copy('groups.friends')}</Text>
    {model.friendsLoading?<Loading/>:model.friends.map(friend=><OutingPressable key={friend.id} testID={'group-friend-'+friend.id} accessibilityRole="checkbox" aria-checked={ids.includes(friend.id)} accessibilityState={{checked:ids.includes(friend.id)}} onPress={()=>setIds(old=>old.includes(friend.id)?old.filter(id=>id!==friend.id):old.length<GROUP_MEMBER_LIMIT-1?[...old,friend.id]:old)} style={[s.row,{minHeight:60}]}><MemberAvatar name={friend.username} uri={friend.avatarUrl} userId={friend.id}/><Text style={[s.body,{flex:1}]}>{friend.username}</Text>{ids.includes(friend.id)&&<Check size={20} color={colors.accent}/>}</OutingPressable>)}
    {model.friendsError&&<Feedback compact title={copy(model.friendsError)} retry={()=>void model.store.loadFriends()}/>}
    {!model.friendsLoading&&!model.friendsError&&!model.friends.length&&<Text style={s.muted}>{copy('groups.noFriends')}</Text>}
    <Text style={s.muted}>{copy('groups.privacy')}</Text>
    {existing&&<View testID="group-existing-match" style={{gap:8}}><Text style={s.muted}>{copy('groups.existingGroupHint')}</Text><ConversationRow group={existing} testID="group-open-existing" preview={copy(eventId?'groups.openAndSend':'groups.openExistingGroup')} onPress={()=>{if(!model.busy)void (eventId?model.store.send(existing.id,eventId):Promise.resolve(true)).then(ok=>{if(ok){setCreating(false);open(existing.id)}})}}/></View>}
    <ActionButton testID="group-create" title={copy(existing?'groups.createSeparate':eventId?'groups.quick':'groups.create')} tone={existing?'secondary':'primary'} busy={model.busy} disabled={!ids.length} onPress={()=>void model.store.create(name.trim(),ids,eventId).then(group=>{if(!group)return;setCreating(false);open(group.id)})}/>
   </>:<>
    {sent&&<View style={{gap:12}}><Text accessibilityRole="alert" style={s.body}>{copy('groups.sent')}</Text><ActionButton title={copy('common.back')} tone="secondary" onPress={()=>navigation.goBack()}/></View>}
    {model.groups.filter(g=>!eventId||g.status==='accepted').map(group=><GroupRow key={group.id} group={group} onPress={()=>void send(group.id)}/>)}
    {!model.groups.length&&<View style={s.empty}><UsersRound size={32} color={colors.accent}/><Text style={s.title}>{copy('groups.newGroup')}</Text><Text style={s.muted}>{copy('groups.empty')}</Text><ActionButton title={copy('groups.create')} onPress={()=>setCreating(true)}/></View>}
   </>}
   {model.error&&<Feedback compact title={copy(model.error)} retry={()=>void model.store.load()}/>}
  </FormScrollView>
 </View>
}

const Message=memo(function Message({message,mine,showAuthor,onEvent,onOuting,onTickets,group,actor,store,busy}:{message:GroupMessage;mine:boolean;showAuthor:boolean;onEvent:(id:string)=>void;onOuting:(id:string)=>void;onTickets:(plan:OutingPlan)=>void;group:FriendGroup;actor?:string;store:GroupsStore;busy:boolean}){
 const {language}=usePreferences('copy'),time=new Date(message.createdAt).toLocaleTimeString(language,{hour:'2-digit',minute:'2-digit'});
 const meta=<MessageMeta testID={!mine?'group-received-time-'+message.id:undefined} time={time} mine={mine}/>;
 return <View testID={'group-message-'+message.id} style={s.message}>
  {showAuthor&&!mine&&<View style={[s.row,{gap:8,marginBottom:8}]}><MemberAvatar name={message.username} uri={message.avatarUrl} userId={message.senderId} size={24}/><Text style={[s.muted,{flex:1}]}>{message.username}</Text></View>}
  {message.kind==='event'||isCanonicalGroupReference(message)?<View style={{width:'100%',maxWidth:332,alignSelf:mine?'flex-end':'flex-start'}}>{!!message.content&&<View testID={'group-bubble-'+message.id} style={[s.bubble,mine&&s.mine]}><Text style={s.body}>{message.content}</Text></View>}<GroupEventReference message={message} group={group} actor={actor} busy={busy} store={store} onEvent={onEvent} onOuting={onOuting} onTickets={onTickets}/>{meta}</View>:<><View testID={'group-bubble-'+message.id} style={[s.bubble,mine&&s.mine]}><Text style={s.body}>{message.content}</Text></View>{meta}</>}
 </View>;
});
export function FriendGroupScreen({id}:{id:string}){
 const model=useGroups(id),{copy,language}=usePreferences(),navigation=useNavigation<any>(),safe=useSafeAreaInsets(),focused=useIsFocused();
 const group=model.groups.find(g=>g.id===id),messages=model.messages[id]??[],list=useRef<FlatListInstance>(null),nearBottom=useRef(true),read=useRef(0),[newMessages,setNewMessages]=useState(false);
 const [ticketPlanId,setTicketPlanId]=useState<string>(),recipientDraft=useRef<RecipientTaskDraft|null>(null),ticketPlan=group?.outings.find(plan=>plan.id===ticketPlanId);
 const reservation=useCheckoutReservation(ticketPlan?.chosenEventId??'');
 const focusedRef=useRef(focused);focusedRef.current=focused;
 const rows=useMemo(()=>groupConversationRows(messages,group?.outings??[]),[messages,group?.outings]);
 const messagePositions=useMemo(()=>new Map(messages.map((message,index)=>[message.id,index])),[messages]);
 const [composerHeight,setComposerHeight]=useState(44);
 const [overflow,setOverflow]=useState(false),metrics=useRef({viewport:0,content:0,inset:0}),initializedInset=useRef(false);
 const {width,height}=useWindowDimensions();
 const maxComposerHeight=Math.max(132,Math.min(220,Math.round(height*.27)));
 useEffect(()=>{setComposerHeight(value=>Math.min(value,maxComposerHeight))},[maxComposerHeight]);
 const composerInset=Math.max(12,safe.bottom);
 const viewportInset=useRef(Platform.OS==='web'?0:54+composerInset),followLatest=useRef(false),previousLatest=useRef(0);
 const scope=id+':'+model.user?.id+':'+group?.joinedAt+':'+group?.visibleAfterSeq,currentScope=useRef(scope);currentScope.current=scope;
 // KeyboardChatScrollView reserves composer + keyboard space in contentInset.top.
 // The latest inverted position is -inset, not zero. Native MVCP's optional
 // autoscroll always targets zero and therefore fights this reservation.
 const scrollLatest=useCallback((animated=false)=>{if(focusedRef.current)list.current?.scrollToOffset({offset:Platform.OS==='web'?0:-Math.max(0,viewportInset.current),animated})},[]);
 const updateOverflow=useCallback(()=>{const m=metrics.current;if(m.viewport>0)setOverflow(old=>m.content+m.inset>m.viewport+(old?-1:1))},[]);
 const updateViewportInset=useCallback((top:number)=>{if(!focusedRef.current)return;viewportInset.current=top;metrics.current.inset=top;updateOverflow();if(!initializedInset.current&&top>0){initializedInset.current=true;if(nearBottom.current)scrollLatest()}else if(followLatest.current)scrollLatest()},[scrollLatest,updateOverflow]);
 const finishLatestLayout=useCallback(()=>{if(focusedRef.current&&followLatest.current){followLatest.current=false;scrollLatest()}},[scrollLatest]);
 const chatScroll=useCallback((props:ScrollViewProps)=><GroupChatScrollView {...props} active={focused} bottomInset={composerInset} onViewportInset={updateViewportInset}/>,[focused,composerInset,updateViewportInset]);
 useLayoutEffect(()=>{read.current=0;nearBottom.current=true;previousLatest.current=0;followLatest.current=false;initializedInset.current=false;setNewMessages(false);setComposerHeight(44)},[scope]);
 useLayoutEffect(()=>{
  const latest=messages[0];if(!latest||latest.seq<=previousLatest.current)return;
  previousLatest.current=latest.seq;
  // Preserve the visible history anchor for incoming messages. New inserts at
  // the end, and our own sends, follow once now and again after native layout.
  if(nearBottom.current||latest.senderId===model.user?.id&&(!latest.referenceMessageId||latest.referenceMessageId===latest.id)){followLatest.current=true;scrollLatest()}
 },[scope,messages[0]?.seq,model.user?.id,scrollLatest]);
 // A share can finish while its picker still covers this route. Keep that
 // correction pending until the actual list is visible; returning to history
 // without a new own message does not request any scroll.
 useLayoutEffect(()=>{if(focused&&followLatest.current)scrollLatest()},[focused,scrollLatest]);
 const sendMessage=async()=>{
  const sentScope=currentScope.current,result=await model.store.send(id);
  if(result&&currentScope.current===sentScope){followLatest.current=true;scrollLatest();setNewMessages(false)}
 };
 const pinned=pinnedOutingPresentation(group?.outings??[],language,copy),relevant=pinned?.plan;
 useEffect(()=>{if(!group||!focused||group.status!=='accepted')return;const received=messages[0]?.seq??0;if(messages[0]?.senderId===model.user?.id){setNewMessages(false);return}if(nearBottom.current&&received>read.current){read.current=received;void model.store.read(id,received)}else if(received>read.current)setNewMessages(true)},[group?.lastSeq,messages[0]?.seq,focused,id,model.store]);
 const activeNavigation=useRef(focused);activeNavigation.current=focused;
 useEffect(()=>{activeNavigation.current=focused;return()=>{activeNavigation.current=false}},[focused]);
 const openOuting=(planId:string,historyMessageId?:string)=>{if(!activeNavigation.current)return;navigation.navigate('GroupOuting',{groupId:id,planId,historyMessageId})};
 const openTickets=(plan:OutingPlan)=>{const own=plan.members.find(member=>member.userId===model.user?.id);if(plan.myPendingPayment||plan.myCheckoutReservation||['valid','used','offered','processing'].includes(own?.ticketState??''))openOuting(plan.id);else setTicketPlanId(plan.id)};
 const back=()=>navigation.canGoBack()?navigation.goBack():navigation.navigate('Tabs',{screen:'Friends'});
 if(!model.ready||!group&&model.loading)return <View style={[s.root,{paddingTop:safe.top}]}><Loading/></View>;
 if(!group||model.revoked.includes(id))return <View style={[s.root,{paddingTop:safe.top}]}><View style={s.header}><GroupBack onPress={back}/><Text style={s.title}>{copy('groups.title')}</Text></View><Feedback title={copy(model.error??'groups.accessLost')} retry={()=>void model.store.load(id)}/></View>;
 return <GroupChatKeyboardProvider bottomInset={composerInset}><View testID="friend-group" style={[s.root,{paddingTop:safe.top}]}>
  <View style={s.header}><GroupBack onPress={back}/><OutingPressable accessibilityLabel={copy('groups.info')} style={[s.row,{flex:1,minWidth:0,gap:8}]} onPress={()=>navigation.navigate('GroupInfo',{groupId:id})}><GroupAvatar group={group} size={40}/><View style={{flex:1,minWidth:0,gap:2}}><Text accessibilityRole="header" numberOfLines={1} style={s.heading}>{conversationTitle(group,model.user?.id)}</Text><Text numberOfLines={1} style={s.caption}>{copy('groups.members',{count:groupMembershipCounts(group).accepted})}{groupMembershipCounts(group).pending>0?' · '+copy('groups.invitedCount',{count:groupMembershipCounts(group).pending}):''}</Text></View></OutingPressable><GroupMenu testID="group-menu" label={copy('groups.settings')} disabled={group.status!=='accepted'} items={[
   {id:'members',label:copy('groups.info'),icon:UsersRound,nativeImage:Platform.OS==='ios'?'person.2':undefined,onPress:()=>navigation.navigate('GroupInfo',{groupId:id}),testID:'group-menu-members'},
   {id:'outings',label:copy('groups.outings'),icon:CalendarDays,nativeImage:Platform.OS==='ios'?'calendar':undefined,onPress:()=>navigation.navigate('GroupOutings',{groupId:id}),testID:'group-menu-outings'},
   {id:'mute',label:copy(group.muted?'groups.unmute':'groups.mute'),icon:BellOff,nativeImage:Platform.OS==='ios'?'bell.slash':undefined,disabled:model.busy,onPress:()=>void model.store.action(id,{action:'mute',muted:!group.muted})}
  ]}/></View>
  {group.status==='pending'?<ScrollView contentContainerStyle={s.page}><Text style={s.title}>{copy('groups.invited')}</Text><View style={s.row}>{group.members.map(m=><MemberAvatar key={m.userId} name={m.username} uri={m.avatarUrl} userId={m.userId}/>)}</View><Text style={s.muted}>{copy('groups.privacy')}</Text><ActionButton title={copy('groups.accept')} testID="group-accept" busy={model.busy} onPress={()=>void model.store.action(id,{action:'accept'})}/><ActionButton title={copy('groups.decline')} tone="ghost" onPress={()=>void model.store.action(id,{action:'decline'}).then(ok=>{if(ok)back()})}/></ScrollView>:<>
   {relevant&&<View style={[s.summary,{width:Math.min(720,width-40),alignSelf:'center'}]}><OutingSummary plan={relevant} compact otherCount={Math.max(0,(pinned?.eligibleCount??1)-1)} testID="group-summary" onPress={()=>openOuting(relevant.id)}/></View>}
   <FlatList ref={list} testID="group-messages" style={{flex:1,minHeight:0}} data={rows} inverted renderScrollComponent={chatScroll} keyExtractor={m=>m.id} initialNumToRender={16} maxToRenderPerBatch={10} windowSize={7} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" maintainVisibleContentPosition={{minIndexForVisible:0}} contentOffset={Platform.OS==='web'?undefined:{x:0,y:-(54+composerInset)}} contentContainerStyle={{paddingTop:8,paddingBottom:12}}
    alwaysBounceVertical={false} bounces={overflow} overScrollMode={overflow?'auto':'never'}
    onLayout={e=>{if(!focusedRef.current||e.nativeEvent.layout.height<=0)return;metrics.current.viewport=e.nativeEvent.layout.height;updateOverflow();if(followLatest.current)scrollLatest()}}
    onContentSizeChange={(_width,content)=>{if(!focusedRef.current||_width<=0||content<=0)return;metrics.current.content=content;updateOverflow();finishLatestLayout()}} onScrollBeginDrag={()=>{if(focusedRef.current)followLatest.current=false}}
    onScroll={e=>{if(!focusedRef.current)return;nearBottom.current=distanceFromLatest(e.nativeEvent.contentOffset.y,Platform.OS==='web'?0:viewportInset.current)<70;if(nearBottom.current){setNewMessages(false);const received=messages[0]?.seq??0;if(received>read.current){read.current=received;void model.store.read(id,received)}}}} scrollEventThrottle={64}
    ListEmptyComponent={<View testID="group-chat-empty" style={{paddingHorizontal:20,paddingVertical:12,transform:[{scaleY:-1}]}}><Text style={s.muted}>{copy('groups.chatEmpty')}</Text></View>}
    ListFooterComponent={model.more[id]?<ActionButton title={copy('groups.older')} tone="ghost" onPress={()=>void model.store.loadMessages(id,true)}/>:undefined}
    renderItem={({item:row})=>{if(row.kind==='updates')return <GroupHistoryUpdates messages={row.messages} allMessages={messages}/>;const item=row.message,index=messagePositions.get(item.id)??0;if(item.kind==='outing'&&!isCanonicalGroupReference(item))return <GroupHistoryUpdates messages={[item]} allMessages={messages}/>;return <Message message={item} mine={item.senderId===model.user?.id} showAuthor={messages[index+1]?.senderId!==item.senderId} onEvent={event=>navigation.navigate('Event',{id:event})} onOuting={openOuting} onTickets={openTickets} group={group} actor={model.user?.id} busy={model.busy} store={model.store}/>}}/>
   <GroupComposerDock active={focused} bottomInset={composerInset}>
   {newMessages&&<View pointerEvents="box-none" style={{position:'absolute',bottom:'100%',left:0,right:0,alignItems:'center',paddingBottom:8}}><ActionButton testID="group-new-messages" title={copy('groups.newMessages')} size="compact" tone="secondary" onPress={()=>{scrollLatest(true);setNewMessages(false)}}/></View>}
   {(model.error||model.sendError)&&<View style={{paddingHorizontal:20}}><Text accessibilityRole="alert" style={[s.muted,{color:colors.danger}]}>{copy(model.sendError??model.error!)}</Text></View>}
   <View testID="group-composer-row" style={[s.composer,{paddingBottom:composerInset}]}><GroupMenu testID="group-add" label={copy('groups.plus')} icon={Plus} items={[
    {id:'event',label:copy('groups.share'),icon:Images,nativeImage:Platform.OS==='ios'?'photo':undefined,onPress:()=>navigation.navigate('GroupEventPicker',{groupId:id}),testID:'group-open-events'},
    {id:'night',label:copy('groups.propose'),icon:CalendarDays,nativeImage:Platform.OS==='ios'?'calendar.badge.plus':undefined,onPress:()=>navigation.navigate('GroupNewOuting',{groupId:id}),testID:'group-open-night'}
   ]}/><GlassInputSurface testID="group-composer-surface" style={{flex:1,minWidth:0,minHeight:44,maxHeight:maxComposerHeight,borderRadius:22,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.line}}>
    <GroupComposerInput variant="bare" focusOwner="container" multiline scrollEnabled={composerHeight>=maxComposerHeight} testID="group-composer" accessibilityLabel={copy('groups.message')} placeholder={copy('groups.message')} value={model.drafts[id]??''} onChangeText={text=>model.store.draft(id,text)} onContentSizeChange={e=>setComposerHeight(Math.max(44,Math.min(maxComposerHeight,e.nativeEvent.contentSize.height)))} style={{minHeight:44,height:composerHeight,maxHeight:maxComposerHeight,paddingLeft:14,paddingRight:48,paddingVertical:11,fontSize:16,lineHeight:22,color:colors.text,backgroundColor:'transparent'}} maxLength={2000}/>
    {!!model.drafts[id]?.trim()&&<AccentPressable testID="group-send" nativePressEffect={false} fallback={Pressable} accessibilityRole="button" accessibilityLabel={copy('groups.send')} accessibilityState={{disabled:model.busy,busy:model.busy}} disabled={model.busy} hitSlop={6} onPress={()=>void sendMessage()} style={({pressed})=>({position:'absolute',right:6,bottom:6,width:32,height:32,borderRadius:16,backgroundColor:colors.accent,alignItems:'center',justifyContent:'center',opacity:pressed?.76:1})}>{model.busy?<ActivityIndicator testID="group-send-loader" size="small" color={colors.onAction}/>:<ArrowUp testID="group-send-arrow" size={19} color={colors.onAction}/>}</AccentPressable>}
   </GlassInputSurface></View></GroupComposerDock>
  </>}

  {ticketPlan&&model.user&&<PlanTicketRecipients plan={ticketPlan} actor={model.user.id} draftRef={recipientDraft} pendingInvitations={group.members.filter(member=>member.status==='pending').length} onClose={()=>setTicketPlanId(undefined)} onReviewSelection={()=>void model.store.loadPlan(id,ticketPlan.id)} onRecoverCheckout={orderId=>reservation.resume(orderId)}/>}
 </View></GroupChatKeyboardProvider>
}
