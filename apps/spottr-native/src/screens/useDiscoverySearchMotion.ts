import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { cancelAnimation, ReduceMotion, runOnJS, runOnUI, useAnimatedReaction, useReducedMotion, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { keyboardMorphProgress, searchDismissSpring, searchMorphSpring, iosSearchOpenSpring, iosSearchCloseSpring, iosSearchPressSpring, iosSearchPressExpansion, iosSearchFocusFallbackMs } from './searchMorph';
import { useSearchKeyboardEvents, type SearchKeyboardEvent } from './useSearchKeyboardEvents';

export type SearchRequestOrigin = 'command' | 'keyboard';
type SearchPhase = 'closed' | 'open' | 'closing';
const openSpring = Platform.OS === 'ios' ? iosSearchOpenSpring : searchMorphSpring;
const closeSpring = Platform.OS === 'ios' ? iosSearchCloseSpring : searchDismissSpring;

export function useDiscoverySearchMotion(initialOpen: boolean, onClosed: () => void, onRequested?: (open: boolean, origin: SearchRequestOrigin) => void, onFocusReady?: () => void) {
  const initialReduced = useReducedMotion(), [reduced, setReduced] = useState(initialReduced);
  const [phase, setPhase] = useState<SearchPhase>(initialOpen ? 'open' : 'closed');
  const [controlsReady, setControlsReady] = useState(!initialOpen);
  const progress = useSharedValue(initialOpen ? 1 : 0), reduce = useSharedValue(reduced), keyboard = useSharedValue(0);
  const pressed = useSharedValue(0), launchExpansion = useSharedValue(0);
  const preparedFocus = useSharedValue(-1);
  const keyboardReturnFrame = useSharedValue(0);
  const keyboardDrag = useSharedValue({ at: 0, progress: 0, velocity: 0 });
  const request = useSharedValue({
    id: 0, open: initialOpen, owned: initialOpen, seen: false, following: false,
    keyboardClosing: false, settling: false, target: -1,
    interactive: false, awaitingKeyboard: false, awaitingFocus: false, direction: 1, from: initialOpen ? 1 : 0, keyboardFrom: 0,
  });
  const revision = useRef(0), completed = useRef(-1), hiding = useRef<number | null>(null);
  const desired = useRef(initialOpen), alive = useRef(true), closed = useRef(onClosed), requested = useRef(onRequested);
  const focusReady = useRef(onFocusReady);
  useLayoutEffect(() => { closed.current = onClosed; requested.current = onRequested; focusReady.current = onFocusReady; }, [onClosed, onRequested, onFocusReady]);
  useEffect(() => {
    alive.current = true;
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { alive.current = false; revision.current++; listener.remove(); };
  }, []);
  const finish = useCallback((id: number) => {
    if (!alive.current || id !== revision.current || desired.current || completed.current === id) return;
    completed.current = id;
    setPhase('closed');
    closed.current();
  }, []);
  const ready = useCallback((id: number, next: boolean, origin: SearchRequestOrigin) => {
    if (!alive.current || id !== revision.current) return;
    desired.current = next;
    if (!next) hiding.current = id;
    setPhase(next ? 'open' : 'closing');
    requested.current?.(next, origin);
  }, []);
  const publishControls = useCallback((next: boolean) => { if (alive.current) setControlsReady(next); }, []);
  const focusWhenPrepared = useCallback((id: number) => {
    if (alive.current && id === revision.current && desired.current) focusReady.current?.();
  }, []);
  useAnimatedReaction(
    () => Platform.OS === 'ios' && request.value.open ? request.value.id : -1,
    id => {
      if (id >= 0 && id !== preparedFocus.value) {
        preparedFocus.value = id;
        runOnJS(focusWhenPrepared)(id);
      }
    },
  );
  useAnimatedReaction(
    () => !request.value.open && progress.value <= .02,
    (next, previous) => { if (next !== previous) runOnJS(publishControls)(next); },
  );
  useAnimatedReaction(
    () => progress.value >= 1,
    full => { if (full) launchExpansion.value = 0; },
  );
  const beginPreparedOpen = useCallback(() => {
    'worklet';
    const current = request.value;
    if (!current.open || !current.awaitingFocus) return;
    request.value = { ...current, awaitingFocus: false };
    cancelAnimation(progress);
    // Native focus can leave an older event-frame timestamp in Reanimated.
    // Begin on the next display frame so the spring cannot skip its start.
    requestAnimationFrame(() => {
      if (request.value.id !== current.id || !request.value.open || request.value.interactive) return;
      progress.value = withSpring(1, { ...openSpring, reduceMotion: reduce.value ? ReduceMotion.Always : ReduceMotion.Never });
    });
  }, [request, progress, reduce]);
  const inputPrepared = useCallback(() => { if (Platform.OS === 'ios') runOnUI(beginPreparedOpen)(); }, [beginPreparedOpen]);
  const pressIn = useCallback(() => {
    if (Platform.OS !== 'ios') return;
    runOnUI(() => {
      if (request.value.open || reduce.value) return;
      pressed.value = withSpring(1, { ...iosSearchPressSpring, reduceMotion: ReduceMotion.Never });
    })();
  }, [request, reduce, pressed]);
  const pressOut = useCallback(() => {
    if (Platform.OS !== 'ios') return;
    runOnUI(() => { pressed.value = withSpring(0, { ...iosSearchPressSpring, reduceMotion: reduce.value ? ReduceMotion.Always : ReduceMotion.Never }); })();
  }, [pressed, reduce]);
  const settleClosed = useCallback(() => {
    'worklet';
    const current = request.value, id = current.id;
    if (current.settling) return;
    // Never bounce under the finger. After release only a recent, fast
    // downward flick carries velocity into the small terminal settle.
    const sample = keyboardDrag.value;
    const velocity = current.interactive && Date.now() - sample.at < 100
      ? Math.max(-4, Math.min(0, sample.velocity)) : 0;
    const finishSpring = Platform.OS === 'ios' && current.interactive
      ? { ...closeSpring, overshootClamping: velocity > -1.5, velocity }
      : closeSpring;
    // A close/reversal relaxes the carried press without replaying a press at
    // the destination. Keep its current value on interrupted openings.
    if (launchExpansion.value > .001) launchExpansion.value = withSpring(0, { ...closeSpring, reduceMotion: reduce.value ? ReduceMotion.Always : ReduceMotion.Never });
    if (progress.value <= .001) {
      progress.value = 0;
      if (current.keyboardClosing && keyboard.value > .001) return;
      request.value = { ...current, owned: false, following: false, interactive: false, awaitingKeyboard: false };
      runOnJS(finish)(id);
      return;
    }
    request.value = { ...current, settling: true, following: false, interactive: false, awaitingKeyboard: false };
    const startFinish = () => {
      'worklet';
      if (request.value.id !== id || request.value.open || request.value.interactive || !request.value.settling) return;
      progress.value = withSpring(0, { ...finishSpring, reduceMotion: reduce.value ? ReduceMotion.Always : ReduceMotion.Never }, finished => {
      if (finished && !request.value.open && request.value.id === id) {
        request.value = { ...request.value, settling: false };
        // UIKit can still cancel an automatic dismissal until its end event.
        // Keep ownership without holding the visual morph halfway open.
        if (request.value.keyboardClosing && keyboard.value > .001) return;
        request.value = { ...request.value, owned: false };
        runOnJS(finish)(id);
      }
      });
    };
    if (Platform.OS === 'ios' && !reduce.value && !current.interactive) {
      cancelAnimation(progress);
      requestAnimationFrame(startFinish);
    } else startFinish();
  }, [request, progress, keyboard, reduce, finish, launchExpansion, keyboardDrag]);
  const inputBlurred = useCallback(() => {
    if (Platform.OS !== 'ios') return;
    runOnUI(() => {
      const current = request.value;
      if (current.owned && !current.open && !current.interactive) settleClosed();
    })();
  }, [request, settleClosed]);
  const adoptKeyboardClose = useCallback(() => {
    'worklet';
    const current = request.value;
    if (!current.owned || !current.seen) return;
    if (current.open) {
      request.value = { ...current, open: false, keyboardClosing: true };
      runOnJS(ready)(current.id, false, 'keyboard');
    }
  }, [request, ready]);
  const releaseKeyboardGesture = useCallback(() => {
    if (Platform.OS !== 'ios') return;
    const id = revision.current;
    runOnUI((version: number) => {
      const current = request.value;
      // At the bottom UIKit may have no remaining animation to report. Finish
      // only after the finger lifts, and only within the last 2% of travel.
      // Partial/cancelled drags still belong entirely to the native keyboard.
      if (current.id !== version || !current.owned || !current.seen || !current.interactive || keyboard.value > .02) return;
      keyboard.value = 0;
      request.value = { ...current, open: false, keyboardClosing: false, following: false,
        interactive: false, awaitingKeyboard: false, settling: false };
      // Resign the input as well: collapsing just the toolbar would leave the
      // native responder (and its interactive dismissal) active underneath.
      runOnJS(ready)(version, false, 'command');
      settleClosed();
    })(id);
  }, [request, keyboard, ready, settleClosed]);
  useLayoutEffect(() => {
    reduce.value = reduced;
    if (reduced) runOnUI(() => {
      const current = request.value;
      keyboardReturnFrame.value++;
      cancelAnimation(progress);
      cancelAnimation(pressed);
      pressed.value = 0;
      launchExpansion.value = 0;
      progress.value = request.value.open ? 1 : 0;
      request.value = { ...request.value, settling: false, following: false, interactive: false, awaitingKeyboard: false, owned: request.value.owned && request.value.open };
      if (!current.open && current.owned) runOnJS(finish)(current.id);
    })();
  }, [reduced, reduce, progress, request, finish, pressed, launchExpansion, keyboardReturnFrame]);
  const setOpen = useCallback((open: boolean) => {
    if (desired.current === open) return false;
    desired.current = open;
    const id = ++revision.current;
    if (!open) hiding.current = id;
    // Web must commit editability within its trusted focus activation.
    if (Platform.OS === 'web') setPhase(open ? 'open' : 'closing');
    runOnUI((next: boolean, version: number) => {
      const previous = request.value;
      if (next && progress.value <= .001) {
        launchExpansion.value = reduce.value ? 0 : iosSearchPressExpansion * Math.max(0, Math.min(1, pressed.value));
      }
      const alreadyClosing = !next && !previous.open && (previous.following || previous.settling) && !previous.interactive;
      const waiting = !next && !reduce.value && previous.owned && previous.seen && keyboard.value > .001;
      request.value = {
        ...previous, id: version, open: next, owned: true, seen: next ? false : previous.seen,
        keyboardClosing: false, settling: false, target: next ? -1 : previous.target,
        following: alreadyClosing, interactive: false, awaitingKeyboard: next || waiting,
        awaitingFocus: next && Platform.OS === 'ios' && !reduce.value,
        direction: next ? 1 : previous.direction,
      };
      // The UI intent exists before a focus/blur command can emit keyboard events.
      runOnJS(ready)(version, next, alreadyClosing ? 'keyboard' : 'command');
      if (alreadyClosing) { settleClosed(); return; }
      // Resigning first responder also occupies the UI thread. Start collapse
      // at blur/willHide (before the keyboard moves), not during that work.
      if (waiting) { cancelAnimation(progress); return; }
      if (next) {
        const expansion = withSpring(1, { ...openSpring, reduceMotion: reduce.value ? ReduceMotion.Always : ReduceMotion.Never }, finished => {
          if (finished && request.value.id === version && request.value.open) request.value = { ...request.value, awaitingFocus: false };
        });
        if (request.value.awaitingFocus) {
          cancelAnimation(progress);
          progress.value = withDelay(iosSearchFocusFallbackMs, expansion);
        } else progress.value = expansion;
      }
      else settleClosed();
    })(open, id);
    return true;
  }, [request, keyboard, reduce, progress, ready, settleClosed, pressed, launchExpansion]);
  const detach = useCallback(() => {
    const id = ++revision.current;
    desired.current = false; hiding.current = id; setPhase('closing');
    runOnUI((version: number) => {
      request.value = { ...request.value, id: version, open: false, owned: false, keyboardClosing: false, settling: false, following: false, interactive: false, awaitingKeyboard: false };
      settleClosed();
    })(id);
  }, [request, settleClosed]);
  const resumeAfterKeyboardGesture = useCallback(() => {
    'worklet';
    const id = request.value.id, frame = ++keyboardReturnFrame.value;
    cancelAnimation(progress);
    const resume = () => {
      'worklet';
      const current = request.value;
      if (keyboardReturnFrame.value !== frame || current.id !== id || !current.owned || !current.open || current.interactive) return;
      progress.value = withSpring(1, { ...openSpring, reduceMotion: reduce.value ? ReduceMotion.Always : ReduceMotion.Never });
    };
    // A native cancellation can carry an old event-frame timestamp, just like
    // initial focus. Preserve the released geometry until a fresh display frame
    // so the first spring step cannot skip part of the return animation.
    if (Platform.OS === 'ios' && !reduce.value) requestAnimationFrame(resume);
    else resume();
  }, [request, progress, reduce, keyboardReturnFrame]);
  const move = (event: SearchKeyboardEvent) => {
    'worklet';
    const current = request.value;
    keyboard.value = event.progress;
    // Only a finger-driven gesture owns geometry. The keyboard's automatic
    // curve used to consume most of the morph in its first moving frames.
    if (current.owned && current.following && current.interactive && !reduce.value) {
      progress.value = keyboardMorphProgress(event.progress, current.keyboardFrom, current.direction, current.from);
    }
  };
  const willHide = useCallback(() => {
    const id = revision.current;
    hiding.current = id;
    runOnUI((version: number) => {
      const current = request.value;
      if (current.id !== version || !current.owned || !current.seen) return;
      if (current.interactive) return; // A finger-down drag can still be cancelled.
      adoptKeyboardClose();
      settleClosed();
    })(id);
  }, [request, adoptKeyboardClose, settleClosed]);
  const didHide = useCallback(() => {
    const id = hiding.current ?? revision.current;
    runOnUI((version: number) => {
      const current = request.value;
      if (current.id !== version || !current.owned || !current.seen) return;
      adoptKeyboardClose();
      keyboard.value = 0;
      request.value = { ...request.value, following: false, interactive: false, awaitingKeyboard: false };
      // Android may provide only didHide. Reverse from the displayed bounds,
      // without snapping a still-expanded surface to zero.
      settleClosed();
    })(id);
  }, [request, keyboard, adoptKeyboardClose, settleClosed]);
  const didShow = useCallback(() => {
    const id = revision.current;
    hiding.current = null;
    runOnUI((version: number) => {
      if (request.value.id !== version || !request.value.owned || !request.value.open) return;
      request.value = { ...request.value, seen: true, awaitingKeyboard: false };
      keyboard.value = 1;
    })(id);
  }, [request, keyboard]);
  useSearchKeyboardEvents({
    onStart: event => {
      'worklet';
      const current = request.value, direction = event.progress > .5 ? 1 : 0;
      if (!current.owned) return;
      if (direction === 1) {
        if (!current.open) {
          // UIKit can cancel an interactive hide after willHide. Only the
          // same keyboard may reverse an automatic close; Back stays closed.
          if (!current.keyboardClosing || (current.target >= 0 && event.target >= 0 && current.target !== event.target)) return;
          request.value = { ...current, open: true, keyboardClosing: false };
          runOnJS(ready)(current.id, true, 'keyboard');
        }
        request.value = { ...request.value, seen: true, target: event.target };
        beginPreparedOpen();
      } else {
        if (!current.seen) return;
        adoptKeyboardClose();
      }
      const next = request.value;
      if (direction === 0) {
        // The native commit starts a short finish from the displayed geometry.
        // Subsequent keyboard frames must not drag it through a long tail.
        settleClosed();
        return;
      }
      request.value = {
        ...next, direction, settling: false, following: false, interactive: false,
        awaitingKeyboard: keyboard.value < .999,
      };
      if (current.interactive || !current.open) {
        // A cancelled gesture resumes from its current frame. An ordinary
        // keyboard show leaves the already-running opening spring untouched.
        resumeAfterKeyboardGesture();
      }
      if (reduce.value) progress.value = direction;
    },
    onMove: move,
    onInteractive: event => {
      'worklet';
      const previous = keyboard.value, current = request.value;
      if (!current.owned || !current.seen) { keyboard.value = event.progress; return; }
      if (!current.interactive && current.open && event.progress >= previous - .001) { keyboard.value = event.progress; return; }
      const at = event.timestamp ?? Date.now(), sample = keyboardDrag.value;
      const elapsed = at - sample.at;
      keyboardDrag.value = { at, progress: event.progress, velocity: current.interactive && elapsed > 0 && elapsed < 100
        ? (event.progress - sample.progress) * 1000 / elapsed : 0 };
      if (!current.interactive) {
        keyboardReturnFrame.value++;
        cancelAnimation(progress);
        request.value = { ...current, direction: 0, settling: false, following: true, interactive: true, from: progress.value, keyboardFrom: previous };
      }
      // A drag is provisional. Do not blur the input or change React's open
      // state until iOS commits dismissal; a cancelled drag keeps its focus.
      move(event);
    },
    onEnd: event => {
      'worklet';
      keyboard.value = event.progress;
      const current = request.value;
      if (!current.owned) return;
      if (event.progress <= .001) {
        if (!current.seen) return;
        // Ignore an old hide completion while a new presentation is underway.
        if (current.open && current.awaitingKeyboard && current.direction === 1 && !current.interactive) return;
        keyboard.value = 0;
        adoptKeyboardClose();
        settleClosed();
      } else if (current.open) {
        request.value = { ...current, seen: true, following: false, interactive: false, awaitingKeyboard: false };
        if (current.interactive) resumeAfterKeyboardGesture();
      }
    },
  }, { onWillHide: willHide, onDidHide: didHide, onDidShow: didShow });
  const isOpen = useCallback(() => desired.current, []);
  return { open: phase === 'open', phase, isOpen, progress, reduced, intent: request, reduceMotion: reduce, controlsReady, setOpen, detach, pressIn, pressOut, pressProgress: pressed, launchExpansion, releaseKeyboardGesture, inputPrepared, inputBlurred };
}
