import { AccentPressable } from '../ui/AccentPressable';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View, type ViewInstance } from 'react-native';
import { CalendarDays, ChevronRight, MapPin, RefreshCw, Ticket } from 'lucide-react-native';
import { sortValidationEvents } from '@packages/api-client/src/validationEventSelection';
import { usePreferences } from '../usePreferences';
import { Text } from '../ui/Text';
import { Loading } from '../ui/common';
import { dColors as colors } from '../dashboard/common';
import { formatDate } from '../data/events';
import type { ValidationEvent } from './data';
import { s } from './ScannerPanel';

export function ScannerEventList({ events, loading, failed, offline, onSelect, onRefresh }: {
  events: readonly ValidationEvent[]; loading: boolean; failed: boolean;
  offline: boolean;
  onSelect: (id: string) => void; onRefresh: () => void;
}) {
  const { copy, language } = usePreferences();
  const [focused, setFocused] = useState('');
  const heading = useRef<ViewInstance>(null);
  useEffect(() => { if (Platform.OS === 'web') heading.current?.focus(); }, [loading]);
  return <View testID="validation-event-list" style={{ gap: 16 }}>
    <Text style={s.muted}>{copy('validation.eventListHint')}</Text>
    <View style={[s.row, { justifyContent: 'space-between', gap: 12 }]}>
      <View ref={heading} tabIndex={-1} accessibilityRole="header" style={{ flex: 1, outlineWidth: 0 }}><Text style={s.heading}>{copy('validation.chooseEvent')}</Text></View>
      <AccentPressable fallback={Pressable} accessibilityRole="button" accessibilityLabel={copy('validation.refreshEvents')} disabled={loading} onPress={onRefresh}
        style={{ minWidth: 44, minHeight: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: loading ? .5 : 1 }}>
        <RefreshCw size={16} color="white" />
      </AccentPressable>
    </View>
    {loading ? <Loading /> : failed ? null : !events.length ? <Text style={s.muted}>{copy(offline ? 'validation.offlineUnprepared' : 'validation.noAssignedEvents')}</Text> :
      sortValidationEvents(events).map(event => <Pressable key={event.id} testID={'validation-event-'+event.id} accessibilityRole="button"
        accessibilityLabel={`${event.title}. ${formatDate(event.startTime, language, true)}. ${event.locationName}`}
        onPress={() => onSelect(event.id)} onFocus={() => setFocused(event.id)} onBlur={() => setFocused('')}
        style={[s.row, { minHeight: 96, padding: 16, gap: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: '#ffffff06' },
          Platform.OS === 'web' && focused === event.id && { outlineStyle: 'solid', outlineWidth: 2, outlineColor: '#fff', outlineOffset: 2 }]}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#ff00441a', alignItems: 'center', justifyContent: 'center' }}><Ticket size={20} color={colors.accent} /></View>
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <Text style={[s.heading, { fontSize: 16 }]}>{event.title}</Text>
          <View style={[s.row, { gap: 8, alignItems: 'flex-start' }]}><CalendarDays size={16} color={colors.muted} /><Text style={[s.muted, { flex: 1 }]}>{formatDate(event.startTime, language, true)}</Text></View>
          {!!event.locationName && <View style={[s.row, { gap: 8, alignItems: 'flex-start' }]}><MapPin size={16} color={colors.muted} /><Text style={[s.muted, { flex: 1 }]}>{event.locationName}</Text></View>}
          <Text style={[s.tiny, { color: colors.accent }]}>{copy(Date.parse(event.endTime) <= Date.now() ? 'validation.offlineJournal' : event.canManage ? 'validation.organizer' : 'validation.scanAccess')}</Text>
        </View>
        <ChevronRight size={20} color={colors.accent} />
      </Pressable>)}
  </View>;
}
