import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import * as Location from 'expo-location';
import { Clock, LocateFixed, Minus, Plus, X } from 'lucide-react-native';
import { EventMap } from './EventMap';
import { DEFAULT_CENTER, validCoordinate, zoomForDistance, type Coordinate, type Point } from './geometry';
import { isLive, type Event } from '../data/events';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { EventImage, Feedback } from '../ui/common';
import { usePreferences } from '../PreferencesProvider';
import { formatEventTime } from '../../../pulse-app/src/features/events/dateFormat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapEventsCarousel } from './MapEventsCarousel';

export function EventsMapPanel({ events, cityCenter, distance, onOpen, loading, error, retry,toolbarHeight=44,onLocationChange }: { events: Event[]; cityCenter?: Coordinate | null; distance: number; onOpen: (event: Event) => void; loading: boolean; error: boolean; retry: () => void;toolbarHeight?:number;onLocationChange?:(coordinate:readonly[number,number])=>void }) {
  const { copy } = usePreferences(), [location, setLocation] = useState<Coordinate | null>(null);
  const [camera, setCamera] = useState({ center: cityCenter ?? DEFAULT_CENTER, zoom: 12 });
  const [selected, setSelected] = useState<string | null>(null), [point, setPoint] = useState<Point | null>(null), [previewHeight, setPreviewHeight] = useState(150);
  const [locating, setLocating] = useState(false), [locationError, setLocationError] = useState('');
  const viewport = useRef(camera), generation = useRef(0), pending = useRef(false);
  const dimensions = useWindowDimensions(), [width, setWidth] = useState(dimensions.width);
  const [railHeight,setRailHeight]=useState(148),[collapsed,setCollapsed]=useState(false);
  const [focus,setFocus]=useState<{id:string;revision:number}|null>(null);
  const mapEvents = useMemo(() => events.filter(event => validCoordinate(event as Coordinate)), [events]);
  const carousel = Platform.OS !== 'web' || dimensions.width < 768;
  const activeId = mapEvents.some(event => event.id === selected) ? selected : mapEvents[0]?.id ?? null;
  const inset = useSafeAreaInsets(), controlTop = Math.max(24, inset.top)+toolbarHeight+12;
  const bottom = (Platform.OS === 'ios' ? 108 : 104) + inset.bottom;
  const choose = (id: string, focusMap = false) => {
    setSelected(id);
    if(focusMap)setFocus(current=>({id,revision:(current?.revision??0)+1}));
  };
  useEffect(() => {
    if (selected && !mapEvents.some(event => event.id === selected)) setSelected(null);
  }, [mapEvents, selected]);
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
      onSelect={id => { setSelected(id); setPoint(null);setCollapsed(false); }}
      onViewport={(center, zoom) => { viewport.current = { center, zoom }; }}
      onSelectedPoint={carousel ? () => {} : setPoint}
      attributionBottom={carousel?bottom+(mapEvents.length?railHeight:0)+8:0} focus={focus} />
    <View style={{ position: 'absolute', right: 16, top: controlTop, gap: 8 }}>{[
      { icon: Plus, label: copy('mapControls.zoomIn'), id: 'map-zoom-in', action: () => changeZoom(1) },
      { icon: Minus, label: copy('mapControls.zoomOut'), id: 'map-zoom-out', action: () => changeZoom(-1) },
      { icon: LocateFixed, label: copy('mapControls.findMyLocation'), id: 'map-locate', action: () => void locate() },
    ].map(({ icon: Icon, label, id, action }) => <Pressable testID={id} key={id} accessibilityRole="button" accessibilityLabel={label} onPress={action} style={s.control}><Icon size={18} color="white" /></Pressable>)}</View>
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
    {carousel && mapEvents.length > 0 && <MapEventsCarousel events={mapEvents} activeId={activeId} width={width} bottom={bottom} insetLeft={inset.left} insetRight={inset.right} collapsed={collapsed} onCollapsed={setCollapsed} onSelect={choose} onOpen={onOpen} onHeight={setRailHeight}/>}
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
  control: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#121418ed', borderWidth: 1, borderColor: '#ffffff26', alignItems: 'center', justifyContent: 'center' },
  preview: { position: 'absolute', padding: 12, borderRadius: 12, backgroundColor: '#121418f2', borderWidth: 1, borderColor: '#ffffff1a', boxShadow: '0 8px 32px rgba(0,0,0,.5)' },
  close: { position: 'absolute', top: 12, right: 12, zIndex: 2, width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#ffffff26', alignItems: 'center', justifyContent: 'center' },
  badge: { color: '#e4e4e7', fontSize: 10, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 5, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#ffffff26' },
  open: { marginTop: 12, height: 36, backgroundColor: '#ffffff26', borderWidth: 1, borderColor: '#ffffff1a', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tip: { position: 'absolute', bottom: -6, left: '50%', marginLeft: -6, width: 12, height: 12, backgroundColor: '#121418f2', transform: [{ rotate: '45deg' }] },
});
