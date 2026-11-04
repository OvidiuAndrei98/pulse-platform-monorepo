import React,{useEffect,useState} from 'react';
import { AppState,Platform,Share,View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { CalendarDays,Clock,MapPin,Plus,Share2,Pencil,Wallet,ArrowRight,Info } from 'lucide-react-native';
import { arrivalStates,defaultDecisionAt,outingAnswers,outingDate,planNightEnded,validBudget } from '@packages/app-core/outings/presentation';
import type { OutingPlan } from '@packages/app-core/outings/model';
import { OutingAction as ActionButton } from './OutingPrimitives';
import { GlassPressable } from '../ui/GlassPressable';
import { AppModal } from '../ui/AppModal';
import { FormInput } from '../ui/FormInput';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { usePreferences } from '../usePreferences';
import { formatDate } from '../data/events';
import { DateTimeField } from '../dashboard/DateTimeField';
import { WEB_URL } from '../config';
import { useToast } from '../ui/ToastProvider';
import { PlanProposals } from './PlanProposals';
import { DateBlock,MemberAvatar,OutingMeta,OutingProgress } from './OutingPrimitives';
import { PlanReady } from './PlanReady';
import { o } from './outingsStyles';
import { j } from './journeyStyles';
import { EventImage } from '../ui/common';
import { OutingPressable } from './OutingPrimitives';
import type { useOutings } from './useOutings';

type Props={plan:OutingPlan;model:ReturnType<typeof useOutings>;onEvent:(id:string)=>void;onNight:(id:string)=>void;onGroup:(id:string)=>void};
export function PlanDetails({plan,model,onEvent,onNight}:Props) {
 const {copy,language}=usePreferences(),toast=useToast(),focused=useIsFocused();
 const [infoOpen,setInfoOpen]=useState(false),[groupOpen,setGroupOpen]=useState(false),[budgetOpen,setBudgetOpen]=useState(false);
 const [adding,setAdding]=useState(false),[confirm,setConfirm]=useState<{date?:string;eventId?:string}|null>(null);
 const [budget,setBudget]=useState(plan.myBudgetRon?.toString()??''),[budgetError,setBudgetError]=useState(false);
 const [editingDeadline,setEditingDeadline]=useState(false),[deadline,setDeadline]=useState(plan.decisionAt??defaultDecisionAt([plan.outingDate??plan.candidateDates?.at(-1)?.date??'']));
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),10000);return()=>clearInterval(t);},[]);
 useEffect(()=>{
  if(!focused)return;let stop=()=>{};
  const sync=()=>{stop();if(AppState.currentState==='active'&&(Platform.OS!=='web'||document.visibilityState!=='hidden'))stop=model.store.watchPlan(plan.id);};
  sync();const sub=AppState.addEventListener('change',sync);if(Platform.OS==='web')document.addEventListener('visibilitychange',sync);
  return()=>{stop();sub.remove();if(Platform.OS==='web')document.removeEventListener('visibilitychange',sync);};
 },[focused,plan.id,model.store]);
 const ended=planNightEnded(plan,now);
 const accepted=plan.status==='accepted',owner=plan.ownerId===model.user?.id,closed=ended||!!plan.decisionAt&&Date.parse(plan.decisionAt)<=now;
 const participants=plan.members.filter(m=>m.status==='accepted'),busy=model.working;
 const confirmChoice=async()=>{if(!confirm)return;const result=confirm.date?await model.store.updatePlan(plan.id,'date',{date:confirm.date}):await model.store.choose(plan.id,confirm.eventId!);if(result)setConfirm(null);};
 const share=async()=>{try{await Share.share({message:plan.title+'\n'+WEB_URL+'/outings?plan='+plan.id});}catch{toast.show({key:'feedback.shareFailed',kind:'error'});}};
 const reactions=(values:readonly {userId:string;answer:string}[],eventId?:string,day?:string)=><View style={{gap:8}}>
   <View style={{flexDirection:'row',gap:6}}>{outingAnswers.map(answer=>{const selected=values.some(v=>v.userId===model.user?.id&&v.answer===answer),count=values.filter(v=>v.answer===answer).length;
    return <OutingPressable key={answer} testID={eventId?'outing-vote-'+eventId+'-'+answer:'outing-availability-'+day+'-'+answer} accessibilityRole="radio" accessibilityLabel={copy('outings.plan.'+(eventId?{yes:'eventYes',maybe:'eventMaybe',no:'eventNo'}[answer]:answer))} accessibilityState={{checked:selected,disabled:busy||closed}} disabled={busy||closed} style={[j.reaction,selected&&j.reactionSelected]} onPress={()=>void(eventId?model.store.vote(plan.id,eventId,answer):model.store.updatePlan(plan.id,'availability',{date:day,answer}))}><Text style={[j.reactionText,selected&&{color:colors.accent}]}>{copy('outings.plan.'+(eventId?{yes:'eventYes',maybe:'eventMaybe',no:'eventNo'}[answer]:{yes:'dateYes',maybe:'dateMaybe',no:'dateNo'}[answer]))}</Text><Text style={j.count}>{count}</Text></OutingPressable>;})}</View>
   <Text style={[o.caption,{fontSize:11}]}>{copy('outings.plan.responses',{answered:values.length,total:participants.length})}</Text>
  </View>;
 return <View style={j.stack}>
  <View style={j.identity}>
  <View style={o.split}><View style={{flexDirection:'row',alignItems:'center',gap:9}}><View style={{flexDirection:'row'}}>{participants.slice(0,3).map((m,i)=><View key={m.userId} style={{marginLeft:i?-8:0}}><MemberAvatar name={m.username} userId={m.userId} uri={m.avatarUrl} size={28}/></View>)}</View><Text style={o.caption}>{copy('outings.ui.private')}</Text></View><GlassPressable accessibilityRole="button" accessibilityLabel={copy('outings.share')} style={{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface}} onPress={()=>void share()}><Share2 size={18} color={colors.text}/></GlassPressable></View>
  <View style={{gap:12}}><Text accessibilityRole="header" style={j.title}>{plan.title}</Text><OutingMeta plan={plan}/></View>
  {accepted&&<OutingProgress plan={plan}/>}
  </View>
  {ended&&<Text style={o.caption}>{copy('outings.plan.nightEnded')}</Text>}
  {!accepted?<View style={j.card}><Text style={o.heading}>{copy('outings.ui.invitationTitle')}</Text><Text style={o.muted}>{copy('outings.ui.invitationBody')}</Text>
   <Text style={o.muted}>{plan.candidateDates?.map(d=>outingDate(d.date,language)).join(' · ')}</Text>
   <ActionButton title={copy('outings.accept')} busy={busy} onPress={()=>void model.store.respondPlan(plan.id,'accepted')}/><ActionButton title={copy('outings.decline')} tone="secondary" disabled={busy} onPress={()=>void model.store.respondPlan(plan.id,'declined')}/>
  </View>:<>
   {!plan.chosenEventId&&<View style={j.deadline}><Clock color={colors.muted} size={16}/><View style={{flex:1,gap:3}}><Text style={o.label}>{closed?copy('outings.plan.closed'):copy('outings.plan.deadline')+' '+(plan.decisionAt?new Intl.DateTimeFormat(language,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Bucharest'}).format(new Date(plan.decisionAt)):'?')}</Text></View>{owner&&!ended&&<ActionButton accessibilityLabel={copy('outings.plan.extend')} icon={<Pencil size={16}/>} style={{width:44,paddingHorizontal:0}} tone="ghost" onPress={()=>{setDeadline(defaultDecisionAt([plan.outingDate??plan.candidateDates?.at(-1)?.date??'']));setEditingDeadline(true);}}/>}</View>}
   {!plan.chosenEventId&&plan.outingDate&&<ActionButton testID="outing-budget-open" title={copy('outings.plan.budgetAction')+(plan.myBudgetRon===undefined?'':' · '+plan.myBudgetRon+' RON')} accessibilityLabel={copy('outings.plan.budget')} icon={<Wallet size={15}/>} style={{alignSelf:'flex-start'}} tone="secondary" onPress={()=>setBudgetOpen(true)}/>}
   {!plan.outingDate?<View style={j.stack}>
    <View style={{gap:8}}><Text style={o.heading}>{copy('outings.plan.dates')}</Text><Text style={o.muted}>{copy('outings.plan.dateHintShort')}</Text></View>
    {plan.candidateDates?.map(day=><View key={day.date} style={j.card}><View style={o.row}><DateBlock day={day.date}/><View style={{flex:1,gap:4}}><Text style={[o.heading,{fontSize:18}]}>{new Intl.DateTimeFormat(language,{weekday:'long',timeZone:'UTC'}).format(new Date(day.date+'T12:00Z'))}</Text><Text style={o.caption}>{outingDate(day.date,language)}</Text></View></View>
     {reactions(day.responses,undefined,day.date)}{owner&&!ended&&<OutingPressable accessibilityLabel={copy('outings.plan.confirmNight')} disabled={busy} style={{minHeight:44,paddingHorizontal:4,flexDirection:'row',alignItems:'center',gap:8,alignSelf:'flex-end'}} onPress={()=>setConfirm({date:day.date})}><Text style={{fontSize:13,fontWeight:'600',color:colors.accent}}>{copy('outings.plan.confirmNight')}</Text><ArrowRight size={15} color={colors.accent}/></OutingPressable>}</View>)}
    <ActionButton title={copy('outings.plan.moreInfo')} icon={<Info size={15}/>} tone="ghost" style={{alignSelf:'flex-start'}} onPress={()=>setInfoOpen(true)}/>
   </View>:plan.chosenEventId?<PlanReady plan={plan} model={model} onEvent={onEvent} onNight={onNight}/>:<View style={j.stack}>
    <View style={{gap:8}}><Text style={o.heading}>{copy('outings.plan.voting')}</Text><Text style={o.muted}>{copy('outings.plan.compareShort')}</Text></View>
    {plan.options.map(event=><View key={event.eventId} style={j.card}>
     <View style={j.eventHeader}>{!!event.imageUrl&&<EventImage uri={event.imageUrl} style={j.eventThumb}/>}<View style={{flex:1,gap:8}}><Text style={[o.heading,{fontSize:20}]}>{event.title}</Text><View style={o.row}><MapPin size={15} color={colors.muted}/><Text style={[o.muted,{flex:1}]}>{event.location} · {formatDate(event.startTime,language,true)}</Text></View>
     {event.totalPriceRon!==undefined&&event.ticketAvailability!=='external'&&<Text style={o.label}>{copy('outings.plan.total',{amount:new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(event.totalPriceRon)})}</Text>}
     <Text style={o.caption}>{copy('outings.availability.'+(event.ticketAvailability??'unavailable'))}</Text></View></View>
     {(plan.budgetCount??0)>0&&event.totalPriceRon!==undefined&&<Text style={o.caption}>{copy('outings.plan.fits',{count:event.budgetFits??0,total:plan.budgetCount??0})}</Text>}
     {reactions(event.reactions??[],event.eventId)}
     <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}><ActionButton title={copy('outings.viewEvent')} tone="ghost" onPress={()=>onEvent(event.eventId)}/>{owner&&!ended&&<ActionButton title={copy('outings.choose')+' →'} tone="ghost" disabled={busy||!event.available} onPress={()=>setConfirm({eventId:event.eventId})}/>}</View>
    </View>)}
    {!closed&&<><ActionButton title={copy('outings.propose')} icon={<Plus size={18}/>} tone="secondary" disabled={busy||plan.options.length>=8} onPress={()=>setAdding(v=>!v)} accessibilityState={{expanded:adding}}/>{adding&&<PlanProposals plan={plan} model={model} onProposed={()=>setAdding(false)}/>}</>}
   </View>}
   {!!plan.previousEvents?.length&&<View style={j.card}><Text style={o.heading}>{copy('outings.plan.previous')}</Text>{plan.previousEvents.map((event,index)=><ActionButton key={index} title={event.title} tone="ghost" onPress={()=>onEvent(event.eventId)}/>)}<Text style={o.caption}>{copy('outings.plan.planBHint')}</Text></View>}
   <View style={j.divider}><OutingPressable accessibilityLabel={copy('outings.plan.group')} accessibilityState={{expanded:groupOpen}} style={j.groupRow} onPress={()=>setGroupOpen(v=>!v)}><View style={j.avatars}>{plan.members.slice(0,3).map((m,i)=><View key={m.userId} style={{marginLeft:i?-9:0}}><MemberAvatar name={m.username} userId={m.userId} uri={m.avatarUrl}/></View>)}</View><Text style={[o.label,{flex:1}]}>{copy('outings.plan.group')} · {plan.members.length}</Text><Text style={o.caption}>{groupOpen?'−':'+'}</Text></OutingPressable>{groupOpen&&plan.members.map(member=><View key={member.userId} style={o.member}><MemberAvatar name={member.username} userId={member.userId} uri={member.avatarUrl}/><View style={{flex:1,gap:4}}><Text style={o.label}>{member.username}{member.userId===plan.ownerId?' · '+copy('outings.plan.organizer'):''}</Text><Text style={o.caption}>{copy(member.status==='pending'?'outings.plan.pending':plan.chosenEventId?member.hasTicket?'outings.hasTicket':'outings.needsTicket':'outings.accepted')}</Text>{member.hasPreviousTicket&&<Text style={o.caption}>{copy('outings.plan.previousTicket')}</Text>}{plan.chosenEventId&&member.status==='accepted'&&<Text style={o.caption}>{copy('outings.plan.'+(member.arrivalStatus??arrivalStates[0]))}</Text>}</View></View>)}</View>
  </>}
  <AppModal open={infoOpen} onClose={()=>setInfoOpen(false)} title={copy('outings.plan.moreInfo')}><Text style={o.body}>{copy('outings.plan.nightHint')}</Text></AppModal>
  <AppModal open={budgetOpen} onClose={()=>setBudgetOpen(false)} title={copy('outings.plan.budget')}><View style={j.section}><Text style={o.label}>{copy('outings.plan.budget')}</Text><FormInput variant="bare" style={j.input} testID="outing-budget" value={budget} onChangeText={v=>{setBudget(v);setBudgetError(false);}} keyboardType="decimal-pad" accessibilityLabel={copy('outings.plan.budget')} maxLength={12} invalid={budgetError}/><Text style={o.caption}>{copy('outings.plan.budgetHint')}</Text>
    {budgetError&&<Text accessibilityRole="alert" style={o.error}>{copy('outings.plan.invalidBudget')}</Text>}
    <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}><ActionButton title={copy('outings.plan.saveBudget')} tone="secondary" busy={busy} onPress={()=>{if(!validBudget(budget)){setBudgetError(true);return;}void model.store.updatePlan(plan.id,'preferences',budget.trim()?{budgetRon:Number(budget.replace(',','.'))}:{}).then(ok=>{if(ok)setBudgetOpen(false);});}}/>{plan.myBudgetRon!==undefined&&<ActionButton title={copy('outings.plan.clearBudget')} tone="ghost" disabled={busy} onPress={()=>void model.store.updatePlan(plan.id,'preferences',{}).then(ok=>{if(ok)setBudget('');})}/>}</View>
   </View>
</AppModal>
  <AppModal open={editingDeadline} onClose={()=>setEditingDeadline(false)} title={copy('outings.plan.deadline')} footer={<ActionButton title={copy('common.save')} busy={busy} onPress={()=>void model.store.updatePlan(plan.id,'deadline',{decisionAt:deadline}).then(ok=>{if(ok)setEditingDeadline(false);})}/>}><DateTimeField label={copy('outings.plan.deadline')} value={deadline} onChange={value=>setDeadline(new Date(value).toISOString())}/><Text style={o.caption}>{copy('outings.plan.deadlineHint')}</Text></AppModal>
  <AppModal open={!!confirm} onClose={()=>setConfirm(null)} title={copy(confirm?.date?'outings.plan.confirmNight':'outings.ui.confirmChoice')} dismissible={!busy} footer={<><ActionButton title={copy('common.cancel')} tone="secondary" disabled={busy} onPress={()=>setConfirm(null)}/><ActionButton testID="outing-confirm-choice" title={copy(confirm?.date?'outings.plan.confirmNight':'outings.ui.confirmDestination')} busy={busy} onPress={()=>void confirmChoice()}/></>}>
   <Text style={o.body}>{confirm?.date?copy('outings.plan.confirmNightHint',{date:outingDate(confirm.date,language)}):copy('outings.ui.confirmChoiceHint',{event:plan.options.find(e=>e.eventId===confirm?.eventId)?.title??''})}</Text>
  </AppModal>
 </View>;
}
