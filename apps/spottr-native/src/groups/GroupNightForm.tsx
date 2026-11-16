import React,{useEffect,useMemo,useRef,useState} from 'react';
import {View} from 'react-native';
import {useSharedValue} from 'react-native-reanimated';
import {eventCities} from '@packages/app-core/events/constants';
import type {EventFilters} from '@packages/app-core/events/types';
import {canonicalPlanningCity,matchesPlanningContext,planningToday,validPlanningDate,type OutingPlan,type PlanEvent} from '@packages/app-core/outings/model';
import {shiftCalendarDay} from '@packages/app-core/events/discoveryFilters';
import {useGroups} from './useGroups';
import {EventPreview} from './GroupContent';
import {usePreferences} from '../usePreferences';
import {GroupCityField} from './GroupCityField';
import {DiscoveryDateRibbon,type DateRibbonSelectionHandle} from '../screens/DiscoveryDateRibbon';
import {Text} from '../ui/Text';
import {ActionButton} from '../ui/ActionButton';
import {colors} from '../ui/theme';

const ribbonSource={x:0,y:0};
/** Create and edit share the same form. A revision is captured when editing starts. */
export function GroupNightForm({model,groupId,plan,onCreated,active:enabled=true,renderShell,onPickEvent,selectedEvent,onDirtyChange}:{model:ReturnType<typeof useGroups>;groupId:string;plan?:OutingPlan;onCreated:(id:string)=>void;active?:boolean;renderShell?:(body:React.ReactNode,footer:React.ReactNode)=>React.ReactNode;onPickEvent?:(context:{date:string;city:string})=>void;selectedEvent?:PlanEvent;onDirtyChange?:(dirty:boolean)=>void}){
 const {copy,language}=usePreferences(),today=planningToday();
 const [city,setCity]=useState(()=>canonicalPlanningCity(plan?.city??model.groups.find(g=>g.id===groupId)?.outings.find(p=>p.city)?.city)??'');
 const [day,setDay]=useState(()=>plan?.outingDate??plan?.candidateDates?.[0]?.date??today);
 const draft=useRef({day,city}),ribbon=useRef<DateRibbonSelectionHandle>(null);draft.current={day,city};
 const [expanded,setExpanded]=useState(true),[stale,setStale]=useState(false);
 const [removedEvent,setRemovedEvent]=useState<string>(),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState<string|null>(null);
 const alive=useRef(true),enabledRef=useRef(enabled),pending=useRef(false);enabledRef.current=enabled;
 const revision=useRef(plan?.revision??0),progress=useSharedValue(1),calendarMotion=useSharedValue({opacity:1,scale:1,x:0,y:0});
 useEffect(()=>{alive.current=true;model.store.resetContextFeedback();return()=>{alive.current=false;model.store.resetContextFeedback()}},[model.store]);
 const ribbonDay=day<today?today:day;
 const filters=useMemo<EventFilters>(()=>({categories:[],vibes:[],distance:0,city,date:'Custom',dateFrom:ribbonDay,dateTo:ribbonDay}),[city,ribbonDay]);
 const month=new Intl.DateTimeFormat(language==='ro'?'ro-RO':'en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
 const changed=()=>{setSaveError(null);model.store.resetContextFeedback()};
 const choose=(value:string)=>{if(validPlanningDate(value)&&value!==draft.current.day){changed();draft.current.day=value;setDay(value)}};
 const finishContext=()=>({date:ribbon.current?.finish()??draft.current.day,city:draft.current.city});
 const valid=eventCities.includes(city)&&validPlanningDate(day);
 const picked=selectedEvent&&removedEvent!==selectedEvent.id&&matchesPlanningContext(selectedEvent,{outingDate:day,city})?selectedEvent:undefined;
 const hasChanges=!plan||canonicalPlanningCity(plan.city)!==city||plan.outingDate!==day;
 useEffect(()=>{onDirtyChange?.(!!plan&&hasChanges)},[hasChanges,onDirtyChange,!!plan]);
 const existing=!plan?model.groups.find(g=>g.id===groupId)?.outings.find(p=>p.outingDate===day&&!['completed','cancelled'].includes(p.lifecycle??'')):undefined;
 const canAddPicked=!!existing&&!!picked&&!['completed','cancelled'].includes(existing.lifecycle??'')&&matchesPlanningContext(picked,existing);
 const save=async(confirmImpact=false)=>{
  if(!enabledRef.current||pending.current||stale)return;
  const context=finishContext(),changedContext=!plan||canonicalPlanningCity(plan.city)!==context.city||plan.outingDate!==context.date;
  if(!eventCities.includes(context.city)||!validPlanningDate(context.date)||!changedContext)return;
  const currentExisting=!plan?model.groups.find(g=>g.id===groupId)?.outings.find(p=>p.outingDate===context.date&&!['completed','cancelled'].includes(p.lifecycle??'')):undefined;
  const currentPicked=selectedEvent&&removedEvent!==selectedEvent.id&&matchesPlanningContext(selectedEvent,{outingDate:context.date,city:context.city})?selectedEvent:undefined;
  pending.current=true;setSaving(true);setSaveError(null);
  try{
   if(currentExisting){if(currentPicked&&matchesPlanningContext(currentPicked,currentExisting)&&!currentExisting.options.some(o=>o.eventId===currentPicked.id)&&!await model.store.planAction(groupId,currentExisting.id,'proposals',{eventId:currentPicked.id,revision:currentExisting.revision}))return;if(alive.current&&enabledRef.current)onCreated(currentExisting.id);return}
   const saved=plan?await model.store.editContext(groupId,plan.id,{...context,revision:revision.current,confirmImpact}):await model.store.createOuting(groupId,currentPicked?{eventId:currentPicked.id}:context);
   if(!alive.current||!enabledRef.current)return;
   if(saved&&currentPicked&&!saved.options.some(o=>o.eventId===currentPicked.id)&&!await model.store.planAction(groupId,saved.id,'proposals',{eventId:currentPicked.id,revision:saved.revision}))return;
   if(!alive.current||!enabledRef.current)return;
   if(saved)onCreated(saved.id);else {const state=model.store.getSnapshot();if(state.contextError==='groups.contextStale')setStale(true);else if(!state.contextImpact&&!state.contextConflict)setSaveError(state.contextError??state.error??'groups.failed')}
  }catch{if(alive.current&&enabledRef.current)setSaveError('groups.failed')}finally{pending.current=false;if(alive.current)setSaving(false)}
 };
 const impact=model.contextImpact;
 const body=<View testID="group-night-form" style={{gap:20}}>
  <View style={{gap:6}}><Text style={{fontSize:23,lineHeight:30,fontWeight:'600',color:colors.text}}>{new Intl.DateTimeFormat(language==='ro'?'ro-RO':'en-GB',{weekday:'short',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'))}</Text><Text style={{fontSize:13,color:colors.muted}}>{month}</Text></View>
  {day<today?<View style={{gap:12}}><Text style={{color:colors.muted,fontSize:13,lineHeight:19}}>{copy('groups.pastNightHint')}</Text><ActionButton testID="group-choose-new-night" title={copy('groups.chooseNewNight')} tone="secondary" onPress={()=>{choose(today);setExpanded(true)}}/></View>:<View testID="group-night-ribbon" style={{height:58,position:'relative'}}><DiscoveryDateRibbon filters={filters} onChange={next=>choose(next.dateFrom||today)} onPreviewDay={choose} selectionController={ribbon} onOpenChange={setExpanded} progress={progress} calendarMotion={calendarMotion} source={ribbonSource} expanded={expanded} minimumDay={today} maximumDay={shiftCalendarDay(today,365)}/>{!expanded&&<ActionButton title={day} tone="ghost" style={{marginLeft:52,alignSelf:'flex-start'}} onPress={()=>setExpanded(true)}/>}</View>}
  <GroupCityField testID="group-night-city" label={copy('groups.city')} placeholder={copy('groups.city')} value={city} disabled={saving||model.busy||!enabled} onChange={value=>{changed();draft.current.city=value;setCity(value)}} options={eventCities.map(value=>({value,label:value}))}/>
  {!plan&&<View style={{gap:12}}>
   <Text style={{fontSize:14,lineHeight:20,color:colors.muted}}>{copy('groups.chooseEventOptional')}</Text>
    {picked&&<EventPreview testID="group-night-selected-event" title={picked.title} startTime={picked.startTime} imageUrl={picked.bannerUrl} location={picked.locationName} city={picked.city}/>}
   {onPickEvent&&<ActionButton testID="group-night-pick-event" title={copy(picked?'groups.resetChosenEvent':'groups.selectEvent')} tone="secondary" disabled={!valid} onPress={()=>{setRemovedEvent(undefined);onPickEvent(finishContext())}}/>}
  </View>}
  {existing&&<Text testID="group-night-existing-outing" style={{fontSize:13,lineHeight:19,color:colors.muted}}>{copy(canAddPicked?'groups.existingOutingHint':'groups.contextConflict')}</Text>}
  {impact?<View testID="group-context-impact" style={{padding:16,gap:12,borderRadius:20,backgroundColor:colors.raised}}>
   <Text style={{color:colors.text,fontSize:15,lineHeight:22}}>{copy('groups.contextImpact')}</Text>
   <Text style={{color:colors.muted,fontSize:13,lineHeight:19}}>{copy('groups.contextImpactCounts',{availability:impact.availabilityResponses,eventPreferences:impact.eventPreferences,attendance:impact.attendanceResponses,kept:impact.proposalsKept,incompatible:impact.proposalsIncompatible})}</Text>
   {impact.destinationCleared&&<Text style={{color:colors.warning,fontSize:13,lineHeight:19}}>{copy('groups.destinationWillClear')}</Text>}
  </View>:null}
 </View>;
 const feedback=stale?'groups.contextStale':saveError??model.contextError;
 const footer=<View style={{gap:12}}>
  {!!feedback&&<Text accessibilityRole="alert" style={{color:colors.danger,fontSize:13,lineHeight:20}}>{copy(feedback)}</Text>}
  {stale&&<ActionButton title={copy('groups.contextRefresh')} tone="secondary" onPress={()=>void model.store.loadPlan(groupId,plan!.id).then(()=>{if(!alive.current||!enabledRef.current)return;const fresh=model.store.getSnapshot().groups.find(g=>g.id===groupId)?.outings.find(p=>p.id===plan!.id);if(fresh&&fresh.revision!==undefined&&fresh.revision!==revision.current){revision.current=fresh.revision;setStale(false);changed()}})}/>}
  {model.contextConflict&&<ActionButton testID="group-open-context-conflict" title={copy('groups.openExistingOuting')} tone="secondary" onPress={()=>onCreated(model.contextConflict!)}/>}
  {impact?<ActionButton testID="group-context-confirm" title={copy('groups.confirmContextChange')} busy={saving||model.busy} disabled={!enabled} onPress={()=>void save(true)}/>:<ActionButton testID={plan?'group-save-context':'group-create-outing'} title={copy(plan?'groups.saveChanges':existing?canAddPicked?'groups.addToExistingOuting':'groups.openExistingOuting':'groups.propose')} disabled={!valid||stale||!hasChanges||!enabled} busy={saving||model.busy} onPress={()=>void save()}/>}
 </View>;
 return renderShell?renderShell(body,footer):<View style={{gap:20}}>{body}{footer}</View>;
}
