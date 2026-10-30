import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { cancelAnimation, ReduceMotion, runOnJS, runOnUI, useAnimatedReaction, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { keyboardMorphProgress, searchDismissSpring, searchMorphSpring } from './searchMorph';
import { useSearchKeyboardEvents, type SearchKeyboardEvent } from './useSearchKeyboardEvents';

export type SearchRequestOrigin = 'command' | 'keyboard';
type SearchPhase = 'closed' | 'open' | 'closing';

export function useDiscoverySearchMotion(initialOpen: boolean, onClosed: () => void, onRequested?: (open: boolean, origin: SearchRequestOrigin) => void) {
  const initialReduced = useReducedMotion(), [reduced, setReduced] = useState(initialReduced);
  const [phase, setPhase] = useState<SearchPhase>(initialOpen ? 'open' : 'closed');
  const [controlsReady, setControlsReady] = useState(!initialOpen);
  const progress = useSharedValue(initialOpen ? 1 : 0), reduce = useSharedValue(reduced), keyboard = useSharedValue(0);
  const request = useSharedValue({
    id: 0, open: initialOpen, owned: initialOpen, seen: false, following: false,
    keyboardClosing: false, settling: false, target: -1,
    interactive: false, awaitingKeyboard: false, direction: 1, from: initialOpen ? 1 : 0, keyboardFrom: 0,
  });
  const revision = useRef(0), completed = useRef(-1), hiding = useRef<number | null>(null);
  const desired = useRef(initialOpen), alive = useRef(true), closed = useRef(onClosed), requested = useRef(onRequested);
  useLayoutEffect(() => { closed.current = onClosed; requested.current = onRequested; }, [onClosed, onRequested]);
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
  useAnimatedReaction(
    () => !request.value.open && progress.value <= .02,
    (next, previous) => { if (next !== previous) runOnJS(publishControls)(next); },
  );
  const settleClosed = useCallback(() => {
    'worklet';
    const current = request.value, id = current.id;
    if (current.settling) return;
    if (progress.value <= .001) {
      progress.value = 0;
      if (current.keyboardClosing && keyboard.value > .001) return;
      request.value = { ...current, owned: false, following: false, interactive: false, awaitingKeyboard: false };
      runOnJS(finish)(id);
      return;
    }
    request.value = { ...current, settling: true, following: false, interactive: false, awaitingKeyboard: false };
    progress.value = withSpring(0, { ...searchDismissSpring, reduceMotion: reduce.value ? ReduceMotion.Always : ReduceMotion.Never }, finished => {
      if (finished && !request.value.open && request.value.id === id) {
        request.value = { ...request.value, settling: false };
        // UIKit can still cancel an automatic dismissal until its end event.
        // Keep ownership without holding the visual morph halfway open.
        if (request.value.keyboardClosing && keyboard.value > .001) return;
        request.value = { ...request.value, owned: false };
        runOnJS(finish)(id);
      }
    });
  }, [request, progress, keyboard, reduce, finish]);
  const adoptKeyboardClose = useCallback(() => {
    'worklet';
    const current = request.value;
    if (!current.owned || !current.seen) return;
    if (current.open) {
      request.value = { ...current, open: false, keyboardClosing: true };
      runOnJS(ready)(current.id, false, 'keyboard');
    }
  }, [request, ready]);
  useLayoutEffect(() => {
    reduce.value = reduced;
    if (reduced) runOnUI(() => {
      const current = request.value;
      cancelAnimation(progress);
      progress.value = request.value.open ? 1 : 0;
      request.value = { ...request.value, settling: false, following: false, interactive: false, awaitingKeyboard: false, owned: request.value.owned && request.value.open };
      if (!current.open && current.owned) runOnJS(finish)(current.id);
    })();
  }, [reduced, reduce, progress, request, finish]);
  const setOpen = useCallback((open: boolean) => {
    if (desired.current === open) return false;
    desired.current = open;
    const id = ++revision.current;
    if (!open) hiding.current = id;
    // Web must commit editability within its trusted focus activation.
    if (Platform.OS === 'web') setPhase(open ? 'open' : 'closing');
    runOnUI((next: boolean, version: number) => {
      const previous = request.value;
      const alreadyClosing = !next && !previous.open && (previous.following || previous.settling) && !previous.interactive;
      const waiting = !next && !reduce.value && previous.owned && previous.seen && keyboard.value > .001;
      request.value = {
        ...previous, id: version, open: next, owned: true, seen: next ? false : previous.seen,
        keyboardClosing: false, settling: false, target: next ? -1 : previous.target,
        following: alreadyClosing, interactive: false, awaitingKeyboard: next || waiting,
        direction: next ? 1 : previous.direction,
      };
      // The UI intent exists before a focus/blur command can emit keyboard events.
      runOnJS(ready)(version, next, alreadyClosing ? 'keyboard' : 'command');
      if (alreadyClosing) { settleClosed(); return; }
      if (waiting) { cancelAnimation(progress); return; }
      if (next) progress.value = withSpring(1, { ...searchMorphSpring, reduceMotion: reduce.value ? ReduceMotion.Always : ReduceMotion.Never });
      else settleClosed();
    })(open, id);
    return true;
  }, [request, keyboard, reduce, progress, ready, settleClosed]);
  const detach = useCallback(() => {
    const id = ++revision.current;
    desired.current = false; hiding.current = id; setPhase('closing');
    runOnUI((version: number) => {
      request.value = { ...request.value, id: version, open: false, owned: false, keyboardClosing: false, settling: false, following: false, interactive: false, awaitingKeyboard: false };
      settleClosed();
    })(id);
  }, [request, settleClosed]);
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
        progress.value = withSpring(1, { ...searchMorphSpring, reduceMotion: reduce.value ? ReduceMotion.Always : ReduceMotion.Never });
      }
      if (reduce.value) progress.value = direction;
    },
    onMove: move,
    onInteractive: event => {
      'worklet';
      const previous = keyboard.value, current = request.value;
      if (!current.owned || !current.seen) { keyboard.value = event.progress; return; }
      if (!current.interactive && current.open && event.progress >= previous - .001) { keyboard.value = event.progress; return; }
      if (!current.interactive) {
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
      if (event.progress === 0) {
        if (!current.seen) return;
        // Ignore an old hide completion while a new presentation is underway.
        if (current.open && current.awaitingKeyboard && current.direction === 1 && !current.interactive) return;
        adoptKeyboardClose();
        settleClosed();
      } else if (current.open) {
        if (current.interactive) progress.value = withSpring(1, {
          ...searchMorphSpring, reduceMotion: reduce.value ? ReduceMotion.Always : ReduceMotion.Never,
        });
        request.value = { ...current, seen: true, following: false, interactive: false, awaitingKeyboard: false };
      }
    },
  }, { onWillHide: willHide, onDidHide: didHide, onDidShow: didShow });
  const isOpen = useCallback(() => desired.current, []);
  return { open: phase === 'open', phase, isOpen, progress, reduced, intent: request, reduceMotion: reduce, controlsReady, setOpen, detach };
}
