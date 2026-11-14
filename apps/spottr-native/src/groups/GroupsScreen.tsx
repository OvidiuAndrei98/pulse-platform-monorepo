import React,{memo,useEffect,useRef,useState} from 'react';
import {FlatList,KeyboardAvoidingView,Platform,ScrollView,StyleSheet,View,useWindowDimensions,type FlatListInstance} from 'react-native';
import {useNavigation,useIsFocused} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ArrowUp,Check,ChevronRight,MoreHorizontal,Plus,UsersRound} from 'lucide-react-native';
import {GROUP_MEMBER_LIMIT,preferredGroupOuting,groupReadinessLabel,type FriendGroup,type GroupMessage,type SharedEvent} from '@packages/app-core/social/groups';
import {matchesPlanningContext,planningToday,type OutingPlan} from '@packages/app-core/outings/model';
import {outingDate} from '@packages/app-core/outings/presentation';
import {useGroups} from './useGroups';
import {Text} from '../ui/Text';
import {ActionButton} from '../ui/ActionButton';
import {GlassPressable} from '../ui/GlassPressable';
import {FormInput,formStyles} from '../ui/FormInput';
import {AppModal} from '../ui/AppModal';
import {EventImage,Feedback,Loading} from '../ui/common';
import {FormScrollView} from '../ui/KeyboardForms';
import {MemberAvatar,OutingPressable} from '../outings/OutingPrimitives';
import {usePreferences} from '../usePreferences';
import {formatDate} from '../data/events';
import {colors} from '../ui/theme';
import {ActionIcon} from '../ui/ActionIcon';
import {GroupNightForm} from './GroupNightForm';

export const groupStyles=StyleSheet.create({
 root:{flex:1,backgroundColor:colors.bg},page:{padding:20,gap:24,maxWidth:760,width:'100%',alignSelf:'center'},
 header:{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:20,paddingVertical:12,minHeight:68,width:'100%',maxWidth:760,alignSelf:'center'},title:{fontSize:21,lineHeight:28,fontWeight:'600',color:colors.text,letterSpacing:-.5},
 heading:{fontSize:18,lineHeight:25,fontWeight:'600',color:colors.text},body:{fontSize:15,lineHeight:22,color:colors.text},muted:{fontSize:13,lineHeight:19,color:colors.muted},row:{flexDirection:'row',gap:12,alignItems:'center'},
 circle:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:colors.raised},line:{height:1,backgroundColor:colors.line},
 bubble:{maxWidth:'88%',alignSelf:'flex-start',backgroundColor:colors.raised,borderRadius:20,borderTopLeftRadius:5,padding:14,gap:8},mine:{alignSelf:'flex-end',backgroundColor:'#25131b',borderTopLeftRadius:20,borderTopRightRadius:5},
 summary:{marginHorizontal:20,paddingVertical:12,paddingHorizontal:14,minHeight:68,flexDirection:'row',gap:12,alignItems:'center',backgroundColor:colors.surface,borderRadius:20},
 message:{paddingHorizontal:20,paddingTop:10,paddingBottom:4,width:'100%',maxWidth:760,alignSelf:'center'},composer:{paddingHorizontal:16,paddingTop:10,flexDirection:'row',gap:8,alignItems:'flex-end',backgroundColor:colors.bg,width:'100%',maxWidth:760,alignSelf:'center'},
 field:{flex:1,minHeight:44,maxHeight:120,paddingVertical:11},empty:{gap:14,paddingVertical:36},tag:{backgroundColor:colors.accent,width:7,height:7,borderRadius:4},
 eventImage:{width:'100%',aspectRatio:1.9,borderRadius:15},eventRow:{gap:10,paddingVertical:10,flexDirection:'row',alignItems:'center'},
});
const s=groupStyles;
export function GroupBack({onPress,testID}:{onPress:()=>void;testID?:string}){const {copy}=usePreferences('copy');return <GlassPressable testID={testID} accessibilityRole="button" accessibilityLabel={copy('common.back')} onPress={onPress} style={s.circle}><ActionIcon name="back" size={22} color={colors.text}/></GlassPressable>}
export function GroupRow({group,onPress}:{group:FriendGroup;onPress:()=>void}){
 const {copy}=usePreferences('copy');return <OutingPressable testID={'group-row-'+group.id} onPress={onPress} style={[s.row,{paddingVertical:16}]}>
  <View style={{width:54,height:54,justifyContent:'center',alignItems:'center'}}>{group.members.slice(0,2).map((m,i)=><View key={m.userId} style={{position:'absolute',left:i?20:0,top:i?19:0}}><MemberAvatar name={m.username} uri={m.avatarUrl} userId={m.userId} size={35}/></View>)}</View>
  <View style={{flex:1,gap:4}}><Text numberOfLines={1} style={s.heading}>{group.name}</Text><Text numberOfLines={2} style={[s.muted,group.status==='pending'&&{color:colors.accent}]}>{group.status==='pending'?copy('groups.invited'):group.preview||copy('groups.empty')}</Text></View>
  {group.unread>0&&group.status==='accepted'&&<View style={{minWidth:22,height:22,borderRadius:11,backgroundColor:colors.accent,alignItems:'center',justifyContent:'center',paddingHorizontal:6}}><Text style={{color:'white',fontSize:11}}>{group.unread>99?'99+':group.unread}</Text></View>}<ChevronRight size={17} color={colors.muted}/>
 </OutingPressable>
}
export function GroupsScreen({eventId,newGroup=false}:{eventId?:string;newGroup?:boolean}){
 const model=useGroups(),{copy}=usePreferences(),safe=useSafeAreaInsets(),navigation=useNavigation<any>();
 const [creating,setCreating]=useState(newGroup),[name,setName]=useState(''),[ids,setIds]=useState<string[]>([]),[sent,setSent]=useState(false);
 useEffect(()=>{if(creating)void model.store.catalog()},[creating,model.store]);
 const open=(id:string)=>navigation.navigate('FriendGroup',{id});
 const send=async(id:string)=>{if(eventId){if(await model.store.send(id,eventId))setSent(true)}else open(id)};
 const title=eventId?'groups.sendTo':'groups.title';
 return <View testID="groups-screen" style={[s.root,{paddingTop:safe.top}]}>
  <View style={s.header}><GroupBack onPress={()=>creating?setCreating(false):navigation.canGoBack()?navigation.goBack():navigation.navigate('Tabs',{screen:'Friends'})}/><Text accessibilityRole="header" style={[s.title,{flex:1}]}>{copy(creating?'groups.create':title)}</Text>{!creating&&model.user&&<ActionButton accessibilityLabel={copy('groups.create')} testID="groups-new" icon={<Plus size={20}/>} style={{width:44,paddingHorizontal:0}} tone="secondary" onPress={()=>setCreating(true)}/>}</View>
  <FormScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.page,{paddingBottom:safe.bottom+32}]}>
   {!model.ready||model.loading&&model.user?<Loading/>:!model.user?<><Text style={s.muted}>{copy('groups.sessionEnded')}</Text><ActionButton title={copy('social.signIn')} onPress={()=>navigation.navigate('Auth',{returnTab:'Friends'})}/></>:creating?<>
    <FormInput testID="group-name" accessibilityLabel={copy('groups.name')} placeholder={copy('groups.name')} value={name} onChangeText={setName} maxLength={80}/><Text style={s.heading}>{copy('groups.friends')}</Text>
    {model.catalogLoading?<Loading/>:model.friends.map(friend=><OutingPressable key={friend.id} testID={'group-friend-'+friend.id} accessibilityRole="checkbox" accessibilityState={{checked:ids.includes(friend.id)}} onPress={()=>setIds(old=>old.includes(friend.id)?old.filter(id=>id!==friend.id):old.length<GROUP_MEMBER_LIMIT-1?[...old,friend.id]:old)} style={[s.row,{minHeight:60}]}><MemberAvatar name={friend.username} uri={friend.avatarUrl} userId={friend.id}/><Text style={[s.body,{flex:1}]}>{friend.username}</Text>{ids.includes(friend.id)&&<Check size={20} color={colors.accent}/>}</OutingPressable>)}
    {!model.catalogLoading&&!model.friends.length&&<Text style={s.muted}>{copy('groups.noFriends')}</Text>}
    <Text style={s.muted}>{copy('groups.privacy')}</Text>
    <ActionButton testID="group-create" title={copy(eventId?'groups.quick':'groups.create')} busy={model.busy} disabled={!ids.length} onPress={()=>void model.store.create(name.trim()||[model.user?.username,...model.friends.filter(f=>ids.includes(f.id)).map(f=>f.username)].filter(Boolean).join(', ').slice(0,80),ids,eventId).then(group=>{if(!group)return;setCreating(false);open(group.id)})}/>
   </>:<>
    {sent&&<View style={{gap:12}}><Text accessibilityRole="alert" style={s.body}>{copy('groups.sent')}</Text><ActionButton title={copy('common.back')} tone="secondary" onPress={()=>navigation.goBack()}/></View>}
    {model.groups.filter(g=>!eventId||g.status==='accepted').map(group=><GroupRow key={group.id} group={group} onPress={()=>void send(group.id)}/>)}
    {!model.groups.length&&<View style={s.empty}><UsersRound size={32} color={colors.accent}/><Text style={s.title}>{copy('groups.newGroup')}</Text><Text style={s.muted}>{copy('groups.empty')}</Text><ActionButton title={copy('groups.create')} onPress={()=>setCreating(true)}/></View>}
   </>}
   {model.error&&<Feedback compact title={copy(model.error)} retry={()=>void model.store.load()}/>}
  </FormScrollView>
 </View>
}

export function EventChooser({model,onSelect,plan}:{model:ReturnType<typeof useGroups>;onSelect:(id:string)=>void;plan?:OutingPlan}){
 const {copy}=usePreferences(),[q,setQ]=useState(''),[page,setPage]=useState(1);
 useEffect(()=>{const timer=setTimeout(()=>{setPage(1);void model.store.catalog(q,plan?{date:plan.outingDate,city:plan.city}:undefined)},220);return()=>clearTimeout(timer)},[q,plan?.id,plan?.outingDate,plan?.city,model.store]);
 const events=model.events.filter(event=>!plan||matchesPlanningContext(event,plan));
 return <View style={{gap:14}}><FormInput accessibilityLabel={copy('groups.search')} testID="group-event-search" placeholder={copy('groups.search')} value={q} onChangeText={setQ}/>
  {model.catalogLoading&&<Loading/>}{events.map(event=>{const added=plan?.options.some(o=>o.eventId===event.id);return <OutingPressable testID={'group-send-event-'+event.id} key={event.id} accessibilityState={{disabled:added||model.busy||!!plan&&plan.options.length>=8}} disabled={added||model.busy||!!plan&&plan.options.length>=8} onPress={()=>onSelect(event.id)} style={s.eventRow}><EventImage uri={event.bannerUrl} style={{width:58,height:68,borderRadius:12}}/><View style={{flex:1,gap:5}}><Text style={s.heading}>{event.title}</Text><Text style={s.muted}>{added?copy('groups.added'):event.locationName}</Text></View>{added?<Check size={20} color={colors.accent}/>:<Plus size={20} color={colors.accent}/>}</OutingPressable>})}
  {!model.catalogLoading&&!events.length&&!model.error&&<Text style={s.muted}>{copy('outings.ui.searchEmpty')}</Text>}
  {model.catalogMore&&<ActionButton title={copy('outings.more')} tone="ghost" busy={model.catalogLoading} onPress={()=>{setPage(page+1);void model.store.catalog(q,plan?{date:plan.outingDate,city:plan.city}:undefined,page+1)}}/>}
 </View>
}

const Message=memo(function Message({message,mine,showAuthor,onEvent,onOuting,onPropose,action,outing,actor,onRespond,busy}:{message:GroupMessage;mine:boolean;showAuthor:boolean;onEvent:(id:string)=>void;onOuting:(id:string)=>void;onPropose:(event:SharedEvent)=>void;action:string;outing?:OutingPlan;actor?:string;onRespond:(p:OutingPlan,answer:string)=>void;busy:boolean}){
 const {copy,language}=usePreferences('copy');return <View testID={'group-message-'+message.id} style={s.message}>
  {showAuthor&&!mine&&<View style={[s.row,{gap:8,marginBottom:6}]}><MemberAvatar name={message.username} uri={message.avatarUrl} userId={message.senderId} size={24}/><Text style={s.muted}>{message.username}</Text></View>}
  <View style={[s.bubble,mine&&s.mine,message.kind!=='text'&&{width:'86%'}]}>
   {!!message.content&&<Text style={s.body}>{message.content}</Text>}
   {message.kind==='event'&&(message.event?<>
    <OutingPressable accessibilityLabel={message.event.title} onPress={()=>onEvent(message.event!.id)} style={{gap:10}}><EventImage uri={message.event.imageUrl} style={s.eventImage}/><Text style={s.heading}>{message.event.title}</Text><Text style={s.muted}>{formatDate(message.event.startTime,language,true)} · {message.event.location}</Text></OutingPressable>
    {Date.parse(message.event.endTime)>Date.now()&&message.event.status==='published'?<View {...(Platform.OS==='web'?{dataSet:{eventId:message.event.id}}:{})} testID={'group-event-action-'+message.event.id}><ActionButton testID="group-create-outing" title={copy(action)} size="compact" tone="secondary" onPress={()=>onPropose(message.event!)}/></View>:<Text style={s.muted}>{copy(message.event.status==='cancelled'?'groups.cancelled':'groups.completed')}</Text>}
   </>:<Text style={s.muted}>{copy('groups.eventUnavailable')}</Text>)}
   {message.kind==='outing'&&message.outingId&&<>
    <Text style={s.heading}>{outing?outingDate(outing.outingDate,language)||copy('groups.poll'):copy('groups.viewOuting')}</Text>
    {outing?.chosenEventId&&<Text style={s.body}>{outing.options.find(o=>o.eventId===outing.chosenEventId)?.title??copy('groups.eventUnavailable')}</Text>}
    {outing&&outing.lifecycle!=='completed'&&outing.lifecycle!=='cancelled'&&(outing.chosenEventId||outing.outingDate)&&<View style={[s.row,{gap:6,flexWrap:'wrap'}]}>{['yes','maybe','no'].map(answer=>{const current=outing.chosenEventId?outing.members.find(m=>m.userId===actor)?.attendance:outing.candidateDates?.find(d=>d.date===outing.outingDate)?.responses.find(r=>r.userId===actor)?.answer;return <ActionButton key={answer} size="compact" tone={current===answer?'primary':'secondary'} accessibilityRole="radio" accessibilityState={{checked:current===answer}} disabled={busy} title={copy(answer==='yes'&&!outing.chosenEventId?'groups.available':'groups.'+answer)} onPress={()=>onRespond(outing,answer)}/>})}</View>}
    <ActionButton title={copy('groups.viewOuting')} tone="ghost" size="compact" onPress={()=>onOuting(message.outingId!)}/>
   </>}
   <Text style={[s.muted,{fontSize:10,alignSelf:'flex-end'}]}>{new Date(message.createdAt).toLocaleTimeString(language,{hour:'2-digit',minute:'2-digit'})}</Text>
  </View>
 </View>
});

export function FriendGroupScreen({id}:{id:string}){
 const model=useGroups(id),{copy,language}=usePreferences(),navigation=useNavigation<any>(),safe=useSafeAreaInsets(),focused=useIsFocused();
 const group=model.groups.find(g=>g.id===id),messages=model.messages[id]??[],list=useRef<FlatListInstance>(null),nearBottom=useRef(true),read=useRef(0),[newMessages,setNewMessages]=useState(false);
 const [panel,setPanel]=useState<'plus'|'events'|'night'|'settings'|'outings'|'collection'|null>(null),[renamed,setRenamed]=useState(''),[pinned,setPinned]=useState('');
 const [composerHeight,setComposerHeight]=useState(44);
 const {width}=useWindowDimensions();
 useEffect(()=>{read.current=0;nearBottom.current=true;setPinned('');setNewMessages(false);setComposerHeight(44)},[id,model.user?.id,group?.joinedAt,group?.visibleAfterSeq]);
 const relevant=group?.outings.find(p=>p.id===pinned)??preferredGroupOuting(group?.outings??[]);
 useEffect(()=>{if(!pinned&&relevant)setPinned(relevant.id)},[relevant?.id,pinned]);
 useEffect(()=>{if(!group||!focused||group.status!=='accepted')return;const received=messages[0]?.seq??0;if(nearBottom.current&&received>read.current){read.current=received;void model.store.read(id,received)}else if(received>read.current)setNewMessages(true)},[group?.lastSeq,messages[0]?.seq,focused,id,model.store]);
 useEffect(()=>{if(panel==='settings'){setRenamed(group?.name??'');void model.store.catalog()}if(panel==='collection')void model.store.collection(id);if(panel==='outings')void model.store.loadHistory(id)},[panel,id,model.store]);
 const openOuting=(planId:string)=>{setPanel(null);setPinned(planId);navigation.navigate('GroupOuting',{groupId:id,planId})};
 const match=(event:SharedEvent)=>group?.outings.find(p=>p.outingDate===planningToday(new Date(event.startTime))&&p.city?.toLowerCase()===event.city.toLowerCase());
 const propose=async(event:SharedEvent)=>{const existing=match(event);if(existing){if(!existing.options.some(o=>o.eventId===event.id)&&await model.store.planAction(id,existing.id,'proposals',{eventId:event.id})===undefined)return;openOuting(existing.id)}else{const plan=await model.store.createOuting(id,{eventId:event.id});if(plan)openOuting(plan.id)}};
 const collection=[...new Map((model.collection[id]??[]).slice().reverse().map(m=>[m.eventId,m])).values()].sort((a,b)=>{const future=(m:GroupMessage)=>!!m.event&&Date.parse(m.event.endTime)>Date.now()&&m.event.status!=='cancelled';return Number(future(b))-Number(future(a))||(future(a)?1:-1)*((Date.parse(a.event?.startTime??'')||0)-(Date.parse(b.event?.startTime??'')||0))});
 const back=()=>navigation.canGoBack()?navigation.goBack():navigation.navigate('Tabs',{screen:'Friends'});
 if(!model.ready||!group&&model.loading)return <View style={[s.root,{paddingTop:safe.top}]}><Loading/></View>;
 if(!group||model.revoked.includes(id))return <View style={[s.root,{paddingTop:safe.top}]}><View style={s.header}><GroupBack onPress={back}/><Text style={s.title}>{copy('groups.title')}</Text></View><Feedback title={copy(model.error??'groups.accessLost')} retry={()=>void model.store.load(id)}/></View>;
 return <KeyboardAvoidingView testID="friend-group" behavior={Platform.OS==='ios'?'padding':undefined} style={[s.root,{paddingTop:safe.top}]}>
  <View style={s.header}><GroupBack onPress={back}/><OutingPressable style={{flex:1,gap:2}} onPress={()=>setPanel('settings')}><Text accessibilityRole="header" numberOfLines={1} style={s.title}>{group.name}</Text><Text style={s.muted}>{copy('groups.members',{count:group.members.filter(m=>m.status==='accepted').length})}</Text></OutingPressable><GlassPressable accessibilityRole="button" accessibilityLabel={copy('groups.settings')} onPress={()=>setPanel('settings')} style={s.circle}><MoreHorizontal size={23} color="white"/></GlassPressable></View>
  {group.status==='pending'?<ScrollView contentContainerStyle={s.page}><Text style={s.title}>{copy('groups.invited')}</Text><View style={s.row}>{group.members.map(m=><MemberAvatar key={m.userId} name={m.username} uri={m.avatarUrl} userId={m.userId}/>)}</View><Text style={s.muted}>{copy('groups.privacy')}</Text><ActionButton title={copy('groups.accept')} testID="group-accept" busy={model.busy} onPress={()=>void model.store.action(id,{action:'accept'})}/><ActionButton title={copy('groups.decline')} tone="ghost" onPress={()=>void model.store.action(id,{action:'decline'}).then(ok=>{if(ok)back()})}/></ScrollView>:<>
   {relevant?<OutingPressable testID="group-summary" style={[s.summary,{width:Math.min(720,width-40),alignSelf:'center'}]} onPress={()=>group.outings.filter(p=>!['completed','cancelled'].includes(p.lifecycle??'')).length>1?setPanel('outings'):openOuting(relevant.id)}><View style={{flex:1,gap:4}}><Text numberOfLines={1} style={s.body}>{outingDate(relevant.outingDate,language)} · {relevant.options.find(o=>o.eventId===relevant.chosenEventId)?.title??copy(relevant.outingDate?'groups.preparing':'groups.poll')}</Text><Text style={s.muted}>{relevant.chosenEventId?copy(groupReadinessLabel(relevant,model.user?.id),{confirmed:relevant.confirmedCount??0,ready:relevant.readyCount??0}):copy('outings.propose')}</Text></View><ChevronRight size={17} color={colors.muted}/></OutingPressable>:<ActionButton testID='group-open-night' title={copy('groups.propose')} tone="ghost" onPress={()=>setPanel('night')}/>}
   <FlatList ref={list} testID="group-messages" data={messages} inverted keyExtractor={m=>m.id} initialNumToRender={16} maxToRenderPerBatch={10} windowSize={7} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" maintainVisibleContentPosition={{minIndexForVisible:0,autoscrollToTopThreshold:50}} contentContainerStyle={{paddingTop:14,paddingBottom:16,flexGrow:1}}
    onScroll={e=>{nearBottom.current=e.nativeEvent.contentOffset.y<70;if(nearBottom.current){setNewMessages(false);const received=messages[0]?.seq??0;if(received>read.current){read.current=received;void model.store.read(id,received)}}}} scrollEventThrottle={64}
    ListEmptyComponent={<View style={[s.page,{transform:[{scaleY:-1}]}]}><Text style={s.muted}>{copy('groups.empty')}</Text><ActionButton title={copy('groups.share')} onPress={()=>setPanel('events')}/></View>}
    ListFooterComponent={model.more[id]?<ActionButton title={copy('groups.older')} tone="ghost" onPress={()=>void model.store.loadMessages(id,true)}/>:undefined}
    renderItem={({item,index})=>{const existing=item.event?match(item.event):undefined;return <Message message={item} mine={item.senderId===model.user?.id} showAuthor={messages[index+1]?.senderId!==item.senderId} onEvent={event=>navigation.navigate('Event',{id:event})} onOuting={openOuting} onPropose={event=>void propose(event)} action={!existing?'groups.letsGo':existing.chosenEventId===item.eventId?'groups.viewOuting':existing.options.some(o=>o.eventId===item.eventId)?'groups.added':existing.chosenEventId?'groups.alternative':'groups.addProposal'} outing={group.outings.find(p=>p.id===item.outingId)} actor={model.user?.id} busy={model.busy} onRespond={(plan,answer)=>void model.store.planAction(id,plan.id,plan.chosenEventId?'attendance':'availability',plan.chosenEventId?{answer,decisionRound:plan.decisionRound}:{date:plan.outingDate,answer})}/>}}/>
   {newMessages&&<ActionButton title={copy('groups.newMessages')} size="compact" tone="secondary" onPress={()=>{list.current?.scrollToOffset({offset:0,animated:true});setNewMessages(false)}}/>}
   {(model.error||model.sendError)&&<View style={{paddingHorizontal:20}}><Text accessibilityRole="alert" style={[s.muted,{color:colors.danger}]}>{copy(model.sendError??model.error!)}</Text></View>}
   <View style={[s.composer,{paddingBottom:Math.max(12,safe.bottom)}]}><ActionButton testID="group-add" tone="secondary" accessibilityLabel={copy('groups.plus')} icon={<Plus size={21}/>} onPress={()=>setPanel('plus')} style={{width:44,paddingHorizontal:0}}/><FormInput variant="bare" multiline scrollEnabled={composerHeight>=120} testID="group-composer" accessibilityLabel={copy('groups.message')} placeholder={copy('groups.message')} value={model.drafts[id]??''} onChangeText={text=>model.store.draft(id,text)} onContentSizeChange={e=>setComposerHeight(Math.max(44,Math.min(120,e.nativeEvent.contentSize.height)))} style={[formStyles.event,s.field,{height:composerHeight}]} maxLength={2000}/><ActionButton testID="group-send" accessibilityLabel={copy('groups.send')} busy={model.busy} disabled={!model.drafts[id]?.trim()} icon={<ArrowUp size={20}/>} onPress={()=>void model.store.send(id)} style={{width:44,paddingHorizontal:0}}/></View>
  </>}
  <AppModal open={panel!==null} title={copy(panel==='events'?'groups.share':panel==='night'?'groups.propose':panel==='outings'?'groups.outings':panel==='collection'?'groups.sentEvents':panel==='plus'?'groups.plus':'groups.settings')} onClose={()=>setPanel(null)}>
   {panel==='plus'&&<><ActionButton testID="group-open-events" title={copy('groups.share')} tone="secondary" onPress={()=>setPanel('events')}/><ActionButton testID='group-open-night' title={copy('groups.propose')} tone="secondary" onPress={()=>setPanel('night')}/></>}
   {panel==='events'&&<EventChooser model={model} onSelect={event=>void model.store.send(id,event).then(ok=>{if(ok)setPanel(null)})}/>}
   {panel==='night'&&<GroupNightForm model={model} groupId={id} onCreated={openOuting}/>}
   {panel==='outings'&&<>{['upcoming','history'].map(section=><View key={section} style={{gap:12}}><Text style={s.heading}>{copy('groups.'+section)}</Text>{group.outings.filter(p=>(p.lifecycle==='completed'||p.lifecycle==='cancelled')===(section==='history')).map(p=><ActionButton key={p.id} title={outingDate(p.outingDate,language)+' · '+(p.options.find(o=>o.eventId===p.chosenEventId)?.title??copy('groups.preparing'))} tone="secondary" onPress={()=>openOuting(p.id)}/>)}</View>)}{model.historyMore[id]&&<ActionButton title={copy('outings.more')} tone="ghost" onPress={()=>void model.store.loadHistory(id,true)}/>}</>}
   {panel==='collection'&&<>{collection.map(message=><OutingPressable key={message.id} onPress={()=>{setPanel(null);if(message.eventId)navigation.navigate('Event',{id:message.eventId})}} style={s.eventRow}><EventImage uri={message.event?.imageUrl} style={{width:56,height:64,borderRadius:12}}/><View style={{flex:1,gap:4}}><Text style={s.body}>{message.event?.title??copy('groups.eventUnavailable')}</Text><Text style={s.muted}>{message.username}</Text></View></OutingPressable>)}{model.collectionMore[id]&&<ActionButton title={copy('outings.more')} tone="ghost" onPress={()=>void model.store.collection(id,true)}/>}</>}
   {panel==='settings'&&<>
    <ActionButton title={copy('groups.outings')} tone="secondary" onPress={()=>setPanel('outings')}/><ActionButton title={copy('groups.sentEvents')} tone="secondary" onPress={()=>setPanel('collection')}/>
    {group.ownerId===model.user?.id&&<><FormInput accessibilityLabel={copy('groups.name')} value={renamed} onChangeText={setRenamed} maxLength={80}/><ActionButton title={copy('groups.rename')} tone="secondary" busy={model.busy} onPress={()=>void model.store.action(id,{action:'rename',name:renamed})}/></>}
    {group.members.map(m=><View key={m.userId} style={{gap:10}}><View style={s.row}><MemberAvatar name={m.username} uri={m.avatarUrl} userId={m.userId}/><Text style={[s.body,{flex:1}]}>{m.username}</Text>{m.status==='pending'&&<Text style={s.muted}>{copy('groups.pending')}</Text>}</View>{group.ownerId===model.user?.id&&m.userId!==model.user?.id&&<View style={s.row}>{m.status==='accepted'&&<ActionButton title={copy('groups.transfer')} tone="ghost" size="compact" busy={model.busy} onPress={()=>void model.store.action(id,{action:'transfer-admin',userId:m.userId})}/>}<ActionButton title={copy('groups.remove')} tone="ghost" size="compact" onPress={()=>void model.store.action(id,{action:'remove',userId:m.userId})}/></View>}</View>)}
    {group.ownerId===model.user?.id&&model.friends.filter(f=>!group.members.some(m=>m.userId===f.id)).map(f=><ActionButton key={f.id} title={copy('groups.invite')+' · '+f.username} tone="secondary" onPress={()=>void model.store.action(id,{action:'invite',userId:f.id})}/>)}
    <ActionButton title={copy(group.muted?'groups.unmute':'groups.mute')} tone="secondary" onPress={()=>void model.store.action(id,{action:'mute',muted:!group.muted})}/>
    <Text style={s.muted}>{copy('groups.privacy')}</Text><ActionButton title={copy('groups.leave')} tone="danger" onPress={()=>void model.store.action(id,{action:'leave'}).then(ok=>{if(ok)back()})}/>
   </>}
   {model.error&&<Text accessibilityRole="alert" style={[s.muted,{color:colors.danger}]}>{copy(model.error)}</Text>}
  </AppModal>
 </KeyboardAvoidingView>
}
