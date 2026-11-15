import React,{useEffect,useState} from 'react';
import {Platform,ScrollView,View} from 'react-native';
import {CalendarDays,ChevronRight,RotateCcw} from 'lucide-react-native';
import {useNavigation,useIsFocused} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {groupTicketLabel,groupReadinessLabel} from '@packages/app-core/social/groups';
import {useGroups} from './useGroups';
import {GroupBack,groupStyles as s} from './GroupsScreen';
import {usePreferences} from '../usePreferences';
import {MemberAvatar,OutingPressable} from '../outings/OutingPrimitives';
import {ActionButton} from '../ui/ActionButton';
import {GroupMenu} from './GroupMenu';
import {AttendanceResponse,EventPreference,ProposalPreview} from './GroupOutingCard';
import {EventPreview} from './GroupContent';
import {outingTitle,outingContextLabel} from '@packages/app-core/social/groupPresentation';
import {GroupNightSheet} from './GroupNightSheet';
import {AppModal} from '../ui/AppModal';
import {Text} from '../ui/Text';
import {Feedback,Loading} from '../ui/common';
import {colors} from '../ui/theme';
import {useTickets} from '../data/useTickets';
import {TicketSheet} from '../profile/TicketSheet';
import {PlanTicketRecipients} from '../outings/PlanTicketRecipients';
import {useOutings} from '../outings/useOutings';

export function GroupOutingScreen({groupId,planId}:{groupId:string;planId:string}){
 const model=useGroups(groupId),{copy,language}=usePreferences(),safe=useSafeAreaInsets(),navigation=useNavigation<any>(),focused=useIsFocused(),tickets=useTickets(focused,true),transfers=useOutings('transfers');
 const group=model.groups.find(g=>g.id===groupId),plan=group?.outings.find(p=>p.id===planId),[panel,setPanel]=useState<'confirm'|null>(null),[choice,setChoice]=useState(''),[choiceRevision,setChoiceRevision]=useState(0),[buying,setBuying]=useState(false),[qr,setQr]=useState('');
 const [editing,setEditing]=useState(false),[proposalLimit,setProposalLimit]=useState(3),[showAlternatives,setShowAlternatives]=useState(false);
 const edit=()=>setEditing(true);
 const back=()=>navigation.canGoBack()?navigation.goBack():navigation.navigate('FriendGroup',{id:groupId});
 const event=plan?.options.find(o=>o.eventId===plan.chosenEventId),ended=plan?.lifecycle==='completed',cancelled=plan?.lifecycle==='cancelled',mine=plan?.members.find(m=>m.userId===model.user?.id),owner=plan?.ownerId===model.user?.id;
 const owned=(tickets.data??[]).filter(t=>t.eventId===plan?.chosenEventId&&(!t.assignedRecipientId||t.assignedRecipientId===model.user?.id)&&!transfers.transfers.some(x=>x.ticketId===t.id&&x.senderId===model.user?.id&&x.status==='pending'));
 const incoming=transfers.transfers.find(t=>t.eventId===plan?.chosenEventId&&t.recipientId===model.user?.id&&t.status==='pending')??transfers.transfers.find(t=>t.eventId===plan?.chosenEventId&&t.recipientId===model.user?.id&&t.status==='expired'&&!!t.blockedReason);
 const receivable=incoming?.status==='pending'&&!incoming.blockedReason;
 const mutation=(action:string,body:Record<string,unknown>,inline=false)=>model.store.planAction(groupId,planId,action,{...body,...(['availability','date','vote','proposals','choose','remove-proposal'].includes(action)?{revision:body.revision??plan?.revision}:{})},inline?{feedback:'inline'}:undefined);
 useEffect(()=>{if(!model.loading&&!plan&&!model.error)void model.store.loadPlan(groupId,planId)},[model.loading,plan?.id,groupId,planId,model.store]);
 return <View testID="group-outing" style={[s.root,{paddingTop:safe.top}]}>
  <View style={s.header}><GroupBack testID="group-outing-back" onPress={back}/><View style={{flex:1,gap:3}}><Text accessibilityRole="header" style={s.title}>{plan?outingTitle(plan,language):copy('groups.viewOuting')}</Text>{plan?.city&&<Text style={s.muted}>{outingContextLabel(plan,language)}</Text>}</View>{plan&&owner&&!ended&&!cancelled&&plan.chosenEventId&&<GroupMenu testID="group-outing-menu" label={copy('groups.outingMenu')} items={[{id:'reopen',label:copy('groups.reopen'),icon:RotateCcw,nativeImage:Platform.OS==='ios'?'arrow.counterclockwise':undefined,disabled:model.busy,onPress:()=>void mutation('reopen',{revision:plan.revision,reason:'other'}),testID:'group-menu-reopen'}]}/>}</View>
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.page,{paddingBottom:safe.bottom+32}]}>
   {!plan&&!model.error?<Loading/>:!plan?<Feedback title={copy(model.error??'groups.accessLost')} retry={()=>void model.store.load(groupId)}/>:<>
    {owner&&!ended&&!cancelled&&<OutingPressable testID="group-edit-context" onPress={()=>edit()} style={[s.row,{alignSelf:'flex-start',minHeight:44}]}><CalendarDays size={17} color={colors.accent}/><Text style={s.body}>{copy('groups.editOuting')}</Text><ChevronRight size={16} color={colors.muted}/></OutingPressable>}
    {model.error&&<Feedback compact title={copy(model.error)} retry={()=>void model.store.load(groupId)}/>}
    {!plan.outingDate?<>
     <Text style={s.heading}>{copy('groups.chooseNight')}</Text><Text style={s.muted}>{copy(owner?'groups.chooseNightContext':'groups.creatorChoosingNight')}</Text>
    </>:!plan.chosenEventId?<>
     <View style={{gap:8}}><Text style={s.heading}>{copy('groups.compareNight',{day:new Intl.DateTimeFormat(language==='ro'?'ro-RO':'en-GB',{weekday:'long',timeZone:'UTC'}).format(new Date(plan.outingDate+'T12:00:00Z'))})}</Text><Text style={s.muted}>{copy(plan.options.length?'outings.v2.yourPreference':'outings.v2.noProposalsHint')}</Text></View>
     {plan.options.slice(0,proposalLimit).map(option=><View testID={'group-proposal-'+option.eventId} key={option.eventId} style={{gap:12,paddingBottom:16,borderBottomWidth:1,borderBottomColor:colors.line}}><ProposalPreview plan={plan} eventId={option.eventId} onOpen={()=>navigation.navigate('Event',{id:option.eventId})}/>
      <View style={{gap:12}}><EventPreference plan={plan} group={group} actor={model.user?.id} eventId={option.eventId} busy={model.busy} getError={()=>model.store.getSnapshot().error} onToggle={selected=>mutation('vote',{eventId:option.eventId,...(selected?{answer:'yes'}:{remove:true})},true)} testID={'group-preference-'+option.eventId}/>
      {owner&&option.available&&!ended&&!cancelled&&<ActionButton testID={'group-choose-'+option.eventId} title={copy('groups.choose')} tone="secondary" disabled={model.busy} onPress={()=>{setChoice(option.eventId);setChoiceRevision(plan.revision??0);setPanel('confirm')}}/>}
      {!ended&&!cancelled&&(owner||option.proposedBy===model.user?.id)&&<ActionButton title={copy('groups.remove')} tone="ghost" size="compact" disabled={model.busy} onPress={()=>void mutation('remove-proposal',{eventId:option.eventId})}/>}</View>
     </View>)}
     {plan.options.length>proposalLimit&&<ActionButton testID="group-more-proposals" title={copy('outings.more')} tone="ghost" onPress={()=>setProposalLimit(plan.options.length)}/>}
     {!ended&&!cancelled&&<ActionButton testID="group-empty-propose" title={copy('groups.proposeEvent')} tone={plan.options.length?'secondary':'primary'} onPress={()=>navigation.navigate('GroupEventPicker',{groupId,planId})}/>}
    </>:<>
     <EventPreview title={event?.title??copy('groups.eventUnavailable')} imageUrl={event?.imageUrl} startTime={event?.startTime} location={event?.location} city={plan.city} onPress={()=>navigation.navigate('Event',{id:plan.chosenEventId})}/>
     <AttendanceResponse key={plan.id+':'+plan.decisionRound} plan={plan} group={group} actor={model.user?.id} busy={model.busy} getError={()=>model.store.getSnapshot().error} onRespond={answer=>mutation('attendance',{answer,decisionRound:plan.decisionRound},true)} testID="group-attendance"/>
     {(ended||cancelled)&&<Text style={[s.body,{color:cancelled?colors.danger:colors.muted}]}>{copy(cancelled?'groups.cancelled':'groups.completed')}</Text>}
     <View style={{gap:16}}><Text testID="group-readiness" style={[s.heading,plan.allConfirmedReady&&{color:colors.success}]}>{copy(groupReadinessLabel(plan,model.user?.id),{confirmed:plan.confirmedCount??0,ready:plan.readyCount??0})}</Text>
      {plan.members.filter(m=>m.status==='accepted').map(member=><View key={member.userId} style={s.row}><MemberAvatar name={member.username} uri={member.avatarUrl} userId={member.userId}/><View style={{flex:1,minWidth:0,gap:4}}><Text style={s.body}>{member.username}</Text><Text style={s.muted}>{copy(member.attendance==='yes'?'groups.comingYes':member.attendance==='no'?'groups.comingNo':'groups.unanswered')}</Text></View><Text style={[s.muted,{maxWidth:'42%',textAlign:'right'}]}>{copy(groupTicketLabel(member.ticketState))}</Text></View>)}
     </View>
     {plan.previousEvents?.length?<Text style={s.muted}>{copy('groups.previous')}</Text>:null}
     {incoming?.blockedReason&&<Text style={s.muted}>{copy(incoming.blockedReason==='offline_snapshot'?'outings.v2.offlineTransferClosed':'outings.v2.eventTransferClosed')}</Text>}
     {receivable?<ActionButton testID="group-accept-ticket" title={copy('outings.v2.acceptTicket')} busy={transfers.working} onPress={()=>void transfers.store.respondTransfer(incoming!.id,'accepted').then(ok=>{if(ok){void tickets.refetch();void model.store.load(groupId)}})}/>:plan.myPendingPayment?<ActionButton title={copy('outings.v2.checkingPayment')} onPress={()=>navigation.navigate('CheckoutReturn',{eventId:plan.chosenEventId,...(plan.myPendingPayment!.sessionId?{sessionId:plan.myPendingPayment!.sessionId}:{nativeOrderId:plan.myPendingPayment!.orderId})})}/>:owned.length>0||mine?.hasTicket?<ActionButton testID="group-my-ticket" title={copy(owned.length>1?'tickets.title':'groups.myTicket')} busy={tickets.isPending} disabled={!owned.length} onPress={()=>{if(owned.length)setQr(owned.find(t=>!t.isValidated)?.id??owned[0]!.id)}}/>:null}
     {!ended&&!cancelled&&<><ActionButton testID="group-buy" title={copy(owned.length?'groups.buyMore':'groups.buy')} tone={owned.length?'secondary':'primary'} disabled={['sold_out','sales_ended','upcoming','unavailable'].includes(event?.ticketAvailability??'unavailable')||!!plan.myPendingPayment} onPress={()=>event?.ticketAvailability==='external'?navigation.navigate('Event',{id:plan.chosenEventId}):setBuying(true)}/>{['sold_out','sales_ended','upcoming','unavailable'].includes(event?.ticketAvailability??'unavailable')&&<Text style={s.muted}>{copy('outings.availability.'+(event?.ticketAvailability??'unavailable'))}</Text>}</>}
     {tickets.isError&&<Feedback compact title={copy('feedback.loadFailed')} retry={()=>void tickets.refetch()}/>}
     {transfers.error&&<Feedback compact title={copy(transfers.error)} retry={()=>void transfers.store.load()}/>}
     {incoming?.status==='pending'&&!incoming.blockedReason&&<ActionButton title={copy('groups.decline')} tone="ghost" onPress={()=>void transfers.store.respondTransfer(incoming.id,'declined')}/>}
     {plan.options.some(option=>option.eventId!==plan.chosenEventId)&&<ActionButton title={copy('groups.earlierPreferences')} accessibilityState={{expanded:showAlternatives}} tone="ghost" onPress={()=>setShowAlternatives(value=>!value)}/>}
     {showAlternatives&&plan.options.filter(o=>o.eventId!==plan.chosenEventId).map(option=><View key={option.eventId} style={{gap:8}}><EventPreview title={option.title} imageUrl={option.imageUrl} startTime={option.startTime} location={option.location} onPress={()=>navigation.navigate('Event',{id:option.eventId})}/>{!ended&&!cancelled&&(owner||option.proposedBy===model.user?.id)&&<ActionButton title={copy('groups.remove')} tone="ghost" size="compact" onPress={()=>void mutation('remove-proposal',{eventId:option.eventId})}/>}</View>)}

    </>}
   </>}
  </ScrollView>
  <AppModal open={panel==='confirm'} title={copy('outings.ui.confirmChoice')} onClose={()=>setPanel(null)}>
   {panel==='confirm'&&plan&&<><Text style={s.body}>{copy('outings.ui.confirmChoiceHint',{event:plan.options.find(o=>o.eventId===choice)?.title??''})}</Text><ActionButton testID="group-confirm-choice" title={copy('outings.ui.confirmDestination')} busy={model.busy} onPress={()=>void mutation('choose',{eventId:choice,revision:choiceRevision}).then(ok=>{if(ok)setPanel(null)})}/></>}
   {model.error&&<Text accessibilityRole="alert" style={[s.muted,{color:colors.danger}]}>{copy(model.error)}</Text>}
  </AppModal>

  {editing&&plan&&owner&&!ended&&!cancelled&&<GroupNightSheet model={model} groupId={groupId} plan={plan} onClose={()=>setEditing(false)} onSaved={id=>{if(id!==planId)navigation.replace('GroupOuting',{groupId,planId:id})}}/>}
  {buying&&plan&&model.user&&<PlanTicketRecipients plan={plan} actor={model.user.id} onClose={()=>setBuying(false)}/>}
  {!!qr&&owned.some(t=>t.id===qr)&&<TicketSheet tickets={owned} initialId={qr} onClose={()=>setQr('')}/>}
 </View>
}
