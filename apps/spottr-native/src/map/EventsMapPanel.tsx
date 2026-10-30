import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import * as Location from 'expo-location';
import { Clock, LocateFixed, Minus, Plus, X } from 'lucide-react-native';
import { EventMap } from './EventMap';
import { DEFAULT_CENTER, validCoordinate, zoomForDistance, type Coordinate, type Point } from './geometry';
import { formatDate, isLive, type Event } from '../data/events';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { EventImage, Feedback } from '../ui/common';
import { usePreferences } from '../usePreferences';
import { formatEventTime } from '../../../pulse-app/src/features/events/dateFormat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassButtonGroup } from '../ui/GlassButtonGroup';
import { GlassPressable } from '../ui/GlassPressable';
import { GlassSurface } from '../ui/GlassSurface';

export function EventsMapPanel({ events, cityCenter, distance, onOpen, loading, error, retry,toolbarHeight=44,onLocationChange }: { events: Event[]; cityCenter?: Coordinate | null; distance: number; onOpen: (event: Event) => void; loading: boolean; error: boolean; retry: () => void;toolbarHeight?:number;onLocationChange?:(coordinate:readonly[number,number])=>void }) {
  const { copy, language } = usePreferences(), [location, setLocation] = useState<Coordinate | null>(null);
  const [camera, setCamera] = useState({ center: cityCenter ?? DEFAULT_CENTER, zoom: 12 });
  const [selected, setSelected] = useState<string | null>(null), [point, setPoint] = useState<Point | null>(null), [previewHeight, setPreviewHeight] = useState(150);
  const [locating, setLocating] = useState(false), [locationError, setLocationError] = useState('');
  const viewport = useRef(camera), generation = useRef(0), pending = useRef(false);
  const dimensions = useWindowDimensions(), [width, setWidth] = useState(dimensions.width);
  const rail = useRef<FlatList<Event>>(null);
  const [railHeight,setRailHeight]=useState(140);
  const [focusedCard,setFocusedCard]=useState<string|null>(null);
  const [focus,setFocus]=useState<{id:string;revision:number}|null>(null);
  const scrollTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const mapEvents = useMemo(() => events.filter(event => validCoordinate(event as Coordinate)), [events]);
  const carousel = Platform.OS !== 'web' || dimensions.width < 768;
  const activeId = mapEvents.some(event => event.id === selected) ? selected : mapEvents[0]?.id ?? null;
  const cardWidth = Math.min(360, Math.max(240, width - 72));
  const inset = useSafeAreaInsets(), controlTop = Math.max(24, inset.top)+toolbarHeight+12;
  const bottom = (Platform.OS === 'ios' ? 108 : 104) + inset.bottom;
  const choose = (id: string, focusMap = false) => {
    setSelected(id);
    if(focusMap)setFocus(current=>({id,revision:(current?.revision??0)+1}));
  };
  const settle = (offset: number) => {
    const index=Math.max(0,Math.min(mapEvents.length-1,Math.round(offset/(cardWidth+12))));
    const event=mapEvents[index];if(event&&event.id!==activeId)choose(event.id,true);
  };
  useEffect(()=>{if(scrollTimer.current)clearTimeout(scrollTimer.current);return()=>{if(scrollTimer.current)clearTimeout(scrollTimer.current);};},[activeId]);
  useEffect(() => {
    if (selected && !mapEvents.some(event => event.id === selected)) setSelected(null);
  }, [mapEvents, selected]);
  useEffect(() => {
    const index = mapEvents.findIndex(event => event.id === activeId);
    if (carousel && index >= 0) rail.current?.scrollToIndex({index, animated:false});
  }, [activeId, cardWidth, carousel, mapEvents]);
  useEffect(() => () => { generation.current++; pending.current = false; }, []);
  useEffect(() => { setCamera({ center: cityCenter ?? location ?? DEFAULT_CENTER, zoom: zoomForDistance(distance) }); }, [cityCenter?.latitude, cityCenter?.longitude, distance]);
  const locate = async () => {
    if (pending.current) return;
    pending.current = true; setLocating(true); setLocationError('');
    const version = generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        (async () => {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (!permission.granted) throw new Error('feedback.locationDenied');
          return await Location.getLastKnownPositionAsync({ maxAge: 60_000 }) ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('feedback.locationTimeout')), 15_000); }),
      ]);
      if (!validCoordinate(result.coords)) throw new Error('feedback.locationUnavailable');
      if (version === generation.current) { setLocation(result.coords);onLocationChange?.([result.coords.latitude,result.coords.longitude]); setCamera({ center: result.coords, zoom: viewport.current.zoom }); }
    } catch (cause) {
      if (version === generation.current) setLocationError(cause instanceof Error && ['feedback.locationDenied', 'feedback.locationTimeout'].includes(cause.message) ? cause.message : 'feedback.locationUnavailable');
    } finally {
      clearTimeout(timer);
      if (version === generation.current) { pending.current = false; setLocating(false); }
    }
  };
  useEffect(() => { void locate(); }, []);
  const changeZoom = (delta: number) => setCamera({ center: viewport.current.center, zoom: Math.max(3, Math.min(20, viewport.current.zoom + delta)) });
  const event = events.find(row => row.id === selected), previewWidth = Math.min(width - 32, width >= 768 ? 320 : 304);
  return <View testID="events-map-panel" onLayout={e => setWidth(e.nativeEvent.layout.width)} style={{ flex: 1, overflow: 'hidden', backgroundColor: '#030604' }}>
    <EventMap events={mapEvents} center={camera.center} zoom={camera.zoom} location={location} selected={carousel ? activeId : selected}
      onSelect={id => { setSelected(id); setPoint(null); }}
      onViewport={(center, zoom) => { viewport.current = { center, zoom }; }}
      onSelectedPoint={carousel ? () => {} : setPoint}
      attributionBottom={carousel?bottom+(mapEvents.length?railHeight:0)+8:0} focus={focus} />
    <GlassButtonGroup testID="map-controls" style={{ position: 'absolute', right: 16, top: controlTop, flexDirection: 'column' }}>
      <GlassSurface testID="map-zoom-capsule" style={s.zoomCapsule}>
        <Pressable testID="map-zoom-in" accessibilityRole="button" accessibilityLabel={copy('mapControls.zoomIn')}
          onPress={() => changeZoom(1)} style={s.zoomControl}><Plus size={18} color="white" /></Pressable>
        <View pointerEvents="none" style={s.zoomDivider} />
        <Pressable testID="map-zoom-out" accessibilityRole="button" accessibilityLabel={copy('mapControls.zoomOut')}
          onPress={() => changeZoom(-1)} style={s.zoomControl}><Minus size={18} color="white" /></Pressable>
      </GlassSurface>
      <GlassPressable fallback={Pressable} testID="map-locate" accessibilityRole="button" accessibilityLabel={copy('mapControls.findMyLocation')}
        accessibilityState={{ busy: locating }} onPress={() => void locate()} style={s.control}>
        <LocateFixed size={18} color="white" />
      </GlassPressable>
    </GlassButtonGroup>
    {(loading || locating) && <ActivityIndicator color={colors.accent} style={{ position: 'absolute', top: controlTop + 56, left: 20 }} />}
    {(error || locationError) && <View style={{ position: 'absolute', left: 16, right: 72, top: controlTop + 80, backgroundColor: '#121418f2', borderRadius: 12 }}><Feedback compact title={copy(error ? 'feedback.loadFailed' : locationError)} retry={error ? retry : () => void locate()} /></View>}
    {!carousel && event && point && <View testID="map-event-preview" onLayout={e => setPreviewHeight(e.nativeEvent.layout.height)} style={[s.preview, { width: previewWidth, left: point.x - previewWidth / 2, top: point.y - previewHeight - 45 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={copy('common.close')} onPress={() => setSelected(null)} style={s.close}><X size={14} color="#d4d4d8" /></Pressable>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <EventImage uri={event.bannerUrl} style={{ width: 56, height: 56, borderRadius: 8, borderWidth: 1, borderColor: '#ffffff1a' }} />
        <View style={{ flex: 1, paddingRight: 20 }}>
          <Text numberOfLines={1} style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>{event.title}</Text>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4 }}><Clock size={14} color="#a1a1aa" /><Text style={{ color: '#a1a1aa', fontSize: 12 }}>{formatEventTime(event.startTime)}</Text></View>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
            <Text style={s.badge}>{event.category || copy('events.generalCategory')}</Text>
            {isLive(event) && <Text style={[s.badge, { color: '#f87171', backgroundColor: '#00000099', borderColor: '#ef44444d' }]}>● {copy('common.liveNow').toUpperCase()}</Text>}
          </View>
        </View>
      </View>
      <Pressable accessibilityRole="button" testID="map-open-event" onPress={() => onOpen(event)} style={s.open}><Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>{copy('events.viewEvent')}</Text></Pressable>
      <View pointerEvents="none" style={s.tip}/>
    </View>}
    {carousel && mapEvents.length > 0 && <View testID="map-events-carousel" pointerEvents="box-none" onLayout={event=>setRailHeight(event.nativeEvent.layout.height)} style={{position:'absolute',left:0,right:0,bottom}}>
      <FlatList ref={rail} horizontal data={mapEvents} keyExtractor={event => event.id}
        showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingLeft:Math.max(16,inset.left),paddingRight:Math.max(16,inset.right),gap:12}}
        snapToInterval={cardWidth+12} decelerationRate="fast" keyboardShouldPersistTaps="handled"
        getItemLayout={(_,index)=>({length:cardWidth+12,offset:(cardWidth+12)*index,index})}
        scrollEventThrottle={32}
        onScroll={event=>{const offset=event.nativeEvent.contentOffset.x;if(scrollTimer.current)clearTimeout(scrollTimer.current);scrollTimer.current=setTimeout(()=>{scrollTimer.current=null;settle(offset);},140);}}
        onMomentumScrollEnd={event=>{if(scrollTimer.current)clearTimeout(scrollTimer.current);scrollTimer.current=null;settle(event.nativeEvent.contentOffset.x);}}
        renderItem={({item})=><Pressable testID={'map-event-card-'+item.id} accessibilityRole="button"
          accessibilityLabel={`${copy('events.viewEvent')}: ${item.title}. ${formatDate(item.startTime,language,true)}. ${item.locationName||item.city||''}`}
          accessibilityState={{selected:item.id===activeId}} onPress={()=>{choose(item.id,true);onOpen(item);}}
          onFocus={Platform.OS==='web'?()=>setFocusedCard(item.id):undefined} onBlur={()=>setFocusedCard(null)}
          style={[s.carouselCard,{width:cardWidth,borderColor:item.id===activeId?colors.accent:colors.line},Platform.OS==='web'&&focusedCard===item.id&&s.cardFocus]}>
          <View style={{flex:1,minWidth:0,gap:4}}>
            <Text numberOfLines={2} style={{color:colors.text,fontSize:18,lineHeight:22,fontWeight:'700'}}>{item.title}</Text>
            <Text numberOfLines={1} style={{color:colors.text,fontSize:12,lineHeight:18}}>{formatDate(item.startTime,language,true)}</Text>
            <Text numberOfLines={1} style={{color:colors.muted,fontSize:12,lineHeight:18}}>{item.locationName||item.city}</Text>
            <Text style={{color:colors.accent,fontSize:12,lineHeight:18,fontWeight:'600'}}>{copy('events.viewEvent')} →</Text>
          </View>
          <EventImage uri={item.bannerUrl} style={{width:72,height:104,borderRadius:12}} />
        </Pressable>} />
    </View>}
    {Platform.OS !== 'web' && <View style={{position:'absolute',right:4,left:36,bottom:carousel&&mapEvents.length?bottom+railHeight+8:bottom+8,flexDirection:'row',justifyContent:'flex-end',flexWrap:'wrap',backgroundColor:'#101012ed'}}>
      {[
        ['OpenFreeMap','https://openfreemap.org/'],
        ['© OpenMapTiles','https://openmaptiles.org/'],
        ['© OpenStreetMap','https://www.openstreetmap.org/copyright'],
        ['Style','https://github.com/hyperknot/openfreemap-styles/blob/main/styles/dark/LICENSE.md'],
      ].map(([label,url])=><Pressable key={url} accessibilityRole="link" onPress={()=>{void Linking.openURL(url!).catch(()=>{});}} style={{paddingHorizontal:3}}><Text style={{fontSize:9,color:'#ccc'}}>{label}</Text></Pressable>)}
    </View>}
  </View>;
}
const s = StyleSheet.create({
  control: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#121418ed', borderWidth: 1, borderColor: '#ffffff26', alignItems: 'center', justifyContent: 'center' },
  zoomCapsule: { width: 44, height: 88, borderRadius: 22, backgroundColor: '#121418ed', borderWidth: 1, borderColor: '#ffffff26', alignItems: 'center', justifyContent: 'center' },
  zoomControl: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  zoomDivider: { position: 'absolute', top: '50%', left: 10, right: 10, height: StyleSheet.hairlineWidth, backgroundColor: '#ffffff1a' },
  carouselCard:{minHeight:140,padding:12,borderRadius:16,borderWidth:1,backgroundColor:'#19191cf5',flexDirection:'row',alignItems:'center',gap:12},
  cardFocus:{outlineColor:'#fff',outlineWidth:2,outlineOffset:-4,outlineStyle:'solid'},
  preview: { position: 'absolute', padding: 12, borderRadius: 12, backgroundColor: '#121418f2', borderWidth: 1, borderColor: '#ffffff1a', boxShadow: '0 8px 32px rgba(0,0,0,.5)' },
  close: { position: 'absolute', top: 12, right: 12, zIndex: 2, width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#ffffff26', alignItems: 'center', justifyContent: 'center' },
  badge: { color: '#e4e4e7', fontSize: 10, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 5, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#ffffff26' },
  open: { marginTop: 12, height: 36, backgroundColor: '#ffffff26', borderWidth: 1, borderColor: '#ffffff1a', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tip: { position: 'absolute', bottom: -6, left: '50%', marginLeft: -6, width: 12, height: 12, backgroundColor: '#121418f2', transform: [{ rotate: '45deg' }] },
});
