import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, Platform, Pressable, StyleSheet, View, useWindowDimensions, type TextInputInstance, type ViewInstance } from 'react-native';
import Animated, { ReduceMotion, useAnimatedProps, useAnimatedStyle, useDerivedValue, useSharedValue, withSpring } from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { CalendarDays, ChevronLeft, MapPin, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { usePreferences } from '../usePreferences';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { GlassButtonGroup } from '../ui/GlassButtonGroup';
import { GlassSurface } from '../ui/GlassSurface';
import { FormInput } from '../ui/FormInput';
import { usePressMotion } from '../ui/MotionPressable';
import { haptic } from '../ui/haptics';
import { DiscoveryViewSwitch } from './DiscoveryViewSwitch';
import { initialSearchBounds, searchMorphGeometry, smoothMorphPhase, type SearchBounds, type SearchMorphBounds } from './searchMorph';
import { MorphVisibility } from './MorphVisibility';
import { DiscoveryNativeGlassGroups } from './DiscoveryNativeGlassGroups';
import { GlassPressable } from '../ui/GlassPressable';
import { useDiscoverySearchMotion, type SearchRequestOrigin } from './useDiscoverySearchMotion';
import { commitSearchFocus } from './commitSearchFocus';
import type { EventFilters } from '../../../pulse-app/src/features/events/types';

const AnimatedFormInput = Animated.createAnimatedComponent(FormInput);

export function DiscoveryToolbar({ filters, onChange, view, onViewChange, onFilters, onCalendar, onCity, onHeight, onSearchActivityChange }: {
  filters: EventFilters; onChange: (value: EventFilters) => void; view: 'list' | 'map'; onViewChange: (view: 'list' | 'map') => void;
  onFilters: () => void; onCalendar: () => void; onCity: () => void; onHeight: (height: number) => void;
  onSearchActivityChange?: (active: boolean) => void;
}) {
  const { copy } = usePreferences(), { width } = useWindowDimensions(), wide = width >= 1024 && Platform.OS === 'web';
  const focused = useIsFocused();
  const [inputFocused, setInputFocused] = useState(false);
  const input = useRef<TextInputInstance>(null), trigger = useRef<ViewInstance>(null);
  const pendingFocus = useRef(!!filters.q), wasFocused = useRef(focused);
  const current = useRef({ filters, onChange, wide, focused });
  useLayoutEffect(() => { current.current = { filters, onChange, wide, focused }; }, [filters, onChange, wide, focused]);
  const didClose = useCallback(() => {
    const latest = current.current;
    if (latest.filters.q) latest.onChange({ ...latest.filters, q: '' });
    if (latest.focused && !latest.wide) trigger.current?.focus();
  }, []);
  const didRequest = useCallback((next: boolean, origin: SearchRequestOrigin) => {
    if (!next) pendingFocus.current = false;
    if (Platform.OS === 'web') return;
    if (!next && origin === 'command') { input.current?.blur(); Keyboard.dismiss(); }
  }, []);
  const { open, phase, isOpen, progress, intent, reduceMotion, controlsReady, setOpen: moveSearch, detach } = useDiscoverySearchMotion(!!filters.q, didClose, didRequest);
  const searchActive = phase !== 'closed';
  useEffect(() => { onSearchActivityChange?.(searchActive && focused); }, [searchActive, focused, onSearchActivityChange]);
  const measured = useRef(initialSearchBounds(width - 40)), lastHeight = useRef(0);
  const bounds = useSharedValue(measured.current);
  const measureBound = useCallback((key: keyof SearchMorphBounds, layout: SearchBounds) => {
    if (layout.width <= 0 || layout.height <= 0) return;
    const { x, y, width: w, height } = layout;
    measured.current = { ...measured.current, [key]: { x, y, width: w, height } };
    bounds.value = measured.current;
  }, [bounds]);
  const measuredTextWidth = useSharedValue(144);
  const geometry = useDerivedValue(() => searchMorphGeometry(bounds.value, progress.value, measuredTextWidth.value, {
    opening: intent.value.open, interactive: intent.value.interactive, reduced: reduceMotion.value,
  }));
  // A fast, non-bouncing follower preserves the entrance scale if a tap or
  // keyboard gesture reverses direction halfway through Back's appearance.
  const backScale = useDerivedValue(() => withSpring(geometry.value.backScale, {
    mass: .3, stiffness: 600, damping: 27,
    reduceMotion: reduceMotion.value ? ReduceMotion.Always : ReduceMotion.Never,
  }));
  const press = usePressMotion();
  const nativeLayers = Platform.OS === 'ios';
  const active = open || wide;
  const compact = !wide && (open || !controlsReady);
  const searchPressIn = () => { if (!isOpen()) haptic('selection'); if (!nativeLayers) press.pressIn(); };
  const openSearch = () => {
    pendingFocus.current = true;
    if (!isOpen()) {
      if (Platform.OS === 'web') {
        commitSearchFocus(() => moveSearch(true));
        // Safari needs focus within the trusted activation, before any rAF.
        input.current?.focus();
      } else moveSearch(true);
    } else if (open) input.current?.focus();
  };
  const close = () => {
    if (wide) {
      onChange({ ...filters, q: '' }); input.current?.focus(); return;
    }
    if (!isOpen()) return;
    pendingFocus.current = false;
    if (moveSearch(false) && Platform.OS === 'web') { input.current?.blur(); Keyboard.dismiss(); }
  };
  // Focus only after the existing input becomes editable. No delayed callback
  // can refocus it after an interrupted dismissal or steal another screen's focus.
  useLayoutEffect(() => {
    if (open && focused && pendingFocus.current) { pendingFocus.current = false; input.current?.focus(); }
  }, [open, focused]);
  useEffect(() => {
    if (filters.q && phase === 'closed') {
      pendingFocus.current = true; moveSearch(true);
    }
  }, [filters.q, moveSearch]);
  useEffect(() => {
    if (wasFocused.current && !focused) { pendingFocus.current = false; input.current?.blur(); detach(); }
    wasFocused.current = focused;
  }, [focused, detach]);
  useEffect(() => {
    if (!open || wide || !focused || Platform.OS !== 'android') return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => listener.remove();
  }, [open, wide, focused, filters, onChange]);

  const surfaceMotion = useAnimatedStyle(() => wide
    ? { position: 'relative', flex: 1, width: undefined, height: 44, minWidth: 180, maxWidth: 440, borderRadius: 22, transform: [{ translateX: 0 }, { translateY: 0 }] }
    : { position: 'absolute', flex: undefined, minWidth: 44, maxWidth: undefined, width: geometry.value.searchWidth,
        height: geometry.value.searchHeight, borderRadius: geometry.value.radius,
        transform: [{ translateX: geometry.value.searchX + geometry.value.searchWidth * (geometry.value.fieldScaleX - 1) / 2 },
          { translateY: geometry.value.searchY }, { scaleX: geometry.value.fieldScaleX * geometry.value.sourceScale },
          { scaleY: geometry.value.sourceScale }] });
  const contentSize = useAnimatedStyle(() => ({ width: wide ? '100%' : geometry.value.contentWidth }));
  const maskMotion = useAnimatedStyle(() => ({ borderRadius: wide ? 22 : geometry.value.radius }));
  const iconMotion = useAnimatedStyle(() => ({
    opacity: (wide ? .8 : 1 - .2 * Math.max(0, Math.min(1, progress.value))) * (nativeLayers
      ? smoothMorphPhase(progress.value, 0, .18) * (1 - smoothMorphPhase(progress.value, .88, 1)) : 1),
    transform: [{ translateX: wide ? -4 : geometry.value.iconX }],
  }));
  const textMotion = useAnimatedStyle(() => ({
    opacity: wide ? 1 : geometry.value.text,
    transform: [{ translateX: wide ? 0 : 6 * (1 - geometry.value.text) }],
  }));
  const caretMotion = useAnimatedProps(() => ({ caretHidden: !wide && geometry.value.text < .99 }));
  const clearMotion = useAnimatedStyle(() => ({ opacity: wide ? 1 : geometry.value.clear }));
  const controlsMotion = useAnimatedStyle(() => ({ opacity: geometry.value.controls }));
  const controlsScale = useAnimatedStyle(() => ({ transform: [{ scale: geometry.value.controlsScale }] }));
  const backMotion = useAnimatedStyle(() => ({ opacity: geometry.value.back }));
  const backEntrance = useAnimatedStyle(() => ({ transform: [{ scale: backScale.value }] }));
  const materialMotion = useAnimatedStyle(() => ({ opacity: nativeLayers
    ? smoothMorphPhase(progress.value, 0, .18) * (1 - smoothMorphPhase(progress.value, .88, 1)) : 1 }));
  const filter = <GlassPressable testID="event-filters" style={s.circle} pointerEvents={compact ? 'none' : 'auto'}
    accessibilityLabel={copy('common.filters')} tabIndex={compact ? -1 : 0} onPress={compact ? undefined : onFilters}
    aria-hidden={compact} accessibilityElementsHidden={compact}><SlidersHorizontal size={16} color="white"/></GlassPressable>;

  const field = <Animated.View style={[s.content, contentSize]} pointerEvents={active ? 'auto' : 'none'}
          aria-hidden={!active} accessibilityElementsHidden={!active} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}>
          <Animated.View style={[s.field, textMotion]}>
            <AnimatedFormInput ref={input} animatedProps={Platform.OS === 'web' ? undefined : caretMotion}
              variant="bare" nativeID="discovery-search" testID="discovery-search" accessibilityLabel={copy('filters.searchEvents')}
              placeholder={copy('filters.searchEvents')} placeholderTextColor={colors.muted} value={filters.q ?? ''}
              editable={wide || searchActive} tabIndex={active ? 0 : -1}
              onChangeText={q => onChange({ ...filters, q: Array.from(q).slice(0, 120).join('') })}
              autoCapitalize="none" autoCorrect={false} keyboardAppearance="dark" returnKeyType="search" onSubmitEditing={close}
              onKeyPress={event => { if (event.nativeEvent.key === 'Escape') close(); }}
              onFocus={() => {
                setInputFocused(true);
                if (wide && !isOpen()) moveSearch(true);
              }} onBlur={() => setInputFocused(false)} style={s.input}/>
            <Animated.View style={clearMotion}><Pressable testID="discovery-search-clear" accessibilityRole="button" accessibilityLabel={copy('filters.closeSearch')}
              disabled={!filters.q} aria-hidden={!filters.q} accessibilityElementsHidden={!filters.q}
              onPress={() => { onChange({ ...filters, q: '' }); input.current?.focus(); }} tabIndex={active && filters.q ? 0 : -1}
              hitSlop={4} style={[s.clear, { opacity: filters.q ? 1 : 0 }]}><X size={16} color="white"/></Pressable></Animated.View>
          </Animated.View>
        </Animated.View>;

  return <View testID="discovery-toolbar" onLayout={event => {
    if (lastHeight.current !== event.nativeEvent.layout.height) { lastHeight.current = event.nativeEvent.layout.height; onHeight(lastHeight.current); }
  }} style={[s.row, wide ? s.desktopRow : s.mobileRow]}>
    <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.measureClip}>
      <View style={s.textMeasure}><Text style={s.measureFont} onLayout={event => { measuredTextWidth.value = event.nativeEvent.layout.width; }}>
        {filters.q || copy('filters.searchEvents')}
      </Text></View>
    </View>
    {wide ? <DiscoveryViewSwitch view={view} onChange={onViewChange}/> : nativeLayers ?
      <DiscoveryNativeGlassGroups bounds={bounds} progress={progress} geometry={geometry} backScale={backScale}
        sourceSwitch={<DiscoveryViewSwitch view={view} onChange={onViewChange} disabled={compact} style={[s.sourceSwitch, { width: '100%' }]}/>}
        filter={filter} field={field} compact={compact} active={active} focused={inputFocused}
        searchLabel={copy('filters.searchEvents')} backLabel={copy('common.back')} triggerRef={trigger}
        onOpen={openSearch} onClose={close} onSearchPressIn={searchPressIn}
        onSourceLayout={event => measureBound('source', event.nativeEvent.layout)}
        onDestinationLayout={event => measureBound('destination', event.nativeEvent.layout)}/>
      : <>
      {/* Permanent anchors share the toolbar's coordinate space. Neither row
          responds to open/closed state, so measuring cannot restart the morph. */}
      <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.anchors}>
        <View style={s.circleSize}/>
        <View testID="discovery-search-destination" style={s.destination}
          onLayout={event => measureBound('destination', event.nativeEvent.layout)}/>
      </View>
      <MorphVisibility testID="discovery-source-layer" opacityStyle={controlsMotion} style={s.sourceLayer}
        pointerEvents={compact ? 'none' : 'box-none'} aria-hidden={compact}
        accessibilityElementsHidden={compact} importantForAccessibility={compact ? 'no-hide-descendants' : 'auto'}>
        <GlassButtonGroup style={s.sourceRow}>
          <Animated.View style={[s.switchSlot, controlsScale]}>
            <DiscoveryViewSwitch view={view} onChange={onViewChange} disabled={compact} style={[s.sourceSwitch, { width: '100%' }]}/>
          </Animated.View>
          <Animated.View style={[s.circleSize, controlsScale]}>{filter}</Animated.View>
          <View testID="discovery-search-source" pointerEvents="none" style={s.circleSize}
            onLayout={event => measureBound('source', event.nativeEvent.layout)}/>
        </GlassButtonGroup>
      </MorphVisibility>
      <MorphVisibility testID="discovery-back-layer" opacityStyle={backMotion} style={s.backLayer}
        pointerEvents={compact ? 'auto' : 'none'} aria-hidden={!compact}
        accessibilityElementsHidden={!compact} importantForAccessibility={compact ? 'auto' : 'no-hide-descendants'}>
        <Animated.View testID="discovery-back-surface" style={[s.circleSize, backEntrance]}>
          <GlassPressable testID="discovery-search-back" style={s.circle} accessibilityLabel={copy('common.back')}
            tabIndex={compact ? 0 : -1} onPress={close}><ChevronLeft size={20} color="white"/></GlassPressable>
        </Animated.View>
      </MorphVisibility>
    </>}
    <Animated.View testID="discovery-search-surface" pointerEvents="box-none" style={[s.searchSurface, surfaceMotion]}>
      <MorphVisibility style={s.fill} opacityStyle={materialMotion} pointerEvents="none">
        <GlassSurface interactive={false} style={s.morphMaterial}/>
        <Animated.View style={[s.border, maskMotion, inputFocused && s.focusedBorder]}/>
      </MorphVisibility>
      <Animated.View pointerEvents="box-none" style={[s.searchMask, maskMotion]}>
        {/* The travel layer hands off to native controls at the same bounds. */}
        <Animated.View pointerEvents="none" style={[s.searchIcon, iconMotion]}>
          <Animated.View style={nativeLayers ? undefined : press.style}><Search size={16} color="white"/></Animated.View>
        </Animated.View>
        {!nativeLayers && field}
        <View pointerEvents={active || (nativeLayers && controlsReady) ? 'none' : 'auto'} style={s.fill} aria-hidden={active || nativeLayers}
          accessibilityElementsHidden={active || nativeLayers} importantForAccessibility={active || nativeLayers ? 'no-hide-descendants' : 'auto'}>
          <Pressable ref={nativeLayers ? undefined : trigger} testID={nativeLayers ? "discovery-search-moving-toggle" : "discovery-search-toggle"} accessibilityRole="button" accessibilityLabel={copy('filters.searchEvents')}
            accessibilityState={{ expanded: open }} tabIndex={active ? -1 : 0} onPress={openSearch}
            onPressIn={searchPressIn} onPressOut={press.pressOut} onBlur={press.pressOut} style={s.center}/>
        </View>
      </Animated.View>
    </Animated.View>
    {wide && <>
      <Pressable testID="discovery-calendar-toggle" accessibilityRole="button" accessibilityLabel={copy('filters.calendar')} onPress={onCalendar}
        style={[s.desktopControl, { maxWidth: 210, paddingVertical: 10 }]}>
        <CalendarDays size={16} color={colors.accent}/><Text style={s.desktopText}>{filters.date === 'Custom' && filters.dateFrom
          ? filters.dateFrom + (filters.dateTo !== filters.dateFrom ? ' – ' + filters.dateTo : '') : copy('filters.calendar')}</Text>
      </Pressable>
      <Pressable testID="discovery-city" accessibilityRole="button" accessibilityLabel={copy('filters.city')} onPress={onCity}
        style={[s.desktopControl, { maxWidth: 180 }]}>
        <MapPin size={16} color={colors.accent}/><Text style={s.desktopText}>{filters.city || copy('filters.allCities')}</Text>
      </Pressable>
    </>}
    {wide && filter}
  </View>;
}
const s = StyleSheet.create({
  row: { position: 'relative', alignItems: 'center' },
  mobileRow: { height: 44, width: '100%', flexWrap: 'nowrap' },
  desktopRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, minHeight: 44 },
  anchors: { ...StyleSheet.absoluteFill, flexDirection: 'row', gap: 8 },
  destination: { flex: 1, height: 44 },
  circleSize: { width: 44, height: 44, borderRadius: 22, flexShrink: 0 },
  sourceLayer: { ...StyleSheet.absoluteFill, zIndex: 1 },
  sourceRow: { width: '100%', height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'nowrap' },
  sourceSwitch: { flexShrink: 1, minWidth: 112 },
  switchSlot: { width: 152, height: 44, minWidth: 112, flexShrink: 1 },
  backLayer: { position: 'absolute', left: 0, top: 0, width: 44, height: 44, zIndex: 2 },
  circle: { width: 44, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: '#ffffff1a', backgroundColor: '#121418ed' },
  searchSurface: { left: 0, top: 0, height: 44, borderRadius: 22, flexShrink: 0, zIndex: 3 },
  morphMaterial: { ...StyleSheet.absoluteFill, borderRadius: 22, backgroundColor: '#121418ed' },
  searchMask: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  measureClip: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, overflow: 'hidden' },
  textMeasure: { position: 'absolute', left: 0, top: 0, width: 10000, flexDirection: 'row', opacity: 0 },
  measureFont: { fontSize: 16, fontFamily: 'Inter_400Regular', flexShrink: 0 },
  searchIcon: { position: 'absolute', left: 14, top: 14, width: 16, height: 16 },
  content: { position: 'absolute', left: 0, top: 0, height: 44 },
  field: { position: 'absolute', left: 36, right: 4, top: 0, height: 44, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, minWidth: 0, fontSize: 16, fontFamily: 'Inter_400Regular', minHeight: 42, color: colors.text, padding: 0,
    ...(Platform.OS === 'web' ? { outlineWidth: 0, outlineStyle: 'solid' as const } : {}) },
  clear: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  fill: { ...StyleSheet.absoluteFill },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  border: { ...StyleSheet.absoluteFill, borderWidth: StyleSheet.hairlineWidth, borderColor: '#ffffff1a' },
  focusedBorder: { borderColor: '#ffffff38' },
  desktopControl: { minHeight: 44, borderRadius: 24, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#121418ed', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  desktopText: { color: colors.text, fontSize: 14, flexShrink: 1 },
});
