import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin } from 'lucide-react-native';
import { Event, formatDate, isLive } from '../data/events';
import { usePreferences } from '../PreferencesProvider';
import { EventImage } from './common';
import { Text } from './Text';
import { colors } from './theme';

export function EventBrowseCard({ event, onOpen, fill = false, promoted = false }: { event: Event; onOpen: () => void; fill?: boolean; promoted?: boolean }) {
  const { copy, language } = usePreferences();
  return <Pressable accessibilityRole="button" accessibilityLabel={event.title} onPress={onOpen} style={{ flex: 1, maxWidth: fill ? '100%' : '48.5%' }}>
    <View style={{ aspectRatio: 1, borderRadius: 20, overflow: 'hidden' }}>
      <EventImage uri={event.bannerUrl} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['#00000033', 'transparent', '#000000bf']} style={StyleSheet.absoluteFill} />
      {promoted && <Text style={[s.category, { position: 'absolute', top: 42, left: 10, color: colors.accent }]}>{copy('promotions.sponsored').toUpperCase()}</Text>}
      <View style={{ position: 'absolute', left: 10, top: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 4 }}><Text numberOfLines={1} style={s.category}>{event.category || copy('events.generalCategory')}</Text>{isLive(event) && <Text numberOfLines={1} style={s.live}>● {copy('events.liveNow').toUpperCase()}</Text>}</View>
      <View style={{ position: 'absolute', bottom: 10, left: 0, right: 0, alignItems: 'center' }}><Text style={s.date}>{formatDate(event.startTime, language, true)}</Text></View>
    </View>
    <View style={{ marginTop: 8, paddingHorizontal: 4 }}><Text numberOfLines={1} style={{ color: 'white', fontSize: 14, fontWeight: '700' }}>{event.title}</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}><MapPin size={14} color={colors.accent} /><Text numberOfLines={1} style={{ flex: 1, color: '#a1a1aa', fontSize: 12 }}>{event.locationName || copy('events.locationUnknown')}</Text></View></View>
  </Pressable>;
}
const s = StyleSheet.create({
  category: { maxWidth: '58%', borderRadius: 99, backgroundColor: '#00000099', borderWidth: 1, borderColor: '#ffffff26', paddingHorizontal: 6, paddingVertical: 4, color: '#ffffffe6', fontSize: 9, fontWeight: '700' },
  live: { borderRadius: 99, backgroundColor: '#ef444433', borderWidth: 1, borderColor: '#ef444466', paddingHorizontal: 6, paddingVertical: 4, color: '#f87171', fontSize: 9, fontWeight: '700' },
  date: { borderRadius: 99, borderWidth: 1, borderColor: '#ffffff26', backgroundColor: '#00000099', color: '#ffffffe6', paddingHorizontal: 10, paddingVertical: 4, fontSize: 10, fontWeight: '600' },
});
