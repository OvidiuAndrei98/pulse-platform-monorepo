import React,{useEffect,useState} from 'react';
import {ScrollView,View} from 'react-native';
import {MoreHorizontal,Plus} from 'lucide-react-native';
import {useNavigation,useIsFocused} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {groupTicketLabel,groupReadinessLabel} from '@packages/app-core/social/groups';
import {outingDate} from '@packages/app-core/outings/presentation';
import {useGroups} from './useGroups';
import {GroupBack,EventChooser,groupStyles as s} from './GroupsScreen';
import {usePreferences} from '../usePreferences';
import {MemberAvatar,OutingPressable} from '../outings/OutingPrimitives';
import {ActionButton} from '../ui/ActionButton';
import {GlassPressable} from '../ui/GlassPressable';
import {AppModal} from '../ui/AppModal';
import {Text} from '../ui/Text';
import {EventImage,Feedback,Loading} from '../ui/common';
import {colors} from '../ui/theme';
import {formatDate} from '../data/events';
import {useTickets} from '../data/useTickets';
import {TicketSheet} from '../profile/TicketSheet';
import {PlanTicketRecipients} from '../outings/PlanTicketRecipients';
import {useOutings} from '../outings/useOutings';

export function GroupOutingScreen({groupId,planId}:{groupId:string;planId:string}){
 const model=useGroups(groupId),{copy,language}=usePreferences(),safe=useSafeAreaInsets(),navigation=useNavigation<any>(),focused=useIsFocused(),tickets=useTickets(focused,true),transfers=useOutings('transfers');
 const plan=model.groups.find(g=>g.id===groupId)?.outings.find(p=>p.id===planId),[panel,setPanel]=useState<'propose'|'options'|'confirm'|null>(null),[choice,setChoice]=useState(''),[buying,setBuying]=useState(false),[qr,setQr]=useState('');
 const back=()=>navigation.canGoBack()?navigation.goBack():navigation.navigate('FriendGroup',{id:groupId});
 const event=plan?.options.find(o=>o.eventId===plan.chosenEventId),ended=plan?.lifecycle==='completed',cancelled=plan?.lifecycle==='cancelled',mine=plan?.members.find(m=>m.userId===model.user?.id),owner=plan?.ownerId===model.user?.id;
 const owned=(tickets.data??[]).filter(t=>t.eventId===plan?.chosenEventId&&(!t.assignedRecipientId||t.assignedRecipientId===model.user?.id)&&!transfers.transfers.some(x=>x.ticketId===t.id&&x.senderId===model.user?.id&&x.status==='pending'));
 const incoming=transfers.transfers.find(t=>t.eventId===plan?.chosenEventId&&t.recipientId===model.user?.id&&t.status==='pending')??transfers.transfers.find(t=>t.eventId===plan?.chosenEventId&&t.recipientId===model.user?.id&&t.status==='expired'&&!!t.blockedReason);
 const receivable=incoming?.status==='pending'&&!incoming.blockedReason;
 const mutation=(action:string,body:unknown)=>model.store.planAction(groupId,planId,action,body);
 useEffect(()=>{if(!model.loading&&!plan&&!model.error)void model.store.loadPlan(groupId,planId)},[model.loading,plan?.id,groupId,planId,model.store]);
 const response=(value:string,current:string|undefined,run:()=>void,label:string,testID?:string)=> <ActionButton testID={testID} key={value} title={copy(label)} size="compact" tone={current===value?'primary':'secondary'} accessibilityRole="radio" aria-checked={current===value} accessibilityState={{checked:current===value}} busy={model.busy} disabled={ended||cancelled} onPress={run}/>;
 return <View testID="group-outing" style={[s.root,{paddingTop:safe.top}]}>
  <View style={s.header}><GroupBack testID="group-outing-back" onPress={back}/><Text accessibilityRole="header" style={[s.title,{flex:1}]}>{plan?outingDate(plan.outingDate,language)||copy('groups.poll'):copy('groups.viewOuting')}</Text>{plan&&owner&&!ended&&<GlassPressable accessibilityRole="button" accessibilityLabel={copy('groups.settings')} onPress={()=>setPanel('options')} style={s.circle}><MoreHorizontal size={22} color={colors.text}/></GlassPressable>}</View>
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.page,{paddingBottom:safe.bottom+32}]}>
   {!plan&&!model.error?<Loading/>:!plan?<Feedback title={copy(model.error??'groups.accessLost')} retry={()=>void model.store.load(groupId)}/>:<>
    {model.error&&<Feedback compact title={copy(model.error)} retry={()=>void model.store.load(groupId)}/>}
    {!plan.outingDate?<>
     <Text style={s.title}>{copy('groups.chooseNight')}</Text>
     {plan.candidateDates?.map(day=><View key={day.date} style={{gap:12,paddingVertical:12}}><Text style={s.heading}>{outingDate(day.date,language)}</Text><View style={[s.row,{flexWrap:'wrap'}]}>{['yes','maybe','no'].map(answer=>response(answer,day.responses.find(r=>r.userId===model.user?.id)?.answer,()=>void mutation('availability',{date:day.date,answer}),answer==='yes'?'groups.available':'groups.'+answer))}</View><Text style={s.muted}>{copy('outings.plan.responses',{answered:day.responses.length,total:plan.members.length})}</Text>{owner&&<ActionButton title={copy('groups.chooseNight')} tone="ghost" onPress={()=>void mutation('date',{date:day.date})}/>}</View>)}
    </>:!plan.chosenEventId?<>
     <View style={s.row}><Text style={[s.title,{flex:1}]}>{copy('groups.preparing')}</Text><ActionButton icon={<Plus size={18}/>} title={copy('outings.propose')} tone="secondary" size="compact" onPress={()=>setPanel('propose')}/></View>
     <View style={s.row}>{plan.members.map(m=><MemberAvatar key={m.userId} name={m.username} userId={m.userId} uri={m.avatarUrl} size={30}/>)}</View>
     <View style={{gap:8}}><Text style={s.body}>{copy('groups.respond')}</Text><View style={[s.row,{flexWrap:'wrap'}]}>{['yes','maybe','no'].map(answer=>response(answer,plan.candidateDates?.find(d=>d.date===plan.outingDate)?.responses.find(r=>r.userId===model.user?.id)?.answer,()=>void mutation('availability',{date:plan.outingDate,answer}),answer==='yes'?'groups.available':'groups.'+answer))}</View></View>
     {!plan.options.length&&<ActionButton title={copy('groups.find')} onPress={()=>setPanel('propose')}/>}
     {plan.options.map(option=><View testID={'group-proposal-'+option.eventId} key={option.eventId} style={{gap:14,paddingBottom:22}}>
      <OutingPressable onPress={()=>navigation.navigate('Event',{id:option.eventId})} style={{gap:10}}><EventImage uri={option.imageUrl} style={{width:'100%',aspectRatio:2,borderRadius:20}}/><Text style={s.heading}>{option.title}</Text><Text style={s.muted}>{formatDate(option.startTime,language,true)} · {option.location}</Text></OutingPressable>
      <View style={[s.row,{flexWrap:'wrap',gap:6}]}>{['yes','maybe','no'].map(answer=>response(answer,option.reactions?.find(r=>r.userId===model.user?.id)?.answer,()=>void mutation('vote',{eventId:option.eventId,answer}),{yes:'groups.eventYes',maybe:'groups.eventMaybe',no:'groups.eventNo'}[answer]!,'group-preference-'+option.eventId+'-'+answer))}</View>
      <Text style={s.muted}>{copy('outings.v2.responses',{yes:option.reactions?.filter(r=>r.answer==='yes').length??0,maybe:option.reactions?.filter(r=>r.answer==='maybe').length??0})}</Text>
      {owner&&option.available&&<ActionButton testID={'group-choose-'+option.eventId} title={copy('groups.choose')} tone="ghost" onPress={()=>{setChoice(option.eventId);setPanel('confirm')}}/>}
      {(owner||option.proposedBy===model.user?.id)&&<ActionButton title={copy('groups.remove')} tone="ghost" size="compact" onPress={()=>void mutation('remove-proposal',{eventId:option.eventId})}/>}
     </View>)}
    </>:<>
     <OutingPressable accessibilityLabel={event?.title??copy('groups.eventUnavailable')} onPress={()=>navigation.navigate('Event',{id:plan.chosenEventId})}><EventImage uri={event?.imageUrl} style={{width:'100%',aspectRatio:2,borderRadius:24}}/></OutingPressable>
     <View style={{gap:7}}><Text style={[s.title,{fontSize:26,lineHeight:32}]}>{event?.title??copy('groups.eventUnavailable')}</Text><Text style={s.muted}>{event&&formatDate(event.startTime,language,true)}</Text><Text style={s.muted}>{event?.location} · {plan.city}</Text></View>
     {(ended||cancelled)&&<Text style={[s.body,{color:cancelled?colors.danger:colors.muted}]}>{copy(cancelled?'groups.cancelled':'groups.completed')}</Text>}
     <Text testID="group-readiness" style={[s.body,plan.allConfirmedReady&&{color:colors.success}]}>{copy(groupReadinessLabel(plan,model.user?.id),{confirmed:plan.confirmedCount??0,ready:plan.readyCount??0})}</Text>
     <View style={{gap:18}}>{plan.members.filter(m=>m.status==='accepted').map(member=><View key={member.userId} style={s.row}><MemberAvatar name={member.username} uri={member.avatarUrl} userId={member.userId}/><View style={{flex:1,gap:4}}><Text style={s.body}>{member.username}</Text><Text style={s.muted}>{copy('groups.'+(member.attendance??'unanswered'))}</Text></View><Text style={[s.muted,{maxWidth:'42%',textAlign:'right'}]}>{copy(groupTicketLabel(member.ticketState))}</Text></View>)}</View>
     {!ended&&!cancelled&&<View style={{gap:10}}><Text style={s.heading}>{copy('groups.respond')}</Text><View style={[s.row,{flexWrap:'wrap'}]}>{['yes','maybe','no'].map(answer=>response(answer,mine?.attendance,()=>void mutation('attendance',{answer,decisionRound:plan.decisionRound}),'groups.'+answer,'group-attendance-'+answer))}</View></View>}
     {plan.previousEvents?.length?<Text style={s.muted}>{copy('groups.previous')}</Text>:null}
     {incoming?.blockedReason&&<Text style={s.muted}>{copy(incoming.blockedReason==='offline_snapshot'?'outings.v2.offlineTransferClosed':'outings.v2.eventTransferClosed')}</Text>}
     {receivable?<ActionButton testID="group-accept-ticket" title={copy('outings.v2.acceptTicket')} busy={transfers.working} onPress={()=>void transfers.store.respondTransfer(incoming!.id,'accepted').then(ok=>{if(ok){void tickets.refetch();void model.store.load(groupId)}})}/>:plan.myPendingPayment?<ActionButton title={copy('outings.v2.checkingPayment')} onPress={()=>navigation.navigate('CheckoutReturn',{eventId:plan.chosenEventId,...(plan.myPendingPayment!.sessionId?{sessionId:plan.myPendingPayment!.sessionId}:{nativeOrderId:plan.myPendingPayment!.orderId})})}/>:owned.length>0||mine?.hasTicket?<ActionButton testID="group-my-ticket" title={copy(owned.length>1?'tickets.title':'groups.myTicket')} busy={tickets.isPending} disabled={!owned.length} onPress={()=>{if(owned.length)setQr(owned.find(t=>!t.isValidated)?.id??owned[0]!.id)}}/>:null}
     {!ended&&!cancelled&&<><ActionButton testID="group-buy" title={copy(owned.length?'groups.buyMore':'groups.buy')} tone={owned.length?'secondary':'primary'} disabled={['sold_out','sales_ended','upcoming','unavailable'].includes(event?.ticketAvailability??'unavailable')||!!plan.myPendingPayment} onPress={()=>event?.ticketAvailability==='external'?navigation.navigate('Event',{id:plan.chosenEventId}):setBuying(true)}/>{['sold_out','sales_ended','upcoming','unavailable'].includes(event?.ticketAvailability??'unavailable')&&<Text style={s.muted}>{copy('outings.availability.'+(event?.ticketAvailability??'unavailable'))}</Text>}</>}
     {tickets.isError&&<Feedback compact title={copy('feedback.loadFailed')} retry={()=>void tickets.refetch()}/>}
     {transfers.error&&<Feedback compact title={copy(transfers.error)} retry={()=>void transfers.store.load()}/>}
     {incoming?.status==='pending'&&!incoming.blockedReason&&<ActionButton title={copy('groups.decline')} tone="ghost" onPress={()=>void transfers.store.respondTransfer(incoming.id,'declined')}/>}
     {plan.options.filter(o=>o.eventId!==plan.chosenEventId).map(option=><View key={option.eventId} style={{gap:8,paddingTop:12}}><OutingPressable accessibilityLabel={option.title} onPress={()=>navigation.navigate('Event',{id:option.eventId})} style={s.eventRow}><EventImage uri={option.imageUrl} style={{width:58,height:68,borderRadius:12}}/><View style={{flex:1,gap:4}}><Text style={s.heading}>{option.title}</Text><Text style={s.muted}>{copy('groups.alternative')}</Text></View></OutingPressable>{!ended&&!cancelled&&(owner||option.proposedBy===model.user?.id)&&<ActionButton title={copy('groups.remove')} tone="ghost" size="compact" onPress={()=>void mutation('remove-proposal',{eventId:option.eventId})}/>}</View>)}
    </>}
   </>}
  </ScrollView>
  <AppModal open={!!panel} title={copy(panel==='propose'?'groups.find':panel==='confirm'?'outings.ui.confirmChoice':'groups.settings')} onClose={()=>setPanel(null)}>
   {panel==='confirm'&&plan&&<><Text style={s.body}>{copy('outings.ui.confirmChoiceHint',{event:plan.options.find(o=>o.eventId===choice)?.title??''})}</Text><ActionButton testID="group-confirm-choice" title={copy('outings.ui.confirmDestination')} busy={model.busy} onPress={()=>void mutation('choose',{eventId:choice}).then(ok=>{if(ok)setPanel(null)})}/></>}
   {panel==='propose'&&plan&&<><Text style={s.muted}>{outingDate(plan.outingDate,language)} · {plan.city}</Text><EventChooser model={model} plan={plan} onSelect={id=>void mutation('proposals',{eventId:id}).then(ok=>{if(ok)setPanel(null)})}/></>}
   {panel==='options'&&plan&&<ActionButton title={copy('groups.reopen')} tone="secondary" busy={model.busy} onPress={()=>void mutation('reopen',{revision:plan.revision,reason:'other'}).then(ok=>{if(ok)setPanel(null)})}/>}
   {model.error&&<Text accessibilityRole="alert" style={[s.muted,{color:colors.danger}]}>{copy(model.error)}</Text>}
  </AppModal>
  {buying&&plan&&model.user&&<PlanTicketRecipients plan={plan} actor={model.user.id} onClose={()=>setBuying(false)}/>}
  {!!qr&&owned.some(t=>t.id===qr)&&<TicketSheet tickets={owned} initialId={qr} onClose={()=>setQr('')}/>}
 </View>
}
