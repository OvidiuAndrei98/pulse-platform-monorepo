import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import NativeMaskedView from '@react-native-masked-view/masked-view';
import Svg, { Rect } from 'react-native-svg';
import Animated, { useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated';
import { ChevronLeft, Search } from 'lucide-react-native';
import { GlassButtonGroup } from '../ui/GlassButtonGroup';
import { GlassPressable } from '../ui/GlassPressable';
import { GlassSurface } from '../ui/GlassSurface';
import { smoothMorphPhase } from './searchMorph';
import type { DiscoveryNativeGlassGroupsProps } from './DiscoveryNativeGlassGroups';

const MaskedView = NativeMaskedView as unknown as React.ComponentType<ViewProps & { maskElement: React.ReactElement }>;
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedGlassSurface = Animated.createAnimatedComponent(GlassSurface);

/** The same native controls as Home, in permanently mounted, fixed layouts.
 * Only their compositing masks change. UIKit owns pressing/merging at rest;
 * the separate morph surface owns travel, so the two animations cannot fight. */
export function DiscoveryNativeGlassGroups({ bounds, progress, geometry, backScale, sourceSwitch, filter, field, compact, active, focused,
  searchLabel, backLabel, triggerRef, onOpen, onClose, onSearchPressIn, onSourceLayout, onDestinationLayout }: DiscoveryNativeGlassGroupsProps) {
  const sourceControls = useAnimatedProps(() => ({ width: bounds.value.source.x + 4, opacity: geometry.value.controls }));
  const sourceSearch = useAnimatedProps(() => ({ x: bounds.value.source.x + 4, opacity: 1 - smoothMorphPhase(progress.value, 0, .18) }));
  const back = useAnimatedProps(() => ({ width: bounds.value.destination.x + 4, opacity: geometry.value.back }));
  const destination = useAnimatedProps(() => {
    const rest = progress.value >= .999;
    return {
      x: rest ? bounds.value.destination.x + 4 : geometry.value.searchX + 8,
      y: rest ? 0 : 8, width: rest ? bounds.value.destination.width + 12 : geometry.value.searchWidth,
      height: rest ? 60 : 44, rx: rest ? 0 : 22,
      opacity: smoothMorphPhase(progress.value, .88, 1),
    };
  });
  const inputPosition = useAnimatedStyle(() => ({ transform: [{ translateX: geometry.value.searchX - bounds.value.destination.x }] }));
  const iconPosition = useAnimatedStyle(() => ({ transform: [{ translateX:
    geometry.value.searchX - bounds.value.destination.x + geometry.value.iconX + 4,
  }] }));
  const controlsPosition = useAnimatedStyle(() => ({ transform: [{ scale: geometry.value.controlsScale }] }));
  const backEntrance = useAnimatedStyle(() => ({ transform: [{ scale: backScale.value }] }));
  const sourceSettle = useAnimatedStyle(() => ({ transform: [{ scale: geometry.value.sourceScale }] }));
  const fieldSettle = useAnimatedStyle(() => ({ transform: [
    { translateX: bounds.value.destination.width * (geometry.value.fieldScaleX - 1) / 2 },
    { scaleX: geometry.value.fieldScaleX },
  ] }));

  return <>
    <View testID="discovery-source-layer" style={s.source} pointerEvents={compact ? 'none' : 'box-none'}
      aria-hidden={compact} accessibilityElementsHidden={compact} importantForAccessibility={compact ? 'no-hide-descendants' : 'auto'}>
      <MaskedView style={s.maskFrame} maskElement={<Svg style={StyleSheet.absoluteFill}>
        <AnimatedRect animatedProps={sourceControls} x={0} y={0} height={60} fill="black"/>
        <AnimatedRect animatedProps={sourceSearch} y={0} width="100%" height={60} fill="black"/>
      </Svg>}>
        <View style={s.content}><GlassButtonGroup style={s.row}>
          <Animated.View style={[s.switchSlot, controlsPosition]}>{sourceSwitch}</Animated.View>
          <Animated.View style={[s.circleSize, controlsPosition]}>{filter}</Animated.View>
          <View testID="discovery-search-source" onLayout={onSourceLayout} style={s.circleSize}>
            <Animated.View style={[s.circleSize, sourceSettle]}>
            <GlassPressable ref={triggerRef} testID="discovery-search-toggle" style={s.circle}
              accessibilityLabel={searchLabel} accessibilityState={{ expanded: active }} tabIndex={compact ? -1 : 0}
              onPressIn={onSearchPressIn} onPress={compact ? undefined : onOpen}><Search size={16} color="white"/></GlassPressable>
            </Animated.View>
          </View>
        </GlassButtonGroup></View>
      </MaskedView>
    </View>
    <View style={s.expanded} pointerEvents={compact ? 'box-none' : 'none'}>
      <MaskedView style={s.maskFrame} maskElement={<Svg style={StyleSheet.absoluteFill}>
        <AnimatedRect animatedProps={back} x={0} y={0} height={60} fill="black"/>
        <AnimatedRect animatedProps={destination} fill="black"/>
      </Svg>}>
        <View style={s.content}><GlassButtonGroup style={s.row}>
          <Animated.View testID="discovery-back-surface" style={[s.circleSize, backEntrance]}>
            <GlassPressable testID="discovery-search-back" style={s.circle} accessibilityLabel={backLabel}
              tabIndex={compact ? 0 : -1} onPress={compact ? onClose : undefined}
              aria-hidden={!compact} accessibilityElementsHidden={!compact}>
              <ChevronLeft size={20} color="white"/>
            </GlassPressable>
          </Animated.View>
          <AnimatedGlassSurface testID="discovery-search-destination" onLayout={onDestinationLayout} style={[s.field, fieldSettle]}
            pointerEvents={active ? 'box-none' : 'none'} aria-hidden={!active} accessibilityElementsHidden={!active}>
            <Animated.View pointerEvents="none" style={[s.fieldIcon, iconPosition]}><Search size={16} color="white"/></Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, inputPosition]}>{field}</Animated.View>
            <View pointerEvents="none" style={[s.border, focused && s.focused]}/>
          </AnimatedGlassSurface>
        </GlassButtonGroup></View>
      </MaskedView>
    </View>
  </>;
}
const s = StyleSheet.create({
  source: { ...StyleSheet.absoluteFill, zIndex: 1 }, expanded: { ...StyleSheet.absoluteFill, zIndex: 2 },
  maskFrame: { position: 'absolute', left: -8, top: -8, right: -8, bottom: -8 },
  content: { position: 'absolute', left: 8, top: 8, right: 8, bottom: 8 },
  row: { width: '100%', height: 44, flexWrap: 'nowrap' },
  switchSlot: { width: 152, height: 44, minWidth: 112, flexShrink: 1 },
  circleSize: { width: 44, height: 44, borderRadius: 22, flexShrink: 0 },
  circle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#121418ed', borderWidth: StyleSheet.hairlineWidth, borderColor: '#ffffff1a' },
  field: { flex: 1, height: 44, borderRadius: 22, backgroundColor: '#121418ed' },
  fieldIcon: { position: 'absolute', left: 10, top: 14, opacity: .8 },
  border: { ...StyleSheet.absoluteFill, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: '#ffffff1a' },
  focused: { borderColor: '#ffffff38' },
});
