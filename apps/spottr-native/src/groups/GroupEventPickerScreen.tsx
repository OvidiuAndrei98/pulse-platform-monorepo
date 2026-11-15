import React,{useEffect,useRef,useState} from 'react';
import {View} from 'react-native';
import {CommonActions,useIsFocused,useNavigation} from '@react-navigation/native';
import type {PlanEvent} from '@packages/app-core/outings/model';
import {GroupAccess,GroupPage,g} from './GroupPage';
import {EventChooser} from './GroupEventChooser';
import {GroupNightSheet} from './GroupNightSheet';
import {GroupNightForm} from './GroupNightForm';
import {useGroups} from './useGroups';
import {usePreferences} from '../usePreferences';
import {ActionButton} from '../ui/ActionButton';
import {Feedback,Loading} from '../ui/common';
import {FormScrollView} from '../ui/KeyboardForms';
import {Text} from '../ui/Text';

export type GroupEventPickerParams={groupId:string;planId?:string;selectionSourceKey?:string;date?:string;city?:string};
export function GroupEventPickerScreen({groupId,planId,selectionSourceKey,date,city}:GroupEventPickerParams){
 const model=useGroups(groupId),{copy}=usePreferences(),navigation=useNavigation<any>(),focused=useIsFocused();
 const plan=model.groups.find(group=>group.id===groupId)?.outings.find(plan=>plan.id===planId),[editing,setEditing]=useState(false),[error,setError]=useState<string|null>(null),pending=useRef(false),active=useRef(focused);active.current=focused;
 useEffect(()=>{active.current=focused;return()=>{active.current=false}},[focused]);
 useEffect(()=>{if(planId&&!plan&&model.groups.some(g=>g.id===groupId&&g.status==='accepted'))void model.store.loadPlan(groupId,planId)},[planId,plan?.id,model.store,groupId,model.groups.some(g=>g.id===groupId&&g.status==='accepted')]);
 const owner=plan?.ownerId===model.user?.id,closed=!!plan&&['completed','cancelled'].includes(plan.lifecycle??'');
 const select=async(id:string)=>{
  if(pending.current)return;
  if(selectionSourceKey){const event=model.events.find(event=>event.id===id);if(!event)return;navigation.dispatch({...CommonActions.setParams({pickedEvent:event}),source:selectionSourceKey});navigation.goBack();return}
  pending.current=true;setError(null);
  try{const ok=plan?await model.store.planAction(groupId,plan.id,'proposals',{eventId:id,revision:plan.revision}):await model.store.send(groupId,id);if(active.current){if(ok)navigation.canGoBack()?navigation.goBack():navigation.navigate(plan?'GroupOuting':'FriendGroup',plan?{groupId,planId:plan.id}:{id:groupId});else setError(model.store.getSnapshot().error??'groups.failed')}}finally{pending.current=false}
 };
 return <GroupPage groupId={groupId} testID="group-event-picker-page" title={copy(planId?'groups.proposeEvent':selectionSourceKey?'groups.selectEvent':'groups.share')}><GroupAccess model={model} groupId={groupId}>
  {!!error&&<View style={{paddingHorizontal:20,paddingTop:8}}><Text accessibilityRole="alert" style={g.error}>{copy(error)}</Text></View>}
  {planId&&!plan?(model.error?<Feedback compact title={copy(model.error)} retry={()=>void model.store.loadPlan(groupId,planId)}/>:<Loading/>):closed?<View style={g.content}><Text style={g.body}>{copy(plan?.lifecycle==='cancelled'?'groups.cancelled':'groups.completed')}</Text></View>:plan&&!plan.outingDate?<View style={g.content}><Text style={g.body}>{copy('groups.chooseNight')}</Text>{owner&&<ActionButton title={copy('groups.editNight')} onPress={()=>setEditing(true)}/>}</View>:<EventChooser model={model} plan={plan} context={selectionSourceKey?{date,city}:undefined} onEdit={owner&&!closed?()=>setEditing(true):undefined} onSelect={id=>void select(id)}/>}
  {editing&&plan&&owner&&!closed&&<GroupNightSheet model={model} groupId={groupId} plan={plan} onClose={()=>setEditing(false)} onSaved={id=>{if(id!==planId)navigation.replace('GroupOuting',{groupId,planId:id})}}/>}
 </GroupAccess></GroupPage>;
}
export function GroupNewOutingScreen({groupId,routeKey,pickedEvent}:{groupId:string;routeKey:string;pickedEvent?:PlanEvent}){
 const model=useGroups(groupId),{copy}=usePreferences(),navigation=useNavigation<any>(),focused=useIsFocused();
 return <GroupPage groupId={groupId} title={copy('groups.propose')} testID="group-new-outing"><GroupAccess model={model} groupId={groupId}><GroupNightForm model={model} groupId={groupId} active={focused} selectedEvent={pickedEvent} onPickEvent={context=>navigation.navigate('GroupEventPicker',{groupId,selectionSourceKey:routeKey,...context})} onCreated={planId=>navigation.replace('GroupOuting',{groupId,planId})} renderShell={(body,footer)=><View style={{flex:1}}><FormScrollView contentContainerStyle={g.content}>{body}</FormScrollView><View style={[g.content,{paddingVertical:16}]}>{footer}</View></View>}/></GroupAccess></GroupPage>;
}
