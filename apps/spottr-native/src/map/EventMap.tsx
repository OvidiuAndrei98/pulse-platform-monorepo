import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { Map as MapView, Camera, Marker, type MapRef, type CameraRef, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { MapPin } from 'lucide-react-native';
import darkStyle from '../../../pulse-app/src/features/events/map/openFreeMapDark.json';
import { usePreferences } from '../PreferencesProvider';
import { Text } from '../ui/Text';
import { Feedback } from '../ui/common';
import { colors } from '../ui/theme';
import { isLive } from '../data/events';
import { clusterEvents, clusterZoom, radialPositions, validCoordinate, type Coordinate } from './geometry';
import type { EventMapProps } from './types';

export function EventMap(props: EventMapProps) {
  const {copy}=usePreferences();
  const map=useRef<MapRef>(null),camera=useRef<CameraRef>(null),latest=useRef(props);latest.current=props;
  const [level,setLevel]=useState(props.zoom),[ready,setReady]=useState(false),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0),[height,setHeight]=useState(844);
  const reduced=useRef(false),revision=useRef(0);
  useEffect(()=>{
    let disposed=false;
    void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(!disposed)reduced.current=value;}).catch(()=>{});
    const listener=AccessibilityInfo.addEventListener('reduceMotionChanged',value=>{reduced.current=value;});
    return()=>{disposed=true;revision.current++;listener.remove();};
  },[]);
  const clusters=useMemo(()=>clusterEvents(props.events,level+1),[props.events,level]);
  const rows=useMemo(()=>clusters.flatMap(cluster=>cluster.events.length===1?[{event:cluster.events[0]!,coordinate:cluster}]:level>17?radialPositions(cluster,level+1):[]),[clusters,level]);
  const selected=rows.find(row=>row.event.id===props.selected)?.coordinate;
  const selectedRef=useRef(selected);selectedRef.current=selected;
  const updatePoint=()=>{
    const version=++revision.current,coordinate=selectedRef.current;
    if(!coordinate){latest.current.onSelectedPoint(null);return;}
    void map.current?.project([coordinate.longitude,coordinate.latitude]).then(point=>{
      if(version===revision.current)latest.current.onSelectedPoint({x:point[0],y:point[1]});
    }).catch(()=>{if(version===revision.current)latest.current.onSelectedPoint(null);});
  };
  useEffect(updatePoint,[selected?.latitude,selected?.longitude]);
  useEffect(()=>{
    if(ready)camera.current?.easeTo({center:[props.center.longitude,props.center.latitude],zoom:props.zoom,duration:reduced.current?0:250});
  },[ready,props.center.latitude,props.center.longitude,props.zoom]);
  useEffect(()=>{
    if(!ready||!props.focus)return;
    const event=props.events.find(event=>event.id===props.focus?.id);
    if(!event||!validCoordinate(event as Coordinate))return;
    camera.current?.flyTo({center:[event.longitude!,event.latitude!],zoom:Math.max(18,level),pitch:50,
      padding:{top:Math.min(80,height*.12),right:36,bottom:Math.min((props.attributionBottom??0)+24,height-80),left:36},duration:reduced.current?0:550});
  },[ready,props.focus?.id,props.focus?.revision]);
  return <>
    <MapView key={attempt} ref={map} testID="event-map" style={StyleSheet.absoluteFill}
      mapStyle={darkStyle as unknown as StyleSpecification} attribution={true} attributionPosition={{left:4,bottom:props.attributionBottom??112}} logo={false}
      onLayout={event=>setHeight(event.nativeEvent.layout.height)}
      onPress={()=>props.onSelect(null)}
      onDidFinishLoadingMap={()=>{setReady(true);setFailed(false);updatePoint();}}
      onDidFailLoadingMap={()=>setFailed(true)} onRegionIsChanging={updatePoint}
      onRegionDidChange={event=>{const view=event.nativeEvent;setLevel(view.zoom);props.onViewport({latitude:view.center[1],longitude:view.center[0]},view.zoom);updatePoint();}}>
      <Camera ref={camera} initialViewState={{center:[props.center.longitude,props.center.latitude],zoom:props.zoom,pitch:45}} minZoom={3} maxZoom={20}/>
      {validCoordinate(props.location)&&<Marker id="user-location" lngLat={[props.location.longitude,props.location.latitude]}><View style={s.location}/></Marker>}
      {level<=17&&clusters.filter(cluster=>cluster.events.length>1).map(cluster=><Marker key={'cluster:'+cluster.key} id={'cluster:'+cluster.key} lngLat={[cluster.longitude,cluster.latitude]}
        onPress={event=>{event.stopPropagation();camera.current?.flyTo({center:[cluster.longitude,cluster.latitude],zoom:clusterZoom(cluster,level),duration:reduced.current?0:450});}}>
        <View style={s.cluster} accessible accessibilityRole="button" accessibilityLabel={copy('eventMap.cluster',{count:cluster.events.length})}><Text style={{color:'white',fontWeight:'700'}}>{cluster.events.length}</Text></View>
      </Marker>)}
      {rows.map(({event,coordinate})=><Marker key={event.id} id={event.id} lngLat={[coordinate.longitude,coordinate.latitude]} selected={event.id===props.selected}
        accessibilityRole="button" accessibilityLabel={event.title} onPress={click=>{click.stopPropagation();props.onSelect(event.id);}}>
        <View style={[s.pin,event.id===props.selected&&s.selected]}><MapPin size={22} color={event.id===props.selected?'white':colors.accent}/>{isLive(event)&&<View style={s.live}/>}</View>
      </Marker>)}
    </MapView>
    {failed&&<View style={s.failure}><Feedback compact title={copy('feedback.loadFailed')} retry={()=>{setReady(false);setFailed(false);setAttempt(value=>value+1);}}/></View>}
  </>;
}
const s=StyleSheet.create({
  pin:{width:44,height:44,borderRadius:22,borderWidth:2,borderColor:colors.accent,backgroundColor:'#19191c',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 16px #0008'},
  selected:{width:48,height:48,borderRadius:24,borderWidth:3,borderColor:'white',backgroundColor:colors.accent},
  live:{position:'absolute',top:0,right:0,width:8,height:8,borderRadius:4,borderWidth:2,borderColor:'white',backgroundColor:colors.accent},
  cluster:{width:44,height:44,borderRadius:22,borderWidth:2,borderColor:colors.accent,backgroundColor:'#19191c',alignItems:'center',justifyContent:'center'},
  location:{width:14,height:14,borderRadius:7,borderWidth:2,borderColor:'white',backgroundColor:colors.accent},
  failure:{position:'absolute',top:90,left:16,right:70,backgroundColor:'#19191cf5',borderRadius:8,padding:8},
});
