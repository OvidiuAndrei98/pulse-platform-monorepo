import React,{memo,useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ActivityIndicator,FlatList,Platform,Pressable,ScrollView,View,useWindowDimensions,type FlatListInstance,type ScrollViewProps} from 'react-native';
import {useNavigation,useIsFocused} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ArrowUp,BellOff,CalendarDays,Check,Images,Plus,UsersRound} from 'lucide-react-native';
import {GROUP_MEMBER_LIMIT,findMatchingFriendGroup,groupMembershipCounts,preferredGroupOuting,type FriendGroup,type GroupMessage,type SharedEvent} from '@packages/app-core/social/groups';
import {planningCityKey,planningToday,type OutingPlan} from '@packages/app-core/outings/model';
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
import {GroupOutingCard} from './GroupOutingCard';
import {ConversationRow,GroupAvatar,EventPreview,OutingSummary,MessageMeta} from './GroupContent';
import {conversationTitle,relatedEventOuting} from '@packages/app-core/social/groupPresentation';
import {groupStyles as s} from './groupStyles';
export {groupStyles} from './groupStyles';
import {GlassInputSurface} from '../ui/GlassInputSurface';
import {GroupChatKeyboardProvider,GroupChatScrollView,GroupComposerDock} from './GroupChatKeyboard';
import {AccentPressable} from '../ui/AccentPressable';
import {distanceFromLatest} from './groupChatGeometry';

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

const Message=memo(function Message({message,mine,showAuthor,onEvent,onOuting,onPropose,action,outing,group,actor,onRespond,onToggle,getError,busy}:{message:GroupMessage;mine:boolean;showAuthor:boolean;onEvent:(id:string)=>void;onOuting:(id:string)=>void;onPropose:(event:SharedEvent)=>void;action:string;outing?:OutingPlan;group:FriendGroup;actor?:string;onRespond:(p:OutingPlan,answer:'yes'|'no')=>Promise<unknown>;onToggle:(p:OutingPlan,eventId:string,selected:boolean)=>Promise<unknown>;getError:()=>string|null|undefined;busy:boolean}){
 const {copy,language}=usePreferences('copy'),time=new Date(message.createdAt).toLocaleTimeString(language,{hour:'2-digit',minute:'2-digit'});
 const meta=<MessageMeta testID={!mine?'group-received-time-'+message.id:undefined} time={time} mine={mine}/>;
 return <View testID={'group-message-'+message.id} style={s.message}>
  {(showAuthor||message.kind==='outing')&&!mine&&<View style={[s.row,{gap:8,marginBottom:8}]}><MemberAvatar name={message.username} uri={message.avatarUrl} userId={message.senderId} size={24}/><Text style={[s.muted,{flex:1}]}>{message.username}</Text></View>}
  {message.kind==='outing'&&message.outingId?<View style={{maxWidth:560,width:'100%',alignSelf:mine?'flex-end':'flex-start'}}><GroupOutingCard plan={outing} group={group} message={message} actor={actor} busy={busy} onRespond={onRespond} onToggle={onToggle} getError={getError} onOpen={()=>onOuting(message.outingId!)} onEvent={onEvent}/>{meta}</View>:message.kind==='event'?<View style={{width:'100%',maxWidth:400,alignSelf:mine?'flex-end':'flex-start'}}>
   {message.event?<EventPreview variant="media" title={message.event.title} imageUrl={message.event.imageUrl} startTime={message.event.startTime} location={message.event.location} city={message.event.city} onPress={()=>onEvent(message.event!.id)}>
    {!!message.content&&<Text style={[s.body,{marginBottom:8}]}>{message.content}</Text>}
    {Date.parse(message.event.endTime)>Date.now()&&message.event.status==='published'?<View {...(Platform.OS==='web'?{dataSet:{eventId:message.event.id}}:{})} testID={'group-event-action-'+message.event.id}><ActionButton testID="group-create-outing" title={copy(action)} size="compact" tone="ghost" disabled={busy} onPress={()=>onPropose(message.event!)}/></View>:<Text style={s.muted}>{copy(message.event.status==='cancelled'?'groups.cancelled':'groups.completed')}</Text>}
   </EventPreview>:<View style={s.bubble}><Text style={s.muted}>{copy('groups.eventUnavailable')}</Text></View>}{meta}
  </View>:<><View testID={'group-bubble-'+message.id} style={[s.bubble,mine&&s.mine]}><Text style={s.body}>{message.content}</Text></View>{meta}</>}
 </View>;
});
export function FriendGroupScreen({id}:{id:string}){
 const model=useGroups(id),{copy,language}=usePreferences(),navigation=useNavigation<any>(),safe=useSafeAreaInsets(),focused=useIsFocused();
 const group=model.groups.find(g=>g.id===id),messages=model.messages[id]??[],list=useRef<FlatListInstance>(null),nearBottom=useRef(true),read=useRef(0),[newMessages,setNewMessages]=useState(false);
 const [pinned,setPinned]=useState('');
 const [composerHeight,setComposerHeight]=useState(44);
 const {width,height}=useWindowDimensions();
 const maxComposerHeight=Math.max(132,Math.min(220,Math.round(height*.27)));
 useEffect(()=>{setComposerHeight(value=>Math.min(value,maxComposerHeight))},[maxComposerHeight]);
 const composerInset=Math.max(12,safe.bottom);
 const viewportInset=useRef(0),followLatest=useRef(false),previousLatest=useRef(0);
 const scope=id+':'+model.user?.id+':'+group?.joinedAt+':'+group?.visibleAfterSeq,currentScope=useRef(scope);currentScope.current=scope;
 // KeyboardChatScrollView reserves composer + keyboard space in contentInset.top.
 // The latest inverted position is -inset, not zero. Native MVCP's optional
 // autoscroll always targets zero and therefore fights this reservation.
 const scrollLatest=useCallback((animated=false)=>{list.current?.scrollToOffset({offset:Platform.OS==='web'?0:-Math.max(0,viewportInset.current),animated})},[]);
 const updateViewportInset=useCallback((top:number)=>{viewportInset.current=top;if(followLatest.current)scrollLatest()},[scrollLatest]);
 const finishLatestLayout=useCallback(()=>{if(followLatest.current){followLatest.current=false;scrollLatest()}},[scrollLatest]);
 const chatScroll=useCallback((props:ScrollViewProps)=><GroupChatScrollView {...props} bottomInset={composerInset} onViewportInset={updateViewportInset}/>,[composerInset,updateViewportInset]);
 useLayoutEffect(()=>{read.current=0;nearBottom.current=true;previousLatest.current=0;followLatest.current=false;setPinned('');setNewMessages(false);setComposerHeight(44)},[scope]);
 useLayoutEffect(()=>{
  const latest=messages[0];if(!latest||latest.seq<=previousLatest.current)return;
  previousLatest.current=latest.seq;
  // Preserve the visible history anchor for incoming messages. New inserts at
  // the end, and our own sends, follow once now and again after native layout.
  if(nearBottom.current||latest.senderId===model.user?.id){followLatest.current=true;scrollLatest()}
 },[scope,messages[0]?.seq,model.user?.id,scrollLatest]);
 const sendMessage=async()=>{
  const sentScope=currentScope.current,result=await model.store.send(id);
  if(result&&currentScope.current===sentScope){followLatest.current=true;scrollLatest();setNewMessages(false)}
 };
 const relevant=group?.outings.find(p=>p.id===pinned)??preferredGroupOuting(group?.outings??[]);
 useEffect(()=>{if(!pinned&&relevant)setPinned(relevant.id)},[relevant?.id,pinned]);
 useEffect(()=>{if(!group||!focused||group.status!=='accepted')return;const received=messages[0]?.seq??0;if(messages[0]?.senderId===model.user?.id){setNewMessages(false);return}if(nearBottom.current&&received>read.current){read.current=received;void model.store.read(id,received)}else if(received>read.current)setNewMessages(true)},[group?.lastSeq,messages[0]?.seq,focused,id,model.store]);
 const activeNavigation=useRef(focused);activeNavigation.current=focused;
 useEffect(()=>{activeNavigation.current=focused;return()=>{activeNavigation.current=false}},[focused]);
 const openOuting=(planId:string)=>{if(!activeNavigation.current)return;setPinned(planId);navigation.navigate('GroupOuting',{groupId:id,planId})};
 const match=(event:SharedEvent)=>group?.outings.find(p=>!['completed','cancelled'].includes(p.lifecycle??'')&&p.outingDate===planningToday(new Date(event.startTime))&&planningCityKey(p.city)===planningCityKey(event.city));
 const propose=async(event:SharedEvent)=>{const associated=group&&relatedEventOuting(group,event.id);if(associated){openOuting(associated.id);return}const existing=match(event);if(existing){if(!existing.options.some(o=>o.eventId===event.id)&&await model.store.planAction(id,existing.id,'proposals',{eventId:event.id,revision:existing.revision})===undefined)return;openOuting(existing.id)}else{const plan=await model.store.createOuting(id,{eventId:event.id});if(plan){if(!plan.options.some(option=>option.eventId===event.id)&&!await model.store.planAction(id,plan.id,'proposals',{eventId:event.id,revision:plan.revision}))return;openOuting(plan.id)}}};
 const back=()=>navigation.canGoBack()?navigation.goBack():navigation.navigate('Tabs',{screen:'Friends'});
 if(!model.ready||!group&&model.loading)return <View style={[s.root,{paddingTop:safe.top}]}><Loading/></View>;
 if(!group||model.revoked.includes(id))return <View style={[s.root,{paddingTop:safe.top}]}><View style={s.header}><GroupBack onPress={back}/><Text style={s.title}>{copy('groups.title')}</Text></View><Feedback title={copy(model.error??'groups.accessLost')} retry={()=>void model.store.load(id)}/></View>;
 return <GroupChatKeyboardProvider bottomInset={composerInset}><View testID="friend-group" style={[s.root,{paddingTop:safe.top}]}>
  <View style={s.header}><GroupBack onPress={back}/><OutingPressable accessibilityLabel={copy('groups.info')} style={[s.row,{flex:1,minWidth:0,gap:8}]} onPress={()=>navigation.navigate('GroupInfo',{groupId:id})}><GroupAvatar group={group} size={40}/><View style={{flex:1,minWidth:0,gap:2}}><Text accessibilityRole="header" numberOfLines={1} style={s.heading}>{conversationTitle(group,model.user?.id)}</Text><Text numberOfLines={1} style={s.caption}>{copy('groups.members',{count:groupMembershipCounts(group).accepted})}{groupMembershipCounts(group).pending>0?' · '+copy('groups.invitedCount',{count:groupMembershipCounts(group).pending}):''}</Text></View></OutingPressable><GroupMenu testID="group-menu" label={copy('groups.settings')} disabled={group.status!=='accepted'} items={[
   {id:'members',label:copy('groups.info'),icon:UsersRound,nativeImage:Platform.OS==='ios'?'person.2':undefined,onPress:()=>navigation.navigate('GroupInfo',{groupId:id}),testID:'group-menu-members'},
   {id:'mute',label:copy(group.muted?'groups.unmute':'groups.mute'),icon:BellOff,nativeImage:Platform.OS==='ios'?'bell.slash':undefined,disabled:model.busy,onPress:()=>void model.store.action(id,{action:'mute',muted:!group.muted})}
  ]}/></View>
  {group.status==='pending'?<ScrollView contentContainerStyle={s.page}><Text style={s.title}>{copy('groups.invited')}</Text><View style={s.row}>{group.members.map(m=><MemberAvatar key={m.userId} name={m.username} uri={m.avatarUrl} userId={m.userId}/>)}</View><Text style={s.muted}>{copy('groups.privacy')}</Text><ActionButton title={copy('groups.accept')} testID="group-accept" busy={model.busy} onPress={()=>void model.store.action(id,{action:'accept'})}/><ActionButton title={copy('groups.decline')} tone="ghost" onPress={()=>void model.store.action(id,{action:'decline'}).then(ok=>{if(ok)back()})}/></ScrollView>:<>
   {relevant&&<View style={[s.summary,{width:Math.min(720,width-40),alignSelf:'center'}]}><OutingSummary plan={relevant} compact testID="group-summary" onPress={()=>openOuting(relevant.id)}/></View>}
   <FlatList ref={list} testID="group-messages" data={messages} inverted renderScrollComponent={chatScroll} keyExtractor={m=>m.id} initialNumToRender={16} maxToRenderPerBatch={10} windowSize={7} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" maintainVisibleContentPosition={{minIndexForVisible:0}} contentContainerStyle={{paddingTop:14,paddingBottom:16,flexGrow:1}}
    onContentSizeChange={finishLatestLayout} onScrollBeginDrag={()=>{followLatest.current=false}}
    onScroll={e=>{nearBottom.current=distanceFromLatest(e.nativeEvent.contentOffset.y,Platform.OS==='web'?0:viewportInset.current)<70;if(nearBottom.current){setNewMessages(false);const received=messages[0]?.seq??0;if(received>read.current){read.current=received;void model.store.read(id,received)}}}} scrollEventThrottle={64}
    ListEmptyComponent={<View style={[s.page,{transform:[{scaleY:-1}]}]}><Text style={s.muted}>{copy('groups.empty')}</Text><ActionButton title={copy('groups.share')} onPress={()=>navigation.navigate('GroupEventPicker',{groupId:id})}/></View>}
    ListFooterComponent={model.more[id]?<ActionButton title={copy('groups.older')} tone="ghost" onPress={()=>void model.store.loadMessages(id,true)}/>:undefined}
    renderItem={({item,index})=>{const associated=item.event?relatedEventOuting(group,item.event.id):undefined,existing=item.event?match(item.event):undefined;return <Message message={item} mine={item.senderId===model.user?.id} showAuthor={messages[index+1]?.senderId!==item.senderId} onEvent={event=>navigation.navigate('Event',{id:event})} onOuting={openOuting} onPropose={event=>void propose(event)} action={associated?'groups.viewOuting':existing?.chosenEventId?'groups.alternative':'groups.proposeForOuting'} outing={group.outings.find(p=>p.id===item.outingId)} group={group} actor={model.user?.id} busy={model.busy} getError={()=>model.store.getSnapshot().error} onRespond={(plan,answer)=>model.store.planAction(id,plan.id,'attendance',{answer,decisionRound:plan.decisionRound},{feedback:'inline'})} onToggle={(plan,eventId,selected)=>model.store.planAction(id,plan.id,'vote',{eventId,...(selected?{answer:'yes'}:{remove:true}),revision:plan.revision},{feedback:'inline'})}/>}}/>
   <GroupComposerDock bottomInset={composerInset}>
   {newMessages&&<ActionButton testID="group-new-messages" title={copy('groups.newMessages')} size="compact" tone="secondary" onPress={()=>{scrollLatest(true);setNewMessages(false)}}/>}
   {(model.error||model.sendError)&&<View style={{paddingHorizontal:20}}><Text accessibilityRole="alert" style={[s.muted,{color:colors.danger}]}>{copy(model.sendError??model.error!)}</Text></View>}
   <View testID="group-composer-row" style={[s.composer,{paddingBottom:composerInset}]}><GroupMenu testID="group-add" label={copy('groups.plus')} icon={Plus} items={[
    {id:'event',label:copy('groups.share'),icon:Images,nativeImage:Platform.OS==='ios'?'photo':undefined,onPress:()=>navigation.navigate('GroupEventPicker',{groupId:id}),testID:'group-open-events'},
    {id:'night',label:copy('groups.propose'),icon:CalendarDays,nativeImage:Platform.OS==='ios'?'calendar.badge.plus':undefined,onPress:()=>navigation.navigate('GroupNewOuting',{groupId:id}),testID:'group-open-night'}
   ]}/><GlassInputSurface testID="group-composer-surface" style={{flex:1,minWidth:0,minHeight:44,maxHeight:maxComposerHeight,borderRadius:22,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.line}}>
    <GroupComposerInput variant="bare" focusOwner="container" multiline scrollEnabled={composerHeight>=maxComposerHeight} testID="group-composer" accessibilityLabel={copy('groups.message')} placeholder={copy('groups.message')} value={model.drafts[id]??''} onChangeText={text=>model.store.draft(id,text)} onContentSizeChange={e=>setComposerHeight(Math.max(44,Math.min(maxComposerHeight,e.nativeEvent.contentSize.height)))} style={{minHeight:44,height:composerHeight,maxHeight:maxComposerHeight,paddingLeft:14,paddingRight:48,paddingVertical:11,fontSize:16,lineHeight:22,color:colors.text,backgroundColor:'transparent'}} maxLength={2000}/>
    {!!model.drafts[id]?.trim()&&<AccentPressable testID="group-send" nativePressEffect={false} fallback={Pressable} accessibilityRole="button" accessibilityLabel={copy('groups.send')} accessibilityState={{disabled:model.busy,busy:model.busy}} disabled={model.busy} hitSlop={6} onPress={()=>void sendMessage()} style={({pressed})=>({position:'absolute',right:6,bottom:6,width:32,height:32,borderRadius:16,backgroundColor:colors.accent,alignItems:'center',justifyContent:'center',opacity:pressed?.76:1})}>{model.busy?<ActivityIndicator testID="group-send-loader" size="small" color={colors.onAction}/>:<ArrowUp testID="group-send-arrow" size={19} color={colors.onAction}/>}</AccentPressable>}
   </GlassInputSurface></View></GroupComposerDock>
  </>}

 </View></GroupChatKeyboardProvider>
}
