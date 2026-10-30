import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, Keyboard, Platform, Pressable, TextInput, View, useWindowDimensions } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { CalendarDays, List, Map as MapIcon, MapPin, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { usePreferences } from '../PreferencesProvider';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import type { EventFilters } from '../../../pulse-app/src/features/events/types';

export function DiscoveryToolbar({filters,onChange,view,onViewChange,onFilters,onCalendar,onCity,onHeight}:{
  filters:EventFilters;onChange:(value:EventFilters)=>void;view:'list'|'map';onViewChange:(view:'list'|'map')=>void;
  onFilters:()=>void;onCalendar:()=>void;onCity:()=>void;onHeight:(height:number)=>void;
}) {
  const {copy}=usePreferences(),{width}=useWindowDimensions(),wide=width>=1024&&Platform.OS==='web';
  const focused=useIsFocused();
  const [open,setOpen]=useState(!!filters.q),[rowWidth,setRowWidth]=useState(width-40),[reduced,setReduced]=useState(true);
  const [inputFocused,setInputFocused]=useState(false);
  const progress=useRef(new Animated.Value(filters.q?1:0)).current,input=useRef<TextInput>(null),trigger=useRef<View>(null);
  useEffect(()=>{let alive=true;void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(alive)setReduced(value);}).catch(()=>{});const listener=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);return()=>{alive=false;listener.remove();};},[]);
  useEffect(()=>{const animation=Animated.timing(progress,{toValue:open?1:0,duration:reduced?0:200,easing:Easing.bezier(.2,0,0,1),useNativeDriver:false});animation.start();if(open){const frame=requestAnimationFrame(()=>input.current?.focus());return()=>{cancelAnimationFrame(frame);animation.stop();};}return()=>animation.stop();},[open,reduced,progress]);
  useEffect(()=>{if(filters.q)setOpen(true);},[filters.q]);
  const glass={minHeight:44,borderRadius:24,borderWidth:1,borderColor:'#ffffff1a',backgroundColor:'#121418ed'};
  const circle={...glass,width:44,alignItems:'center' as const,justifyContent:'center' as const};
  const close=()=>{onChange({...filters,q:''});setOpen(false);if(wide)input.current?.focus();else{Keyboard.dismiss();requestAnimationFrame(()=>trigger.current?.focus());}};
  useEffect(()=>{if(!open||wide||!focused||Platform.OS!=='android')return;const listener=BackHandler.addEventListener('hardwareBackPress',()=>{close();return true;});return()=>listener.remove();},[open,wide,focused,filters,onChange]);
  return <View testID="discovery-toolbar" onLayout={event=>{setRowWidth(event.nativeEvent.layout.width);onHeight(event.nativeEvent.layout.height);}} style={{flexDirection:'row',alignItems:'center',gap:8,flexWrap:wide?'wrap':'nowrap'}}>
    <Animated.View style={[glass,{overflow:'hidden',height:44,flexDirection:'row',padding:wide||!open?4:0,width:wide?152:progress.interpolate({inputRange:[0,1],outputRange:[152,44]})}]}>
      {open&&!wide?<Pressable accessibilityRole="button" accessibilityLabel={copy(view==='map'?'eventMap.list':'eventMap.map')} onPress={()=>onViewChange(view==='map'?'list':'map')} style={{width:44,height:42,alignItems:'center',justifyContent:'center'}}>{view==='map'?<List size={16} color="white"/>:<MapIcon size={16} color="white"/>}</Pressable>:
        (['list','map'] as const).map(mode=><Pressable key={mode} testID={'events-'+mode+'-toggle'} accessibilityRole="button" accessibilityLabel={copy(mode==='list'?'eventMap.list':'eventMap.map')} accessibilityState={{selected:mode===view}} onPress={()=>onViewChange(mode)} style={{width:72,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:mode===view?colors.accent:'transparent'}}>{mode==='list'?<List size={16} color="white"/>:<MapIcon size={16} color="white"/>}</Pressable>)}
    </Animated.View>
    <Animated.View style={[glass,{borderColor:inputFocused?'white':glass.borderColor,overflow:'hidden',width:wide?undefined:progress.interpolate({inputRange:[0,1],outputRange:[44,Math.max(44,rowWidth-104)]}),...(wide?{flex:1,minWidth:180,maxWidth:440}:{}),flexDirection:'row',alignItems:'center'}]}>
      {open||wide?<View style={{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:8,paddingLeft:12,paddingRight:4}}>
        <Search size={16} color={colors.muted}/><TextInput ref={input} testID="discovery-search" accessibilityLabel={copy('filters.searchEvents')} placeholder={copy('filters.searchEvents')} placeholderTextColor={colors.muted} value={filters.q??''}
          onChangeText={q=>onChange({...filters,q:Array.from(q).slice(0,120).join('')})} autoCapitalize="none" autoCorrect={false} returnKeyType="search" onSubmitEditing={()=>Keyboard.dismiss()} onKeyPress={event=>{if(event.nativeEvent.key==='Escape')close();}}
          onFocus={()=>setInputFocused(true)} onBlur={()=>setInputFocused(false)} style={{flex:1,minWidth:0,fontSize:16,minHeight:42,color:colors.text,padding:0,...(Platform.OS==='web'?{outlineWidth:0,outlineStyle:'solid' as const}:{})}}/>
        <Pressable accessibilityRole="button" accessibilityLabel={copy('filters.closeSearch')} onPress={close} style={{width:36,height:40,alignItems:'center',justifyContent:'center'}}><X size={16} color="white"/></Pressable>
      </View>:<Pressable ref={trigger} testID="discovery-search-toggle" accessibilityRole="button" accessibilityLabel={copy('filters.searchEvents')} onPress={()=>setOpen(true)} style={{width:44,height:42,alignItems:'center',justifyContent:'center'}}><Search size={16} color="white"/></Pressable>}
    </Animated.View>
    {wide&&<>
      <Pressable testID="discovery-calendar-toggle" accessibilityRole="button" accessibilityLabel={copy('filters.calendar')} onPress={onCalendar} style={{...glass,maxWidth:210,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:12,paddingVertical:10}}><CalendarDays size={16} color={colors.accent}/><Text style={{color:colors.text,fontSize:14,flexShrink:1}}>{filters.date==='Custom'&&filters.dateFrom?filters.dateFrom+(filters.dateTo!==filters.dateFrom?' – '+filters.dateTo:''):copy('filters.calendar')}</Text></Pressable>
      <Pressable testID="discovery-city" accessibilityRole="button" accessibilityLabel={copy('filters.city')} onPress={onCity} style={{...glass,maxWidth:180,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:12}}><MapPin size={16} color={colors.accent}/><Text style={{color:colors.text,fontSize:14,flexShrink:1}}>{filters.city||copy('filters.allCities')}</Text></Pressable>
    </>}
    <Pressable testID="event-filters" accessibilityRole="button" accessibilityLabel={copy('common.filters')} onPress={onFilters} style={circle}><SlidersHorizontal size={16} color="white"/></Pressable>
  </View>;
}
