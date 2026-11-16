import React,{useEffect,useRef,useState} from 'react';
import {Platform,ScrollView,View} from 'react-native';
import {Check,Plus,RotateCcw,Trash2} from 'lucide-react-native';
import {useNavigation,useIsFocused} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {groupTicketLabel,groupTicketReadiness} from '@packages/app-core/social/groups';
import {useGroups} from './useGroups';
import {GroupBack,groupStyles as s} from './GroupsScreen';
import {usePreferences} from '../usePreferences';
import {MemberAvatar,OutingPressable} from '../outings/OutingPrimitives';
import {ActionButton} from '../ui/ActionButton';
import {GroupMenu} from './GroupMenu';
import {AttendanceResponse,EventPreference,ProposalPreview} from './GroupOutingCard';
import {EventPreview} from './GroupContent';
import {groupNightDate,outingTitle,outingContextLabel} from '@packages/app-core/social/groupPresentation';
import {GroupNightSheet} from './GroupNightSheet';
import {GroupActionSheet} from './GroupActionSheet';
import {Text} from '../ui/Text';
import {Feedback,Loading} from '../ui/common';
import {colors} from '../ui/theme';
import {useTickets} from '../data/useTickets';
import {TicketSheet} from '../profile/TicketSheet';
import {PlanTicketRecipients,type RecipientTaskDraft} from '../outings/PlanTicketRecipients';
import {useOutings} from '../outings/useOutings';
import {useCheckoutReservation} from '../checkout/useCheckoutReservation';
import {CheckoutReservationActions} from '../checkout/CheckoutReservationActions';
import {GroupOutingHistory} from './GroupOutingHistory';

export function GroupOutingScreen({groupId,planId,historyMessageId}:{groupId:string;planId:string;historyMessageId?:string}){
 const model=useGroups(groupId),{copy,language}=usePreferences(),safe=useSafeAreaInsets(),navigation=useNavigation<any>(),focused=useIsFocused(),tickets=useTickets(focused,true),transfers=useOutings('transfers');
 const group=model.groups.find(g=>g.id===groupId),plan=group?.outings.find(p=>p.id===planId),[panel,setPanel]=useState<'confirm'|null>(null),[choice,setChoice]=useState(''),[choiceRevision,setChoiceRevision]=useState(0),[buying,setBuying]=useState(false),[qr,setQr]=useState('');
 const [editing,setEditing]=useState(false),[proposalLimit,setProposalLimit]=useState(3),[showAlternatives,setShowAlternatives]=useState(false);
 const [panelClosing,setPanelClosing]=useState(false);
 const recipientDraft=useRef<RecipientTaskDraft|null>(null);
 const edit=()=>setEditing(true);
 const back=()=>navigation.canGoBack()?navigation.goBack():navigation.navigate('FriendGroup',{id:groupId});
 const event=plan?.options.find(o=>o.eventId===plan.chosenEventId),ended=plan?.lifecycle==='completed',cancelled=plan?.lifecycle==='cancelled',owner=plan?.ownerId===model.user?.id;
 const reservation=useCheckoutReservation(plan?.chosenEventId??'');
 const history=historyMessageId?model.messages[groupId]?.find(message=>message.id===historyMessageId)?.outingContext:undefined;
 const owned=(tickets.data??[]).filter(t=>t.eventId===plan?.chosenEventId&&(!t.assignedRecipientId||t.assignedRecipientId===model.user?.id)&&!transfers.transfers.some(x=>x.ticketId===t.id&&x.senderId===model.user?.id&&x.status==='pending'));
 const incoming=transfers.transfers.find(t=>t.eventId===plan?.chosenEventId&&t.recipientId===model.user?.id&&t.status==='pending')??transfers.transfers.find(t=>t.eventId===plan?.chosenEventId&&t.recipientId===model.user?.id&&t.status==='expired'&&!!t.blockedReason);
 const receivable=incoming?.status==='pending'&&!incoming.blockedReason;
 const readiness=plan?groupTicketReadiness(plan,model.user?.id):undefined;
 const mutation=(action:string,body:Record<string,unknown>,inline=false)=>model.store.planAction(groupId,planId,action,{...body,...(['availability','date','vote','proposals','choose','remove-proposal'].includes(action)?{revision:body.revision??plan?.revision}:{})},inline?{feedback:'inline'}:undefined);
 useEffect(()=>{if(!model.loading&&!plan&&!model.error)void model.store.loadPlan(groupId,planId)},[model.loading,plan?.id,groupId,planId,model.store]);
 return <View testID="group-outing" style={[s.root,{paddingTop:safe.top}]}>
  <View style={s.header}><GroupBack testID="group-outing-back" onPress={back}/><Text accessibilityRole="header" style={[s.title,{flex:1}]}>{copy('groups.outingTitleLabel')}</Text>{plan&&owner&&!ended&&!cancelled&&plan.chosenEventId&&<GroupMenu testID="group-outing-menu" label={copy('groups.outingMenu')} items={[{id:'reopen',label:copy('groups.reopen'),icon:RotateCcw,nativeImage:Platform.OS==='ios'?'arrow.counterclockwise':undefined,disabled:model.busy,onPress:()=>void mutation('reopen',{revision:plan.revision,reason:'other'}),testID:'group-menu-reopen'}]}/>}</View>
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.page,{paddingBottom:safe.bottom+32}]}>
   {!plan&&!model.error?<Loading/>:!plan?<Feedback title={copy(model.error??'groups.accessLost')} retry={()=>void model.store.load(groupId)}/>:<>
    <View style={[s.row,{justifyContent:'space-between'}]}><View style={{flex:1,minWidth:0,gap:4}}><Text style={s.muted}>{[outingTitle(plan,language),outingContextLabel(plan,language)].filter(Boolean).join(' · ')}</Text></View>{owner&&!ended&&!cancelled&&<ActionButton testID="group-edit-context" title={copy('groups.change')} tone="ghost" size="compact" onPress={edit}/>}</View>
    {!!history?.outingDate&&<Text testID="group-history-context" style={s.caption}>{copy('groups.historyCurrent',{date:groupNightDate(history.outingDate,language)})}</Text>}
    {model.error&&<Feedback compact title={copy(model.error)} retry={()=>void model.store.load(groupId)}/>}
    {!plan.outingDate?<>
     <Text style={s.heading}>{copy('groups.chooseNight')}</Text><Text style={s.muted}>{copy(owner?'groups.chooseNightContext':'groups.creatorChoosingNight')}</Text>
    </>:!plan.chosenEventId?<>
     <View style={{gap:8}}><View style={s.row}><Text style={[s.heading,{flex:1}]}>{copy('groups.proposalsTitle')}</Text>{!ended&&!cancelled&&<ActionButton testID="group-empty-propose" title={copy('groups.addShort')} tone="ghost" icon={<Plus size={16}/>} size="compact" onPress={()=>navigation.navigate('GroupEventPicker',{groupId,planId})}/>}</View><Text style={s.muted}>{copy(plan.options.length?'outings.v2.yourPreference':'outings.v2.noProposalsHint')}</Text></View>
     {plan.options.slice(0,proposalLimit).map(option=><View testID={'group-proposal-'+option.eventId} key={option.eventId} style={{gap:8,paddingBottom:12}}><View style={[s.row,{alignItems:'flex-start'}]}><View style={{flex:1,minWidth:0}}><ProposalPreview plan={plan} eventId={option.eventId} onOpen={()=>navigation.navigate('Event',{id:option.eventId})}/></View>{!ended&&!cancelled&&(owner||option.proposedBy===model.user?.id)&&<GroupMenu testID={'group-proposal-menu-'+option.eventId} label={copy('groups.outingMenu')} items={[{id:'remove',label:copy('groups.remove'),icon:Trash2,destructive:true,testID:'group-remove-proposal-'+option.eventId,onPress:()=>void mutation('remove-proposal',{eventId:option.eventId})}]}/>}</View>
      <View style={{gap:12}}><EventPreference plan={plan} group={group} actor={model.user?.id} eventId={option.eventId} busy={model.busy} getError={()=>model.store.getSnapshot().error} onToggle={selected=>mutation('vote',{eventId:option.eventId,...(selected?{answer:'yes'}:{remove:true})},true)} testID={'group-preference-'+option.eventId}/>
      </View>
     </View>)}
     {plan.options.length>proposalLimit&&<ActionButton testID="group-more-proposals" title={copy('outings.more')} tone="ghost" onPress={()=>setProposalLimit(plan.options.length)}/>}
    </>:<>
     <EventPreview testID="group-outing-event" variant="detail" title={event?.title??copy('groups.eventUnavailable')} imageUrl={event?.imageUrl} startTime={event?.startTime} location={event?.location} city={plan.city} onPress={()=>navigation.navigate('Event',{id:plan.chosenEventId})}/>
     <AttendanceResponse key={plan.id+':'+plan.decisionRound} plan={plan} group={group} actor={model.user?.id} busy={model.busy} getError={()=>model.store.getSnapshot().error} onRespond={answer=>mutation('attendance',{answer,decisionRound:plan.decisionRound},true)} testID="group-attendance"/>
     {(ended||cancelled)&&<Text style={[s.body,{color:cancelled?colors.danger:colors.muted}]}>{copy(cancelled?'groups.cancelled':'groups.completed')}</Text>}
     <View style={{gap:16}}><View style={{gap:4}}><Text style={s.heading}>{copy('groups.participants')}</Text><Text testID="group-readiness" style={[s.muted,readiness?.allConfirmedReady&&{color:colors.success}]}>{readiness&&copy(readiness.summaryKey,readiness.values)}</Text>{!!readiness?.unknown&&<ActionButton testID="group-retry-tickets" title={copy('common.retry')} tone="ghost" size="compact" onPress={()=>void model.store.loadPlan(groupId,planId)}/>}</View>
      {plan.members.filter(m=>m.status==='accepted').map(member=><View key={member.userId} style={s.row}><MemberAvatar name={member.username} uri={member.avatarUrl} userId={member.userId}/><View style={{flex:1,minWidth:0,gap:4}}><Text style={s.body}>{member.username}</Text><Text style={s.muted}>{copy(member.attendance==='yes'?'groups.comingYes':member.attendance==='no'?'groups.comingNo':'groups.unanswered')}</Text></View><Text style={[s.muted,{maxWidth:'42%',textAlign:'right'}]}>{copy(groupTicketLabel(member.ticketState))}</Text></View>)}
     </View>
     {incoming?.blockedReason&&<Text style={s.muted}>{copy(incoming.blockedReason==='offline_snapshot'?'outings.v2.offlineTransferClosed':'outings.v2.eventTransferClosed')}</Text>}
     {tickets.isError&&<Feedback compact title={copy('feedback.loadFailed')} retry={()=>void tickets.refetch()}/>}
     {transfers.error&&<Feedback compact title={copy(transfers.error)} retry={()=>void transfers.store.load()}/>}
     {incoming?.status==='pending'&&!incoming.blockedReason&&<ActionButton title={copy('groups.decline')} tone="ghost" onPress={()=>void transfers.store.respondTransfer(incoming.id,'declined')}/>}
     {plan.options.some(option=>option.eventId!==plan.chosenEventId)&&<ActionButton title={copy('groups.earlierPreferences')} accessibilityState={{expanded:showAlternatives}} tone="ghost" onPress={()=>setShowAlternatives(value=>!value)}/>}
     {showAlternatives&&plan.options.filter(o=>o.eventId!==plan.chosenEventId).map(option=><View key={option.eventId} style={{gap:8}}><EventPreview title={option.title} imageUrl={option.imageUrl} startTime={option.startTime} location={option.location} onPress={()=>navigation.navigate('Event',{id:option.eventId})}/>{!ended&&!cancelled&&(owner||option.proposedBy===model.user?.id)&&<ActionButton title={copy('groups.remove')} tone="ghost" size="compact" onPress={()=>void mutation('remove-proposal',{eventId:option.eventId})}/>}</View>)}

    </>}
    <GroupOutingHistory key={planId} planId={planId} messages={model.messages[groupId]??[]} more={!!model.more?.[groupId]} onMore={()=>model.store.loadMessages(groupId,true)}/>
   </>}
  </ScrollView>
  {plan&&(!ended&&!cancelled||owned.length>0)&&<View testID="group-outing-footer" style={{paddingHorizontal:20,paddingTop:12,paddingBottom:Math.max(16,safe.bottom),gap:8,backgroundColor:colors.bg}}>
   {!plan.chosenEventId?owner&&!!plan.options.length?<ActionButton testID="group-choose-destination" title={copy('groups.chooseDestination')} disabled={model.busy} onPress={()=>{setChoice('');setChoiceRevision(plan.revision??0);setPanelClosing(false);setPanel('confirm')}}/>:null:<>
   {receivable?<ActionButton testID="group-accept-ticket" title={copy('outings.v2.acceptTicket')} busy={transfers.working} onPress={()=>void transfers.store.respondTransfer(incoming!.id,'accepted').then(ok=>{if(ok){void tickets.refetch();void model.store.load(groupId)}})}/>:plan.myPendingPayment?<ActionButton title={copy('outings.v2.checkingPayment')} onPress={()=>navigation.navigate('CheckoutReturn',{eventId:plan.chosenEventId,...(plan.myPendingPayment!.sessionId?{sessionId:plan.myPendingPayment!.sessionId}:{nativeOrderId:plan.myPendingPayment!.orderId})})}/>:plan.myCheckoutReservation?<ActionButton testID="group-resume-checkout" title={copy('groups.resumeCheckout')} busy={reservation.busy} onPress={()=>void reservation.resume(plan.myCheckoutReservation!.orderId).finally(()=>model.store.loadPlan(groupId,planId))}/>:null}
   {owned.length>0&&<ActionButton testID="group-my-ticket" title={copy(owned.length>1?'tickets.title':'groups.myTicket')} tone={receivable||plan.myPendingPayment||plan.myCheckoutReservation?'secondary':'primary'} onPress={()=>setQr(owned.find(t=>!t.isValidated)?.id??owned[0]!.id)}/>}
   {reservation.error&&<Text accessibilityRole="alert" style={[s.caption,{color:colors.danger}]}>{copy(reservation.error)}</Text>}
   <CheckoutReservationActions model={reservation} onClosed={()=>void model.store.loadPlan(groupId,planId)}/>
   {owned.length===0&&tickets.isError&&<ActionButton title={copy('common.retry')} tone="secondary" onPress={()=>void tickets.refetch()}/>}
   {!ended&&!cancelled&&!plan.myPendingPayment&&!plan.myCheckoutReservation&&<ActionButton testID="group-buy" title={copy(owned.length?'groups.buyMore':'groups.buy')} tone={owned.length?'secondary':'primary'} disabled={['sold_out','sales_ended','upcoming','unavailable'].includes(event?.ticketAvailability??'unavailable')} onPress={()=>event?.ticketAvailability==='external'?navigation.navigate('Event',{id:plan.chosenEventId}):setBuying(true)}/>}
   {!ended&&!cancelled&&['sold_out','sales_ended','upcoming','unavailable'].includes(event?.ticketAvailability??'unavailable')&&<Text style={s.caption}>{copy('outings.availability.'+(event?.ticketAvailability??'unavailable'))}</Text>}
   </>}
  </View>}
  {panel==='confirm'&&plan&&<GroupActionSheet testID="group-destination-sheet" title={copy('groups.chooseDestination')} contentEstimate={Math.min(440,plan.options.length*114+48)} closing={panelClosing} onRequestClose={()=>setPanelClosing(true)} onDismiss={()=>{setPanel(null);setPanelClosing(false)}} footer={<ActionButton testID="group-confirm-choice" title={copy('outings.ui.confirmDestination')} disabled={!choice} busy={model.busy} onPress={()=>void mutation('choose',{eventId:choice,revision:choiceRevision}).then(ok=>{if(ok)setPanelClosing(true)})}/>}>
   <Text style={s.muted}>{copy('groups.destinationHint')}</Text>
   {plan.options.map(option=><OutingPressable key={option.eventId} testID={'group-choose-'+option.eventId} accessibilityRole="radio" aria-checked={choice===option.eventId} accessibilityState={{checked:choice===option.eventId,disabled:!option.available}} disabled={!option.available||model.busy} onPress={()=>setChoice(option.eventId)} style={[s.row,{padding:8,borderRadius:12,borderWidth:1,borderColor:choice===option.eventId?colors.accent:'transparent'}]}><View style={{flex:1,minWidth:0}}><EventPreview variant="message" title={option.title} imageUrl={option.imageUrl} startTime={option.startTime} location={option.location}/></View>{choice===option.eventId&&<Check size={18} color={colors.accent}/>}</OutingPressable>)}
   {model.error&&<Text accessibilityRole="alert" style={[s.muted,{color:colors.danger}]}>{copy(model.error)}</Text>}
  </GroupActionSheet>}

  {editing&&plan&&owner&&!ended&&!cancelled&&<GroupNightSheet model={model} groupId={groupId} plan={plan} onClose={()=>setEditing(false)} onSaved={id=>{if(id!==planId)navigation.replace('GroupOuting',{groupId,planId:id})}}/>}
  {buying&&plan&&model.user&&<PlanTicketRecipients plan={plan} actor={model.user.id} draftRef={recipientDraft} pendingInvitations={group?.members.filter(member=>member.status==='pending').length} onClose={()=>setBuying(false)} onReviewSelection={()=>void model.store.loadPlan(groupId,planId)} onRecoverCheckout={orderId=>reservation.resume(orderId)}/>}
  {!!qr&&owned.some(t=>t.id===qr)&&<TicketSheet tickets={owned} initialId={qr} onClose={()=>setQr('')}/>}
 </View>
}
