import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronDown, ChevronUp, Clock3, MapPin, QrCode, Ticket, UsersRound } from 'lucide-react-native';
import { usePreferences } from '../usePreferences';
import { ticketStatus, type UserTicket } from '../data/tickets';
import { MotionPressable as Pressable } from '../ui/MotionPressable';
import { Text } from '../ui/Text';
import { Wordmark } from '../ui/Logo';
import { colors } from '../ui/theme';
import { initialGroupTicket, ticketTypeSummary, type TicketGroup } from './ticketGroups';

type EventProps = {
  group: TicketGroup; now: number; expanded?: boolean;
  onOpen: (ticket: UserTicket) => void;
  onToggle?: (eventId: string) => void;
  onGroup?: (eventId: string) => void;
};

function useEventPass(group: TicketGroup, now: number) {
  const { copy, language } = usePreferences('copy');
  const event = group.tickets[0]!;
  const data = useMemo(() => {
    const locale = language === 'ro' ? 'ro-RO' : 'en-GB';
    const date = new Date(event.startTime);
    const parts = new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Bucharest', day: '2-digit', month: 'short', year: 'numeric' }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
    const ready = group.tickets.filter(t => ticketStatus(t, now) === 'active').length;
    const used = group.tickets.filter(t => ticketStatus(t, now) === 'used').length;
    const expired = group.tickets.length - ready - used;
    const selectedId = initialGroupTicket(group.tickets, event.id, true, now);
    return {
      day: part('day'), month: part('month').replace('.', '').toUpperCase(), year: part('year'), ready,
      time: new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Bucharest', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(date),
      types: ticketTypeSummary(group.tickets),
      first: group.tickets.find(t => t.id === selectedId)!,
      states: ready ? copy('tickets.readyCount', { count: ready })
        : [used ? `${used} ${copy('tickets.used')}` : '', expired ? `${expired} ${copy('tickets.expired')}` : ''].filter(Boolean).join(' · '),
    };
  }, [group, event, now, language, copy]);
  return { ...data, event, copy };
}

/** One entrance pass, shared by Profile and the top of the wallet. */
export const FeaturedEventPass = React.memo(function FeaturedEventPass({ group, now, onOpen, onToggle, expanded, onGroup, testID }: EventProps & { testID?: string }) {
  const pass = useEventPass(group, now), { event, copy } = pass;
  const status = Date.parse(event.startTime) <= now ? 'tickets.happeningNow' : 'tickets.nextEvent';
  return <View testID={testID ?? `tickets-event-${group.eventId}`} style={s.pass}>
    <LinearGradient pointerEvents="none" colors={['#25131d', '#151115', '#101012']} locations={[0, .6, 1]} style={StyleSheet.absoluteFill}/>
    <View style={s.passBody}>
      <View style={s.between}><Wordmark/><View style={s.badge}><Text style={s.badgeText}>{copy(status).toUpperCase()}</Text></View></View>
      <View style={s.hero}>
        <View accessible accessibilityLabel={`${pass.day} ${pass.month} ${pass.year}`} style={s.heroDate}>
          <Text maxFontSizeMultiplier={1.15} style={s.heroDay}>{pass.day}</Text>
          <Text style={s.heroMonth}>{pass.month} <Text style={s.heroYear}>{pass.year}</Text></Text>
        </View>
        <View style={s.details}><Text numberOfLines={3} style={s.heroTitle}>{event.eventTitle}</Text>
          <View style={s.meta}><MapPin size={12} color={colors.accent}/><Text numberOfLines={2} style={s.metaText}>{event.locationName}</Text></View>
          <View style={s.meta}><Clock3 size={12} color={colors.muted}/><Text style={s.metaText}>{pass.time}</Text></View>
        </View>
      </View>
      <Text numberOfLines={2} style={s.types}>{pass.types}</Text>
      <View style={s.between}><Text style={s.ready}>{pass.states}</Text>
        {onGroup && <GroupAction event={event} now={now} onGroup={onGroup}/>}</View>
    </View>
    <View pointerEvents="none" style={s.tear}><View style={[s.cutout, { left: -8 }]}/><View style={[s.cutout, { right: -8 }]}/></View>
    <View style={s.footer}>
      {onToggle ? <Pressable testID={`tickets-expand-${event.eventId}`} accessibilityRole="button" accessibilityState={{ expanded: !!expanded }}
        accessibilityLabel={copy(expanded ? 'tickets.hideTickets' : 'tickets.chooseTicket')}
        onPress={() => onToggle(event.eventId)} style={s.countButton}>
        <Ticket size={14} color={colors.muted}/><Text style={s.count}>{copy('userProfile.ticketCount', { count: group.tickets.length })}</Text>
        {expanded ? <ChevronUp size={14} color={colors.muted}/> : <ChevronDown size={14} color={colors.muted}/>}
      </Pressable> : <View style={s.countButton}><Ticket size={14} color={colors.muted}/><Text style={s.count}>{copy('userProfile.ticketCount', { count: group.tickets.length })}</Text></View>}
      <Pressable testID={testID ? `${testID}-qr` : `tickets-qr-${event.eventId}`} accessibilityRole="button" accessibilityLabel={`${copy('tickets.showQr')} · ${event.eventTitle}`}
        onPress={() => onOpen(pass.first)} style={s.primary}><QrCode size={17} color={colors.text}/><Text style={s.primaryText}>{copy('tickets.showQr')}</Text></Pressable>
    </View>
  </View>;
});

/** Compact event summary; individual admissions are separate virtualized rows. */
export const WalletEventRow = React.memo(function WalletEventRow({ group, now, onOpen, onToggle, expanded, onGroup }: EventProps) {
  const pass = useEventPass(group, now), { event, copy } = pass;
  return <View testID={`tickets-event-${event.eventId}`} style={[s.eventRow, expanded && s.expanded]}>
    <Pressable testID={`tickets-expand-${event.eventId}`} accessibilityRole="button" accessibilityState={{ expanded: !!expanded }}
      accessibilityLabel={`${event.eventTitle}. ${pass.day} ${pass.month} ${pass.year}. ${pass.states}. ${copy(expanded ? 'tickets.hideTickets' : 'tickets.chooseTicket')}`}
      onPress={() => onToggle?.(event.eventId)} style={s.eventMain}>
      <View style={s.rowDate}><Text style={s.rowDay}>{pass.day}</Text><Text style={s.rowMonth}>{pass.month}</Text></View>
      <View style={s.details}><Text numberOfLines={2} style={s.rowTitle}>{event.eventTitle}</Text>
        <Text numberOfLines={1} style={s.small}>{event.locationName} · {pass.time}</Text>
        <Text numberOfLines={2} style={s.small}>{copy('userProfile.ticketCount', { count: group.tickets.length })} · {pass.types}</Text>
        <Text style={[s.state, pass.ready > 0 && { color: colors.success }]}>{pass.states}</Text>
      </View>
      {expanded ? <ChevronUp size={14} color={colors.muted}/> : <ChevronDown size={14} color={colors.muted}/>}
    </Pressable>
    <View style={s.rowActions}>
      {onGroup && <GroupAction event={event} now={now} onGroup={onGroup}/>}
      <Pressable testID={`tickets-qr-${event.eventId}`} accessibilityRole="button" accessibilityLabel={`${copy('tickets.showQr')} · ${event.eventTitle}`}
        onPress={() => onOpen(pass.first)} style={[s.qrButton, pass.ready > 0 && { backgroundColor: '#ff004412' }]}>
        <QrCode size={19} color={pass.ready > 0 ? colors.accent : colors.muted}/>
      </Pressable>
    </View>
  </View>;
});

function GroupAction({ event, now, onGroup }: { event: UserTicket; now: number; onGroup: (id: string) => void }) {
  const { copy } = usePreferences('copy');
  if (Date.parse(event.endTime) + 86400000 < now) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel={copy('safetyGroup.openOrCreate')} onPress={() => onGroup(event.eventId)} style={s.groupButton}><UsersRound size={17} color={colors.success}/></Pressable>;
}

export const WalletTicketRow = React.memo(function WalletTicketRow({ ticket, index, now, onOpen, selected, testID }: {
  ticket: UserTicket; index: number; now: number; onOpen: (ticket: UserTicket) => void; selected?: boolean; testID?: string;
}) {
  const { copy } = usePreferences('copy'), status = ticketStatus(ticket, now), valid = status === 'active';
  return <Pressable testID={testID ?? `tickets-open-${ticket.id}`} accessibilityRole="button" accessibilityState={{ selected }}
    accessibilityLabel={`${copy('tickets.ticketNumber', { count: index + 1 })}. ${ticket.ticketTypeName}. ${copy(valid ? 'tickets.validForEntry' : 'tickets.' + status)}`}
    onPress={() => onOpen(ticket)} style={[s.ticketRow, selected && s.expanded]}>
    <Text style={s.ticketNumber}>{String(index + 1).padStart(2, '0')}</Text>
    <View style={s.details}><Text numberOfLines={2} style={s.rowTitle}>{ticket.ticketTypeName}</Text><Text style={[s.state, valid && { color: colors.success }]}>{copy(valid ? 'tickets.validForEntry' : 'tickets.' + status)}</Text></View>
    <QrCode size={19} color={valid ? colors.accent : colors.muted}/>
  </Pressable>;
});

const s = StyleSheet.create({
  pass: { borderRadius: 26, borderWidth: 1, borderColor: '#ffffff16', overflow: 'hidden', backgroundColor: '#151115' },
  passBody: { padding: 18, gap: 14 }, between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: { flexShrink: 1, backgroundColor: '#ff004412', borderRadius: 99, paddingVertical: 6, paddingHorizontal: 8 },
  badgeText: { color: colors.accent, fontSize: 8, fontWeight: '700', letterSpacing: .65 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 4 },
  heroDate: { width: 84, alignItems: 'center' }, heroDay: { color: colors.text, fontSize: 64, lineHeight: 70, fontWeight: '800', letterSpacing: -3 },
  heroMonth: { color: colors.accent, fontSize: 10, fontWeight: '700', letterSpacing: .7 }, heroYear: { color: colors.muted, fontWeight: '400', letterSpacing: 0 },
  heroTitle: { color: colors.text, fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -.5 },
  details: { flex: 1, minWidth: 0, gap: 5 }, meta: { flexDirection: 'row', gap: 5, alignItems: 'center' }, metaText: { color: colors.muted, fontSize: 11, lineHeight: 16, flexShrink: 1 },
  types: { color: colors.muted, fontSize: 12, lineHeight: 18 }, ready: { flexShrink: 1, color: colors.success, fontSize: 11 },
  tear: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#ffffff20', marginHorizontal: 0 },
  cutout: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.bg, position: 'absolute', top: -8 },
  footer: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between' },
  countButton: { minHeight: 44, flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center' }, count: { color: colors.muted, fontSize: 12, flexShrink: 1 },
  primary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 99, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', gap: 7 }, primaryText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  eventRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0b0b0d', borderRadius: 20, borderWidth: 1, borderColor: '#ffffff14', paddingRight: 10 },
  expanded: { borderColor: '#ff004440', backgroundColor: '#ff004408' },
  eventMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingRight: 8 },
  rowDate: { width: 36, alignItems: 'center', gap: 2 }, rowDay: { fontSize: 25, lineHeight: 30, fontWeight: '700', letterSpacing: -1, color: colors.text }, rowMonth: { color: colors.muted, fontSize: 8, fontWeight: '600', letterSpacing: .5 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 19 }, small: { color: colors.muted, fontSize: 10, lineHeight: 15 }, state: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  rowActions: { gap: 2, alignItems: 'center' }, qrButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff06' },
  groupButton: { width: 44, height: 32, justifyContent: 'center', alignItems: 'center' },
  ticketRow: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderWidth: 1, borderColor: '#ffffff12', borderRadius: 16, backgroundColor: '#111113', minHeight: 72 },
  ticketNumber: { width: 24, fontSize: 12, fontWeight: '600', color: colors.muted, fontVariant: ['tabular-nums'] },
});
