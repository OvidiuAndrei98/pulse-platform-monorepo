import React,{useMemo,useState} from 'react';
import {View} from 'react-native';
import {useSharedValue} from 'react-native-reanimated';
import {Plus} from 'lucide-react-native';
import {eventCities} from '@packages/app-core/events/constants';
import type {EventFilters} from '@packages/app-core/events/types';
import {planningToday,validPlanningDate} from '@packages/app-core/outings/model';
import {shiftCalendarDay} from '@packages/app-core/events/discoveryFilters';
import {useGroups} from './useGroups';
import {usePreferences} from '../usePreferences';
import {DashboardDropdown} from '../dashboard/DashboardDropdown';
import {DiscoveryDateRibbon} from '../screens/DiscoveryDateRibbon';
import {Text} from '../ui/Text';
import {ActionButton} from '../ui/ActionButton';
import {colors} from '../ui/theme';

const ribbonSource={x:0,y:0};
export function GroupNightForm({model,groupId,onCreated}:{model:ReturnType<typeof useGroups>;groupId:string;onCreated:(id:string)=>void}){
 const {copy,language}=usePreferences(),[city,setCity]=useState(()=>model.groups.find(g=>g.id===groupId)?.outings.find(p=>p.city)?.city??''),[days,setDays]=useState([planningToday()]),[together,setTogether]=useState(false),[active,setActive]=useState(0),[expanded,setExpanded]=useState(true);
 const progress=useSharedValue(1),calendarMotion=useSharedValue({opacity:1,scale:1,x:0,y:0}),today=planningToday();
 const day=days[active]??days[0]!;
 const filters=useMemo<EventFilters>(()=>({categories:[],vibes:[],distance:0,city,date:'Custom',dateFrom:day,dateTo:day}),[city,day]);
 const month=new Intl.DateTimeFormat(language==='ro'?'ro-RO':'en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
 const choose=(value:string)=>{if(validPlanningDate(value))setDays(old=>old.map((d,i)=>i===active?value:d))};
 const valid=eventCities.includes(city)&&days.every(d=>validPlanningDate(d))&&new Set(days).size===days.length;
 return <View style={{gap:18}}>
  <DashboardDropdown label={copy('groups.city')} placeholder={copy('groups.city')} value={city} onChange={setCity} options={eventCities.map(value=>({value,label:value}))}/>
  <Text style={{fontSize:15,fontWeight:'600',color:colors.text}}>{month}</Text>
  <View testID="group-night-ribbon" style={{height:58,position:'relative'}}><DiscoveryDateRibbon filters={filters} onChange={next=>choose(next.dateFrom||today)} onOpenChange={setExpanded} progress={progress} calendarMotion={calendarMotion} source={ribbonSource} expanded={expanded} minimumDay={today} maximumDay={shiftCalendarDay(today,365)}/>{!expanded&&<ActionButton title={day} tone="ghost" style={{marginLeft:52,alignSelf:'flex-start'}} onPress={()=>setExpanded(true)}/>}</View>
  <ActionButton title={copy('groups.chooseTogether')} tone={together?'primary':'secondary'} accessibilityRole="checkbox" aria-checked={together} accessibilityState={{checked:together}} onPress={()=>{setTogether(!together);setDays(old=>old.slice(0,1));setActive(0)}}/>
  {together&&<View style={{gap:8,flexDirection:'row',flexWrap:'wrap'}}>{days.map((value,index)=><ActionButton key={index} testID={'group-night-'+index} title={new Intl.DateTimeFormat(language==='ro'?'ro-RO':'en-GB',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'))} tone={index===active?'primary':'secondary'} size="compact" onPress={()=>{setActive(index);setExpanded(true)}}/>)}</View>}
  {together&&days.length<3&&<ActionButton title={copy('groups.moreDays')} tone="ghost" icon={<Plus size={16}/>} onPress={()=>{setActive(days.length);setExpanded(true);setDays(old=>[...old,shiftCalendarDay(old.at(-1)!,1)])}}/>}
  <ActionButton testID="group-create-outing" title={copy('groups.propose')} disabled={!valid} busy={model.busy} onPress={()=>void model.store.createOuting(groupId,{city,...(together&&days.length>1?{dates:days}:{date:days[0]})}).then(plan=>{if(plan)onCreated(plan.id)})}/>
 </View>
}
