import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { ChevronDown, ChevronUp, Ticket } from 'lucide-react-native';
import Animated, { FadeIn, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import { usePreferences } from '../usePreferences';
import { ticketStatus, type UserTicket } from '../data/tickets';
import { MotionPressable as Pressable } from '../ui/MotionPressable';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { Feedback, Loading } from '../ui/common';
import { ActionButton } from '../ui/ActionButton';
import { FeaturedEventPass, WalletEventRow, WalletTicketRow } from './WalletEvent';
import { historyMonths, profileTicketGroups, type TicketGroup } from './ticketGroups';

const reveal = FadeIn.duration(160).reduceMotion(ReduceMotion.System);
export const walletLayout = LinearTransition.springify().mass(.65).damping(26).stiffness(260).reduceMotion(ReduceMotion.System);

export function useWalletLists({ all, now, owner, pending, error, retry, onOpen, onGroup, onExplore }: {
  all: UserTicket[]; now: number; owner?: string; pending: boolean; error: boolean;
  retry: () => unknown; onOpen: (ticket: UserTicket) => void;
  onGroup: (id: string) => void; onExplore: () => void;
}) {
  const { copy, language } = usePreferences();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const [historyFilter, setHistoryFilter] = useState<'history' | 'used' | 'expired'>('history');
  useEffect(() => { setExpanded({}); setOpenMonths({}); setHistoryFilter('history'); }, [owner]);
  const toggle = useCallback((id: string) => setExpanded(current => ({ ...current, [id]: !current[id] })), []);
  const active = useMemo(() => profileTicketGroups(all, 'active', now), [all, now]);
  const history = useMemo(() => profileTicketGroups(all, 'history', now), [all, now]);
  const activeCount = useMemo(() => active.reduce((sum, group) => sum + group.tickets.length, 0), [active]);
  const months = useMemo(() => historyMonths(history.filter(group => historyFilter === 'history' || group.tickets.some(ticket => ticketStatus(ticket, now) === historyFilter)), language), [history, historyFilter, now, language]);

  // Flatten expanded admissions into the same FlatList: a group with 500 tickets
  // must not turn into a nested ScrollView rendering 500 QR buttons at once.
  const eventRows = useCallback((group: TicketGroup, featured = false) => {
    const props = { group, now, expanded: !!expanded[group.eventId], onToggle: toggle, onOpen, onGroup };
    const rows: React.ReactNode[] = [featured ? <FeaturedEventPass key={group.eventId} {...props}/> : <WalletEventRow key={group.eventId} {...props}/>];
    if (expanded[group.eventId]) group.tickets.forEach((ticket, index) => rows.push(
      <Animated.View key={ticket.id} entering={reveal} layout={walletLayout}>
        <WalletTicketRow ticket={ticket} index={index} now={now} onOpen={onOpen}/>
      </Animated.View>
    ));
    return rows;
  }, [expanded, now, onOpen, onGroup, toggle]);

  const fallback = useCallback((isActive: boolean) => {
    if (pending) return [<Loading key="loading"/>];
    if (error) return [<Feedback key="error" title={copy('feedback.loadFailed')} retry={() => void retry()}/>];
    return [<View key="empty" style={{ padding: 28, borderWidth: 1, borderColor: colors.line, borderRadius: 22, gap: 12, alignItems: 'center' }}>
      <Ticket size={24} color={colors.accent}/><Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>{copy(isActive ? 'tickets.noUpcoming' : 'tickets.noHistory')}</Text>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' }}>{copy(isActive ? 'tickets.noUpcomingHint' : 'tickets.emptyHint')}</Text>
      {isActive && <ActionButton title={copy('tickets.exploreEvents')} onPress={onExplore}/>}
    </View>];
  }, [pending, error, retry, copy, onExplore]);

  const activeNodes = useMemo(() => {
    if (pending || error || !active.length) return fallback(true);
    return active.flatMap((group, index) => [
      ...(index === 1 ? [<Text key="upcoming" style={{ color: colors.text, fontSize: 14, fontWeight: '600', marginTop: 8 }}>{copy('tickets.upcomingEvents')}</Text>] : []),
      ...eventRows(group, index === 0),
    ]);
  }, [active, pending, error, fallback, eventRows, copy]);
  const historyNodes = useMemo(() => {
    if (pending || error) return fallback(false);
    const filters = <View key="filters" style={{ flexDirection: 'row', gap: 8 }}>{(['history', 'used', 'expired'] as const).map(value =>
      <Pressable key={value} testID={`tickets-filter-${value}`} accessibilityRole="button" accessibilityState={{ selected: historyFilter === value }} onPress={() => setHistoryFilter(value)}
        style={{ minHeight: 40, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 99, backgroundColor: historyFilter === value ? '#ffffff12' : 'transparent' }}>
        <Text style={{ fontSize: 12, color: historyFilter === value ? colors.text : colors.muted }}>{copy(value === 'history' ? 'tickets.allHistory' : 'tickets.' + value)}</Text>
      </Pressable>
    )}</View>;
    return [filters, ...(!months.length ? fallback(false) : months.flatMap((month, index) => {
      const open = openMonths[month.key] ?? index === 0;
      return [<Pressable key={month.key} testID={`tickets-month-${month.key}`} accessibilityRole="button" accessibilityState={{ expanded: open }}
        onPress={() => setOpenMonths(current => ({ ...current, [month.key]: !(current[month.key] ?? index === 0) }))}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 4, marginTop: index ? 8 : 0 }}>
        <View style={{ flex: 1, gap: 4 }}><Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', textTransform: 'capitalize' }}>{month.label}</Text>
          <Text style={{ color: colors.muted, fontSize: 11 }}>{copy('tickets.eventsCount', { count: month.groups.length })}</Text></View>
        {open ? <ChevronUp size={17} color={colors.muted}/> : <ChevronDown size={17} color={colors.muted}/>}
      </Pressable>, ...(open ? month.groups.flatMap(group => eventRows(group)) : [])];
    }))];
  }, [months, openMonths, historyFilter, pending, error, fallback, eventRows, copy]);
  return { activeNodes, historyNodes, activeCount, historyFilter };
}
