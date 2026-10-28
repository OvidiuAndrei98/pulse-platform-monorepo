import { GlassPressable } from '../ui/GlassPressable';
import { ActionIcon } from '../ui/ActionIcon';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { Check, History, RefreshCw, UserRound, Users, WifiOff } from 'lucide-react-native';
import { useAuth } from '../auth/AuthProvider';
import { usePreferences } from '../PreferencesProvider';
import type { RootParamList } from '../navigation/types';
import { formatDate } from '../data/events';
import { ApiError } from '../data/http';
import { Feedback, IconButton, Loading, webListScrollProps } from '../ui/common';
import { MotionPressable as Pressable } from '../ui/MotionPressable';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { scannerApi } from './runtime';
import { isConnectivityError, uuid, type HistoryScan, type ScanScope } from './data';
import { watchScannerConnection } from './connection';

function ScanRow({ scan }: { scan: HistoryScan }) {
  const { copy, language } = usePreferences();
  const actor = scan.scannedBy;
  return <View testID={'scan-history-row-' + scan.ticketId} style={s.scan}>
    <View style={s.row}>
      <View style={s.check}><Check size={17} color="#49dca2" strokeWidth={2.5} /></View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={s.ticketType}>{scan.ticketType}</Text>
        <Text style={s.muted}>{formatDate(scan.validatedAt, language, true)}</Text>
      </View>
    </View>
    <View style={s.actorRow}>
      <UserRound size={13} color={colors.muted} />
      <Text style={s.actor}>{copy('validation.historyScannedBy', { name: actor.name.trim() || copy('validation.historyUnknownScanner') })}</Text>
      {actor.kind === 'access' && <Text style={s.access}>{copy('validation.historyTemporaryAccess')}</Text>}
    </View>
    <Text selectable style={s.ticketId}>{copy('validation.ticketId', { id: scan.ticketId })}</Text>
  </View>;
}

export function ScannerHistoryScreen({ route, navigation }: NativeStackScreenProps<RootParamList, 'ScannerHistory'>) {
  const { eventId, eventTitle } = route.params;
  const { user, controller } = useAuth(), { copy } = usePreferences();
  const token = controller.getToken(), insets = useSafeAreaInsets(), focused = useIsFocused();
  const [scope, setScope] = useState<ScanScope>('all');
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => watchScannerConnection(setConnected), []);
  const history = useInfiniteQuery({
    queryKey: ['scanner-history', user?.id, eventId, scope],
    enabled: !!user && !!token && uuid.test(eventId) && focused && connected !== false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => scannerApi.historyPage(eventId, token!, scope, pageParam, signal),
    getNextPageParam: page => page.nextCursor,
    retry: false,
    staleTime: 0,
  });
  // Do not show stale private data after the server revokes event access.
  const forbidden = history.error instanceof ApiError && [401, 403, 404].includes(history.error.status);
  const offline = connected === false || isConnectivityError(history.error);
  const pages = forbidden ? undefined : history.data?.pages;
  const scans = useMemo(() => {
    const seen = new Set<string>();
    return (pages ?? []).flatMap(page => page.scans).filter(scan => {
      if (seen.has(scan.ticketId)) return false;
      seen.add(scan.ticketId); return true;
    });
  }, [pages]);
  const total = pages?.[0]?.totalScans;
  const loadMore = () => {
    if (history.hasNextPage && !history.isFetching && !history.isError && !offline && !forbidden) void history.fetchNextPage();
  };
  const [tabWidth, setTabWidth] = useState(0);
  const position = useSharedValue(0), reducedMotion = useReducedMotion();
  useEffect(() => { position.value = withTiming(scope === 'mine' ? 1 : 0, { duration: reducedMotion ? 0 : 220 }); }, [scope, position, reducedMotion]);
  const highlight = useAnimatedStyle(() => ({ transform: [{ translateX: position.value * tabWidth / 2 }] }));
  const back = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace('Scanner', { eventId });
  };
  const retry = () => { void history.refetch(); };
  return <View testID="scanner-history-screen" style={[s.screen, { paddingTop: insets.top }]}>
    <View style={s.body}>
      <View style={s.header}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <GlassPressable fallback={Pressable} testID="scanner-history-back" accessibilityRole="button" accessibilityLabel={copy('common.back')} onPress={back} style={s.back}><ActionIcon name="back" size={20} color={colors.text} /></GlassPressable>
          {!!user && <IconButton label={copy('validation.historyRefresh')} onPress={retry} disabled={connected === false || history.isFetching}>
            {history.isFetching && !history.isFetchingNextPage ? <ActivityIndicator size="small" color={colors.accent} /> : <RefreshCw size={18} color={colors.muted} />}
          </IconButton>}
        </View>
        <View style={{ gap: 6 }}>
          <Text accessibilityRole="header" style={s.heading}>{copy('validation.scanHistory')}</Text>
          <Text style={s.event} numberOfLines={2}>{eventTitle || copy('validation.scansForEvent')}</Text>
        </View>
        {!!user && <View style={s.tabs} onLayout={event => setTabWidth(Math.max(0, event.nativeEvent.layout.width - 8))}>
          <Animated.View pointerEvents="none" style={[s.highlight, { width: tabWidth / 2 }, highlight]} />
          {(['all', 'mine'] as const).map(value => {
            const Icon = value === 'all' ? Users : UserRound;
            return <Pressable key={value} testID={'scanner-history-tab-' + value} accessibilityRole="tab" accessibilityState={{ selected: scope === value }} onPress={() => setScope(value)} style={s.tab}>
              <Icon size={15} color={scope === value ? colors.text : colors.muted} />
              <Text style={[s.tabLabel, scope === value && { color: colors.text }]}>{copy(value === 'all' ? 'validation.historyAll' : 'validation.historyMine')}</Text>
            </Pressable>;
          })}
        </View>}
      </View>
      {!user ? <Feedback title={copy('scanner.sessionUnavailable')} /> : !uuid.test(eventId) ? <Feedback title={copy('feedback.loadFailed')} /> : <>
        <View style={s.summary}>
          <Text style={s.summaryLabel}>{copy('validation.totalScans')}</Text>
          <Text testID="scanner-history-total" style={s.total}>{total ?? '–'}</Text>
        </View>
        {offline && <View testID="scanner-history-offline" style={s.offline}><WifiOff size={15} color={colors.muted} /><Text style={[s.muted, { flex: 1 }]}>{copy(pages ? 'validation.historyOfflineCached' : 'validation.historyOffline')}</Text></View>}
        <FlatList<HistoryScan>
          key={scope}
          testID="scanner-history-list"
          data={scans}
          keyExtractor={scan => scan.ticketId}
          renderItem={({ item }) => <ScanRow scan={item} />}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(24, insets.bottom + 16), gap: 10 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          {...webListScrollProps(loadMore)}
          ListEmptyComponent={history.isPending && !offline ? <Loading /> : history.isError && !offline ? <Feedback title={copy(forbidden ? 'scanner.sessionUnavailable' : 'feedback.loadFailed')} retry={retry} /> : offline ? null : <View style={s.empty}>
            <View style={s.emptyIcon}><History size={25} color={colors.accent} /></View>
            <Text style={s.emptyTitle}>{copy('validation.noScansYet')}</Text>
            <Text style={[s.muted, { textAlign: 'center' }]}>{copy(scope === 'all' ? 'validation.historyEmptyAll' : 'validation.historyEmptyMine')}</Text>
          </View>}
          ListFooterComponent={history.isFetchingNextPage ? <Loading /> : scans.length ? <>
            {history.isError && !offline && <Feedback compact title={copy('feedback.loadFailed')} retry={() => { if (history.isFetchNextPageError) void history.fetchNextPage(); else retry(); }} />}
            <Text style={s.footnote}>{copy('validation.historySyncedOnly')}</Text>
          </> : null}
        />
      </>}
    </View>
  </View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, width: '100%', maxWidth: 680, alignSelf: 'center' },
  header: { padding: 20, paddingBottom: 16, gap: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 28, fontWeight: '800', letterSpacing: -0.8, color: colors.text },
  event: { fontSize: 14, lineHeight: 20, color: colors.muted },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 99, backgroundColor: '#101012', borderWidth: 1, borderColor: '#ffffff12' },
  highlight: { position: 'absolute', left: 3, top: 3, bottom: 3, backgroundColor: colors.accent, borderRadius: 99 },
  tab: { flex: 1, minHeight: 40, paddingHorizontal: 6, flexDirection: 'row', gap: 7, justifyContent: 'center', alignItems: 'center' },
  tabLabel: { fontSize: 13, fontWeight: '600', color: colors.muted },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingBottom: 14 },
  summaryLabel: { color: colors.muted, fontSize: 12, fontWeight: '500' },
  total: { color: colors.text, fontSize: 19, fontWeight: '700', fontVariant: ['tabular-nums'] },
  scan: { borderRadius: 20, backgroundColor: '#101012', padding: 16, gap: 12 },
  check: { height: 34, width: 34, borderRadius: 17, backgroundColor: '#49dca214', alignItems: 'center', justifyContent: 'center' },
  ticketType: { color: colors.text, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  actorRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 6, rowGap: 4 },
  actor: { color: '#d0d0d4', fontSize: 12, lineHeight: 18, flexShrink: 1 },
  access: { color: colors.muted, fontSize: 10, backgroundColor: '#ffffff08', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  ticketId: { color: '#797982', fontSize: 10, lineHeight: 15 },
  offline: { flexDirection: 'row', gap: 8, marginHorizontal: 20, paddingBottom: 16, alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 20, gap: 12 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#ff004414', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text, textAlign: 'center' },
  footnote: { color: '#797982', fontSize: 11, lineHeight: 17, textAlign: 'center', paddingHorizontal: 12, paddingVertical: 20 },
});
