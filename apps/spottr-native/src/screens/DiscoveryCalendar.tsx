import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { usePreferences } from '../PreferencesProvider';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { calendarCells, productToday, selectCalendarDay, shiftCalendarDay } from '../../../pulse-app/src/features/events/discoveryFilters';

export function DiscoveryCalendar({from='',to='',onChange}:{from?:string;to?:string;onChange:(from:string,to:string)=>void}) {
  const {copy,language}=usePreferences(),locale=language==='ro'?'ro-RO':'en-GB';
  const [month,setMonth]=useState((from||productToday()).slice(0,7)+'-01');
  const date=(day:string)=>new Date(day+'T12:00:00Z'),today=productToday();
  const move=(by:number)=>{const next=date(month);next.setUTCMonth(next.getUTCMonth()+by);setMonth(next.toISOString().slice(0,10));};
  return <View testID="discovery-calendar" style={{gap:12}}>
    <Text style={{color:colors.muted,fontSize:12}}>{copy('filters.rangeHint')}</Text>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8}}>
      <Pressable accessibilityRole="button" accessibilityLabel={copy('filters.previousMonth')} onPress={()=>move(-1)} style={{minWidth:36,minHeight:36,alignItems:'center',justifyContent:'center'}}><ChevronLeft color="white" size={16}/></Pressable>
      <Text accessibilityLiveRegion="polite" style={{color:colors.text,fontSize:14,fontWeight:'600'}}>{new Intl.DateTimeFormat(locale,{month:'long',year:'numeric',timeZone:'UTC'}).format(date(month))}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={copy('filters.nextMonth')} onPress={()=>move(1)} style={{minWidth:36,minHeight:36,alignItems:'center',justifyContent:'center'}}><ChevronRight color="white" size={16}/></Pressable>
    </View>
    <View style={{flexDirection:'row',flexWrap:'wrap'}}>
      {Array.from({length:7},(_,i)=>shiftCalendarDay('2026-10-26',i)).map(day=><View key={day} style={{width:'14.285714%',alignItems:'center',paddingBottom:8}}><Text style={{color:colors.muted,fontSize:12}}>{new Intl.DateTimeFormat(locale,{weekday:'narrow',timeZone:'UTC'}).format(date(day))}</Text></View>)}
      {calendarCells(month).map(day=>{
        const endpoint=day===from||day===to,inside=!!from&&!!to&&day>from&&day<to;
        return <Pressable key={day} testID={'discovery-day-'+day} accessibilityRole="button" accessibilityLabel={new Intl.DateTimeFormat(locale,{dateStyle:'full',timeZone:'UTC'}).format(date(day))}
          accessibilityState={{selected:endpoint||inside,disabled:day<today}} disabled={day<today}
          onPress={()=>{const value=selectCalendarDay(from,to,day,true);onChange(value.dateFrom,value.dateTo);}}
          style={{width:'14.285714%',minHeight:36,alignItems:'center',justifyContent:'center',borderRadius:8,backgroundColor:endpoint?colors.accent:inside?'#ff004426':'transparent',opacity:day<today?.3:1}}>
          <Text style={{fontSize:endpoint?20:14,fontWeight:endpoint||inside?'700':'400',color:endpoint?'white':day.slice(0,7)===month.slice(0,7)?colors.text:colors.muted,textDecorationLine:inside?'underline':'none'}}>{Number(day.slice(-2))}</Text>
        </Pressable>;
      })}
    </View>
    <Text accessibilityLiveRegion="polite" style={{color:colors.muted,fontSize:12}}>{from&&!to?copy('filters.chooseRangeEnd'):to?copy('filters.rangeSelected'):copy('filters.calendarHint')}</Text>
    <Pressable accessibilityRole="button" onPress={()=>onChange('','')} style={{minHeight:36,justifyContent:'center'}}><Text style={{color:colors.muted,fontSize:12,textDecorationLine:'underline'}}>{copy('filters.clearDates')}</Text></Pressable>
  </View>;
}
