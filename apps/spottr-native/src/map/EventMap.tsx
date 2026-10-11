import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import MapView, { Marker, UrlTile, type Region } from 'react-native-maps';
import Svg, { Path } from 'react-native-svg';
import Constants from 'expo-constants';
import { usePreferences } from '../PreferencesProvider';
import { Feedback } from '../ui/common';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { isLive } from '../data/events';
import { clusterEvents, clusterZoom, radialPositions, TILE_URL, type Coordinate } from './geometry';
import type { EventMapProps } from './types';

export function EventMap(props: EventMapProps) {
  const { copy } = usePreferences();
  // Google Maps Android throws a native exception without its manifest key.
  if (Platform.OS === 'android' && !Constants.expoConfig?.extra?.mapsAndroidConfigured) return <View style={{ flex: 1, justifyContent: 'center' }}><Feedback title={copy('feedback.loadFailed')} detail={copy('mapControls.setupPending')} /></View>;
  return <ConfiguredEventMap {...props}/>;
}
function ConfiguredEventMap(props: EventMapProps) {
  const { events, center, zoom, location, selected, onSelect } = props;
  const ref = useRef<MapView>(null), latest = useRef(props); latest.current = props;
  const dimensions = useWindowDimensions(), [size, setSize] = useState({ width: dimensions.width, height: dimensions.height });
  const [actualZoom, setZoom] = useState(zoom), projectionRevision = useRef(0);
  const toRegion = (point: Coordinate, level: number): Region => {
    const longitudeDelta = Math.min(360, 360 * size.width / 256 / 2 ** level);
    return { ...point, longitudeDelta, latitudeDelta: Math.min(170, longitudeDelta * size.height / size.width * Math.cos(point.latitude * Math.PI / 180)) };
  };
  const clusters = useMemo(() => clusterEvents(events, actualZoom), [events, actualZoom]);
  const displayed = useMemo(() => clusters.flatMap(cluster => cluster.events.length === 1
    ? [{ event: cluster.events[0]!, coordinate: cluster }]
    : actualZoom > 17 ? radialPositions(cluster, actualZoom) : []), [clusters, actualZoom]);
  const selectedCoordinate = displayed.find(row => row.event.id === selected)?.coordinate;
  const coordinateRef = useRef(selectedCoordinate); coordinateRef.current = selectedCoordinate;
  const updatePoint = () => {
    const version = ++projectionRevision.current, coordinate = coordinateRef.current;
    if (!coordinate) { latest.current.onSelectedPoint(null); return; }
    void ref.current?.pointForCoordinate(coordinate).then(point => {
      if (version === projectionRevision.current) latest.current.onSelectedPoint(point);
    }).catch(() => { if (version === projectionRevision.current) latest.current.onSelectedPoint(null); });
  };
  useEffect(() => () => { projectionRevision.current++; }, []);
  useEffect(updatePoint, [selectedCoordinate?.latitude, selectedCoordinate?.longitude, selected]);
  useEffect(() => { ref.current?.animateToRegion(toRegion(center, zoom), 250); }, [center.latitude, center.longitude, zoom, size.width, size.height]);
  return <MapView ref={ref} testID="event-map" style={StyleSheet.absoluteFill} userInterfaceStyle="dark"
    mapType={Platform.OS === 'android' ? 'none' : 'standard'} initialRegion={toRegion(center, zoom)}
    onLayout={event => { const { width, height } = event.nativeEvent.layout; if (width > 0 && height > 0) setSize({ width, height }); }}
    minZoomLevel={3} maxZoomLevel={20} toolbarEnabled={false} showsCompass={false} showsMyLocationButton={false}
    onMapReady={updatePoint} onPress={() => onSelect(null)} onRegionChange={updatePoint}
    onRegionChangeComplete={region => {
      const level = Math.max(3, Math.min(20, Math.log2(360 * size.width / 256 / Math.max(.000001, region.longitudeDelta))));
      setZoom(level); latest.current.onViewport({ latitude: region.latitude, longitude: region.longitude }, level); updatePoint();
    }}>
    <UrlTile urlTemplate={TILE_URL} maximumZ={20} tileSize={256} shouldReplaceMapContent />
    {location && <Marker coordinate={location} anchor={{ x: .5, y: .5 }} tracksViewChanges={false}><View style={s.location}><View style={s.locationDot} /></View></Marker>}
    {actualZoom <= 17 && clusters.filter(cluster => cluster.events.length > 1).map(cluster => {
      const diameter = cluster.events.length >= 100 ? 56 : cluster.events.length >= 10 ? 50 : 44;
      return <Marker key={'cluster-' + cluster.key} coordinate={cluster} anchor={{ x: .5, y: .5 }}
        onPress={event => { event.stopPropagation(); ref.current?.animateToRegion(toRegion(cluster, clusterZoom(cluster, actualZoom)), 450); }}>
        <View style={[s.cluster, { width: diameter, height: diameter, borderRadius: diameter / 2 }]}><Text style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>{cluster.events.length}</Text></View>
      </Marker>;
    })}
    {displayed.map(({ event, coordinate }) => <Marker key={event.id} coordinate={coordinate} anchor={{ x: .5, y: .925 }}
      zIndex={event.id === selected ? 1000 : actualZoom > 17 ? 900 : 0}
      onPress={e => { e.stopPropagation(); onSelect(event.id); }}>
      <EventPin active={event.id === selected} live={isLive(event)} />
    </Marker>)}
  </MapView>;
}
function EventPin({ active, live }: { active: boolean; live: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!live) return;
    const animation = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    animation.start(); return () => { animation.stop(); pulse.setValue(0); };
  }, [live, pulse]);
  return <View style={{ width: active ? 46 : 40, height: active ? 46 : 40, alignItems: 'center', justifyContent: 'center' }}>
    {live && <Animated.View style={[s.pulse, { opacity: pulse.interpolate({ inputRange: [0, .7, 1], outputRange: [.55, 0, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, .7, 1], outputRange: [.9, 1.8, 1.8] }) }] }]} />}
    <View style={[s.pin, { width: active ? 33 : 29, height: active ? 33 : 29, backgroundColor: active || live ? colors.accent : '#0c1812f5', borderColor: active || live ? '#ceff8ef2' : colors.accent }]}>
      <Svg width={13} height={13} viewBox="0 0 24 24" style={{ transform: [{ rotate: '45deg' }] }}><Path fill={active || live ? '#08130d' : colors.accent} d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /></Svg>
    </View>
  </View>;
}
const s = StyleSheet.create({
  cluster: { borderWidth: 3, borderColor: '#0a0a0a', backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 7px rgba(255,0,68,.16)' },
  pin: { borderRadius: 30, borderBottomLeftRadius: 4, borderWidth: 1, transform: [{ rotate: '-45deg' }], alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 18px rgba(0,0,0,.42)' },
  pulse: { position: 'absolute', width: 29, height: 29, borderRadius: 99, borderWidth: 1, borderColor: '#bef264d9', backgroundColor: '#a3e63524' },
  location: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#ff004430', alignItems: 'center', justifyContent: 'center' },
  locationDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent, borderWidth: 2, borderColor: 'white' },
});
