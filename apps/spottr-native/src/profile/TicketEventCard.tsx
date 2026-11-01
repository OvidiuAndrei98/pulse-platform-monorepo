import React, { useContext } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Text as SvgText } from 'react-native-svg';
import { ChevronRight, Clock3, MapPin, QrCode, Ticket, UsersRound } from 'lucide-react-native';
import { usePreferences } from '../usePreferences';
import { ticketStatus, type UserTicket } from '../data/tickets';
import { formatDate } from '../data/events';
import { MotionPressable as Pressable } from '../ui/MotionPressable';
import { AppFontsReadyContext, Text } from '../ui/Text';
import { colors } from '../ui/theme';

/** The same calendar-style event pass for upcoming and historical admissions. */
export function TicketEventCard({ tickets, active, featured, now, onOpen, onGroup }: {
  tickets: UserTicket[]; active: boolean; featured: boolean; now: number;
  onOpen: (ticket: UserTicket) => void; onGroup: (eventId: string) => void;
}) {
  const { copy, language } = usePreferences();
  const fontsReady = useContext(AppFontsReadyContext);
  const event = tickets[0]!;
  const gradientId = 'ticket-date-' + event.eventId;
  const locale = language === 'ro' ? 'ro-RO' : 'en-GB';
  const date = new Date(event.startTime);
  const parts = new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Bucharest', day: '2-digit', month: 'short', year: 'numeric' }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? '';
  const day = part('day').padStart(2, '0');
  const time = new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Bucharest', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  const status = active ? Date.parse(event.startTime) <= now ? 'tickets.happeningNow' : featured ? 'tickets.nextEvent' : 'tickets.upcoming' : 'tickets.history';
  const canOpenGroup = Date.parse(event.endTime) + 86400000 >= now;
  return <View testID={`tickets-event-${event.eventId}`} style={s.card}>
    <LinearGradient pointerEvents="none" colors={[colors.surface, '#050505', colors.bg]} locations={[0, .55, 1]} style={StyleSheet.absoluteFill}/>
    <View pointerEvents="none" style={s.innerBorder}/>
    <View style={s.body}>
      <View style={s.calendar}>
        <View style={s.dateDetails} accessible accessibilityLabel={formatDate(event.startTime, language, true, { year: true })}>
          <Svg width={128} height={96} viewBox="0 0 128 96" accessible={false}>
            <Defs><SvgGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={0} y1={18} x2={0} y2={84}><Stop offset={0} stopColor={colors.text}/><Stop offset={0.46} stopColor="#b9b9bf"/><Stop offset={1} stopColor="#101012"/></SvgGradient></Defs>
            <SvgText x={64} y={84} textAnchor="middle"
              fontFamily={fontsReady ? 'Inter_800ExtraBold' : undefined} fontWeight={fontsReady ? 'normal' : '800'}
              fontSize={90} fill={`url(#${gradientId})`}>{day}</SvgText>
          </Svg>
          <View style={s.monthRow}>
            <View style={[s.dateAccent, { backgroundColor: active ? colors.accent : colors.muted }]}/>
            <Text maxFontSizeMultiplier={1.1} style={s.month}>{part('month').replace('.', '').toUpperCase()}</Text>
            <View style={s.dateDot}/>
            <Text maxFontSizeMultiplier={1.1} style={s.year}>{part('year')}</Text>
          </View>
        </View>
        <View style={s.eventDetails}>
          <View style={[s.badge, active && s.activeBadge]}><Text style={[s.badgeText, active && { color: colors.accent }]}>{copy(status)}</Text></View>
          <Text style={s.title}>{event.eventTitle}</Text>
          <View style={s.detail}><MapPin size={13} color={active ? colors.accent : colors.muted}/><Text style={s.detailText}>{event.locationName}</Text></View>
          <View style={s.detail}><Clock3 size={13} color={colors.muted}/><Text style={s.detailText}>{time}</Text></View>
        </View>
      </View>
      <View style={s.footerHeading}>
        <View style={s.count}><Ticket size={13} color={colors.muted}/><Text style={s.countText}>{copy('userProfile.ticketCount', { count: tickets.length })}</Text></View>
        {canOpenGroup && <Pressable accessibilityRole="button" accessibilityLabel={copy('safetyGroup.openOrCreate')}
          onPress={() => onGroup(event.eventId)} style={s.groupButton}><UsersRound size={16} color={colors.success}/><ChevronRight size={12} color={colors.success}/></Pressable>}
      </View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.ticketStrip}
      contentContainerStyle={s.ticketStripContent}>
      {tickets.map((ticket, index) => {
        const state = ticketStatus(ticket, now), valid = state === 'active';
        return <Pressable key={ticket.id} testID={`tickets-open-${ticket.id}`} accessibilityRole="button"
          accessibilityLabel={`${ticket.ticketTypeName}. ${copy('tickets.ticketNumber', { count: index + 1 })}. ${copy(valid ? 'tickets.showQr' : 'tickets.viewTicket')}`}
          onPress={() => onOpen(ticket)} style={[s.ticketButton, tickets.length === 1 ? s.singleTicket : s.multipleTicket]}>
          <View style={{ flex: 1, gap: 3 }}><Text numberOfLines={1} style={s.ticketType}>{ticket.ticketTypeName}</Text>
            <Text style={s.ticketMeta}>{copy('tickets.ticketNumber', { count: index + 1 })}{!valid ? ` · ${copy('tickets.' + state)}` : ''}</Text></View>
          <View style={[s.qr, valid && s.activeQr]}><QrCode size={18} color={valid ? colors.accent : colors.muted}/></View>
        </Pressable>;
      })}
    </ScrollView>
  </View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.bg, borderRadius: 28, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  innerBorder: { ...StyleSheet.absoluteFill, margin: 3, borderWidth: 1, borderColor: '#ffffff05', borderRadius: 25 },
  body: { paddingHorizontal: 18, paddingTop: 16 },
  calendar: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  dateDetails: { width: 116, alignItems: 'center' },
  eventDetails: { flex: 1, minWidth: 0 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 24, marginTop: 2 },
  dateAccent: { width: 2, height: 13, borderRadius: 1 },
  dateDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: colors.muted },
  month: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: .5 },
  year: { color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '500', fontVariant: ['tabular-nums'] },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, maxWidth: '100%', marginBottom: 10 },
  activeBadge: { backgroundColor: '#ff004414' },
  badgeText: { color: colors.muted, fontSize: 9, fontWeight: '600' },
  title: { color: colors.text, fontSize: 18, lineHeight: 22, fontWeight: '700', letterSpacing: -.5, marginBottom: 10 },
  detail: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginBottom: 5 },
  detailText: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 17 },
  footerHeading: { minHeight: 44, marginTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countText: { color: colors.muted, fontSize: 11 },
  groupButton: { minWidth: 44, minHeight: 44, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'flex-end' },
  ticketStrip: { marginBottom: 10 },
  ticketStripContent: { flexGrow: 1, paddingHorizontal: 10, gap: 8 },
  ticketButton: { minHeight: 58, paddingVertical: 8, paddingLeft: 14, paddingRight: 8, borderRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: '#ffffff04', flexDirection: 'row', alignItems: 'center', gap: 12 },
  singleTicket: { flex: 1 },
  multipleTicket: { width: 230 },
  ticketType: { color: colors.text, fontSize: 12, fontWeight: '600' },
  ticketMeta: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  qr: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
  activeQr: { backgroundColor: '#ff004416' },
});
