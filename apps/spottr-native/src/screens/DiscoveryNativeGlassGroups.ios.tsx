import React from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import NativeMaskedView from '@react-native-masked-view/masked-view';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import Animated, { useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { ChevronLeft, Search } from 'lucide-react-native';
import { GlassButtonGroup } from '../ui/GlassButtonGroup';
import { GlassPressable } from '../ui/GlassPressable';
import { supportsLiquidGlass } from '../ui/GlassSurface';
import { GlassInputSurface } from '../ui/GlassInputSurface';
import type { GlassSurfaceProps } from '../ui/glassSurfaceTypes';
import { useReducedTransparencyPreference } from '../ui/useReducedTransparencyPreference';
import { nativeSearchInputCompensation, smoothMorphPhase, iosSearchSourceHandoff } from './searchMorph';
import type { DiscoveryNativeGlassGroupsProps } from './DiscoveryNativeGlassGroups';
import { advanceDiscoveryControls, initialDiscoveryControlsState } from './discoveryControlsMotion';

const MaskedView = NativeMaskedView as unknown as React.ComponentType<ViewProps & { maskElement: React.ReactElement }>;
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedGlassInputSurface = Animated.createAnimatedComponent(GlassInputSurface);

/** The same native controls as Home, in permanently mounted, fixed layouts.
 * UIKit owns the materials/merging. Search alone shares its small press extent
 * with the morph, so its release cannot finish before the expansion starts. */
export function DiscoveryNativeGlassGroups({ bounds, progress, geometry, backScale, intent, reduceMotion, sourceSwitch, filter, field, calendar, calendarMotion, compact, active, focused,
  searchLabel, backLabel, triggerRef, onOpen, onClose, onSearchPressIn, onSearchPressOut, onSourceLayout, onCalendarLayout, onDestinationLayout }: DiscoveryNativeGlassGroupsProps) {
  const controls = useSharedValue(initialDiscoveryControlsState(active));
  const reducedTransparency=useReducedTransparencyPreference();
  useAnimatedReaction(() => ({ progress: progress.value, opening: intent.value.open, interactive: intent.value.interactive,
    reduced: reduceMotion.value, sourceX: bounds.value.source.x, opacity: geometry.value.controls,
    scale: geometry.value.controlsScale, y: geometry.value.controlsTranslateY }),
    frame => {
      controls.value = advanceDiscoveryControls(controls.value, frame);
      if (calendarMotion) calendarMotion.value = controls.value.filter;
    });
  const sourceSwitchMask = useAnimatedProps(() => ({ width: bounds.value.source.x - 48, opacity: controls.value.switch.opacity }));
  const sourceFilterMask = useAnimatedProps(() => ({ x: bounds.value.source.x - 48, opacity: controls.value.filter.opacity }));
  const sourceClearance = useAnimatedProps(() => geometry.value.controlsCutout);
  const sourceSearch = useAnimatedProps(() => ({ x: bounds.value.source.x + 4, opacity: 1 - smoothMorphPhase(progress.value, 0, iosSearchSourceHandoff) }));
  const sourceCalendar = useAnimatedProps(() => ({ x: bounds.value.source.x + 52, opacity: controls.value.filter.opacity }));
  const back = useAnimatedProps(() => ({ width: bounds.value.destination.x + 4, opacity: geometry.value.back }));
  // Only the effect hands off late. Its input child keeps its independent fade
  // and one responder for the whole morph, including interrupted keyboard drags.
  const materialShown=useDerivedValue(()=>progress.value>=.88);
  const materialProps=useAnimatedProps<GlassSurfaceProps>(()=>({glassEffectStyle:{style:materialShown.value?'regular':'none',
    animate:!intent.value.interactive&&!reduceMotion.value,animationDuration:.07}}));
  const materialVisibility=useAnimatedStyle(()=>({opacity:smoothMorphPhase(progress.value,.88,1)}));
  const inputPosition = useAnimatedStyle(() => {
    const pose=nativeSearchInputCompensation(bounds.value,geometry.value);
    return {left:pose.left,top:pose.top,width:pose.width,transform:[{scaleX:pose.scaleX},{scaleY:pose.scaleY}]};
  });
  const iconPosition = useAnimatedStyle(() => ({ transform: [{ translateX:
    geometry.value.searchX - bounds.value.destination.x - geometry.value.destinationOffsetX + geometry.value.iconX + 4,
  }] }));
  // Both magnifiers occupy the same position during the brief material
  // crossfade. Otherwise closing shows a doubled glyph just before rest.
  const sourceIconPosition = useAnimatedStyle(() => ({ transform: [{ translateX:
    (bounds.value.destination.x - bounds.value.source.x - 4) * Math.max(0, Math.min(iosSearchSourceHandoff, progress.value)),
  }] }));
  const switchMotion = useAnimatedStyle(() => ({ transform: [
    { translateX: controls.value.switch.x }, { translateY: controls.value.switch.y }, { scale: controls.value.switch.scale },
  ] }));
  const filterMotion = useAnimatedStyle(() => ({ transform: [
    { translateX: controls.value.filter.x }, { translateY: controls.value.filter.y }, { scale: controls.value.filter.scale },
  ] }));
  const focusBorder = useAnimatedStyle(() => ({ borderColor: focused.value ? '#ffffff38' : '#ffffff1a' }));
  // A transparent SVG mask can hide the glyph while UIKit still composites
  // the native glass circle above the returning switch. Hide its host too at
  // zero visibility; the permanent outer slot keeps the morph's layout intact.
  const backEntrance = useAnimatedStyle(() => ({
    display: geometry.value.back > 0 ? 'flex' : 'none',
    transform: [{ scale: backScale.value }],
  }));
  const sourceSettle = useAnimatedStyle(() => ({ transform: [{ scale: Math.max(geometry.value.sourceScale, geometry.value.sourcePressScale) }] }));
  const fieldSettle = useAnimatedStyle(() => ({ transform: [
    { translateX: geometry.value.destinationOffsetX + bounds.value.destination.width * (geometry.value.destinationScaleX - 1) / 2 },
    { scaleX: geometry.value.destinationScaleX },
    { scaleY: geometry.value.fieldScaleY },
  ] }));

  return <>
    <View testID="discovery-source-layer" style={s.source} pointerEvents={compact ? 'none' : 'box-none'}
      aria-hidden={compact} accessibilityElementsHidden={compact} importantForAccessibility={compact ? 'no-hide-descendants' : 'auto'}>
      <MaskedView style={s.maskFrame} maskElement={<Svg style={StyleSheet.absoluteFill}>
        <Defs><Mask id="discovery-controls-clearance" x={0} y={0} width="100%" height={60}
          maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" maskType="luminance">
          <Rect x={0} y={0} width="100%" height={60} fill="white"/>
          <AnimatedRect animatedProps={sourceClearance} fill="black"/>
        </Mask></Defs>
        <AnimatedRect animatedProps={sourceSwitchMask} x={0} y={0} height={60} fill="black" mask="url(#discovery-controls-clearance)"/>
        <AnimatedRect animatedProps={sourceFilterMask} width={52} y={0} height={60} fill="black" mask="url(#discovery-controls-clearance)"/>
        <AnimatedRect animatedProps={sourceSearch} y={0} width={52} height={60} fill="black"/>
        {calendar && <AnimatedRect animatedProps={sourceCalendar} y={0} width={60} height={60} fill="black" mask="url(#discovery-controls-clearance)"/>}
      </Svg>}>
        <View style={s.content}><GlassButtonGroup style={s.row}>
          {/* Permanent slots in one native glass container. The whole switch
              moves together; its selected segment is never reanimated. */}
          <Animated.View testID="discovery-controls-group" style={s.controlsGroup}>
            <Animated.View testID="discovery-switch-return" style={[s.switchSlot, switchMotion]}>{sourceSwitch}</Animated.View>
            <Animated.View testID="discovery-filter-return" style={[s.circleSize, filterMotion]}>{filter}</Animated.View>
          </Animated.View>
          <View testID="discovery-search-source" onLayout={onSourceLayout} style={s.circleSize}>
            <Animated.View style={[s.circleSize, sourceSettle]}>
            <GlassPressable ref={triggerRef} testID="discovery-search-toggle" style={s.circle} nativePressEffect={false} fallback={Pressable}
              accessibilityLabel={searchLabel} accessibilityState={{ expanded: active }} tabIndex={compact ? -1 : 0}
              onPressIn={onSearchPressIn} onPressOut={onSearchPressOut} onPress={compact ? undefined : onOpen}>
              <Animated.View pointerEvents="none" style={sourceIconPosition}><Search size={16} color="white"/></Animated.View>
            </GlassPressable>
            </Animated.View>
          </View>
          {calendar && <Animated.View onLayout={onCalendarLayout} style={[s.circleSize, filterMotion]}>{calendar}</Animated.View>}
        </GlassButtonGroup></View>
      </MaskedView>
    </View>
    <View style={s.expanded} pointerEvents={compact ? 'box-none' : 'none'}>
        <GlassButtonGroup style={s.row}>
          <View style={s.circleSize}><MaskedView style={s.maskFrame} maskElement={<Svg style={StyleSheet.absoluteFill}>
            <AnimatedRect animatedProps={back} x={0} y={0} height={60} fill="black"/>
          </Svg>}><View style={s.content}>
          <Animated.View testID="discovery-back-surface" style={[s.circleSize, backEntrance]}>
            <GlassPressable testID="discovery-search-back" style={s.circle} accessibilityLabel={backLabel}
              tabIndex={compact ? 0 : -1} onPress={compact ? onClose : undefined}
              aria-hidden={!compact} accessibilityElementsHidden={!compact}>
              <ChevronLeft size={20} color="white"/>
            </GlassPressable>
          </Animated.View>
          </View></MaskedView></View>
          <AnimatedGlassInputSurface testID="discovery-search-destination" onLayout={onDestinationLayout} style={[s.field, fieldSettle]}
            glassEffectStyle="none" animatedProps={supportsLiquidGlass&&!reducedTransparency?materialProps:undefined} fallbackMaterialStyle={materialVisibility}
            pointerEvents={active ? 'auto' : 'none'} onTouchEnd={()=>{if(active)onOpen()}} aria-hidden={!active} accessibilityElementsHidden={!active}>
            <Animated.View pointerEvents="none" style={materialVisibility}><Animated.View style={[s.fieldIcon, iconPosition]}><Search size={16} color="white"/></Animated.View></Animated.View>
            <Animated.View pointerEvents="none" style={[s.border, focusBorder, materialVisibility]}/>
            <Animated.View testID="discovery-search-content" pointerEvents={active?'box-none':'none'} style={[s.inputOverlay,inputPosition]}>{field}</Animated.View>
          </AnimatedGlassInputSurface>
        </GlassButtonGroup>
    </View>
  </>;
}
const s = StyleSheet.create({
  source: { ...StyleSheet.absoluteFill, zIndex: 1 }, expanded: { ...StyleSheet.absoluteFill, zIndex: 2 },
  maskFrame: { position: 'absolute', left: -8, top: -8, right: -8, bottom: -8 },
  content: { position: 'absolute', left: 8, top: 8, right: 8, bottom: 8 },
  row: { width: '100%', height: 44, flexWrap: 'nowrap' },
  controlsGroup: { width: 204, minWidth: 164, height: 44, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchSlot: { width: 152, height: 44, minWidth: 112, flexShrink: 1 },
  circleSize: { width: 44, height: 44, borderRadius: 22, flexShrink: 0 },
  circle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#121418ed', borderWidth: StyleSheet.hairlineWidth, borderColor: '#ffffff1a' },
  field: { flex: 1, height: 44, borderRadius: 22, backgroundColor: '#121418ed' },
  inputOverlay: { position: 'absolute', height: 44, zIndex: 4, overflow: 'hidden', transformOrigin:'top left' },
  fieldIcon: { position: 'absolute', left: 10, top: 14, opacity: .8 },
  border: { ...StyleSheet.absoluteFill, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: '#ffffff1a' },
});
