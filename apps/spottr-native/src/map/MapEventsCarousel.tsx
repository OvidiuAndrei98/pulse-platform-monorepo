import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, PanResponder, Platform, Pressable, StyleSheet, View, type ViewInstance, type ViewStyle } from 'react-native';
import { ChevronUp, Layers } from 'lucide-react-native';
import { carouselCardAction, dismissCarouselDrag, verticalCarouselDrag } from '../../../pulse-app/src/features/events/map/carouselGestures';
import { formatDate, type Event } from '../data/events';
import { usePreferences } from '../usePreferences';
import { Text } from '../ui/Text';
import { EventImage } from '../ui/common';
import { colors } from '../ui/theme';
import { useReducedMotionPreference } from '../ui/useReducedMotionPreference';

export function MapEventsCarousel({events,activeId,width,bottom,insetLeft,insetRight,collapsed,onCollapsed,onSelect,onOpen,onHeight}:{
  events:Event[];activeId:string|null;width:number;bottom:number;insetLeft:number;insetRight:number;collapsed:boolean;
  onCollapsed:(value:boolean)=>void;onSelect:(id:string,focus:boolean)=>void;onOpen:(event:Event)=>void;onHeight:(height:number)=>void;
}) {
  const {copy,language}=usePreferences(),reduced=useReducedMotionPreference();
  const rail=useRef<FlatList<Event>>(null),toggle=useRef<ViewInstance>(null),scrollTimer=useRef<ReturnType<typeof setTimeout>|null>(null),dragging=useRef(false),clearDrag=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [focused,setFocused]=useState<string|null>(null),cardWidth=Math.min(336,Math.max(240,width-72));
  const current=useRef({events,activeId,onSelect});current.current={events,activeId,onSelect};
  const order=events.map(event=>event.id).join(',');
  const collapse=()=>{onCollapsed(true);requestAnimationFrame(()=>toggle.current?.focus());};
  const gestures=useMemo(()=>PanResponder.create({
    onStartShouldSetPanResponderCapture:()=>{dragging.current=false;return false;},
    onMoveShouldSetPanResponderCapture:(_,gesture)=>verticalCarouselDrag(gesture.dx,gesture.dy),
    onPanResponderGrant:()=>{dragging.current=true;},
    onPanResponderRelease:(_,gesture)=>{if(dismissCarouselDrag(gesture.dx,gesture.dy))collapse();if(clearDrag.current)clearTimeout(clearDrag.current);clearDrag.current=setTimeout(()=>{dragging.current=false;},250);},
    onPanResponderTerminate:()=>{dragging.current=false;},
  }),[onCollapsed]);
  useEffect(()=>{
    if(collapsed)return;
    const index=events.findIndex(event=>event.id===activeId);
    if(index>=0)rail.current?.scrollToIndex({index,animated:!reduced});
  },[activeId,cardWidth,collapsed,reduced,order]);
  useEffect(()=>()=>{if(scrollTimer.current)clearTimeout(scrollTimer.current);if(clearDrag.current)clearTimeout(clearDrag.current);},[]);
  useEffect(()=>{if(scrollTimer.current)clearTimeout(scrollTimer.current);},[collapsed,cardWidth]);
  const settle=(offset:number)=>{
    const value=current.current,index=Math.max(0,Math.min(value.events.length-1,Math.round(offset/(cardWidth+12)))),event=value.events[index];
    if(event&&event.id!==value.activeId)value.onSelect(event.id,true);
  };
  return <View testID="map-events-tray" {...gestures.panHandlers} onLayout={event=>onHeight(event.nativeEvent.layout.height)} style={{position:'absolute',left:0,right:0,bottom,...(Platform.OS==='web'?{touchAction:'pan-x' as const}:{})}}>
    <Pressable ref={toggle} testID="map-carousel-toggle" accessibilityRole="button" accessibilityLabel={copy(collapsed?'eventMap.showEvents':'eventMap.hideEvents')} accessibilityState={{expanded:!collapsed}} aria-expanded={!collapsed}
      onPress={()=>collapsed?onCollapsed(false):collapse()} onFocus={()=>setFocused('$toggle')} onBlur={()=>setFocused(null)} style={[s.handle,collapsed&&s.closedHandle,Platform.OS==='web'&&({touchAction:'none'} as ViewStyle),Platform.OS==='web'&&focused==='$toggle'&&s.focus]}>
      {collapsed?<><Layers color={colors.text} size={16}/><Text style={{color:colors.text,fontSize:14}}>{copy('eventMap.showEvents')}</Text><Text style={{color:colors.muted,fontSize:14,fontVariant:['tabular-nums']}}>{events.length}</Text><ChevronUp color={colors.text} size={16}/></>:<View accessible={false} style={s.grip}/>}
    </Pressable>
    {!collapsed&&<View testID="map-events-carousel"><FlatList ref={rail} horizontal data={events} keyExtractor={event=>event.id}
      showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingLeft:Math.max(16,insetLeft),paddingRight:Math.max(16,insetRight),gap:12,paddingVertical:4}}
      snapToInterval={cardWidth+12} decelerationRate="fast" keyboardShouldPersistTaps="handled"
      getItemLayout={(_,index)=>({length:cardWidth+12,offset:(cardWidth+12)*index,index})}
      onScrollToIndexFailed={info=>rail.current?.scrollToOffset({offset:info.index*(cardWidth+12),animated:false})}
      scrollEventThrottle={32}
      onScroll={event=>{const offset=event.nativeEvent.contentOffset.x;if(scrollTimer.current)clearTimeout(scrollTimer.current);scrollTimer.current=setTimeout(()=>{scrollTimer.current=null;settle(offset);},140);}}
      onMomentumScrollEnd={event=>{if(scrollTimer.current)clearTimeout(scrollTimer.current);scrollTimer.current=null;settle(event.nativeEvent.contentOffset.x);}}
      renderItem={({item})=><Pressable testID={'map-event-card-'+item.id} accessibilityRole="button"
        accessibilityLabel={`${copy(item.id===activeId?'events.viewEvent':'eventMap.selectEvent')}: ${item.title}. ${formatDate(item.startTime,language,true)}. ${item.locationName||item.city||''}`}
        accessibilityState={{selected:item.id===activeId}}
        onPress={()=>{if(dragging.current)return;if(carouselCardAction(item.id,activeId)==='open')onOpen(item);else onSelect(item.id,true);}}
        onFocus={Platform.OS==='web'?()=>setFocused(item.id):undefined} onBlur={()=>setFocused(null)}
        style={[s.card,{width:cardWidth,borderColor:item.id===activeId?colors.accent:colors.line},Platform.OS==='web'&&focused===item.id&&s.focus]}>
        <EventImage uri={item.bannerUrl} style={{width:72,height:88,borderRadius:8,borderWidth:1,borderColor:'#ffffff1a'}}/>
        <View style={{flex:1,minWidth:0,gap:4}}>
          <Text numberOfLines={2} style={{color:colors.text,fontSize:16,lineHeight:22,fontWeight:'700'}}>{item.title}</Text>
          <Text numberOfLines={1} style={s.meta}>{formatDate(item.startTime,language,true)}</Text>
          <Text numberOfLines={1} style={[s.meta,{color:colors.muted}]}>{item.locationName||item.city}</Text>
          <Text style={[s.meta,{fontWeight:'600'}]}>{copy(item.id===activeId?'events.viewEvent':'eventMap.selectEvent')} →</Text>
        </View>
      </Pressable>}/></View>}
  </View>;
}
const s=StyleSheet.create({
  handle:{alignSelf:'center',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,height:44,width:52,padding:0,marginBottom:6,borderRadius:16,backgroundColor:'transparent'},
  closedHandle:{height:undefined,minHeight:44,width:undefined,paddingHorizontal:12,paddingVertical:4,marginBottom:0,borderWidth:1,borderColor:colors.line,borderRadius:24,backgroundColor:'#171717'},
  grip:{width:28,height:3,borderRadius:2,backgroundColor:colors.muted},
  card:{minHeight:112,padding:11,borderRadius:20,borderWidth:1,backgroundColor:'#171717',flexDirection:'row',alignItems:'center',gap:12},
  focus:{outlineColor:colors.focus,outlineWidth:2,outlineOffset:-4,outlineStyle:'solid'},
  meta:{color:colors.text,fontSize:12,lineHeight:18},
});
