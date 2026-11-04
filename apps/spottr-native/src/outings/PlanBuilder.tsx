import React,{useEffect,useState} from 'react';
import { ScrollView,View } from 'react-native';
import { ArrowRight,Check,ChevronRight,Clock,Info,Plus,X } from 'lucide-react-native';
import { canCreatePlan,eventPlanDraft,eventPlanningContext,planningToday,validPlanningDate,type PlanEvent } from '@packages/app-core/outings/model';
import { defaultDecisionAt,outingDate } from '@packages/app-core/outings/presentation';
import { shiftCalendarDay } from '@packages/app-core/events/discoveryFilters';
import { eventCities } from '@packages/app-core/events/constants';
import { usePreferences } from '../usePreferences';
import { FormInput } from '../ui/FormInput';
import { OutingAction as ActionButton } from './OutingPrimitives';
import { AppModal } from '../ui/AppModal';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { DateTimeField } from '../dashboard/DateTimeField';
import { DashboardDropdown } from '../dashboard/DashboardDropdown';
import { MemberAvatar,OutingPressable } from './OutingPrimitives';
import { o } from './outingsStyles';
import { j } from './journeyStyles';
import type { useOutings } from './useOutings';
export { Choice } from './PlanChoice';

export function PlanBuilder({model,onCreated,onCancel,sourceEvent}:{model:ReturnType<typeof useOutings>;onCreated:(id:string)=>void;onCancel:()=>void;sourceEvent?:PlanEvent}) {
 const {copy,language}=usePreferences();
 const context=sourceEvent?eventPlanningContext(sourceEvent):undefined;
 const [step,setStep]=useState(1),[title,setTitle]=useState(()=>sourceEvent?Array.from(sourceEvent.title.trim()).slice(0,80).join(''):copy('outings.defaultName')),[city,setCity]=useState(context?.city??'Bucuresti');
 const [days,setDays]=useState<string[]>(()=>[context?.outingDate??planningToday()]),[friends,setFriends]=useState<string[]>([]),[search,setSearch]=useState(''),[submitted,setSubmitted]=useState(false);
 const [deadline,setDeadline]=useState(()=>defaultDecisionAt([context?.outingDate??planningToday()])),[deadlineOpen,setDeadlineOpen]=useState(false),[infoOpen,setInfoOpen]=useState(false);
 useEffect(()=>{void model.store.loadFriends();},[model.store]);
 const dayInvalid=days.some(value=>!validPlanningDate(value))||new Set(days).size!==days.length;
 const setupValid=(!sourceEvent||!!context)&&title.trim().length>0&&Array.from(title.trim()).length<=80&&!dayInvalid&&eventCities.includes(city)&&Date.parse(deadline)>Date.now();
 const next=()=>{setSubmitted(true);if(setupValid){setSubmitted(false);setStep(2);}};
 const create=async()=>{if(model.working)return;setSubmitted(true);if(!setupValid||!days.every(value=>canCreatePlan(title,value,city,friends))){if(!setupValid)setStep(1);return;}const draft=sourceEvent?eventPlanDraft(sourceEvent,title,friends):{title:title.trim(),candidateDates:days,city,friendIds:friends};if(!draft)return;const p=await model.store.createPlan({...draft,decisionAt:deadline});if(p)onCreated(p.id);};
 const visible=model.friends.filter(f=>f.username.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 return <View style={{width:'100%',maxWidth:560,alignSelf:'center',gap:24}}>
  <View style={o.split}><Text style={o.caption}>{copy('outings.plan.step',{step})}</Text><View style={{flexDirection:'row',gap:5}}>{[1,2].map(n=><View key={n} style={{height:3,width:32,borderRadius:2,backgroundColor:n<=step?colors.accent:colors.line}}/>)}</View></View>
  {step===1?<>
   <View style={{gap:7}}><Text style={[j.title,{fontSize:26,lineHeight:32}]}>{copy('outings.plan.setup')}</Text><Text style={o.muted}>{copy('outings.plan.setupHint')}</Text></View>
   <View style={{gap:18}}><View style={{gap:8}}><Text style={j.fieldLabel}>{copy('outings.planName')}</Text><FormInput variant="bare" style={j.input} testID="outing-title" accessibilityLabel={copy('outings.planName')} placeholder={copy('outings.plan.nameHint')} value={title} maxLength={80} onChangeText={setTitle} invalid={submitted&&!title.trim()}/></View>
    {submitted&&!title.trim()&&<Text accessibilityRole="alert" style={o.error}>{copy('outings.ui.invalidTitle')}</Text>}
    <DashboardDropdown triggerStyle={{minHeight:52,borderWidth:0,borderRadius:16,backgroundColor:colors.raised,paddingHorizontal:16}} testID="outing-city" disabled={!!sourceEvent} label={copy('outings.city')} placeholder={copy('outings.city')} value={city} onChange={setCity} options={eventCities.map(value=>({value,label:value}))}/>
   </View>
   <View style={{gap:10}}><View style={o.split}><Text style={j.fieldLabel}>{copy('outings.plan.selectedNights')}</Text><View style={[o.row,{gap:4}]}><Text style={o.caption}>{days.length}/3</Text><OutingPressable accessibilityLabel={copy('outings.plan.moreInfo')} onPress={()=>setInfoOpen(true)} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Info size={17} color={colors.muted}/></OutingPressable></View></View>
    <View style={{flexDirection:'row',gap:10,alignItems:'flex-start'}}>{days.map((day,index)=><View key={index} style={{flex:1,maxWidth:112,gap:4}}>
     <DateTimeField dateOnly hideLabel disabled={!!sourceEvent} label={copy('outings.plan.nightLabel',{number:index+1})} value={day} onChange={value=>setDays(rows=>rows.map((old,i)=>i===index?value:old))} triggerHeight={108} triggerStyle={{height:108,minHeight:108,padding:8,flexDirection:'column',alignItems:'center',justifyContent:'center',borderWidth:0,borderRadius:22,backgroundColor:'#151618'}} triggerContent={<><Text style={{fontSize:46,lineHeight:54,fontWeight:'700',letterSpacing:-1.8,color:colors.text,fontVariant:['tabular-nums'],textAlign:'center'}}>{outingDate(day,language,'day')}</Text><Text style={{fontSize:12,lineHeight:18,color:colors.muted,textAlign:'center'}}>{new Intl.DateTimeFormat(language,{weekday:'short',timeZone:'UTC'}).format(new Date(day+'T12:00Z'))} · {outingDate(day,language,'month')}</Text></>}/>
     {days.length>1&&<OutingPressable accessibilityLabel={copy('outings.plan.removeNight')+' '+outingDate(day,language)} onPress={()=>setDays(rows=>rows.filter((_,i)=>i!==index))} style={{minHeight:44,alignItems:'center',justifyContent:'center'}}><X size={15} color={colors.muted}/></OutingPressable>}
    </View>)}
    {!sourceEvent&&days.length<3&&<OutingPressable accessibilityLabel={copy('outings.plan.addNight')} onPress={()=>setDays(rows=>[...rows,shiftCalendarDay([...rows].sort().at(-1)!,1)])} style={{width:64,height:108,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:'#ffffff07'}}><Plus size={22} color={colors.muted}/></OutingPressable>}
    </View>
    {submitted&&dayInvalid&&<Text accessibilityRole="alert" style={o.error}>{copy('outings.ui.invalidDate')}</Text>}
   </View>
   <OutingPressable accessibilityLabel={copy('outings.plan.deadlineShort')} style={j.deadline} onPress={()=>setDeadlineOpen(true)}><Clock size={17} color={colors.muted}/><View style={{flex:1,gap:4}}><Text style={o.caption}>{copy('outings.plan.deadlineShort')}</Text><Text style={o.label}>{new Intl.DateTimeFormat(language,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(deadline))}</Text></View><ChevronRight size={17} color={colors.muted}/></OutingPressable>
   {submitted&&Date.parse(deadline)<=Date.now()&&<Text accessibilityRole="alert" style={o.error}>{copy('outings.plan.invalidDeadline')}</Text>}
   <ActionButton testID="outing-next" accessibilityLabel={copy('outings.plan.next')} onPress={next} style={{width:'100%',justifyContent:'space-between',paddingHorizontal:20}}><Text style={{fontSize:14,fontWeight:'600'}}>{copy('outings.plan.next')}</Text><ArrowRight size={17} color={colors.onAction}/></ActionButton>
  </>:<>
   <View style={{gap:7}}><Text style={[j.title,{fontSize:26,lineHeight:32}]}>{copy('outings.plan.people')}</Text><Text style={o.muted}>{copy('outings.plan.peopleHint')}</Text></View>
   <View style={j.summary}><View style={j.dateBlock}><Text style={j.dateNumber}>{outingDate(days[0],language,'day')}</Text><Text style={j.dateMonth}>{outingDate(days[0],language,'month')}</Text></View><View style={{flex:1,gap:4}}><Text style={o.label}>{title}</Text><Text style={o.caption}>{city} · {days.map(day=>outingDate(day,language)).join(' / ')}</Text></View></View>
   <FormInput variant="bare" style={j.input} testID="outing-friend-search" accessibilityLabel={copy('outings.ui.searchFriends')} placeholder={copy('outings.ui.searchFriends')} value={search} onChangeText={setSearch}/>
   <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{maxHeight:320}} contentContainerStyle={{gap:6}}>
    {visible.map(friend=>{const checked=friends.includes(friend.id);return <OutingPressable key={friend.id} accessibilityRole="checkbox" accessibilityLabel={friend.username} accessibilityState={{checked}} disabled={model.working||friends.length>=7&&!checked} onPress={()=>setFriends(rows=>checked?rows.filter(id=>id!==friend.id):[...rows,friend.id])} style={{flexDirection:'row',alignItems:'center',gap:12,padding:14,minHeight:66,borderRadius:20,backgroundColor:checked?'#ff004416':'#111214'}}>
      <MemberAvatar name={friend.username} userId={friend.id} uri={friend.avatarUrl}/><Text style={[o.label,{flex:1}]}>{friend.username}</Text><View style={{height:24,width:24,borderRadius:12,borderWidth:checked?0:1,borderColor:'#ffffff35',backgroundColor:checked?colors.accent:'transparent',alignItems:'center',justifyContent:'center'}}>{checked&&<Check size={15} color={colors.text}/>}</View>
     </OutingPressable>;})}
    {!model.catalogPending&&!model.friendsError&&!visible.length&&<Text style={o.muted}>{copy(model.friends.length?'outings.ui.noFriendResults':'outings.noFriends')}</Text>}
   </ScrollView>
   {model.catalogPending&&<Text accessibilityRole="progressbar" style={o.caption}>{copy('common.loading')}</Text>}
   {!!model.friendsError&&<View style={{gap:8}}><Text accessibilityRole="alert" style={o.error}>{copy(model.friendsError)}</Text><ActionButton title={copy('common.retry')} tone="secondary" busy={model.catalogPending} onPress={()=>void model.store.loadFriends()}/></View>}
   <Text accessibilityRole={submitted&&!friends.length?'alert':undefined} style={submitted&&!friends.length?o.error:o.caption}>{copy(submitted&&!friends.length?'outings.ui.invalidFriends':'outings.ui.selected',{count:friends.length})}</Text>
   <ActionButton testID="outing-create" title={copy('outings.create')} busy={model.working} onPress={()=>void create()} style={{width:'100%'}}/>
  </>}
  <ActionButton title={copy(step===1?'common.cancel':'common.back')} tone="ghost" disabled={model.working} onPress={()=>step===1?onCancel():setStep(1)}/>
  <AppModal open={deadlineOpen} onClose={()=>setDeadlineOpen(false)} title={copy('outings.plan.deadlineShort')} footer={<ActionButton title={copy('datePicker.done')} onPress={()=>setDeadlineOpen(false)}/>}><View style={j.section}><DateTimeField label={copy('outings.plan.deadline')} value={deadline} onChange={value=>setDeadline(new Date(value).toISOString())}/><Text style={o.caption}>{copy('outings.plan.deadlineHint')}</Text></View></AppModal>
  <AppModal open={infoOpen} onClose={()=>setInfoOpen(false)} title={copy('outings.plan.moreInfo')}><Text style={o.body}>{copy('outings.plan.nightHint')}</Text></AppModal>
 </View>;
}
