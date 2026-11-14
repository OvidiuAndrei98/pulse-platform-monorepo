import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { VirtualizedList, Platform, Pressable, StyleSheet, View, useWindowDimensions, type ViewProps, type ViewInstance, type VirtualizedListInstance } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { CalendarDays, ChevronLeft, RotateCcw } from 'lucide-react-native';
import type { EventFilters } from '@packages/app-core/events/types';
import { productToday, shiftCalendarDay } from '@packages/app-core/events/discoveryFilters';
import { DATE_RIBBON_CONTEXT_DAYS, DATE_RIBBON_DAY_WIDTH as STEP, dateRibbonCalendar, dateRibbonDayAt, dateRibbonDayIndex, dateRibbonEventRanges, dateRibbonIndex, dateRibbonSelection, withRibbonDay, withoutRibbonDay, type DateRibbonCalendar } from '@packages/app-core/events/dateRibbon';
import { useHomeEvents } from '../data/queries';
import { usePreferences } from '../usePreferences';
import { GlassSurface, supportsLiquidGlass } from '../ui/GlassSurface';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { DateRibbonMask } from './DateRibbonMask';
import { iosSearchOpenSpring, iosSearchCloseSpring, searchMorphGeometry, smoothMorphPhase } from './searchMorph';
import type { DiscoveryControlPose } from './discoveryControlsMotion';
import { MorphVisibility } from './MorphVisibility';
import { useDateRibbonSound } from './useDateRibbonSound';
import { useDateRibbonHaptics } from './useDateRibbonHaptics';
import { DateRibbonHaptics, hasNativeDateRibbonHaptics } from './DateRibbonHaptics';

const AnimatedGlassSurface = Animated.createAnimatedComponent(GlassSurface);
const calendarItemCount = (calendar: DateRibbonCalendar) => calendar.count;
type RibbonKeyEvent = Parameters<NonNullable<ViewProps['onKeyDown']>>[0];

type RibbonDayLabel = { day: string; weekday: string; number: number; month: string; full: string };
const RibbonDay = React.memo(function RibbonDay({ label, selected, preview, today, onPick, context, contextWidth, hasEvents }: {
  label: RibbonDayLabel; selected: boolean; preview: boolean; today: string; onPick: (day: string) => void;
  context: RibbonDayLabel[]; contextWidth: number; hasEvents?: boolean;
}) {
  const past = label.day < today;
  return <Pressable testID={'ribbon-day-' + label.day} accessibilityRole="button" tabIndex={Platform.OS === 'web' ? -1 : undefined}
    {...(Platform.OS === 'web' ? { dataSet: { eventAvailability: hasEvents === undefined ? 'unknown' : hasEvents ? 'available' : 'empty' } } : {})}
    accessibilityLabel={label.full} accessibilityState={{ selected, disabled: past }} aria-pressed={selected}
    disabled={past} onPress={() => onPick(label.day)} style={[s.day, past && s.pastDay]}>
    {label.day === today && <View pointerEvents="none" accessibilityElementsHidden aria-hidden style={[s.pastContext, { width: contextWidth }]}>
      <View style={[s.contextRow, { width: context.length * STEP }]}>
        {context.map(item => <View key={item.day} testID={'ribbon-context-day-' + item.day} style={[s.day, s.pastDay]}>
          <Text style={s.weekday}>{item.weekday}</Text><Text style={s.number}>{item.number}</Text><Text style={s.month}>{item.month}</Text>
        </View>)}
      </View>
    </View>}
    <Text style={[s.weekday, preview && s.centerText]}>{label.weekday}</Text>
    <Text style={[s.number, hasEvents === false && s.emptyNumber, preview && s.centerText]}>{label.number}</Text>
    <Text style={[s.month, preview && s.centerText]}>{label.month}</Text>
  </Pressable>;
});

export function DiscoveryDateRibbon({ filters, onChange, onOpenChange, progress, source, expanded, calendarMotion, searching = false, center = null, minimumDay, maximumDay }: {
  filters: EventFilters; onChange: (filters: EventFilters) => void;
  onOpenChange: (open: boolean) => void; progress: SharedValue<number>; source: { x: number; y: number }; expanded: boolean;
  calendarMotion: SharedValue<DiscoveryControlPose>; searching?: boolean; center?: readonly [number, number] | null;
  /** Planning may start before 06:00 on the previous nightlife date. Discover keeps its defaults. */
  minimumDay?: string; maximumDay?: string;
}) {
  const { copy, language } = usePreferences('copy'), reduced = useReducedMotion(), id = useId();
  const locale = language === 'ro' ? 'ro-RO' : 'en-GB', today = minimumDay ?? productToday();
  const selection = dateRibbonSelection(filters, today);
  const playTick = useDateRibbonSound(expanded && !searching);
  const vibrate = useDateRibbonHaptics(expanded && !searching);
  const contextDays = useMemo(() => Array.from({ length: DATE_RIBBON_CONTEXT_DAYS }, (_, index) => shiftCalendarDay(today, index - DATE_RIBBON_CONTEXT_DAYS)), [today]);
  const setExpanded = onOpenChange;
  const calendar = useMemo(() => {const base=dateRibbonCalendar(today);return maximumDay?{...base,count:Math.max(1,Math.min(base.count,dateRibbonDayIndex(base,maximumDay)+1))}:base}, [today,maximumDay]);
  // Reuse Home's fully paginated catalogue; a date-filtered list cannot prove
  // that another day is empty. Unknown/error states keep their normal colors.
  const catalogue = useHomeEvents(expanded && !searching);
  const eventRanges = useMemo(() => catalogue.data && !catalogue.isError
    ? dateRibbonEventRanges(catalogue.data, filters, center) : undefined,
    [catalogue.data, catalogue.isError, filters.categories, filters.vibes, filters.city, filters.q,
      filters.distance, center?.[0], center?.[1], today]);
  const availability = useMemo(() => {
    const cache = new Map<string, boolean>();
    return (day: string) => {
      if (!eventRanges) return undefined;
      if (!cache.has(day)) {
        if (cache.size >= 512) cache.delete(cache.keys().next().value!);
        cache.set(day, eventRanges.some(range => day >= range.first && day <= range.last));
      }
      return cache.get(day);
    };
  }, [eventRanges]);
  const [preview, setPreview] = useState(selection || today), [width, setWidth] = useState(useWindowDimensions().width - 40);
  const list = useRef<VirtualizedListInstance>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const track = useRef<ViewInstance>(null);
  const previewRef = useRef(preview), committed = useRef(selection), dragging = useRef(false), momentum = useRef(false), interacted = useRef(false);
  const programmatic = useRef(false);
  const wasExpanded = useRef(false);
  const fullWidth = useSharedValue(width), sourcePoint = useSharedValue(source);
  const latest = useRef({ filters, onChange, calendar, today, expanded });
  latest.current = { filters, onChange, calendar, today, expanded };
  const formatters = useMemo(() => ({
    weekday: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }),
    full: new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }),
    month: new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }),
    year: new Intl.DateTimeFormat(locale, { year: 'numeric', timeZone: 'UTC' }),
  }), [locale]);
  // Formatting and native text views stay stable while the selected day moves.
  const labels = useMemo(() => {
    const format = (day: string): RibbonDayLabel => {
      const date = new Date(day + 'T12:00:00Z');
      return { day, weekday: formatters.weekday.format(date).replace(/\.$/, ''), number: Number(day.slice(-2)),
        month: formatters.month.format(date), full: formatters.full.format(date) };
    };
    const cache = new Map<string, RibbonDayLabel>();
    return { day: (day: string) => {
      let label = cache.get(day);
      if (!label) {
        if (cache.size >= 512) cache.delete(cache.keys().next().value!);
        label = format(day); cache.set(day, label);
      } else { cache.delete(day); cache.set(day, label); }
      return label;
    }, context: contextDays.map(format) };
  }, [contextDays, formatters]);
  const date = (day: string) => new Date(day + 'T12:00:00Z');
  const clearTimer = () => { clearTimeout(timer.current); timer.current = undefined; };
  const setDayPreview = (day: string) => { previewRef.current = day; setPreview(current => current === day ? current : day); };
  const updateScroll = (offset: number) => {
    if (!expanded) return;
    const index = dateRibbonIndex(offset, calendar.count), day = dateRibbonDayAt(calendar, index);
    if (!day) return;
    if (expanded && day !== previewRef.current && interacted.current && !programmatic.current) {
      if (!hasNativeDateRibbonHaptics) vibrate();
      playTick();
    }
    setDayPreview(day);
  };
  const settle = () => {
    clearTimer();
    const current = latest.current;
    if (!current.expanded || !interacted.current || dragging.current || momentum.current) return;
    const day = previewRef.current < current.today ? current.today : previewRef.current;
    if (day !== previewRef.current) {
      programmatic.current = true; setDayPreview(day);
      list.current?.scrollToOffset({ offset: Math.max(0, dateRibbonDayIndex(current.calendar, day)) * STEP, animated: !reduced });
    }
    const next = withRibbonDay(current.filters, day, current.today);
    committed.current = day;
    if (next !== current.filters) current.onChange(next);
  };
  useLayoutEffect(() => {
    interacted.current = false;
    if (expanded && !wasExpanded.current) {
      const day = selection && selection >= today ? selection : today;
      setDayPreview(day);
    }
    wasExpanded.current = expanded;
    if (expanded) list.current?.scrollToOffset({ offset: Math.max(0, dateRibbonDayIndex(calendar, previewRef.current)) * STEP, animated: false });
  }, [calendar, width, expanded]);
  useEffect(() => { fullWidth.value = width; }, [width, fullWidth]);
  useEffect(() => { if (expanded && Platform.OS === 'web') { const frame = requestAnimationFrame(() => track.current?.focus()); return () => cancelAnimationFrame(frame); } }, [expanded]);
  useEffect(() => { sourcePoint.value = source; }, [source, sourcePoint]);
  useEffect(() => {
    const spring = Platform.OS === 'ios' ? expanded ? iosSearchOpenSpring : iosSearchCloseSpring : { mass: 0.8, stiffness: 300, damping: 27 };
    progress.value = withSpring(expanded ? 1 : 0, { ...spring, reduceMotion: ReduceMotion.System });
  }, [expanded, progress, onOpenChange]);
  useEffect(() => {
    if (selection === committed.current) return;
    clearTimer(); committed.current = selection;
    const day = selection && selection >= today ? selection : today;
    setDayPreview(day);
    if (expanded) list.current?.scrollToOffset({ offset: Math.max(0, dateRibbonDayIndex(calendar, day)) * STEP, animated: false });
  }, [selection, today, calendar, expanded]);
  useEffect(() => { if (searching) { clearTimer(); setExpanded(false); } }, [searching]);
  useEffect(() => () => { clearTimeout(timer.current); }, []);
  const geometry = useDerivedValue(() => {
    if (Platform.OS === 'ios') {
      const shape = searchMorphGeometry({
        source: { ...sourcePoint.value, width: 44, height: 44 },
        destination: { x: 0, y: 0, width: fullWidth.value, height: 54 },
      }, progress.value, 144, { opening: expanded, interactive: false, reduced, ios: true });
      return { width: shape.searchWidth, height: shape.searchHeight, radius: shape.radius,
        x: shape.searchX, y: shape.searchY, scaleX: shape.sourceScale, scaleY: shape.sourceScale * shape.fieldScaleY };
    }
    const p = progress.value;
    return { width: 44 + (fullWidth.value - 44) * p, height: 44 + 10 * p, radius: 22 + 5 * p,
      x: sourcePoint.value.x * (1 - p), y: sourcePoint.value.y * (1 - p), scaleX: 1, scaleY: 1 };
  });
  const sourceVisibility = useAnimatedStyle(() => ({ opacity: calendarMotion.value.opacity }));
  const surfaceMotion = useAnimatedStyle(() => {
    const sourceWeight = 1 - Math.max(0, Math.min(1, progress.value)), pose = calendarMotion.value;
    return { width: geometry.value.width, height: geometry.value.height,
      borderRadius: geometry.value.radius, transform: [{ translateX: geometry.value.x + pose.x * sourceWeight }, { translateY: geometry.value.y + pose.y * sourceWeight },
        { scaleX: geometry.value.scaleX * (1 + (pose.scale - 1) * sourceWeight) }, { scaleY: geometry.value.scaleY * (1 + (pose.scale - 1) * sourceWeight) }] };
  });
  const clipMotion = useAnimatedStyle(() => ({ width: geometry.value.width, height: geometry.value.height, borderRadius: geometry.value.radius }));
  const expandedMotion = useAnimatedStyle(() => ({ opacity: smoothMorphPhase(progress.value, 0.12, 0.82) }));
  const iconMotion = useAnimatedStyle(() => ({ top: 14 - 2.5 * Math.max(0, Math.min(1, progress.value)) }));
  const calendarIconMotion = useAnimatedStyle(() => ({ opacity: 1 - smoothMorphPhase(progress.value, 0.12, 0.7) }));
  const resetIconMotion = useAnimatedStyle(() => ({ opacity: smoothMorphPhase(progress.value, 0.12, 0.7) }));
  const reset = () => {
    clearTimer(); interacted.current = false; programmatic.current = true;
    setDayPreview(today); list.current?.scrollToOffset({ offset: 0, animated: false });
    onChange(withoutRibbonDay(filters));
  };
  const pick = (day: string) => {
    if (day < today || day > (maximumDay ?? '2100-12-31')) return;
    if (day !== committed.current) { vibrate(); playTick(); }
    clearTimer(); programmatic.current = true; setDayPreview(day); committed.current = day;
    const next = withRibbonDay(filters, day, today);
    if (next !== filters) onChange(next);
    const index = dateRibbonDayIndex(calendar, day);
    if (index >= 0) list.current?.scrollToOffset({ offset: index * STEP, animated: !reduced });
  };
  const latestPick = useRef(pick);
  useLayoutEffect(() => { latestPick.current = pick; });
  const pickDay = useCallback((day: string) => latestPick.current(day), []);
  const trackWidth = Math.max(STEP, width - 88);
  const trackCenter = width / 2 - 44;
  const paddingLeft = Math.max(0, trackCenter - STEP / 2), paddingRight = Math.max(0, trackWidth - trackCenter - STEP / 2);
  return <View testID="discovery-date-control" pointerEvents={searching ? 'none' : 'box-none'} aria-hidden={searching} accessibilityElementsHidden={searching}
    importantForAccessibility={searching ? 'no-hide-descendants' : 'auto'} style={s.root} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <MorphVisibility testID="discovery-date-material-layer" pointerEvents="box-none" style={StyleSheet.absoluteFill} opacityStyle={sourceVisibility}>
    {/* One permanently opaque native material is the button AND the ribbon.
        Only its inner content clips; the native press halo remains unmasked. */}
    <AnimatedGlassSurface testID="discovery-date-surface" interactive style={[s.surface, supportsLiquidGlass && s.nativeSurface, surfaceMotion]}>
      <Animated.View style={[s.clip, clipMotion]}>
        <Animated.View testID="discovery-calendar-morph-icon" pointerEvents="none" accessibilityElementsHidden aria-hidden style={[s.morphIcon, iconMotion]}>
          <Animated.View testID="discovery-calendar-glyph" style={[StyleSheet.absoluteFill, calendarIconMotion]}><CalendarDays size={16} color={colors.text}/></Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, resetIconMotion]}><RotateCcw size={16} color={colors.text}/></Animated.View>
        </Animated.View>
        <Pressable testID="discovery-calendar-toggle" accessibilityRole="button" accessibilityLabel={copy('filters.calendar')}
          accessibilityState={{ expanded }} aria-hidden={expanded} accessibilityElementsHidden={expanded}
          importantForAccessibility={expanded ? 'no-hide-descendants' : 'auto'} tabIndex={expanded || searching ? -1 : 0}
          pointerEvents={expanded ? 'none' : 'auto'} onPress={() => setExpanded(true)} style={s.toggle}/>
        <Animated.View nativeID={id} testID={expanded ? 'discovery-date-ribbon' : undefined} style={[s.row, { width }, expandedMotion]} pointerEvents={expanded ? 'auto' : 'none'} aria-hidden={!expanded} accessibilityElementsHidden={!expanded} importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}>
          <Pressable testID="discovery-calendar-close" accessibilityRole="button" accessibilityLabel={copy('common.close')} onPress={() => { clearTimer(); setExpanded(false); }} style={s.action}><ChevronLeft size={18} color={colors.text}/></Pressable>
          <View ref={track} collapsable={false} testID="discovery-date-track" style={[s.track, { width: trackWidth }]} accessibilityLabel={copy('filters.chooseDay')}
            {...(Platform.OS === 'web' ? { tabIndex: expanded ? 0 : -1, onKeyDown: (event: RibbonKeyEvent) => {
              const key = (event as RibbonKeyEvent & { key?: string }).key ?? (event.nativeEvent as { key?: string }).key ?? '';
              const day = key === 'Home' ? today : ['ArrowLeft', 'ArrowRight'].includes(key) ? shiftCalendarDay(previewRef.current, key === 'ArrowRight' ? 1 : -1) : '';
              if (day) { event.preventDefault(); pick(day); }
              if (key === 'Escape') { event.preventDefault(); clearTimer(); setExpanded(false); }
            }, onWheel: () => { interacted.current = true; programmatic.current = false; } } : {})}>
            <DateRibbonHaptics enabled={expanded && !searching} stepWidth={STEP}/>
            <View pointerEvents="none" style={[s.center, { left: trackCenter - 22 }]} />
            <DateRibbonMask>
            <VirtualizedList ref={list} horizontal data={calendar} getItem={dateRibbonDayAt} getItemCount={calendarItemCount}
              extraData={availability} keyExtractor={day => day} testID="discovery-date-scroll"
              showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft, paddingRight }}
              getItemLayout={(_, index) => ({ index, length: STEP, offset: index * STEP })}
              // Coordinates stay fixed across months/years. Overscan prepares
              // nearby dates without mounting the entire calendar or rebasing.
              initialNumToRender={91} maxToRenderPerBatch={32} windowSize={31} updateCellsBatchingPeriod={16}
              snapToInterval={STEP} decelerationRate="fast" bounces={false} keyboardShouldPersistTaps="handled" scrollEventThrottle={1}
              onTouchStart={() => { interacted.current = true; programmatic.current = false; }}
              onPointerDown={() => { interacted.current = true; programmatic.current = false; }}
              onScrollBeginDrag={() => { interacted.current = true; programmatic.current = false; dragging.current = true; clearTimer(); }}
              onScrollEndDrag={event => { updateScroll(event.nativeEvent.contentOffset.x); dragging.current = false; clearTimer(); timer.current = setTimeout(settle, 160); }}
              onMomentumScrollBegin={() => { momentum.current = true; clearTimer(); }}
              onMomentumScrollEnd={event => { updateScroll(event.nativeEvent.contentOffset.x); momentum.current = false; settle(); }}
              onScroll={event => {
                updateScroll(event.nativeEvent.contentOffset.x);
                if (!dragging.current && !momentum.current) { clearTimer(); timer.current = setTimeout(settle, 160); }
              }}
              renderItem={({ item: day }) => <RibbonDay label={labels.day(day)} selected={selection === day} preview={preview === day}
                today={today} onPick={pickDay} context={labels.context} contextWidth={paddingLeft} hasEvents={availability(day)}/>}/>
            </DateRibbonMask>
          </View>
          <Pressable testID="discovery-calendar-reset" accessibilityRole="button" accessibilityLabel={copy('filters.clearDates')} onPress={reset} style={s.action}>
            <View style={{width:16,height:17}}/><Text style={s.year}>{formatters.year.format(date(preview))}</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </AnimatedGlassSurface>
    </MorphVisibility>
  </View>;
}
const s = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, width: '100%', maxWidth: 620, height: 54, zIndex: 20 },
  surface: { position: 'absolute', top: 0, left: 0, backgroundColor: '#121418ed', borderWidth: 1, borderColor: '#ffffff1a' },
  nativeSurface: { borderWidth: 0 },
  clip: { overflow: 'hidden' },
  morphIcon: { position: 'absolute', right: 14, width: 16, height: 16, zIndex: 1 },
  toggle: { ...StyleSheet.absoluteFill, borderRadius: 22, zIndex: 2 },
  row: { position: 'absolute', top: 0, left: 0, height: 54, flexDirection: 'row', alignItems: 'center' },
  action: { width: 44, height: 54, alignItems: 'center', justifyContent: 'center' },
  track: { height: 54, overflow: 'hidden' },
  center: { position: 'absolute', top: 2, height: 48, width: 44, borderRadius: 13, borderCurve: 'continuous', backgroundColor: colors.accent },
  day: { width: STEP, height: 54, alignItems: 'center', justifyContent: 'center', gap: 1 },
  pastDay: { opacity: 0.35 },
  pastContext: { position: 'absolute', right: STEP, top: 0, height: 54, overflow: 'hidden' },
  contextRow: { position: 'absolute', right: 0, top: 0, height: 54, flexDirection: 'row' },
  weekday: { color: colors.muted, fontSize: 9, fontWeight: '500', textTransform: 'uppercase' },
  number: { color: colors.text, fontSize: 21, fontWeight: '700', lineHeight: 23, fontVariant: ['tabular-nums'] },
  emptyNumber: { color: colors.muted },
  month: { color: colors.muted, fontSize: 8, lineHeight: 10, fontWeight: '500' },
  year: { color: colors.muted, fontSize: 9, lineHeight: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  centerText: { color: 'white' },
});
