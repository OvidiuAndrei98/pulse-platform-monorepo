import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import BottomSheet, { ANIMATION_CONFIGS, ANIMATION_SOURCE, ANIMATION_STATUS, KEYBOARD_STATUS, BottomSheetBackdrop, BottomSheetFooter, useBottomSheetGestureHandlers, useBottomSheetInternal, type BottomSheetBackdropProps, type BottomSheetFooterProps } from '@gorhom/bottom-sheet';
import { Gesture, GestureDetector, GestureHandlerRootView, State } from 'react-native-gesture-handler';
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { drawerDesign } from '../../../pulse-app/src/components/ui/drawerDesign';
import { SheetScrollProvider, sheetGestureHandlersHook, useSheetScrollSurface } from './SheetScrollBridge';
import { getSheetScrollReport } from './sheetScrollDiagnostics';

type Props = React.PropsWithChildren<{ open: boolean; onClose: () => void; height?: number; embedded?: boolean; edgeToEdge?: boolean; label: string; testID?: string; footer?: React.ReactNode }>;
const FooterContext = createContext<React.ReactNode>(null);
// Stable component identity keeps the footer mounted when ticket/RSVP data changes.
function SheetFooter(props: BottomSheetFooterProps) {
  return <BottomSheetFooter {...props}>{useContext(FooterContext)}</BottomSheetFooter>;
}

/** Same black surface, grabber, drag-to-dismiss and 90% event height as the web sheets. */
export function AppSheet({ open, onClose, height = 0.9, embedded = false, edgeToEdge = false, label, testID, footer, children }: Props) {
  if (!open) return null;
  const content = <SheetContent height={height} onClose={onClose} edgeToEdge={edgeToEdge} label={label} testID={testID} footer={footer}>{children}</SheetContent>;
  // A modal does not add a browser/navigation history entry. Native horizontal
  // Back stays a navigation gesture belonging to Search and Checkout.
  return embedded ? content : <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
    <GestureHandlerRootView style={s.root}>{content}</GestureHandlerRootView>
  </Modal>;
}
function SheetContent({ height = 0.9, onClose, edgeToEdge, label, testID, footer, children }: Omit<Props, 'open'>) {
  const ref = useRef<BottomSheet>(null), viewport = useWindowDimensions(), safe = useSafeAreaInsets();
  const points = useMemo(() => [Math.max(180, Math.min(viewport.height - safe.top - 8, viewport.height * height))], [height, viewport.height, safe.top]);
  // Keep Gorhom's original spring trajectory/velocity. Reanimated's default
  // energy threshold waits for subpixel settling, leaving the invisible Modal
  // blocking taps. Finish that tail earlier through the normal onClose callback,
  // without timers or changing Android's existing timing animation.
  const animationConfigs = useMemo(() => Platform.OS === 'android' ? ANIMATION_CONFIGS : { ...ANIMATION_CONFIGS, energyThreshold: 1e-5 }, []);
  // Gorhom handles mount and snap-point changes. A second imperative snap here
  // can restart the opening animation after the user has already grabbed it.
  const backdrop = useCallback((props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} opacity={0.7} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />, []);
  return <FooterContext.Provider value={footer}><SheetScrollProvider><View style={s.root} testID={testID}>
    <BottomSheet ref={ref} index={0} snapPoints={points} animateOnMount animationConfigs={animationConfigs} enableDynamicSizing={false} enablePanDownToClose
      gestureEventsHandlersHook={sheetGestureHandlersHook}
      footerComponent={footer ? SheetFooter : undefined}
      enableContentPanningGesture keyboardBehavior="interactive" keyboardBlurBehavior="restore" enableBlurKeyboardOnGesture
      android_keyboardInputMode="adjustResize" onClose={onClose} backdropComponent={backdrop}
      backgroundStyle={s.surface} handleComponent={null}>
      {/* The native viewport needs its own bound. Flex alone can inherit an
          oversized animated ancestor: UIKit then thinks long content fits and
          rubber-bands every drag back to zero. Exclude Gorhom's overdrag padding. */}
      <SheetGestureBoundary viewportHeight={points[0]!}>
        <View style={[s.body, !edgeToEdge && { marginTop: drawerDesign.handleAreaHeight }]}>{children}</View>
        <SheetHandleOverlay label={label} onClose={() => ref.current?.close()} />
      </SheetGestureBoundary>
    </BottomSheet>
  </View></SheetScrollProvider></FooterContext.Provider>;
}
function SheetGestureBoundary({ children, viewportHeight }: React.PropsWithChildren<{ viewportHeight: number }>) {
  const { animatedAnimationState, animatedContentGestureState, animatedHandleGestureState, animatedLayoutState, animatedKeyboardState, stopAnimation, animateToPosition } = useBottomSheetInternal();
  const pausedTarget = useSharedValue<{ position: number; source: ANIMATION_SOURCE } | null>(null);
  const resumeFrame = useRef<number | null>(null);
  const surface = useRef<View>(null);
  useSheetScrollSurface(surface);
  const nativeViewportStyle = useAnimatedStyle(() => {
    if (Platform.OS === 'web') return {};
    const { containerHeight } = animatedLayoutState.get();
    const keyboard = animatedKeyboardState.get();
    const keyboardHeight = keyboard.status === KEYBOARD_STATUS.SHOWN ? Math.max(0, keyboard.heightWithinContainer) : 0;
    // Our single interactive snap keeps its height until the keyboard leaves
    // less room. On Android adjustResize, Gorhom reports keyboardHeight=0 and
    // the container itself shrinks, so the keyboard is not subtracted twice.
    const availableHeight = Math.max(0, (containerHeight > 0 ? containerHeight : viewportHeight) - keyboardHeight);
    const height = Math.min(viewportHeight, availableHeight);
    // Same resize animation as Gorhom's content. Bound the native viewport
    // independently of intrinsic content, allowing shorter parents to shrink it.
    return {
      flex: 0,
      flexShrink: 1,
      height: Platform.OS === 'android'
        ? withTiming(height, ANIMATION_CONFIGS as WithTimingConfig)
        : withSpring(height, ANIMATION_CONFIGS as WithSpringConfig),
    };
  }, [viewportHeight, animatedLayoutState, animatedKeyboardState]);
  // The library normally cancels its spring only after Pan activates. On web
  // that requires 15px of movement, so an opening or returning sheet can escape
  // a held finger. Preserve the animation source when a stationary grab resumes.
  const pause = useCallback(() => {
    'worklet';
    const animation = animatedAnimationState.get();
    if (pausedTarget.get() !== null || animation.status !== ANIMATION_STATUS.RUNNING || animation.nextPosition === undefined || animation.nextIndex === undefined || animation.nextIndex < 0) return;
    pausedTarget.set({ position: animation.nextPosition, source: animation.source });
    stopAnimation();
  }, [animatedAnimationState, pausedTarget, stopAnimation]);
  useAnimatedReaction(() => {
    const content = animatedContentGestureState.get(), handle = animatedHandleGestureState.get();
    return content === State.BEGAN || content === State.ACTIVE || handle === State.BEGAN || handle === State.ACTIVE;
  }, claimed => {
    if (claimed) pausedTarget.set(null);
  }, [animatedContentGestureState, animatedHandleGestureState, pausedTarget]);
  const resume = useCallback(() => {
    'worklet';
    const target = pausedTarget.get();
    pausedTarget.set(null);
    if (target === null || animatedAnimationState.get().status !== ANIMATION_STATUS.STOPPED) return;
    animateToPosition(target.position, target.source, 0);
  }, [animatedAnimationState, animateToPosition, pausedTarget]);
  const touch = useCallback(() => {
    if (resumeFrame.current !== null) cancelAnimationFrame(resumeFrame.current);
    resumeFrame.current = null;
    // Only DOM pointer listeners call this. Native scrolling must let Gorhom
    // reach its expanded snap: stopping short leaves its ScrollView locked.
    pause();
  }, [pause]);
  const release = useCallback(() => {
    if (resumeFrame.current !== null) cancelAnimationFrame(resumeFrame.current);
    // Let Pan's finalization or a handle press select its destination first.
    resumeFrame.current = requestAnimationFrame(() => { resumeFrame.current = null; resume(); });
  }, [resume]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // RN Web does not forward onClickCapture. A native DOM capture listener
    // prevents its child Pressable from treating a completed drag as a click.
    const element = surface.current as unknown as HTMLElement;
    if (!element) return;
    let origin: { x: number; y: number; id: number } | null = null;
    let moved = false, clearFrame: number | null = null;
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary) return;
      if (clearFrame !== null) cancelAnimationFrame(clearFrame);
      origin = { x: event.clientX, y: event.clientY, id: event.pointerId };
      moved = false;
      touch();
    };
    const move = (event: PointerEvent) => {
      if (origin && event.pointerId === origin.id && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10) moved = true;
    };
    const up = () => {
      origin = null;
      release();
      if (clearFrame !== null) cancelAnimationFrame(clearFrame);
      clearFrame = requestAnimationFrame(() => { clearFrame = null; moved = false; });
    };
    const click = (event: MouseEvent) => {
      if (!moved) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      moved = false;
    };
    element.addEventListener('pointerdown', down, true);
    element.addEventListener('click', click, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('blur', up);
    return () => {
      element.removeEventListener('pointerdown', down, true);
      element.removeEventListener('click', click, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('blur', up);
      if (clearFrame !== null) cancelAnimationFrame(clearFrame);
    };
  }, [touch, release]);
  useEffect(() => () => { if (resumeFrame.current !== null) cancelAnimationFrame(resumeFrame.current); }, []);
  const Viewport = Platform.OS === 'web' ? View : Animated.View;
  return <Viewport ref={surface} testID="sheet-content-viewport" collapsable={false} style={[s.content, nativeViewportStyle]}>
    {children}
  </Viewport>;
}
function SheetHandleOverlay({ label, onClose }: { label: string; onClose: () => void }) {
  // Temporary diagnostic for installed iPhone builds, which cannot be inspected
  // from the desktop browser. Long-press copies local measurements only.
  const copied = useRef(false);
  const copyDiagnostics = async () => {
    copied.current = true;
    try {
      if (!(await Clipboard.setStringAsync(getSheetScrollReport()))) throw new Error('Clipboard unavailable');
      Alert.alert('Diagnostic scroll copiat', 'Lipește raportul în conversație. Nu conține date despre cont sau eveniment.');
    } catch {
      Alert.alert('Copiere nereușită', 'Apasă lung pe capsulă pentru a încerca din nou.');
    }
  };
  // Use the library's handle recognizer so the grabber remains draggable even
  // when the content below it has scrolled, without reserving a black header.
  const { handlePanGestureHandler: handler } = useBottomSheetGestureHandlers();
  const pan = useMemo(() => Gesture.Pan().shouldCancelWhenOutside(false).runOnJS(false)
    .onStart(handler.handleOnStart).onChange(handler.handleOnChange)
    .onEnd(handler.handleOnEnd).onFinalize(handler.handleOnFinalize), [handler]);
  return <View pointerEvents="box-none" style={s.overlay}>
    <LinearGradient pointerEvents="none" colors={drawerDesign.shadeColors} locations={drawerDesign.shadeLocations} style={s.shade} />
    <GestureDetector gesture={pan}>
      <Animated.View style={s.handle}>
        <Pressable testID="sheet-handle" accessibilityRole="button" accessibilityLabel={label}
          onPressIn={() => { copied.current = false; }}
          onLongPress={Platform.OS === 'web' ? undefined : () => void copyDiagnostics()} delayLongPress={900}
          onPress={() => { if (!copied.current) onClose(); }} style={s.grabArea}>
          <View testID="sheet-pill" style={s.capsule} />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  </View>;
}
const s = StyleSheet.create({
  root: { flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 600 : undefined, alignSelf: 'center' },
  surface: { backgroundColor: '#000', borderTopLeftRadius: 32, borderTopRightRadius: 32 },
  content: { flex: 1, minHeight: 0, borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' },
  body: { flex: 1, minHeight: 0 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, height: drawerDesign.shadeHeight, zIndex: 30 },
  shade: { position: 'absolute', top: 0, left: 0, right: 0, height: drawerDesign.shadeHeight },
  handle: { height: drawerDesign.handleAreaHeight },
  grabArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  capsule: { width: drawerDesign.pillWidth, height: drawerDesign.pillHeight, borderRadius: 99, backgroundColor: drawerDesign.pillColor, boxShadow: '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1)' },
});
